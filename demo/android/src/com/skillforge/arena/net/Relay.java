package com.skillforge.arena.net;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;

/**
 * The LAN relay of src/net/PROTOCOL.md: a small RFC 6455 WebSocket server holding one room (a host
 * and up to 7 joiners) that forwards text frames between the host page and the joiners.
 *
 * <p>Threads: one accept thread, one housekeeping thread (pings every 15 s, close timeouts, shutdown)
 * and, per connection, a reader and a writer. Every connection has its own lock and outbound queue:
 * sending only enqueues, so a phone whose Wi-Fi stalls never blocks the host or the other players.
 * A peer is dropped when it has been silent for 45 s or when 4 MiB pile up for it.
 *
 * <p>Pure Java, no android.* imports: the same class runs in the app and on a desktop JVM (tests).
 */
public final class Relay {
    public static final int FIRST_PORT = 47800, LAST_PORT = 47810;
    public static final int MAX_JOINERS = 7;
    /** Largest accepted message, all fragments together. */
    public static final int MAX_MESSAGE = 1 << 20;

    static final int MAX_QUEUED = 4 << 20;
    static final int MAX_CONNECTIONS = 32;
    static final long PING_MS = 15000, CLOSE_WAIT_MS = 3000, STOP_WAIT_MS = 1000;
    static final int SILENT_MS = 45000, HANDSHAKE_MS = 10000;

    static final int OP_CONT = 0x0, OP_TEXT = 0x1, OP_BINARY = 0x2, OP_CLOSE = 0x8, OP_PING = 0x9, OP_PONG = 0xA;
    private static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int NONE = 0, HOST = 1, JOINER = 2, GONE = 3;

    private final Net.Log log;
    /** Guards host, joiners, conns and every Conn.role / Conn.name. */
    private final Object room = new Object();
    private final LinkedHashMap<Integer, Conn> joiners = new LinkedHashMap<Integer, Conn>();
    private final List<Conn> conns = new ArrayList<Conn>();
    private Conn host;
    private int nextId;

    private ServerSocket server;
    private volatile boolean running;
    private boolean started;
    private int port;

    public Relay(Net.Log log) {
        this.log = log != null ? log : Net.SILENT;
    }

    /**
     * Listens on the first free port in [first, last], on every interface, and starts relaying.
     * Returns the port. A Relay starts once; make a new one after stop().
     */
    public synchronized int start(int first, int last) throws IOException {
        if (started) throw new IllegalStateException("relay already started");
        IOException err = null;
        for (int p = first; p <= last && server == null; p++) {
            ServerSocket s = new ServerSocket();
            try {
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p), 16);
                server = s;
                port = p;
            } catch (IOException e) {
                err = e;
                closeQuietly(s);
            }
        }
        if (server == null) {
            throw new IOException("no free port in " + first + "-" + last
                    + (err != null ? " (" + err.getMessage() + ")" : ""));
        }
        started = true;
        running = true;
        Net.thread("sfa-relay-accept", new Runnable() {
            @Override public void run() { acceptLoop(); }
        });
        Net.thread("sfa-relay-keepalive", new Runnable() {
            @Override public void run() { keepaliveLoop(); }
        });
        log.log("relay: listening on port " + port);
        return port;
    }

    public int port() {
        return port;
    }

    public boolean isRunning() {
        return running;
    }

    /** Players in the room right now: the host plus joiners (0 when there is no host). */
    public int players() {
        synchronized (room) {
            return host == null ? 0 : 1 + joiners.size();
        }
    }

    /**
     * Closes the room without blocking: joiners get X|host-left, everyone a close frame, and the
     * housekeeping thread closes whatever is still open a second later.
     */
    public void stop() {
        synchronized (this) {
            if (!running) return;
            running = false;
        }
        closeQuietly(server);
        synchronized (room) {
            if (host != null) hostLeft();
            for (Conn c : conns) {
                if (c.upgraded) c.close(1001, "relay stopped");
                else c.kill();
            }
        }
        log.log("relay: stopped");
    }

    // ---------------------------------------------------------------- threads

    private void acceptLoop() {
        while (running) {
            Socket s;
            try {
                s = server.accept();
            } catch (IOException e) {
                if (running) {
                    log.log("relay: accept failed: " + e);
                    Net.sleep(200);
                }
                continue;
            }
            final Conn c;
            synchronized (room) {
                if (!running || conns.size() >= MAX_CONNECTIONS) {
                    closeQuietly(s);
                    continue;
                }
                c = new Conn(++nextId, s);
                conns.add(c);
            }
            Net.thread("sfa-relay-read-" + c.id, new Runnable() {
                @Override public void run() { c.readLoop(); }
            });
        }
    }

    private void keepaliveLoop() {
        long stopDeadline = 0;
        while (true) {
            Net.sleep(250);
            long now = Net.now();
            List<Conn> list;
            synchronized (room) {
                list = new ArrayList<Conn>(conns);
            }
            if (!running) {
                if (stopDeadline == 0) stopDeadline = now + STOP_WAIT_MS;
                if (list.isEmpty() || now >= stopDeadline) {
                    for (Conn c : list) c.kill();
                    return;
                }
            }
            for (Conn c : list) {
                long closing = c.closeQueuedAt;
                if (closing != 0) {
                    if (now - closing > CLOSE_WAIT_MS) c.kill();
                } else if (c.upgraded && now - c.lastPing >= PING_MS) {
                    c.lastPing = now;
                    c.send(frame(OP_PING, new byte[0]));
                }
            }
        }
    }

    // ---------------------------------------------------------------- room

    /** A complete text message from c. */
    private void onText(Conn c, String t) {
        synchronized (room) {
            if (c.role == NONE) {
                hello(c, t);
                return;
            }
            // S|<to>|<payload>; anything else after the hello is an unknown frame type: ignored
            if (c.role == GONE || !t.startsWith("S|")) return;
            int bar = t.indexOf('|', 2);
            if (bar < 0) return;
            String to = t.substring(2, bar);
            String payload = t.substring(bar + 1);
            if (c.role == JOINER) {
                if (host != null) host.send(textFrame("M|" + c.id + "|" + payload));
            } else if (to.equals("*")) {
                if (joiners.isEmpty()) return;
                byte[] f = textFrame("M|" + c.id + "|" + payload);
                for (Conn j : joiners.values()) j.send(f);
            } else {
                Conn j = joiners.get(parseId(to));
                if (j != null) j.send(textFrame("M|" + c.id + "|" + payload));
            }
        }
    }

    /** First frames: H|name or J|name. Anything else before a valid hello is ignored. */
    private void hello(Conn c, String t) {
        int bar = t.indexOf('|');
        String type = bar < 0 ? t : t.substring(0, bar);
        boolean isHost = type.equals("H");
        if (!isHost && !type.equals("J")) return;
        if (bar < 0) {
            refuse(c, "bad-hello");
            return;
        }
        String name = t.substring(bar + 1);
        if (isHost) {
            if (host != null) {
                refuse(c, "host-exists");
                return;
            }
            host = c;
            c.role = HOST;
            c.name = name;
            c.send(textFrame("W|" + c.id + "|" + c.id));
            log.log("relay: host " + c.id + " (" + name + ") opened the room");
        } else {
            if (host == null) {
                refuse(c, "no-host");
                return;
            }
            if (joiners.size() >= MAX_JOINERS) {
                refuse(c, "full");
                return;
            }
            joiners.put(c.id, c);
            c.role = JOINER;
            c.name = name;
            c.send(textFrame("W|" + c.id + "|" + host.id));
            host.send(textFrame("+|" + c.id + "|" + name));
            log.log("relay: joiner " + c.id + " (" + name + ") joined, " + joiners.size() + " joiner(s)");
        }
    }

    private void refuse(Conn c, String reason) {
        c.role = GONE;
        c.send(textFrame("E|" + reason));
        c.close(1000, reason);
        log.log("relay: refused " + c.id + ": " + reason);
    }

    /** Holds room. The room resets: every joiner gets X|host-left and is closed. */
    private void hostLeft() {
        Conn h = host;
        host = null;
        if (h != null) h.role = GONE;
        if (!joiners.isEmpty()) {
            byte[] x = textFrame("X|host-left");
            for (Conn j : joiners.values()) {
                j.role = GONE;
                j.send(x);
                j.close(1000, "host left");
            }
            joiners.clear();
        }
        log.log("relay: host left, room reset");
    }

    /** The reader of c ended: it leaves the room. */
    private void left(Conn c) {
        synchronized (room) {
            conns.remove(c);
            if (c.role == HOST && host == c) {
                hostLeft();
            } else if (c.role == JOINER && joiners.remove(c.id) != null) {
                if (host != null) host.send(textFrame("-|" + c.id));
                log.log("relay: joiner " + c.id + " left");
            }
            c.role = GONE;
        }
    }

    private static Integer parseId(String s) {
        try {
            return Integer.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- frames

    static byte[] textFrame(String s) {
        return frame(OP_TEXT, s.getBytes(StandardCharsets.UTF_8));
    }

    /** One unmasked, unfragmented server frame. */
    static byte[] frame(int opcode, byte[] payload) {
        int n = payload.length;
        int head = n < 126 ? 2 : n < 65536 ? 4 : 10;
        byte[] f = new byte[head + n];
        f[0] = (byte) (0x80 | opcode);
        if (n < 126) {
            f[1] = (byte) n;
        } else if (n < 65536) {
            f[1] = 126;
            f[2] = (byte) (n >>> 8);
            f[3] = (byte) n;
        } else {
            f[1] = 127;
            for (int i = 0; i < 8; i++) f[2 + i] = (byte) ((long) n >>> (56 - 8 * i));
        }
        System.arraycopy(payload, 0, f, head, n);
        return f;
    }

    static byte[] closeFrame(int code, String reason) {
        byte[] r = reason.getBytes(StandardCharsets.UTF_8);
        int n = Math.min(r.length, 123);
        byte[] p = new byte[2 + n];
        p[0] = (byte) (code >>> 8);
        p[1] = (byte) code;
        System.arraycopy(r, 0, p, 2, n);
        return frame(OP_CLOSE, p);
    }

    /** Sec-WebSocket-Accept for a Sec-WebSocket-Key. */
    static String acceptKey(String key) throws IOException {
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            return Net.base64(sha1.digest((key + GUID).getBytes(StandardCharsets.ISO_8859_1)));
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("SHA-1 unavailable", e);
        }
    }

    static void closeQuietly(java.io.Closeable c) {
        try {
            if (c != null) c.close();
        } catch (IOException e) {
            // already gone
        }
    }

    private static boolean validCloseCode(int code) {
        return (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);
    }

    // ---------------------------------------------------------------- connection

    private final class Conn {
        final int id;
        final Socket socket;
        /** The per-connection lock: guards the outbound queue and the close state below. */
        final Object lock = new Object();
        final ArrayDeque<byte[]> queue = new ArrayDeque<byte[]>();
        long queued;
        boolean closeQueued, closeWritten, readerDone, dead;
        volatile boolean upgraded;
        volatile long closeQueuedAt, lastPing;
        OutputStream out;
        int role = NONE;
        String name = "";

        Conn(int id, Socket socket) {
            this.id = id;
            this.socket = socket;
        }

        /** Queues one whole frame. Never blocks; a peer that cannot keep up is dropped. */
        void send(byte[] f) {
            boolean overflow = false;
            synchronized (lock) {
                if (dead || closeQueued) return;
                if (queued + f.length > MAX_QUEUED) {
                    overflow = true;
                } else {
                    queue.add(f);
                    queued += f.length;
                    lock.notifyAll();
                }
            }
            if (overflow) {
                log.log("relay: peer " + id + " cannot keep up, dropped");
                kill();
            }
        }

        /** Queues a close frame; nothing is sent after it. */
        void close(int code, String reason) {
            synchronized (lock) {
                if (dead || closeQueued) return;
                queue.add(closeFrame(code, reason));
                closeQueued = true;
                closeQueuedAt = Net.now();
                lock.notifyAll();
            }
        }

        /** Hard close: drops the queue and the socket, which also ends the reader and the writer. */
        void kill() {
            synchronized (lock) {
                dead = true;
                queue.clear();
                queued = 0;
                lock.notifyAll();
            }
            closeQuietly(socket);
        }

        void readLoop() {
            try {
                socket.setTcpNoDelay(true);
                socket.setSoTimeout(HANDSHAKE_MS);
                InputStream in = new BufferedInputStream(socket.getInputStream(), 16384);
                out = socket.getOutputStream();
                if (!handshake(in)) return;
                socket.setSoTimeout(SILENT_MS);
                lastPing = Net.now();
                upgraded = true;
                Net.thread("sfa-relay-write-" + id, new Runnable() {
                    @Override public void run() { writeLoop(); }
                });
                frames(in);
            } catch (SocketTimeoutException e) {
                log.log("relay: peer " + id + " silent, dropped");
            } catch (IOException e) {
                // the peer went away
            } catch (RuntimeException e) {
                log.log("relay: peer " + id + " failed: " + e);
            } finally {
                boolean killNow;
                synchronized (lock) {
                    readerDone = true;
                    // a queued close frame (echo, refusal, error) still goes out: the writer closes after it
                    killNow = !upgraded || !closeQueued || closeWritten || dead;
                }
                if (killNow) kill();
                left(this);
            }
        }

        void writeLoop() {
            try {
                OutputStream o = new BufferedOutputStream(out, 32768);
                while (true) {
                    byte[] f;
                    boolean more;
                    synchronized (lock) {
                        while (queue.isEmpty() && !dead) lock.wait();
                        if (dead) return;
                        f = queue.poll();
                        queued -= f.length;
                        more = !queue.isEmpty();
                    }
                    o.write(f);
                    if ((f[0] & 0x0f) == OP_CLOSE) {
                        o.flush();
                        boolean readerGone;
                        synchronized (lock) {
                            closeWritten = true;
                            readerGone = readerDone;
                        }
                        // wait for the peer's close frame unless the reader has already stopped
                        if (readerGone) kill();
                        else socket.shutdownOutput();
                        return;
                    }
                    if (!more) o.flush();
                }
            } catch (InterruptedException e) {
                kill();
            } catch (IOException e) {
                kill();
            }
        }

        /** Reads the HTTP upgrade request and answers it. False if this is not a WebSocket request. */
        boolean handshake(InputStream in) throws IOException {
            String head = readHead(in);
            if (head == null) return false;
            String[] lines = head.split("\r\n");
            String key = null, upgrade = "", version = "", protocol = null;
            for (int i = 1; i < lines.length; i++) {
                int c = lines[i].indexOf(':');
                if (c <= 0) continue;
                String k = lines[i].substring(0, c).trim().toLowerCase(Locale.US);
                String v = lines[i].substring(c + 1).trim();
                if (k.equals("sec-websocket-key")) key = v;
                else if (k.equals("upgrade")) upgrade = v.toLowerCase(Locale.US);
                else if (k.equals("sec-websocket-version")) version = v;
                else if (k.equals("sec-websocket-protocol")) protocol = v;
            }
            if (key == null || !upgrade.contains("websocket")) {
                // a plain HTTP request, e.g. a browser pointed at the relay to check the network path
                String body = "Skill Forge Arena relay\n";
                writeRaw("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: "
                        + body.length() + "\r\nConnection: close\r\n\r\n" + body);
                return false;
            }
            if (!version.equals("13")) {
                writeRaw("HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\n"
                        + "Content-Length: 0\r\nConnection: close\r\n\r\n");
                return false;
            }
            StringBuilder r = new StringBuilder("HTTP/1.1 101 Switching Protocols\r\n"
                    + "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ")
                    .append(acceptKey(key)).append("\r\n");
            if (protocol != null) {
                // a browser fails the handshake if it offered subprotocols and none is chosen
                String first = protocol.split(",")[0].trim();
                if (first.length() > 0) r.append("Sec-WebSocket-Protocol: ").append(first).append("\r\n");
            }
            writeRaw(r.append("\r\n").toString());
            return true;
        }

        private void writeRaw(String s) throws IOException {
            out.write(s.getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
        }

        /** The request line and headers, up to the blank line; null if the peer left or sent too much. */
        private String readHead(InputStream in) throws IOException {
            StringBuilder sb = new StringBuilder(512);
            while (sb.length() < 8192) {
                int b = in.read();
                if (b < 0) return null;
                sb.append((char) b);
                int n = sb.length();
                if (b == '\n' && n >= 4 && sb.charAt(n - 2) == '\r' && sb.charAt(n - 3) == '\n'
                        && sb.charAt(n - 4) == '\r') {
                    return sb.toString();
                }
            }
            return null;
        }

        /** The frame loop. Returns (or throws) when the connection is done reading. */
        void frames(InputStream in) throws IOException {
            ByteArrayOutputStream parts = null; // a fragmented message being reassembled
            int partsOp = 0;
            byte[] mask = new byte[4];
            while (true) {
                int b0 = in.read();
                int b1 = in.read();
                if (b0 < 0 || b1 < 0) throw new EOFException();
                boolean fin = (b0 & 0x80) != 0;
                int op = b0 & 0x0f;
                long len = b1 & 0x7f;
                if (len == 126) {
                    len = (read8(in) << 8) | read8(in);
                } else if (len == 127) {
                    len = 0;
                    for (int i = 0; i < 8; i++) len = (len << 8) | read8(in);
                }
                if ((b0 & 0x70) != 0 || (b1 & 0x80) == 0) {
                    fail(1002, "protocol error"); // extensions are never negotiated; clients must mask
                    return;
                }
                boolean control = op >= 8;
                if (control && (!fin || len > 125)) {
                    fail(1002, "bad control frame");
                    return;
                }
                long total = len + (op == OP_CONT && parts != null ? parts.size() : 0);
                if (len < 0 || total > MAX_MESSAGE) {
                    fail(1009, "message too big");
                    return;
                }
                readFully(in, mask, 4);
                byte[] data = new byte[(int) len];
                readFully(in, data, data.length);
                for (int i = 0; i < data.length; i++) data[i] ^= mask[i & 3];

                switch (op) {
                    case OP_CONT:
                        if (parts == null) {
                            fail(1002, "unexpected continuation");
                            return;
                        }
                        parts.write(data, 0, data.length);
                        if (fin) {
                            byte[] whole = parts.toByteArray();
                            parts = null;
                            if (!message(partsOp, whole)) return;
                        }
                        break;
                    case OP_TEXT:
                    case OP_BINARY:
                        if (parts != null) {
                            fail(1002, "expected continuation");
                            return;
                        }
                        if (fin) {
                            if (!message(op, data)) return;
                        } else {
                            parts = new ByteArrayOutputStream(Math.max(1024, data.length * 2));
                            parts.write(data, 0, data.length);
                            partsOp = op;
                        }
                        break;
                    case OP_CLOSE: {
                        int code = 1000;
                        if (data.length == 1) code = 1002;
                        else if (data.length >= 2) code = ((data[0] & 0xff) << 8) | (data[1] & 0xff);
                        close(validCloseCode(code) ? code : 1002, ""); // the echo; no-op if we closed first
                        return;
                    }
                    case OP_PING:
                        send(frame(OP_PONG, data));
                        break;
                    case OP_PONG:
                        break;
                    default:
                        fail(1002, "unknown opcode");
                        return;
                }
            }
        }

        /** A whole message. Binary ones are ignored (the protocol is text only). False to stop reading. */
        private boolean message(int op, byte[] data) {
            if (op != OP_TEXT) return true;
            String text;
            try {
                text = StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(data)).toString();
            } catch (CharacterCodingException e) {
                fail(1007, "invalid utf-8");
                return false;
            }
            onText(this, text);
            return true;
        }

        private void fail(int code, String reason) {
            log.log("relay: peer " + id + " closed: " + reason);
            close(code, reason);
        }

        private long read8(InputStream in) throws IOException {
            int b = in.read();
            if (b < 0) throw new EOFException();
            return b;
        }

        private void readFully(InputStream in, byte[] b, int n) throws IOException {
            int off = 0;
            while (off < n) {
                int r = in.read(b, off, n - off);
                if (r < 0) throw new EOFException();
                off += r;
            }
        }
    }
}
