package com.skillforge.arena.net;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Listens for room beacons on UDP 47777 and keeps the list of rooms on the LAN. A room is keyed by
 * the sender's IP and its relay port, and dropped 4 s after its last beacon. The listener runs on
 * the discovery thread whenever the list changes (a room appears, disappears, or its name or player
 * count changes).
 */
public final class Discovery {
    public static final int PORT = 47777;
    public static final long EXPIRY_MS = 4000;

    public interface Listener {
        void onRoomsChanged(Discovery discovery);
    }

    /** One room as the page sees it. */
    public static final class Room {
        public final String name, ip;
        public final int port, players, max;
        long seen;

        Room(String name, String ip, int port, int players, int max) {
            this.name = name;
            this.ip = ip;
            this.port = port;
            this.players = players;
            this.max = max;
        }

        boolean sameAs(Room o) {
            return name.equals(o.name) && players == o.players && max == o.max;
        }

        String toJson() {
            return "{\"name\":" + Net.quote(name, false) + ",\"ip\":" + Net.quote(ip, false)
                    + ",\"port\":" + port + ",\"players\":" + players + ",\"max\":" + max + "}";
        }
    }

    private final int udpPort;
    private final Listener listener;
    private final Net.Log log;
    private final LinkedHashMap<String, Room> rooms = new LinkedHashMap<String, Room>(); // guarded by this
    private volatile boolean running;
    private DatagramSocket socket;

    public Discovery(Listener listener, Net.Log log) {
        this(PORT, listener, log);
    }

    public Discovery(int udpPort, Listener listener, Net.Log log) {
        this.udpPort = udpPort;
        this.listener = listener;
        this.log = log != null ? log : Net.SILENT;
    }

    /** Binds UDP port 47777 (shared with other listeners) and starts listening. */
    public void start() throws IOException {
        final DatagramSocket s;
        synchronized (this) {
            if (running) return;
            s = new DatagramSocket(null);
            try {
                s.setReuseAddress(true);
                s.setBroadcast(true);
                s.bind(new InetSocketAddress(udpPort));
                s.setSoTimeout(500);
            } catch (IOException e) {
                s.close();
                throw e;
            }
            socket = s;
            running = true;
        }
        log.log("discovery: listening on udp " + udpPort);
        Net.thread("sfa-discovery", new Runnable() {
            @Override public void run() { loop(s); }
        });
    }

    public void stop() {
        DatagramSocket s;
        synchronized (this) {
            running = false;
            s = socket;
            socket = null;
            rooms.clear();
        }
        if (s != null) s.close();
    }

    public boolean isRunning() {
        return running;
    }

    /** The rooms seen in the last 4 s, sorted by name then address. */
    public synchronized List<Room> rooms() {
        long now = Net.now();
        List<Room> out = new ArrayList<Room>();
        for (Room r : rooms.values()) if (now - r.seen <= EXPIRY_MS) out.add(r);
        Collections.sort(out, new Comparator<Room>() {
            @Override public int compare(Room a, Room b) {
                int c = a.name.compareToIgnoreCase(b.name);
                if (c == 0) c = a.ip.compareTo(b.ip);
                return c != 0 ? c : a.port - b.port;
            }
        });
        return out;
    }

    /** rooms() as the JSON array the page gets: [{"name":..,"ip":..,"port":..,"players":..,"max":..}]. */
    public String roomsJson() {
        StringBuilder b = new StringBuilder("[");
        for (Room r : rooms()) {
            if (b.length() > 1) b.append(',');
            b.append(r.toJson());
        }
        return b.append(']').toString();
    }

    private void loop(DatagramSocket s) {
        byte[] buf = new byte[1500];
        DatagramPacket p = new DatagramPacket(buf, buf.length);
        while (running) {
            boolean changed = false;
            try {
                p.setLength(buf.length);
                s.receive(p);
                changed = offer(p.getAddress(), new String(buf, 0, p.getLength(), StandardCharsets.UTF_8));
            } catch (SocketTimeoutException e) {
                // no beacon for 500 ms: still expire old rooms below
            } catch (IOException e) {
                if (!running) break;
                log.log("discovery: " + e);
                Net.sleep(250);
            }
            changed |= prune();
            if (changed && running && listener != null) {
                try {
                    listener.onRoomsChanged(this);
                } catch (RuntimeException e) {
                    log.log("discovery: listener failed: " + e);
                }
            }
        }
    }

    /**
     * Takes one datagram. The three numbers are read from the right, so a room name that contains
     * '|' still parses. Returns true if the room list changed.
     */
    synchronized boolean offer(InetAddress from, String msg) {
        if (from == null || !msg.startsWith("SFA1|")) return false;
        int c3 = msg.lastIndexOf('|');
        int c2 = c3 > 0 ? msg.lastIndexOf('|', c3 - 1) : -1;
        int c1 = c2 > 0 ? msg.lastIndexOf('|', c2 - 1) : -1;
        if (c1 < 4) return false;
        int port, players, max;
        try {
            port = Integer.parseInt(msg.substring(c1 + 1, c2).trim());
            players = Integer.parseInt(msg.substring(c2 + 1, c3).trim());
            max = Integer.parseInt(msg.substring(c3 + 1).trim());
        } catch (NumberFormatException e) {
            return false;
        }
        if (port < 1 || port > 65535 || players < 0 || players > 999 || max < 0 || max > 999) return false;
        String name = c1 > 5 ? msg.substring(5, c1) : "";
        if (name.length() > 64) name = name.substring(0, 64);
        String ip = from.getHostAddress();
        Room r = new Room(name, ip, port, players, max);
        r.seen = Net.now();
        Room old = rooms.put(ip + ":" + port, r);
        return old == null || !old.sameAs(r) || Net.now() - old.seen > EXPIRY_MS;
    }

    /** Drops rooms not heard from for 4 s. Returns true if any went away. */
    private synchronized boolean prune() {
        long now = Net.now();
        boolean changed = false;
        for (Iterator<Room> it = rooms.values().iterator(); it.hasNext(); ) {
            if (now - it.next().seen > EXPIRY_MS) {
                it.remove();
                changed = true;
            }
        }
        return changed;
    }
}
