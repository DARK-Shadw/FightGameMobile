package com.skillforge.arena.net;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;

/**
 * Helpers shared by the relay, the beacon and discovery. Pure Java (no android.*), Java 8 syntax
 * without lambdas, and only APIs present on Android 24, so it dexes and also runs on a desktop JVM.
 */
public final class Net {
    private Net() {}

    /** Where the networking classes report what they do (logcat on Android, stdout in the tests). */
    public interface Log {
        void log(String msg);
    }

    static final Log SILENT = new Log() {
        @Override public void log(String msg) {}
    };

    private static final long T0 = System.nanoTime();

    /** Monotonic milliseconds, always at least 1 (0 can then mean "never"). */
    static long now() {
        return (System.nanoTime() - T0) / 1000000L + 1;
    }

    static Thread thread(String name, Runnable r) {
        Thread t = new Thread(r, name);
        t.setDaemon(true);
        t.start();
        return t;
    }

    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // ---------------------------------------------------------------- addresses

    private static final String[] WIFI = {"wlan", "swlan", "ap", "softap", "wl"};
    private static final String[] WIRED = {"eth", "en", "usb", "rndis", "bt-pan", "p2p"};
    private static final String[] NEVER = {"rmnet", "r_rmnet", "ccmni", "pdp", "ppp", "v4-", "clat",
            "tun", "dummy", "ifb", "sit", "ip6", "ip_vti", "lo"};

    /** Lower is better; -1 means the interface never carries the LAN address (cellular, VPN, down). */
    static int rank(NetworkInterface ni) {
        try {
            if (!ni.isUp() || ni.isLoopback()) return -1;
        } catch (Exception e) {
            return -1;
        }
        String n = ni.getName() == null ? "" : ni.getName().toLowerCase(Locale.US);
        for (String p : NEVER) if (n.startsWith(p)) return -1;
        for (String p : WIFI) if (n.startsWith(p)) return 0;
        for (String p : WIRED) if (n.startsWith(p)) return 1;
        return 2;
    }

    /**
     * The device's LAN IPv4 address: site-local, not loopback, on an interface that is up. Wi-Fi and
     * hotspot interfaces (wlan*, ap*, swlan*) win over anything else; cellular and VPN interfaces
     * never count, since other phones cannot reach them. If no interface has a site-local address
     * (some campus Wi-Fi hands out public ones), a routable IPv4 on a Wi-Fi or wired interface is
     * used instead. Returns "" when there is none.
     */
    public static String localIPv4() {
        String best = "", fallback = "";
        int bestRank = Integer.MAX_VALUE, fallbackRank = Integer.MAX_VALUE;
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            if (en == null) return "";
            for (NetworkInterface ni : Collections.list(en)) {
                int r = rank(ni);
                if (r < 0) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress() || a.isLinkLocalAddress()
                            || a.isAnyLocalAddress() || a.isMulticastAddress()) {
                        continue;
                    }
                    if (a.isSiteLocalAddress()) {
                        if (r < bestRank) {
                            best = a.getHostAddress();
                            bestRank = r;
                        }
                    } else if (r <= 1 && r < fallbackRank) {
                        fallback = a.getHostAddress();
                        fallbackRank = r;
                    }
                }
            }
        } catch (Exception e) {
            // SocketException, or a SecurityException on a locked-down device: no LAN address
        }
        return best.length() > 0 ? best : fallback;
    }

    /**
     * Where a beacon goes: the limited broadcast 255.255.255.255 plus each up IPv4 interface's own
     * broadcast address. The per-interface ones matter on a phone running a hotspot, whose default
     * route is cellular: a directed broadcast leaves through the hotspot interface anyway.
     */
    public static List<InetAddress> broadcastTargets() {
        List<InetAddress> out = new ArrayList<InetAddress>();
        try {
            out.add(InetAddress.getByAddress(new byte[] {(byte) 255, (byte) 255, (byte) 255, (byte) 255}));
        } catch (Exception e) {
            // cannot happen for a literal address
        }
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            if (en == null) return out;
            for (NetworkInterface ni : Collections.list(en)) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress b = ia == null ? null : ia.getBroadcast();
                    if (b instanceof Inet4Address && !out.contains(b)) out.add(b);
                }
            }
        } catch (Exception e) {
            // keep the limited broadcast only
        }
        return out;
    }

    // ---------------------------------------------------------------- text

    private static final char[] HEX = "0123456789abcdef".toCharArray();

    /**
     * A double-quoted JSON string literal. With asciiOnly every char outside printable ASCII is
     * \\u-escaped as well, which also makes it a safe JavaScript string literal (U+2028 and U+2029
     * included) to splice into code for evaluateJavascript.
     */
    public static String quote(String s, boolean asciiOnly) {
        if (s == null) s = "";
        StringBuilder b = new StringBuilder(s.length() + 16).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029 || (asciiOnly && c >= 0x7f)) {
                        b.append("\\u").append(HEX[c >> 12 & 15]).append(HEX[c >> 8 & 15])
                                .append(HEX[c >> 4 & 15]).append(HEX[c & 15]);
                    } else {
                        b.append(c);
                    }
            }
        }
        return b.append('"').toString();
    }

    private static final char[] B64 =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();

    /** Standard padded base64 (java.util.Base64 does not exist on Android 24 and 25). */
    public static String base64(byte[] d) {
        StringBuilder b = new StringBuilder((d.length + 2) / 3 * 4);
        for (int i = 0; i < d.length; i += 3) {
            int n = (d[i] & 0xff) << 16;
            if (i + 1 < d.length) n |= (d[i + 1] & 0xff) << 8;
            if (i + 2 < d.length) n |= d[i + 2] & 0xff;
            b.append(B64[n >>> 18 & 63]).append(B64[n >>> 12 & 63]);
            b.append(i + 1 < d.length ? B64[n >>> 6 & 63] : '=');
            b.append(i + 2 < d.length ? B64[n & 63] : '=');
        }
        return b.toString();
    }

    /** Parses a number from JavaScript ("3", "3.7", " 12 "); returns def when it is not one. */
    public static long parseLong(String s, long def) {
        if (s == null) return def;
        try {
            double d = Double.parseDouble(s.trim());
            return Double.isNaN(d) ? def : (long) d;
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
