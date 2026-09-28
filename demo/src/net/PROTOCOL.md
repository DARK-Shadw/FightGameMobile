# LAN relay protocol (v1)

Multiplayer runs the whole game in JavaScript. The host's page simulates the
match; the other pages send inputs and render what the host sends back. The
only native piece is a dumb **relay**: a WebSocket server that forwards text
messages between the host page and the joiners. Two relays implement this
same protocol:

- `tools/lan-server.js` (Node): serves the game over HTTP and relays at `/ws`.
- The Android app (Java): each hosting phone runs its own relay, found by
  other phones through UDP beacons.

## WebSocket relay

Text frames only, UTF-8. The request path is ignored (Node uses `/ws`). One
relay holds **one room**: a host and up to 7 joiners. Fields are separated by
`|`; the last field (a payload or a name) may itself contain `|`, so split at
most N-1 times.

### Peer → relay

| Frame | Meaning |
|---|---|
| `H\|<name>` | First frame: become the host. Refused if the room already has a host. |
| `J\|<name>` | First frame: join as a player. Refused if there is no host or the room is full. |
| `S\|<to>\|<payload>` | Send. From the host, `<to>` is a peer id or `*` (every joiner). From a joiner, `<to>` is ignored and the payload always goes to the host. |

### Relay → peer

| Frame | Meaning |
|---|---|
| `W\|<yourId>\|<hostId>` | Welcome, sent after `H` or `J`. Ids are positive integers, assigned in connection order. |
| `E\|<reason>` | Refusal (`host-exists`, `no-host`, `full`, `bad-hello`); the relay closes the socket after it. |
| `+\|<id>\|<name>` | To the host: a joiner arrived. |
| `-\|<id>` | To the host: a joiner left. |
| `M\|<from>\|<payload>` | A message from peer `<from>`. |
| `X\|host-left` | To joiners: the host disconnected. The relay closes their sockets. |

Any frame before a valid hello, or an unknown frame type, is ignored. The
relay pings every 15 s and drops a peer silent for 45 s. Frames are at most
1 MiB. When the host leaves, the room resets and a new host may say `H`.

## Room discovery (UDP, Android)

A hosting phone broadcasts a beacon every second to `255.255.255.255:47777`
(and to each interface's broadcast address):

```
SFA1|<roomName>|<wsPort>|<players>|<maxPlayers>
```

Phones looking for rooms listen on UDP port 47777 and take the room's IP
from the datagram's sender. A room is dropped 4 s after its last beacon.

## Android bridge

The app exposes `window.SFNative` (a `@JavascriptInterface` object). Every
method returns a string.

| Method | Returns |
|---|---|
| `platform()` | `"android"` |
| `version()` | app version name |
| `hostStart(roomName)` | JSON `{"ok":true,"port":47800,"ip":"192.168.1.23"}` or `{"ok":false,"error":"..."}`. Starts the relay on the first free port in 47800–47810, and the beacon. |
| `hostSetPlayers(n)` | `""`. Updates the player count in the beacon. |
| `hostStop()` | `""`. Stops the relay and the beacon. |
| `discoverStart()` | `""`. Starts listening for beacons. |
| `discoverStop()` | `""` |
| `localIp()` | the device's LAN IPv4 address, or `""` |
| `vibrate(ms)` | `""` |

The native side reports rooms by calling, on the UI thread,
`window.SFNativeEvent('rooms', '<json array>')` with
`[{"name":"..","ip":"..","port":47800,"players":2,"max":6}, ...]` whenever
the list changes, and at least once a second while discovering.

The hosting page connects to its own relay at `ws://127.0.0.1:<port>`;
joiners connect to `ws://<ip>:<port>`.

## Game messages (payloads)

Payloads are JSON objects with a `k` (kind) field, defined in
`src/net/session.js`. The relay never looks inside them.
