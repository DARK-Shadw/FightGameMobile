// Relay conformance test for src/net/PROTOCOL.md. Point it at a fresh relay (no host yet):
//
//   node tools/relay-test.mjs ws://127.0.0.1:8080/ws       the Node relay (tools/lan-server.js)
//   node tools/relay-test.mjs ws://127.0.0.1:47800/        the Android relay on a desktop JVM
//                                                          (see android/test/RelayMain.java)
//
// Protocol checks use Node 22's global WebSocket client (no dependencies). A raw TCP client covers
// the RFC 6455 details a WebSocket API cannot produce: fragmented messages, pings, masking.
// Add --slow for the timing rules too (about 50 s more): pings every 15 s, a peer silent for 45 s
// is dropped, peers that answer pings are kept.
// Prints one PASS/FAIL line per check and exits non-zero if any check fails.
import net from 'node:net';
import crypto from 'node:crypto';

const url = process.argv.slice(2).find(a => !a.startsWith('--'));
const SLOW = process.argv.includes('--slow');
if (!url || !/^wss?:\/\//.test(url)) {
  console.error('usage: node tools/relay-test.mjs <ws-url> [--slow]');
  process.exit(2);
}
if (typeof WebSocket !== 'function') {
  console.error('needs a global WebSocket (Node 22 or later)');
  process.exit(2);
}

const WAIT = 3000; // how long to wait for an expected frame
const QUIET = 300; // how long a peer must stay silent when it should receive nothing
const MiB = 1 << 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ WebSocket peers

class Peer {
  constructor(label) {
    this.label = label;
    this.inbox = [];
    this.waiters = [];
    this.closed = null; // { code, reason } once closed
    this.closeWaiters = [];
  }

  static open(label) {
    return new Promise((resolve, reject) => {
      const p = new Peer(label);
      const ws = new WebSocket(url);
      p.ws = ws;
      const timer = setTimeout(() => reject(new Error(`${label}: no connection after ${WAIT} ms`)), WAIT);
      ws.onopen = () => { clearTimeout(timer); resolve(p); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error(`${label}: connection failed`)); };
      ws.onmessage = e => p.deliver(typeof e.data === 'string' ? e.data : '[binary frame]');
      ws.onclose = e => {
        p.closed = { code: e.code, reason: e.reason };
        for (const w of p.waiters.splice(0)) w.reject(new Error(`${label}: closed (${e.code}) while waiting for a frame`));
        for (const w of p.closeWaiters.splice(0)) w(p.closed);
      };
    });
  }

  deliver(m) {
    const w = this.waiters.shift();
    if (w) w.resolve(m);
    else this.inbox.push(m);
  }

  send(m) { this.ws.send(m); }

  /** The next frame this peer receives. */
  next(ms = WAIT) {
    if (this.inbox.length) return Promise.resolve(this.inbox.shift());
    if (this.closed) return Promise.reject(new Error(`${this.label}: closed (${this.closed.code}), no frame`));
    return new Promise((resolve, reject) => {
      const w = {
        resolve: m => { clearTimeout(t); resolve(m); },
        reject: e => { clearTimeout(t); reject(e); },
      };
      const t = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        reject(new Error(`${this.label}: nothing received in ${ms} ms`));
      }, ms);
      this.waiters.push(w);
    });
  }

  /** Asserts the next frame equals want (or matches a RegExp); returns the frame or the match. */
  async expect(want, ms) {
    const got = await this.next(ms);
    if (want instanceof RegExp) {
      const m = got.match(want);
      if (!m) throw new Error(`${this.label}: expected ${want}, got ${show(got)}`);
      return m;
    }
    if (got !== want) throw new Error(`${this.label}: expected ${show(want)}, got ${show(got)}`);
    return got;
  }

  /** Asserts nothing arrives for a while. */
  async quiet(ms = QUIET) {
    await sleep(ms);
    if (this.inbox.length) throw new Error(`${this.label}: unexpected ${show(this.inbox[0])}`);
  }

  /** Resolves with { code, reason } once the relay has closed the socket. */
  waitClose(ms = WAIT) {
    if (this.closed) return Promise.resolve(this.closed);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label}: still open after ${ms} ms`)), ms);
      this.closeWaiters.push(c => { clearTimeout(t); resolve(c); });
    });
  }

  close() {
    try { this.ws.close(); } catch { /* already closed */ }
    return this.waitClose();
  }
}

function show(s) {
  const t = String(s);
  return JSON.stringify(t.length > 80 ? `${t.slice(0, 60)}...(${t.length} chars)` : t);
}

// ------------------------------------------------------------------ raw RFC 6455 client

function rawFrame(op, payload, fin = true) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const n = data.length;
  const head = n < 126 ? 2 : n < 65536 ? 4 : 10;
  const f = Buffer.alloc(head + 4 + n);
  f[0] = (fin ? 0x80 : 0) | op;
  if (n < 126) f[1] = 0x80 | n;
  else if (n < 65536) { f[1] = 0x80 | 126; f.writeUInt16BE(n, 2); }
  else { f[1] = 0x80 | 127; f.writeBigUInt64BE(BigInt(n), 2); }
  const mask = crypto.randomBytes(4);
  mask.copy(f, head);
  for (let i = 0; i < n; i++) f[head + 4 + i] = data[i] ^ mask[i & 3];
  return f;
}

function rawConnect(label) {
  const u = new URL(url);
  if (u.protocol !== 'ws:') throw new Error('raw checks need a ws:// URL');
  const key = crypto.randomBytes(16).toString('base64');
  const expectAccept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(u.port || 80), u.hostname);
    const c = { label, frames: [], waiters: [], ended: false, maskedFromServer: false, sock };
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`${label}: no handshake after ${WAIT} ms`)); }, WAIT);
    const push = f => { const w = c.waiters.shift(); if (w) w(f); else c.frames.push(f); };
    sock.on('connect', () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        const head = buf.subarray(0, i).toString('latin1');
        buf = buf.subarray(i + 4);
        clearTimeout(timer);
        const accept = /\r\nsec-websocket-accept:\s*(\S+)/i.exec(head);
        if (!/^HTTP\/1\.1 101/.test(head) || !accept || accept[1] !== expectAccept) {
          sock.destroy();
          reject(new Error(`${label}: bad handshake response ${show(head)}`));
          return;
        }
        upgraded = true;
        resolve(c);
      }
      while (buf.length >= 2) {
        const b0 = buf[0], b1 = buf[1];
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (b1 & 0x80) { c.maskedFromServer = true; off += 4; }
        if (buf.length < off + len) return;
        push({ fin: !!(b0 & 0x80), op: b0 & 0x0f, data: Buffer.from(buf.subarray(off, off + len)) });
        buf = buf.subarray(off + len);
      }
    });
    sock.on('close', () => { c.ended = true; for (const w of c.waiters.splice(0)) w(null); });
    sock.on('error', () => {});
    c.send = (op, payload, fin) => sock.write(rawFrame(op, payload, fin));
    c.next = (ms = WAIT) => {
      if (c.frames.length) return Promise.resolve(c.frames.shift());
      if (c.ended) return Promise.resolve(null);
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(`${label}: no frame in ${ms} ms`)), ms);
        c.waiters.push(f => { clearTimeout(t); res(f); });
      });
    };
    c.ends = (ms = WAIT) => new Promise((res, rej) => {
      if (c.ended) return res();
      const t = setTimeout(() => rej(new Error(`${label}: TCP still open after ${ms} ms`)), ms);
      sock.once('close', () => { clearTimeout(t); res(); });
    });
  });
}

// ------------------------------------------------------------------ checks

let passed = 0, failed = 0;
async function check(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`PASS  ${name}${note ? `  (${note})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}
function assert(ok, msg) { if (!ok) throw new Error(msg); }

const ids = {}; // label -> id
const peers = {}; // label -> Peer
const WELCOME = /^W\|([1-9]\d*)\|([1-9]\d*)$/;
const UNI = 'unicast|with|pipes ✓ ünïcödé 🥊 "quotes" \\ back';
const ALL = 'broadcast|*|to everyone — 日本語 🎮';
const UP = 'from Alice|to the host|ëmoji 🙂';

console.log(`relay-test: ${url}`);

await check('joiner before any host is refused (E|no-host, then closed)', async () => {
  const p = await Peer.open('early');
  p.send('J|Early Bird');
  await p.expect('E|no-host');
  const c = await p.waitClose();
  return `close ${c.code}`;
});

await check('host hello/welcome (H → W|id|id)', async () => {
  const h = peers.host = await Peer.open('host');
  h.send('H|Host ü');
  const [, you, host] = await h.expect(WELCOME);
  assert(you === host, `host got W|${you}|${host}: its id should be the host id`);
  ids.host = Number(you);
  return `host id ${you}`;
});

await check('second host is refused (E|host-exists)', async () => {
  const p = await Peer.open('host2');
  p.send('H|Impostor');
  await p.expect('E|host-exists');
  await p.waitClose();
});

await check('joiner join (W to joiner, + to host)', async () => {
  const a = peers.a = await Peer.open('alice');
  a.send('J|Alice');
  const [, you, host] = await a.expect(WELCOME);
  ids.a = Number(you);
  assert(Number(host) === ids.host, `alice's welcome names host ${host}, expected ${ids.host}`);
  assert(ids.a > ids.host, `ids should grow in connection order (host ${ids.host}, alice ${ids.a})`);
  await peers.host.expect(`+|${ids.a}|Alice`);
  return `joiner id ${ids.a}`;
});

await check('frames before a hello are ignored; names keep | and non-ASCII', async () => {
  const b = peers.b = await Peer.open('bob');
  b.send('S|*|too early');
  b.send('Q|unknown type');
  b.send('J|Bob|the ü builder');
  const [, you, host] = await b.expect(WELCOME);
  ids.b = Number(you);
  assert(Number(host) === ids.host, `bob's welcome names host ${host}`);
  assert(ids.b > ids.a, 'ids should grow in connection order');
  await peers.host.expect(`+|${ids.b}|Bob|the ü builder`); // and nothing from the early frames
  await peers.a.quiet(100);
});

await check('host → one joiner (S|id|payload with | and non-ASCII)', async () => {
  peers.host.send(`S|${ids.a}|${UNI}`);
  await peers.a.expect(`M|${ids.host}|${UNI}`);
  await peers.b.quiet();
});

await check('host → every joiner (S|*|...)', async () => {
  peers.host.send(`S|*|${ALL}`);
  await peers.a.expect(`M|${ids.host}|${ALL}`);
  await peers.b.expect(`M|${ids.host}|${ALL}`);
});

await check('joiner → host, <to> ignored (S|x|... → M|joiner|...)', async () => {
  peers.a.send(`S|99999|${UP}`);
  await peers.host.expect(`M|${ids.a}|${UP}`);
  peers.b.send(`S|*|${UP}`);
  await peers.host.expect(`M|${ids.b}|${UP}`);
  await peers.a.quiet(100);
  await peers.b.quiet(100);
});

await check('host → unknown id is dropped', async () => {
  peers.host.send('S|99999|nobody');
  await peers.a.quiet(150);
  await peers.b.quiet(150);
});

await check('200 KB payload, both directions', async () => {
  const unit = 'ü|✓🥊abcdefghijklmnopqrstuvwxyz0123456789';
  const big = unit.repeat(Math.ceil(200 * 1024 / unit.length)).slice(0, 200 * 1024);
  peers.host.send(`S|${ids.a}|${big}`);
  const got1 = await peers.a.next(5000);
  assert(got1 === `M|${ids.host}|${big}`, `alice got ${show(got1)}`);
  peers.a.send(`S|0|${big}`);
  const got2 = await peers.host.next(5000);
  assert(got2 === `M|${ids.a}|${big}`, `host got ${show(got2)}`);
  return `${Buffer.byteLength(big)} bytes UTF-8`;
});

await check('a 1 MiB message is relayed', async () => {
  const pre = `S|${ids.b}|`;
  const payload = 'x'.repeat(MiB - pre.length);
  peers.host.send(pre + payload);
  const got = await peers.b.next(8000);
  assert(got === `M|${ids.host}|${payload}`, `bob got ${show(got)}`);
});

await check('a message over 1 MiB closes that connection', async () => {
  const p = await Peer.open('oversize');
  p.send('x'.repeat(MiB + 1));
  const c = await p.waitClose(5000);
  await peers.host.quiet(100);
  return `close ${c.code}`;
});

await check('raw client: fragmented hello with a ping in between, masked in, unmasked out', async () => {
  const r = peers.raw = await rawConnect('raw');
  r.send(0x1, 'J|', false);
  r.send(0x9, 'ping!');
  r.send(0x0, 'Ra', false);
  r.send(0x0, 'w', true);
  const got = [await r.next(), await r.next()];
  const pong = got.find(f => f && f.op === 0xa);
  const text = got.find(f => f && f.op === 0x1);
  assert(pong && pong.data.toString() === 'ping!', `expected pong "ping!", got ${JSON.stringify(got.map(f => f && [f.op, f.data.toString()]))}`);
  assert(text, 'no welcome text frame');
  const m = WELCOME.exec(text.data.toString());
  assert(m && Number(m[2]) === ids.host, `expected W|id|${ids.host}, got ${show(text.data.toString())}`);
  assert(!r.maskedFromServer, 'server frames must not be masked');
  ids.raw = Number(m[1]);
  await peers.host.expect(`+|${ids.raw}|Raw`);
});

await check('raw client: message fragmented inside a UTF-8 character', async () => {
  const r = peers.raw;
  const bytes = Buffer.from('S|0|frag|mented ü✓', 'utf8');
  const cut = bytes.indexOf(Buffer.from('ü', 'utf8')) + 1; // between the two bytes of ü
  r.send(0x1, bytes.subarray(0, cut), false);
  r.send(0x0, bytes.subarray(cut), true);
  await peers.host.expect(`M|${ids.raw}|frag|mented ü✓`);
});

await check('raw client: close handshake (1000 echoed, then - to host)', async () => {
  const r = peers.raw;
  const code = Buffer.alloc(2);
  code.writeUInt16BE(1000);
  r.send(0x8, code);
  const f = await r.next();
  assert(f && f.op === 0x8, `expected a close frame, got ${f ? 'opcode ' + f.op : 'TCP end'}`);
  assert(f.data.length >= 2 && f.data.readUInt16BE(0) === 1000, `close code ${f.data.length >= 2 ? f.data.readUInt16BE(0) : 'none'}`);
  await r.ends();
  await peers.host.expect(`-|${ids.raw}`);
});

await check('joiner leave (- to host)', async () => {
  await peers.b.close();
  await peers.host.expect(`-|${ids.b}`);
});

await check('host leave (X|host-left to joiners, then closed)', async () => {
  await peers.host.close();
  await peers.a.expect('X|host-left');
  const c = await peers.a.waitClose();
  return `close ${c.code}`;
});

await check('a new host can take the room afterwards', async () => {
  const h = peers.host2 = await Peer.open('new host');
  h.send('H|Second Host');
  const [, you, host] = await h.expect(WELCOME);
  assert(you === host, `new host got W|${you}|${host}`);
  ids.host2 = Number(you);
  assert(ids.host2 > ids.a, 'ids are not reused');
  const d = peers.d = await Peer.open('dana');
  d.send('J|Dana');
  await d.expect(new RegExp(`^W\\|\\d+\\|${ids.host2}$`));
  const [, did] = await h.expect(/^\+\|(\d+)\|Dana$/);
  ids.d = Number(did);
  h.send(`S|${did}|welcome back`);
  await d.expect(`M|${ids.host2}|welcome back`);
  return `host id ${ids.host2}`;
});

await check('room full after 7 joiners (E|full)', async () => {
  const extra = [];
  for (let i = 0; i < 6; i++) {
    const p = await Peer.open(`j${i}`);
    p.send(`J|j${i}`);
    await p.expect(WELCOME);
    extra.push(p);
  }
  const late = await Peer.open('eighth');
  late.send('J|Too Late');
  await late.expect('E|full');
  await late.waitClose();
  for (const p of extra) p.close().catch(() => {});
});

if (SLOW) {
  await check('slow: pings every 15 s, a silent peer is dropped after 45 s, answering peers stay', async () => {
    const h = peers.host2, d = peers.d;
    await sleep(500);
    h.inbox.length = 0; // the joins and leaves of the room-full check
    const r = await rawConnect('silent');
    r.send(0x1, 'J|Silent'); // then never another byte, not even a pong
    const w = await r.next();
    const m = w && w.op === 0x1 && WELCOME.exec(w.data.toString());
    assert(m, 'silent peer got no welcome');
    const sid = Number(m[1]);
    await h.expect(`+|${sid}|Silent`);
    const t0 = Date.now(), pings = [];
    for (let f; (f = await r.next(70000)); ) if (f.op === 0x9) pings.push((Date.now() - t0) / 1000);
    const dropped = (Date.now() - t0) / 1000;
    const at = pings.map(t => t.toFixed(1)).join(', ');
    assert(pings.length >= 2 && pings[0] <= 17, `pings at [${at}] s`);
    for (let i = 1; i < pings.length; i++) {
      const gap = pings[i] - pings[i - 1];
      assert(gap >= 13 && gap <= 17, `pings at [${at}] s`);
    }
    assert(dropped >= 44 && dropped <= 62, `silent peer dropped after ${dropped.toFixed(1)} s`);
    await h.expect(`-|${sid}`);
    h.send(`S|${ids.d}|still here`); // host and joiner answered every ping: both still connected
    await d.expect(`M|${ids.host2}|still here`);
    return `pings at ${at} s, dropped after ${dropped.toFixed(1)} s`;
  });
}

for (const p of Object.values(peers)) if (p instanceof Peer && !p.closed) p.close().catch(() => {});
console.log(`${failed ? 'FAIL' : 'PASS'}  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
