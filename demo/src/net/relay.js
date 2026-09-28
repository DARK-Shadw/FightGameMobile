// Client side of the LAN relay (PROTOCOL.md): one WebSocket to a relay that
// holds one room. The host's page says H, joiners say J; afterwards every
// message is a JSON payload routed by the relay.

export class Relay {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.id = 0;
    this.hostId = 0;
    this.isHost = false;
    this.closed = false;
    // handlers
    this.onMessage = () => {};   // (fromId, obj)
    this.onJoin = () => {};      // host: (id, name)
    this.onLeave = () => {};     // host: (id)
    this.onHostLeft = () => {};  // joiner
    this.onClose = () => {};     // (reason)
  }

  // Connect and say hello. → { id, hostId }; rejects with an Error whose message is the reason.
  open(role, name, timeout = 4000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err, v) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(v); };
      const timer = setTimeout(() => { done(new Error('timeout')); try { this.ws?.close(); } catch { /* already closed */ } }, timeout);
      let ws;
      try { ws = this.ws = new WebSocket(this.url); } catch (e) { done(new Error('bad-address')); return; }
      ws.onopen = () => ws.send((role === 'host' ? 'H|' : 'J|') + String(name).replace(/[\r\n]/g, ' ').slice(0, 24));
      ws.onerror = () => done(new Error('unreachable'));
      ws.onclose = () => {
        const was = !this.closed;
        this.closed = true;
        done(new Error('closed'));
        if (was && this.welcomed) this.onClose('closed');
      };
      ws.onmessage = e => {
        if (typeof e.data !== 'string') return;
        const m = e.data;
        const t = m[0];
        if (t === 'W') {
          const [, id, host] = m.split('|');
          this.id = Number(id); this.hostId = Number(host); this.isHost = this.id === this.hostId;
          this.welcomed = true;
          done(null, { id: this.id, hostId: this.hostId });
        } else if (t === 'E') done(new Error(m.slice(2) || 'refused'));
        else if (t === 'M') {
          const i = m.indexOf('|', 2);
          let obj;
          try { obj = JSON.parse(m.slice(i + 1)); } catch { return; }
          this.onMessage(Number(m.slice(2, i)), obj);
        } else if (t === '+') {
          const i = m.indexOf('|', 2);
          this.onJoin(Number(m.slice(2, i)), m.slice(i + 1));
        } else if (t === '-') this.onLeave(Number(m.slice(2)));
        else if (t === 'X') this.onHostLeft();
      };
    });
  }

  // Host: to = a joiner's id or '*'. Joiners: always to the host.
  send(to, obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(`S|${to}|${JSON.stringify(obj)}`);
    return true;
  }

  get buffered() { return this.ws?.bufferedAmount ?? 0; }

  close() {
    this.closed = true;
    try { this.ws?.close(1000); } catch { /* already closed */ }
  }
}

// How this page can play on the LAN:
//   native  the Android app (window.SFNative): host a relay on this phone, find rooms by UDP
//   server  served by tools/lan-server.js: its relay at /ws holds the room
//   null    no way to reach other devices (the published artifact, file:// pages)
export function lanTransport() {
  if (typeof window === 'undefined') return null;
  if (window.SFNative && typeof window.SFNative.hostStart === 'function') return 'native';
  if (window.SFLan && /^https?:$/.test(location.protocol)) return 'server';
  return null;
}

export function serverRelayUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${window.SFLan?.ws || '/ws'}`;
}
