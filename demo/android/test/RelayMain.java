import com.skillforge.arena.net.Net;
import com.skillforge.arena.net.Relay;

/**
 * Runs the app's relay (com.skillforge.arena.net.Relay) on a desktop JVM, for the conformance test:
 *
 *   javac -d /tmp/relay android/src/com/skillforge/arena/net/*.java android/test/RelayMain.java
 *   java -cp /tmp/relay RelayMain 47800 &
 *   node tools/relay-test.mjs ws://127.0.0.1:47800/
 *
 * Add -q to silence the relay's log.
 */
public class RelayMain {
    public static void main(String[] args) throws Exception {
        int port = Relay.FIRST_PORT;
        boolean quiet = false;
        for (String a : args) {
            if (a.equals("-q")) quiet = true;
            else port = Integer.parseInt(a);
        }
        final boolean q = quiet;
        final Relay relay = new Relay(new Net.Log() {
            @Override public void log(String msg) {
                if (!q) System.out.println(msg);
            }
        });
        int p = relay.start(port, port);
        System.out.println("RelayMain: ws://127.0.0.1:" + p + "/  (LAN " + Net.localIPv4() + ")");
        Runtime.getRuntime().addShutdownHook(new Thread() {
            @Override public void run() { relay.stop(); }
        });
        while (true) Thread.sleep(60000);
    }
}
