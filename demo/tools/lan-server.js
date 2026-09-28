#!/usr/bin/env node
// LAN party server, no dependencies: serves the game to every device on your
// network and runs the relay their pages talk through (src/net/PROTOCOL.md).
//
//   node tools/lan-server.js [--port 8080] [--page dist/offline/index.html]
//
// Then, on each phone or computer on the same Wi-Fi, open the address it
// prints (http://<this computer>:8080), tap LAN PARTY, host on one device and
// join from the others. The page is built with `node tools/build.js --offline`
// (done automatically when it's missing).

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };
const PORT = Number(opt('port', process.env.PORT || 8080));
const PAGE = path.resolve(ROOT, opt('page', 'dist/offline/index.html'));

const MAX_JOINERS = 7;
const MAX_MESSAGE = 1 << 20;        // 1 MiB
const MAX_QUEUED = 4 << 20;         // drop a peer that stops reading
const MAX_SOCKETS = 32;
const PING_EVERY = 15000;
const DROP_AFTER = 45000;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ── the page ─────────────────────────────────────────────────────────────
function loadPage() {
  if (!fs.existsSync(PAGE)) {
    console.log('Building the game page (node tools/build.js --offline)…');
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--offline'], { cwd: ROOT, stdio: 'inherit' });
  }
  // tell the page it can reach a relay at /ws
  return fs.readFileSync(PAGE, 'utf8').replace('<head>', '<head><script>window.SFLan={ws:"/ws"}</script>');
}
let page = loadPage();
fs.watchFile(PAGE, { interval: 2000 }, () => { try { page = loadPage(); console.log('page reloaded'); } catch { /* mid-build */ } });

const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address)
  .sort((a, b) => (/^192\.168\./.test(b) - /^192\.168\./.test(a)) || (/^10\./.test(b) - /^10\./.test(a)));

// ── the room ─────────────────────────────────────────────────────────────
let nextId = 1;
let host = null;                    // the host's peer
const peers = new Map();            // id → peer (after hello)
const joiners = () => [...peers.values()].filter(p => p.role === 'joiner');

function onText(peer, m) {
  if (!peer.role) {
    const t = m[0], bar = m[1] === '|';
    if ((t === 'H' || t === 'J') && m.length >= 1 && (m.length === 1 || !bar)) { peer.send('E|bad-hello'); peer.close(1000); return; }
    if (!bar) return;                 // anything else before a hello is ignored
    const name = m.slice(2);
    if (t === 'H') {
      if (host) { peer.send('E|host-exists'); peer.close(1000); return; }
      peer.role = 'host'; peer.name = name; host = peer; peers.set(peer.id, peer);
      peer.send(`W|${peer.id}|${peer.id}`);
      console.log(`host ${peer.id} "${name}" from ${peer.addr}`);
    } else if (t === 'J') {
      if (!host) { peer.send('E|no-host'); peer.close(1000); return; }
      if (joiners().length >= MAX_JOINERS) { peer.send('E|full'); peer.close(1000); return; }
      peer.role = 'joiner'; peer.name = name; peers.set(peer.id, peer);
      peer.send(`W|${peer.id}|${host.id}`);
      host.send(`+|${peer.id}|${name}`);
      console.log(`joiner ${peer.id} "${name}" from ${peer.addr}`);
    }
    return;
  }
  if (m[0] !== 'S' || m[1] !== '|') return;
  const i = m.indexOf('|', 2);
  if (i < 0) return;
  const to = m.slice(2, i), payload = m.slice(i + 1);
  if (peer.role === 'host') {
    const out = `M|${peer.id}|${payload}`;
    if (to === '*') for (const j of joiners()) j.send(out);
    else { const j = peers.get(Number(to)); if (j && j.role === 'joiner') j.send(out); }
  } else if (host) host.send(`M|${peer.id}|${payload}`);
}

function onGone(peer) {
  if (!peer.role) return;
  peers.delete(peer.id);
  if (peer === host) {
    host = null;
    for (const j of joiners()) { j.send('X|host-left'); j.close(1000); peers.delete(j.id); }
    console.log(`host ${peer.id} left: room reset`);
  } else if (host) {
    host.send(`-|${peer.id}`);
    console.log(`joiner ${peer.id} left`);
  }
}

// ── WebSocket (RFC 6455) ─────────────────────────────────────────────────
let sockets = 0;
function frame(op, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.alloc(10);
  if (n >= 65536) { head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}

function accept(req, sock) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || sockets >= MAX_SOCKETS) {
    sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return;
  }
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
  sock.setNoDelay(true);
  sockets++;
  const peer = { id: nextId++, role: null, name: '', addr: req.socket.remoteAddress, closed: false, lastSeen: Date.now() };
  let buf = Buffer.alloc(0), parts = [], partsLen = 0, partOp = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  peer.send = text => {
    if (peer.closed) return;
    if (sock.writableLength > MAX_QUEUED) { peer.close(1008); return; }
    sock.write(frame(1, Buffer.from(text, 'utf8')));
  };
  peer.close = (code = 1000) => {
    if (peer.closed) return;
    peer.closed = true;
    const b = Buffer.alloc(2); b.writeUInt16BE(code);
    try { sock.write(frame(8, b)); } catch { /* gone */ }
    sock.end();
    setTimeout(() => sock.destroy(), 1000).unref();
    finish();
  };
  let finished = false;
  const finish = () => { if (finished) return; finished = true; sockets--; clearInterval(pinger); onGone(peer); };
  const pinger = setInterval(() => {
    if (Date.now() - peer.lastSeen > DROP_AFTER) { peer.close(1001); return; }
    try { sock.write(frame(9, Buffer.alloc(0))); } catch { /* gone */ }
  }, PING_EVERY);
  sock.on('data', chunk => {
    peer.lastSeen = Date.now();
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (!peer.closed) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > BigInt(MAX_MESSAGE)) { peer.close(1009); return; } len = Number(big); off = 10; }
      if (!masked) { peer.close(1002); return; }
      if (len > MAX_MESSAGE || partsLen + len > MAX_MESSAGE) { peer.close(1009); return; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) { // close: answer with the same code
        const code = data.length >= 2 ? data.readUInt16BE(0) : 1000;
        peer.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000);
        return;
      }
      if (op === 9) { try { sock.write(frame(10, data)); } catch { /* gone */ } continue; }
      if (op === 10) continue;
      if (op === 0 || op === 1 || op === 2) {
        if (op !== 0) { partOp = op; parts = []; partsLen = 0; }
        parts.push(data); partsLen += data.length;
        if (!fin) continue;
        const msg = Buffer.concat(parts);
        parts = []; partsLen = 0;
        if (partOp !== 1) continue; // binary frames are ignored
        let text;
        try { text = decoder.decode(msg); } catch { peer.close(1007); return; }
        onText(peer, text);
        continue;
      }
      peer.close(1002);
      return;
    }
  });
  sock.on('close', finish);
  sock.on('error', () => { peer.closed = true; finish(); });
}

// ── HTTP ─────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(page);
  } else if (url.pathname === '/room') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ host: host ? host.name : null, players: host ? 1 + joiners().length : 0, max: 6, addrs: lanAddresses() }));
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});
server.on('upgrade', (req, sock) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') { sock.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  accept(req, sock);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nSkill Forge Arena LAN server on port ${PORT}`);
  const addrs = lanAddresses();
  if (addrs.length) for (const a of addrs) console.log(`  open  http://${a}:${PORT}  on every device on this network`);
  else console.log(`  no LAN address found; open http://localhost:${PORT} here`);
  console.log('  then LAN PARTY → host on one device, join from the others\n');
});
