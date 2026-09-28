import com.skillforge.arena.net.Beacon;
import com.skillforge.arena.net.Discovery;
import com.skillforge.arena.net.Net;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Desktop sanity check for the UDP side: a Beacon and a Discovery on this machine must see each
 * other through a real broadcast, the player count must update, and the room must expire about 4 s
 * after the beacon stops.
 *
 *   javac -d /tmp/relay android/src/com/skillforge/arena/net/*.java android/test/BeaconCheck.java
 *   java -cp /tmp/relay BeaconCheck
 */
public class BeaconCheck {
    static int failures;

    public static void main(String[] args) throws Exception {
        Net.Log log = new Net.Log() {
            @Override public void log(String msg) { System.out.println("  log: " + msg); }
        };
        final AtomicInteger changes = new AtomicInteger();
        Discovery d = new Discovery(new Discovery.Listener() {
            @Override public void onRoomsChanged(Discovery disc) {
                changes.incrementAndGet();
                System.out.println("  rooms changed: " + disc.roomsJson());
            }
        }, log);
        d.start();

        String name = "Kai's \"room\" | ü";
        Beacon b = new Beacon(name, 47800, 1, 6, log);
        System.out.println("  beacon: " + b.message() + "  targets " + Net.broadcastTargets());
        b.start();

        check("room appears", waitFor(d, "\"players\":1", 3000));
        String json = d.roomsJson();
        check("name escaped, port and max parsed",
                json.contains("\"name\":\"Kai's \\\"room\\\"   ü\"") && json.contains("\"port\":47800")
                        && json.contains("\"max\":6"));

        b.setPlayers(3);
        check("player count update arrives quickly", waitFor(d, "\"players\":3", 1000));

        int before = changes.get();
        b.stop();
        long t0 = System.currentTimeMillis();
        boolean gone = waitFor(d, "[]", 6000);
        long dt = System.currentTimeMillis() - t0;
        check("room expires after the beacon stops (" + dt + " ms)", gone && dt >= 3000 && dt <= 5500);
        check("listener fired on removal", changes.get() > before);
        d.stop();

        System.out.println(failures == 0 ? "BeaconCheck: all passed" : "BeaconCheck: " + failures + " failed");
        System.exit(failures == 0 ? 0 : 1);
    }

    static boolean waitFor(Discovery d, String needle, long ms) throws InterruptedException {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            String j = d.roomsJson();
            if (needle.equals("[]") ? j.equals("[]") : j.contains(needle)) return true;
            Thread.sleep(50);
        }
        return false;
    }

    static void check(String what, boolean ok) {
        System.out.println((ok ? "PASS  " : "FAIL  ") + what);
        if (!ok) failures++;
    }
}
