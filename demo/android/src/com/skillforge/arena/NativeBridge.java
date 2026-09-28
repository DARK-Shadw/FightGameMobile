package com.skillforge.arena;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.os.Vibrator;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.skillforge.arena.net.Beacon;
import com.skillforge.arena.net.Discovery;
import com.skillforge.arena.net.Net;
import com.skillforge.arena.net.Relay;

/**
 * window.SFNative, as specified in src/net/PROTOCOL.md ("Android bridge"). Every method returns a
 * String. WebView calls these on its JavaBridge thread, never the UI thread, so the state here is
 * guarded by this object's lock; events go back to the page on the UI thread.
 *
 * <p>Numeric arguments are declared as String: WebView turns a JS number into its decimal text for
 * a String parameter, while a JS string passed to an int parameter would silently become 0.
 */
public final class NativeBridge {
    static final String TAG = "SFArena";
    /** maxPlayers in the beacon: a 3v3 match. The relay itself takes a host and 7 joiners. */
    static final int MAX_PLAYERS = 6;

    private final Context app;
    private final WebView web;
    private final String versionName;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Net.Log log = new Net.Log() {
        @Override public void log(String msg) { Log.i(TAG, msg); }
    };

    private Relay relay;
    private Beacon beacon;
    private Discovery discovery;
    private WifiManager.MulticastLock multicast;
    private boolean destroyed;

    NativeBridge(Context app, WebView web, String versionName) {
        this.app = app;
        this.web = web;
        this.versionName = versionName;
    }

    @JavascriptInterface
    public String platform() {
        return "android";
    }

    @JavascriptInterface
    public String version() {
        return versionName;
    }

    /** Starts the relay on the first free port in 47800-47810 and the beacon. Restarts if hosting. */
    @JavascriptInterface
    public synchronized String hostStart(String roomName) {
        if (destroyed) return "{\"ok\":false,\"error\":\"app closing\"}";
        stopHosting();
        String name = roomName == null || roomName.trim().length() == 0 || roomName.equals("undefined")
                ? "Room" : roomName.trim();
        Relay r = new Relay(log);
        int port;
        try {
            port = r.start(Relay.FIRST_PORT, Relay.LAST_PORT);
        } catch (Exception e) {
            Log.w(TAG, "hostStart failed", e);
            return "{\"ok\":false,\"error\":" + Net.quote(String.valueOf(e.getMessage()), false) + "}";
        }
        Beacon b = new Beacon(name, port, 1, MAX_PLAYERS, log);
        b.start();
        relay = r;
        beacon = b;
        String ip = Net.localIPv4();
        Log.i(TAG, "hosting \"" + name + "\" at " + ip + ":" + port);
        return "{\"ok\":true,\"port\":" + port + ",\"ip\":" + Net.quote(ip, false) + "}";
    }

    @JavascriptInterface
    public synchronized String hostSetPlayers(String n) {
        if (beacon != null) beacon.setPlayers((int) Math.max(0, Math.min(999, Net.parseLong(n, 1))));
        return "";
    }

    @JavascriptInterface
    public synchronized String hostStop() {
        stopHosting();
        return "";
    }

    /** Listens for beacons; the page gets SFNativeEvent('rooms', json) on changes and every second. */
    @JavascriptInterface
    public synchronized String discoverStart() {
        if (destroyed) return "";
        if (discovery == null) {
            acquireMulticast();
            Discovery d = new Discovery(new Discovery.Listener() {
                @Override public void onRoomsChanged(Discovery d) { ui.post(emitRooms); }
            }, log);
            try {
                d.start();
            } catch (Exception e) {
                // UDP 47777 taken: keep reporting an empty list rather than failing the page
                Log.w(TAG, "discovery failed to start", e);
            }
            discovery = d;
        }
        ui.removeCallbacks(tick);
        ui.post(tick);
        return "";
    }

    @JavascriptInterface
    public synchronized String discoverStop() {
        stopDiscovery();
        return "";
    }

    @JavascriptInterface
    public String localIp() {
        return Net.localIPv4();
    }

    @JavascriptInterface
    public String vibrate(String ms) {
        long t = Math.min(5000, Net.parseLong(ms, 0));
        if (t <= 0) return "";
        try {
            Vibrator v = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(t);
        } catch (Exception e) {
            Log.w(TAG, "vibrate failed", e);
        }
        return "";
    }

    /** Activity onDestroy: stops the relay, the beacon and discovery, and releases the multicast lock. */
    synchronized void shutdown() {
        destroyed = true;
        stopHosting();
        stopDiscovery();
        ui.removeCallbacksAndMessages(null);
    }

    // ---------------------------------------------------------------- internals (hold this)

    private void stopHosting() {
        if (beacon != null) beacon.stop();
        if (relay != null) relay.stop();
        beacon = null;
        relay = null;
    }

    private void stopDiscovery() {
        ui.removeCallbacks(tick);
        if (discovery != null) discovery.stop();
        discovery = null;
        if (multicast != null) {
            try {
                if (multicast.isHeld()) multicast.release();
            } catch (Exception e) {
                Log.w(TAG, "multicast release failed", e);
            }
        }
    }

    /** Some phones drop broadcast packets unless an app holds a multicast lock. */
    private void acquireMulticast() {
        try {
            if (multicast == null) {
                WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
                if (wm == null) return;
                multicast = wm.createMulticastLock("sfa-discovery");
                multicast.setReferenceCounted(false);
            }
            multicast.acquire();
        } catch (Exception e) {
            Log.w(TAG, "multicast lock failed", e);
        }
    }

    // ---------------------------------------------------------------- events (UI thread)

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            synchronized (NativeBridge.this) {
                if (discovery == null || destroyed) return;
            }
            emitRooms.run();
            ui.postDelayed(this, 1000);
        }
    };

    private final Runnable emitRooms = new Runnable() {
        @Override public void run() {
            String json;
            synchronized (NativeBridge.this) {
                if (discovery == null || destroyed) return;
                json = discovery.roomsJson();
            }
            emit("rooms", json);
        }
    };

    /** window.SFNativeEvent(type, data), with data as an escaped JS string literal. UI thread only. */
    private void emit(String type, String data) {
        String js = "window.SFNativeEvent&&window.SFNativeEvent(" + Net.quote(type, true) + ","
                + Net.quote(data, true) + ")";
        try {
            web.evaluateJavascript(js, null);
        } catch (Exception e) {
            Log.w(TAG, "event " + type + " not delivered", e);
        }
    }
}
