package com.skillforge.arena.net;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;

/**
 * Announces a hosted room on the LAN (src/net/PROTOCOL.md, "Room discovery"): every second a UDP
 * datagram {@code SFA1|<roomName>|<wsPort>|<players>|<maxPlayers>} goes to 255.255.255.255:47777
 * and to each interface's broadcast address. A player-count change is sent right away.
 */
public final class Beacon {
    public static final int PORT = 47777;
    static final long INTERVAL_MS = 1000, MIN_GAP_MS = 250;

    private final int udpPort;
    private final Net.Log log;
    private final Object lock = new Object();
    private volatile String roomName;
    private volatile int wsPort, players, maxPlayers;
    private boolean running, poked; // guarded by lock

    public Beacon(String roomName, int wsPort, int players, int maxPlayers, Net.Log log) {
        this(roomName, wsPort, players, maxPlayers, PORT, log);
    }

    public Beacon(String roomName, int wsPort, int players, int maxPlayers, int udpPort, Net.Log log) {
        this.roomName = roomName;
        this.wsPort = wsPort;
        this.players = players;
        this.maxPlayers = maxPlayers;
        this.udpPort = udpPort;
        this.log = log != null ? log : Net.SILENT;
    }

    /** The datagram text. '|' and line breaks in the name become spaces so every reader can split it. */
    public String message() {
        String n = roomName == null ? "" : roomName.replace('|', ' ').replace('\n', ' ').replace('\r', ' ');
        if (n.length() > 48) n = n.substring(0, 48);
        return "SFA1|" + n + "|" + wsPort + "|" + players + "|" + maxPlayers;
    }

    public void setPlayers(int n) {
        if (n == players) return;
        players = n;
        poke();
    }

    public void setRoomName(String name) {
        roomName = name;
        poke();
    }

    public void start() {
        synchronized (lock) {
            if (running) return;
            running = true;
        }
        Net.thread("sfa-beacon", new Runnable() {
            @Override public void run() { loop(); }
        });
    }

    public void stop() {
        synchronized (lock) {
            running = false;
            lock.notifyAll();
        }
    }

    private void poke() {
        synchronized (lock) {
            poked = true;
            lock.notifyAll();
        }
    }

    private void loop() {
        DatagramSocket socket = null;
        String lastError = null;
        try {
            while (true) {
                try {
                    if (socket == null) {
                        socket = new DatagramSocket();
                        socket.setBroadcast(true);
                    }
                    byte[] data = message().getBytes(StandardCharsets.UTF_8);
                    int sent = 0;
                    String err = null;
                    for (InetAddress a : Net.broadcastTargets()) {
                        try {
                            socket.send(new DatagramPacket(data, data.length, a, udpPort));
                            sent++;
                        } catch (IOException e) {
                            // e.g. ENETUNREACH for 255.255.255.255 on a phone without a default route
                            err = a.getHostAddress() + ": " + e.getMessage();
                        }
                    }
                    if (sent == 0 && err != null && !err.equals(lastError)) log.log("beacon: " + err);
                    lastError = sent == 0 ? err : null;
                } catch (IOException e) {
                    if (!String.valueOf(e).equals(lastError)) log.log("beacon: " + e);
                    lastError = String.valueOf(e);
                    if (socket != null) socket.close();
                    socket = null;
                }
                long sentAt = Net.now();
                synchronized (lock) {
                    // sleep a second, or until a change asks for an early beacon (at most every 250 ms)
                    while (running) {
                        long waited = Net.now() - sentAt;
                        long left = (poked ? MIN_GAP_MS : INTERVAL_MS) - waited;
                        if (left <= 0) break;
                        try {
                            lock.wait(left);
                        } catch (InterruptedException e) {
                            running = false;
                        }
                    }
                    if (!running) return;
                    poked = false;
                }
            }
        } finally {
            if (socket != null) socket.close();
        }
    }
}
