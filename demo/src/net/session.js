// LAN parties: the LAN menu (host a party or join one), the party lobby
// (teams, brawlers, match settings) and the matches, wired to a relay
// (relay.js, PROTOCOL.md) and the match replication (sync.js).
//
// Party messages (JSON payloads, `k` is the kind):
//   joiner → host  hi {v, name, hero} · hero {hero} · team {} · then sync.js inputs
//   host → joiner  party {state} · start {cfg, roster} · bye {reason} · hb {} · then sync.js mirrors

import { Relay, lanTransport, serverRelayUrl } from './relay.js';
import { HostSync, ClientSync } from './sync.js';
import { resultsScreen } from '../game/menus.js';

export const PROTO = 1;
const MAX_PLAYERS = 6;
const SEATS = 3;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
const cleanName = s => String(s || '').replace(/[\u0000-\u001f|<>]/g, '').trim().slice(0, 14);
const REASONS = {
  'host-exists': 'Someone is already hosting here. Join their party instead.',
  'no-host': 'That party has closed.',
  full: 'That party is full.',
  version: 'That party runs a different version of the game.',
  timeout: 'No answer from that address.',
  unreachable: 'Couldn\'t reach that address. Same Wi-Fi?',
  'bad-address': 'That doesn\'t look like an address.',
  closed: 'The connection closed.',
};

export const NET_CSS = `
.lan *, .party *, .gone * { box-sizing: border-box; }
.lan { justify-content: flex-start; gap: 12px; background: radial-gradient(ellipse at 50% 55%, rgba(40,20,80,.5), rgba(14,6,32,.86)); overflow-y: auto; }
.lan .logo { font-size: clamp(30px, min(7vw, 9vh), 64px); }
.lan .body { display: flex; flex-direction: column; align-items: center; gap: 12px; width: min(820px, 100%); }
.namebox { display: flex; align-items: center; gap: 10px; background: var(--panel); border: 3px solid var(--ink); border-radius: 14px; padding: 6px 8px 6px 14px; }
.namebox .lbl { font-size: 11px; color: var(--muted); }
.lan input { font: 800 16px var(--fb); color: #fff; background: rgba(0,0,0,.35); border: 2px solid var(--line); border-radius: 10px; padding: 7px 10px; outline: none; min-width: 0; }
.lan input:focus { border-color: var(--gold2); }
.namebox input { width: 170px; }
.lan .cards { display: flex; gap: 12px; width: 100%; flex-wrap: wrap; justify-content: center; }
.lan .card { flex: 1 1 300px; max-width: 400px; background: var(--panel); border: 3px solid var(--ink); border-radius: 18px; padding: 12px 14px 14px; box-shadow: 0 6px 0 rgba(0,0,0,.35); display: flex; flex-direction: column; gap: 9px; }
.lan .card.host { border-top: 6px solid var(--gold); } .lan .card.join { border-top: 6px solid var(--blue); }
.lan .card h3 { margin: 0; font-size: 24px; font-weight: 400; }
.lan .card p { margin: 0; font: 700 13px/1.35 var(--fb); color: var(--text); }
.lan .card .btn { align-self: flex-start; }
.lan .rooms { display: flex; flex-direction: column; gap: 6px; min-height: 44px; }
.lan .room { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; text-align: left; background: rgba(255,255,255,.07); border: 2px solid var(--line); border-radius: 12px; padding: 7px 8px 7px 12px; color: #fff; cursor: pointer; font: inherit; }
.lan .room:hover { border-color: var(--blue); }
.lan .room b { font: 900 15px var(--fb); display: block; } .lan .room small { font: 800 11px var(--fb); color: var(--muted); }
.lan .room .go { font: 400 15px var(--fd); color: #fff; background: linear-gradient(#7ad2ff, #2a86e8); border: 3px solid var(--ink); border-radius: 10px; padding: 4px 12px 5px; -webkit-text-stroke: .12em var(--ink); paint-order: stroke fill; }
.lan .empty { font: 800 13px/1.35 var(--fb); color: var(--muted); display: flex; align-items: center; gap: 8px; padding: 6px 2px; }
.lan .spin { width: 14px; height: 14px; border-radius: 50%; border: 3px solid rgba(255,255,255,.2); border-top-color: var(--blue); animation: lanSpin .8s linear infinite; flex: none; }
@keyframes lanSpin { to { transform: rotate(360deg); } }
.lan .manual { display: flex; gap: 8px; align-items: center; } .lan .manual input { flex: 1; }
.btn.small { font-size: 16px; padding: 6px 14px 8px; border-width: 3px; border-radius: 12px; }
.lan .msg { min-height: 20px; font: 800 13px var(--fb); color: #ffb3c0; text-align: center; text-shadow: 0 2px 0 var(--ink); }
.lan .msg.ok { color: #9ff0bd; }

.party { gap: 8px; }
.party .logo { font-size: clamp(26px, min(6vw, 8vh), 54px); }
.party .info { font: 800 13px/1.35 var(--fb); color: var(--text); text-align: center; text-shadow: 0 2px 0 var(--ink), 0 0 8px var(--ink); max-width: 640px; }
.party .info b { color: var(--gold2); } .party .info code { font: 900 13px var(--fb); color: #9fdcff; }
.party .teams { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; width: 100%; }
.party .tm { flex: 0 1 auto; background: var(--panel); border: 3px solid var(--ink); border-radius: 16px; padding: 6px 8px 8px; box-shadow: 0 6px 0 rgba(0,0,0,.35); }
.party .tm.blue { border-top: 6px solid var(--blue); } .party .tm.red { border-top: 6px solid var(--red); }
.party .tm .th { font-size: 10px; color: var(--muted); margin: 0 0 5px 4px; }
.party .seats { display: flex; gap: 6px; }
.party .seat { width: 116px; border-radius: 11px; background: rgba(255,255,255,.08); border: 2px solid var(--line); padding: 5px 8px 6px; position: relative; }
.party .seat .nm { font: 900 14px/1.15 var(--fb); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.party .seat .hr { font: 800 11px var(--fb); color: var(--muted); }
.party .seat.me { border-color: var(--gold2); background: rgba(255,210,80,.13); }
.party .seat.bot .nm, .party .seat.open .nm { color: var(--muted); font-weight: 800; }
.party .seat.open { border-style: dashed; }
.party .seat .tag { position: absolute; right: 5px; top: -8px; font: 900 9px var(--fb); letter-spacing: .08em; background: var(--gold); color: var(--ink); border-radius: 5px; padding: 1px 4px; }
.party .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center; }
.party .seg { display: flex; align-items: center; gap: 4px; background: var(--panel); border: 3px solid var(--ink); border-radius: 14px; padding: 4px; }
.party .seg .lbl { font-size: 10px; color: var(--muted); padding: 0 6px; }
.party .seg button { font: 900 13px var(--fb); color: #fff; background: transparent; border: 0; border-radius: 9px; padding: 6px 10px; cursor: pointer; }
.party .seg button.on { background: linear-gradient(#ffe14a, #ff9a1a); color: var(--ink); }
.party .wait { font: 800 14px var(--fb); color: var(--text); display: flex; align-items: center; gap: 8px; text-shadow: 0 2px 0 var(--ink); }
@media (max-height: 460px) {
  .party { gap: 4px; } .party .bottom { gap: 6px; }
  .party .seat { width: 100px; padding: 3px 6px 4px; } .party .seat .nm { font-size: 13px; }
  .party .tm { padding: 4px 6px 6px; } .party .tm .th { margin-bottom: 3px; }
  .party .info { font-size: 12px; }
  .party .seg { padding: 3px; border-width: 2px; } .party .seg button { font-size: 12px; padding: 5px 7px; } .party .seg .lbl { padding: 0 3px; }
  .party .hero-pick .arrow { width: 32px; height: 32px; } .party .hero-pick .name { min-width: 80px; font-size: 17px; }
  .lan { gap: 8px; } .lan .body { gap: 8px; }
  .lan .card { padding: 8px 12px 10px; gap: 6px; } .lan .card h3 { font-size: 20px; } .lan .card p { font-size: 12px; }
  .namebox { padding: 4px 6px 4px 12px; } .lan input { padding: 5px 9px; font-size: 15px; }
  .lan .actions { position: absolute; top: max(10px, env(safe-area-inset-top)); right: 16px; }
  .lan .actions .btn { font-size: 16px; padding: 5px 14px 7px; border-width: 3px; }
}
@media (max-width: 560px) { .party .seat { width: 28vw; } }
.gone { justify-content: center; gap: 16px; background: rgba(14,6,32,.86); }
.gone .logo { font-size: clamp(28px, 6vh, 46px); text-align: center; }
.gone p { font: 800 15px/1.4 var(--fb); color: var(--text); text-align: center; max-width: 420px; margin: 0; }
`;

// A small awaitable inbox: UI actions and network messages resolve the next wait.
class Inbox {
  constructor() { this.items = []; this.waiter = null; }
  put(x) { if (this.waiter) { const w = this.waiter; this.waiter = null; w(x); } else this.items.push(x); }
  next() { return this.items.length ? Promise.resolve(this.items.shift()) : new Promise(r => { this.waiter = r; }); }
}

export class Net {
  // api: { setupRoster, playMatch, HERO_IDS, HERO_NAMES, BOT_NAMES }
  constructor(app, api) {
    this.app = app;
    this.api = api;
    this.transport = lanTransport();
    this.available = !!this.transport;
    this.sync = null;
    this.name = cleanName(store.get('sfa-name')) || 'Player ' + (10 + Math.floor(Math.random() * 90));
    // a host keeps simulating while its page is hidden (rAF stops, timers don't)
    this.bgTimer = setInterval(() => { if (document.hidden && this.sync instanceof HostSync && this.app.tick) this.app.tick(0.05); }, 50);
  }

  before(dt) { this.sync?.before(dt); }
  after(dt) { this.sync?.after(dt); }

  heroName(h) { return this.api.HERO_NAMES[h] || h; }

  // The LAN flow from the title screen; resolves when the player backs out to the title.
  async menu(hero) {
    this.hero = hero;
    let msg = '';
    for (;;) {
      const pick = await this.lanScreen(msg);
      msg = '';
      if (pick.action === 'back') return;
      try {
        if (pick.action === 'host') msg = await this.hostParty();
        else msg = await this.joinParty(pick.url);
      } catch (e) {
        console.warn('[net]', e);
        msg = REASONS[e.message] || 'Something went wrong: ' + e.message;
      }
      this.sync = null;
      this.app.game.replica = false;
      this.app.game.world.replica = false;
      this.app.game.world.net = null;
    }
  }

  // ── the LAN menu ──────────────────────────────────────────────────────
  lanScreen(message = '') {
    const app = this.app;
    return new Promise(resolve => {
      const native = this.transport === 'native';
      const el = document.createElement('div');
      el.className = 'menu-screen lan';
      el.innerHTML = `
        <div class="logo ol">LAN <span class="accent">PARTY</span></div>
        <div class="tagline">Brawl with friends on the same Wi-Fi. One device hosts the match, up to five more join it.</div>
        <div class="body">
          <label class="namebox"><span class="lbl">Your name</span><input class="name" maxlength="14" autocomplete="off" spellcheck="false"></label>
          <div class="cards">
            <div class="card host">
              <h3 class="ol">Host</h3>
              <p>Start a party on this ${native ? 'phone' : 'device'}. Friends pick it from their <b>LAN PARTY</b> menu. Empty seats get bots.</p>
              <button type="button" class="btn host">HOST A PARTY</button>
            </div>
            <div class="card join">
              <h3 class="ol">Join</h3>
              <div class="rooms"><div class="empty"><span class="spin"></span>Looking for parties…</div></div>
              <div class="manual"><input class="addr" placeholder="or type the host's address" autocomplete="off" spellcheck="false" inputmode="url"><button type="button" class="btn blue small go">JOIN</button></div>
            </div>
          </div>
          <div class="msg"></div>
        </div>
        <div class="actions"><button type="button" class="btn dark back">BACK</button></div>`;
      document.body.appendChild(el);
      const nameIn = el.querySelector('.name'), msgEl = el.querySelector('.msg'), rooms = el.querySelector('.rooms'), addr = el.querySelector('.addr');
      nameIn.value = this.name;
      msgEl.textContent = message;
      addr.value = store.get('sfa-addr') || '';
      const saveName = () => { const n = cleanName(nameIn.value); if (n) { this.name = n; store.set('sfa-name', n); } else nameIn.value = this.name; };
      nameIn.addEventListener('change', saveName);
      let timer = null;
      const done = v => {
        saveName();
        clearInterval(timer);
        if (native) { try { window.SFNative.discoverStop(); } catch { /* ignore */ } window.SFNativeEvent = null; }
        app.popBack?.(onBack);
        el.remove();
        resolve(v);
      };
      const onBack = () => done({ action: 'back' });
      app.pushBack?.(onBack);
      el.querySelector('.back').addEventListener('click', onBack);
      el.querySelector('.btn.host').addEventListener('click', () => done({ action: 'host' }));
      const joinAddr = () => {
        const raw = addr.value.trim();
        if (!raw) { msgEl.textContent = 'Type the address shown on the host\'s screen.'; return; }
        store.set('sfa-addr', raw);
        done({ action: 'join', url: addressToUrl(raw) });
      };
      el.querySelector('.go').addEventListener('click', joinAddr);
      addr.addEventListener('keydown', e => { if (e.key === 'Enter') joinAddr(); });
      const showRooms = list => {
        if (!list.length) { rooms.innerHTML = `<div class="empty"><span class="spin"></span>${native ? 'Looking for parties on this Wi-Fi…' : 'No party here yet. Host one!'}</div>`; return; }
        rooms.innerHTML = list.map((r, i) => `<button type="button" class="room" data-i="${i}"><span><b>${esc(r.name)}</b><small>${r.players}/${r.max} players${r.ip ? ' · ' + esc(r.ip) : ''}</small></span><span class="go">JOIN</span></button>`).join('');
        rooms.querySelectorAll('.room').forEach(b => b.addEventListener('click', () => {
          const r = list[Number(b.dataset.i)];
          if (r.players >= r.max) { msgEl.textContent = REASONS.full; return; }
          done({ action: 'join', url: r.url });
        }));
      };
      if (native) {
        window.SFNativeEvent = (type, data) => {
          if (type !== 'rooms') return;
          let list = [];
          try { list = JSON.parse(data); } catch { /* ignore */ }
          showRooms(list.map(r => ({ name: r.name, players: r.players, max: r.max || MAX_PLAYERS, ip: r.ip, url: `ws://${r.ip}:${r.port}` })));
        };
        try { window.SFNative.discoverStart(); } catch (e) { console.warn(e); }
      } else {
        const poll = async () => {
          try {
            const r = await (await fetch('room', { cache: 'no-store' })).json();
            showRooms(r.host ? [{ name: `${r.host}'s party`, players: r.players, max: r.max || MAX_PLAYERS, url: serverRelayUrl() }] : []);
          } catch { showRooms([]); }
        };
        poll();
        timer = setInterval(poll, 1500);
      }
    });
  }

  // ── hosting ───────────────────────────────────────────────────────────
  async hostParty() {
    const app = this.app;
    let url, address;
    if (this.transport === 'native') {
      let res;
      try { res = JSON.parse(window.SFNative.hostStart(`${this.name}'s party`)); } catch (e) { res = { ok: false, error: e.message }; }
      if (!res.ok) return 'Couldn\'t start a party: ' + (res.error || 'unknown error');
      url = `ws://127.0.0.1:${res.port}`;
      address = res.ip ? `${res.ip}${res.port !== 47800 ? ':' + res.port : ''}` : '';
    } else {
      url = serverRelayUrl();
      address = location.host;
      // opened as localhost on the server's own computer: show its LAN address instead
      if (/^(localhost|127\.|\[?::1)/.test(location.hostname)) {
        try { const r = await (await fetch('room', { cache: 'no-store' })).json(); if (r.addrs?.[0]) address = `${r.addrs[0]}${location.port ? ':' + location.port : ''}`; } catch { /* keep it */ }
      }
    }
    const relay = new Relay(url);
    try { await relay.open('host', this.name); } catch (e) { if (this.transport === 'native') window.SFNative.hostStop(); return REASONS[e.message] || e.message; }
    const party = new HostParty(this, relay, address);
    let out = '';
    try { out = await party.run(); } finally {
      relay.close();
      if (this.transport === 'native') { try { window.SFNative.hostStop(); } catch { /* ignore */ } }
      party.dispose();
      app.lobby.exit();
      this.api.setupRoster(app, this.api.soloRoster(this.hero));
      app.lobby.enter();
    }
    return out;
  }

  async joinParty(url) {
    const app = this.app;
    const relay = new Relay(url);
    try { await relay.open('join', this.name); } catch (e) { return REASONS[e.message] || e.message; }
    const party = new ClientParty(this, relay);
    let out = '';
    try { out = await party.run(); } finally {
      relay.close();
      party.dispose();
      app.lobby.exit();
      this.api.setupRoster(app, this.api.soloRoster(this.hero));
      app.lobby.enter();
    }
    return out;
  }

  // ── party lobby screen (both roles) ───────────────────────────────────
  // state: { name, hostPeer, phase, cfg: {minutes, bots}, players: [{peer, name, hero, team}], address }
  partyScreen(o) {
    const el = document.createElement('div');
    el.className = 'menu-screen party';
    document.body.appendChild(el);
    const self = this;
    const ui = {
      el,
      state: null,
      render(state) {
        this.state = state;
        const me = state.players.find(p => p.peer === o.me);
        const host = state.players.find(p => p.peer === state.hostPeer);
        const seats = seatsOf(state, self.api);
        const seat = s => s.player
          ? `<div class="seat ${s.player.peer === o.me ? 'me' : ''}"><div class="nm">${esc(s.player.name)}</div><div class="hr">${esc(self.heroName(s.player.hero))}</div>${s.player.peer === state.hostPeer ? '<span class="tag">HOST</span>' : s.player.peer === o.me ? '<span class="tag">YOU</span>' : ''}</div>`
          : s.bot ? `<div class="seat bot"><div class="nm">Bot ${esc(s.bot.name)}</div><div class="hr">${esc(self.heroName(s.bot.hero))}</div></div>`
            : '<div class="seat open"><div class="nm">Open seat</div><div class="hr">&nbsp;</div></div>';
        const inMatch = state.phase === 'match';
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
            <div class="logo ol">${esc(host ? host.name : 'LAN')}'s <span class="accent">PARTY</span></div>
            <div class="info">${o.isHost
              ? (state.address ? `Friends on this Wi-Fi: open <b>LAN PARTY</b> and pick <b>${esc(host.name)}'s party</b>${self.transport === 'server' ? ` (or open <code>http://${esc(state.address)}</code>)` : ` or type <code>${esc(state.address)}</code>`}.` : 'Friends on this Wi-Fi: open <b>LAN PARTY</b> and join.')
              : inMatch ? 'A match is on. You\'ll play in the next one.' : `Waiting for <b>${esc(host ? host.name : 'the host')}</b> to start the match.`}</div>
          </div>
          <div class="bottom">
            <div class="teams">
              <div class="tm blue"><div class="th lbl">Blue team</div><div class="seats">${seats[0].map(seat).join('')}</div></div>
              <div class="tm red"><div class="th lbl">Red team</div><div class="seats">${seats[1].map(seat).join('')}</div></div>
            </div>
            <div class="controls">
              <div class="hero-pick"><button type="button" class="arrow" data-d="-1" aria-label="Previous brawler">◀</button><div class="name ol"><small>YOUR BRAWLER</small><span>${esc(self.heroName(me?.hero))}</span></div><button type="button" class="arrow" data-d="1" aria-label="Next brawler">▶</button></div>
              <button type="button" class="btn dark small switch">SWITCH TEAM</button>
              ${o.isHost ? `<div class="seg"><span class="lbl">Match</span>${[3, 4.5, 6].map(m => `<button type="button" data-m="${m}" class="${state.cfg.minutes === m ? 'on' : ''}">${m === 4.5 ? '4½' : m} min</button>`).join('')}</div>
              <div class="seg"><span class="lbl">Bots</span><button type="button" data-b="1" class="${state.cfg.bots ? 'on' : ''}">Fill seats</button><button type="button" data-b="0" class="${state.cfg.bots ? '' : 'on'}">Off</button></div>` : ''}
            </div>
            <div class="actions">
              <button type="button" class="btn dark leave">LEAVE</button>
              ${o.isHost ? `<button type="button" class="btn start" ${canStart(state) ? '' : 'disabled'}>START MATCH</button>` : `<div class="wait"><span class="spin"></span>${inMatch ? 'Match in progress…' : 'Waiting for the host…'}</div>`}
            </div>
          </div>`;
        el.querySelectorAll('.arrow').forEach(b => b.addEventListener('click', () => o.onHero(Number(b.dataset.d))));
        el.querySelector('.switch').addEventListener('click', () => o.onTeam());
        el.querySelector('.leave').addEventListener('click', () => o.onLeave());
        el.querySelector('.start')?.addEventListener('click', () => o.onStart());
        el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => o.onCfg({ minutes: Number(b.dataset.m) })));
        el.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => o.onCfg({ bots: b.dataset.b === '1' })));
        self.preview(state, o.me);
      },
      close() { el.remove(); },
    };
    return ui;
  }

  // The lobby stage behind the party screen shows the party's lineup.
  preview(state, me) {
    const app = this.app;
    const key = JSON.stringify([rosterOf(state, this.api).map(r => [r.hero, r.team, r.name, r.peer]), me]);
    if (key === this.previewKey && app.lobby.active) return;
    this.previewKey = key;
    const roster = rosterOf(state, this.api).map(r => ({ ...r, control: r.peer === me ? 'local' : 'bot' }));
    if (!roster.some(r => r.control === 'local')) return;
    app.lobby.exit();
    this.api.setupRoster(app, roster);
    app.lobby.enter();
  }

  // Shown when the party ends under you.
  goneScreen(text) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'menu-screen gone';
      el.innerHTML = `<div class="logo ol">PARTY <span class="accent">OVER</span></div><p>${esc(text)}</p><div class="actions"><button type="button" class="btn">OK</button></div>`;
      document.body.appendChild(el);
      const done = () => { this.app.popBack?.(done); el.remove(); resolve('menu'); };
      this.app.pushBack?.(done);
      el.querySelector('.btn').addEventListener('click', done);
    });
  }
}

// "192.168.1.23", "192.168.1.23:47801", "ws://..." → a relay URL (Android relays listen on 47800+).
export function addressToUrl(raw) {
  const s = raw.trim();
  if (/^wss?:\/\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) { const u = new URL(s); return `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}/ws`; }
  return /:\d+$/.test(s) ? `ws://${s}` : `ws://${s}:47800`;
}

// Seats per team: players in join order, then bots (or open seats).
function seatsOf(state, api) {
  const out = [[], []];
  const roster = rosterOf(state, api);
  for (let t = 0; t < 2; t++) {
    const mine = roster.filter(r => r.team === t);
    for (let i = 0; i < SEATS; i++) {
      const r = mine[i];
      out[t].push(!r ? {} : r.peer != null ? { player: state.players.find(p => p.peer === r.peer) } : { bot: r });
    }
  }
  return out;
}

// The match lineup a party state makes. Bots are picked by seat so the lobby
// preview and the match agree.
function rosterOf(state, api) {
  const roster = [];
  const botNames = api.BOT_NAMES;
  for (let t = 0; t < 2; t++) {
    const humans = state.players.filter(p => p.team === t).slice(0, SEATS);
    for (const p of humans) roster.push({ hero: p.hero, team: t, name: p.name, peer: p.peer });
    if (state.cfg.bots) for (let i = humans.length; i < SEATS; i++) {
      const k = t * SEATS + i;
      roster.push({ hero: api.HERO_IDS[(k * 3 + 1) % api.HERO_IDS.length], team: t, name: botNames[(k * 5 + 3) % botNames.length], peer: null });
    }
  }
  return roster;
}

const canStart = state => state.phase === 'lobby' && (state.cfg.bots || (state.players.some(p => p.team === 0) && state.players.some(p => p.team === 1)));

// ── host side of a party ──────────────────────────────────────────────────
class HostParty {
  constructor(net, relay, address) {
    this.net = net;
    this.app = net.app;
    this.relay = relay;
    this.inbox = new Inbox();
    this.state = { name: `${net.name}'s party`, hostPeer: relay.id, phase: 'lobby', cfg: { minutes: 4.5, bots: true }, address, players: [{ peer: relay.id, name: net.name, hero: net.hero, team: 0 }] };
    relay.onMessage = (from, msg) => this.onMessage(from, msg);
    relay.onLeave = id => this.onLeave(id);
    relay.onJoin = () => {};
    relay.onClose = () => { this.dead = true; this.inbox.put({ type: 'dead' }); if (this.app.game.match) this.app.game.match.end(-1); };
    this.hb = setInterval(() => relay.send('*', { k: 'hb' }), 2000);
  }

  dispose() { clearInterval(this.hb); this.screen?.close(); }

  broadcast() {
    this.relay.send('*', { k: 'party', ...this.state });
    this.screen?.render(this.state);
    if (this.net.transport === 'native') { try { window.SFNative.hostSetPlayers(String(this.state.players.length)); } catch { /* ignore */ } }
  }

  onMessage(from, msg) {
    if (['in', 'atk', 'cast', 'pick', 'resync'].includes(msg.k)) { this.sync?.onMessage(from, msg); return; }
    const p = this.state.players.find(x => x.peer === from);
    const api = this.net.api;
    switch (msg.k) {
      case 'hi': {
        if (msg.v !== PROTO) { this.relay.send(from, { k: 'bye', reason: 'version' }); return; }
        if (p) return;
        if (this.state.players.length >= MAX_PLAYERS) { this.relay.send(from, { k: 'bye', reason: 'full' }); return; }
        const count = t => this.state.players.filter(x => x.team === t).length;
        const name = cleanName(msg.name) || 'Player';
        this.state.players.push({ peer: from, name, hero: api.HERO_IDS.includes(msg.hero) ? msg.hero : api.HERO_IDS[0], team: count(1) < count(0) ? 1 : count(0) < SEATS ? 0 : 1 });
        this.app.hud.toast(`${name} joined the party`);
        this.app.sfx.ui('click');
        this.broadcast();
        break;
      }
      case 'hero': if (p && api.HERO_IDS.includes(msg.hero)) { p.hero = msg.hero; this.broadcast(); } break;
      case 'team': if (p) this.switchTeam(p); break;
      default: break;
    }
  }

  switchTeam(p) {
    const other = 1 - p.team;
    if (this.state.players.filter(x => x.team === other).length >= SEATS) return;
    p.team = other;
    this.broadcast();
  }

  onLeave(id) {
    const i = this.state.players.findIndex(x => x.peer === id);
    if (i < 0) return;
    const [p] = this.state.players.splice(i, 1);
    if (this.sync) this.sync.dropSeat(id);
    else this.app.hud.toast(`${p.name} left the party`);
    this.broadcast();
  }

  async run() {
    for (;;) {
      this.state.phase = 'lobby';
      const me = this.state.players[0];
      this.screen = this.net.partyScreen({
        isHost: true, me: this.relay.id,
        onHero: d => { const ids = this.net.api.HERO_IDS; me.hero = ids[(ids.indexOf(me.hero) + d + ids.length) % ids.length]; this.net.hero = me.hero; this.broadcast(); },
        onTeam: () => this.switchTeam(me),
        onCfg: c => { Object.assign(this.state.cfg, c); this.broadcast(); },
        onLeave: () => this.inbox.put({ type: 'leave' }),
        onStart: () => this.inbox.put({ type: 'start' }),
      });
      const onBack = () => this.inbox.put({ type: 'leave' });
      this.app.pushBack?.(onBack);
      this.broadcast();
      let act;
      do act = await this.inbox.next(); while (act.type === 'start' && !canStart(this.state));
      this.app.popBack?.(onBack);
      this.screen.close();
      this.screen = null;
      if (act.type === 'leave') return '';
      if (act.type === 'dead') return 'The party\'s connection closed.';
      await this.play();
      if (this.quitting) return '';
      if (this.dead) return 'The party\'s connection closed.';
    }
  }

  async play() {
    const app = this.app, api = this.net.api;
    const cfg = { duration: this.state.cfg.minutes * 60, koTarget: this.state.cfg.minutes <= 3 ? 15 : 20 };
    const roster = rosterOf(this.state, api).map(r => ({ ...r, control: r.peer === this.relay.id ? 'local' : r.peer != null ? 'remote' : 'bot' }));
    app.lobby.exit();
    api.setupRoster(app, roster);
    const seats = new Map();
    for (const f of app.game.brawlers) if (f.remote) seats.set(f.peer, f);
    this.state.phase = 'match';
    this.relay.send('*', { k: 'party', ...this.state });
    this.relay.send('*', { k: 'start', cfg, roster: app.game.brawlers.map(f => ({ id: f.id, hero: f.heroId, team: f.team, name: f.name, peer: f.peer ?? null })) });
    this.sync = this.net.sync = new HostSync(app, this.relay, seats);
    this.sync.attach();
    let choice;
    try {
      choice = await api.playMatch(app, null, {
        lan: true, duration: cfg.duration, koTarget: cfg.koTarget,
        onQuit: () => { this.quitting = true; app.game.match?.abort(); },
        results: data => (this.dead ? this.net.goneScreen('The party\'s connection closed.') : resultsScreen(document.body, { ...data, buttons: [{ id: 'party', label: 'BACK TO PARTY' }] })),
      });
    } finally {
      this.sync.detach();
      this.sync = this.net.sync = null;
    }
    return choice;
  }
}

// ── joiner side of a party ────────────────────────────────────────────────
class ClientParty {
  constructor(net, relay) {
    this.net = net;
    this.app = net.app;
    this.relay = relay;
    this.inbox = new Inbox();
    this.state = null;
    this.lastMsg = performance.now();
    relay.onMessage = (from, msg) => this.onMessage(msg);
    const gone = text => {
      if (this.gone) return;
      this.gone = text;
      this.inbox.put({ type: 'gone' });
      if (this.sync && this.app.game.match) this.app.game.match.end(-1);
    };
    this.lose = gone;
    relay.onHostLeft = () => gone('The host closed the party.');
    relay.onClose = () => gone('Lost the connection to the host.');
    // a host that vanished without closing (Wi-Fi dropped, app killed). A gap
    // while this page itself was frozen (baking a creature, in the background)
    // proves nothing, so it restarts the count.
    this.lastTick = performance.now();
    this.watch = setInterval(() => {
      const now = performance.now();
      if (now - this.lastTick > 2500) this.lastMsg = now;
      this.lastTick = now;
      if (now - this.lastMsg > (this.sync ? 8000 : 12000)) gone('The host stopped answering.');
    }, 1000);
    relay.send(0, { k: 'hi', v: PROTO, name: net.name, hero: net.hero });
  }

  dispose() { clearInterval(this.watch); this.screen?.close(); }

  onMessage(msg) {
    this.lastMsg = performance.now();
    if (['s', 'e', 'o', 'end'].includes(msg.k)) { this.sync?.onMessage(msg); return; }
    switch (msg.k) {
      case 'party': this.state = msg; if (!this.sync) this.screen?.render(msg); this.inbox.put({ type: 'party' }); break;
      case 'start': this.inbox.put({ type: 'start', msg }); this.closeResults?.('party'); break;
      case 'bye': this.lose(REASONS[msg.reason] || 'The host sent you away.'); break;
      default: break;
    }
  }

  async run() {
    for (;;) {
      // wait for the party's state before showing it
      while (!this.state && !this.gone) await this.inbox.next();
      if (this.gone) { const t = this.gone; await this.net.goneScreen(t); return ''; }
      const me = () => this.state.players.find(p => p.peer === this.relay.id);
      this.screen = this.net.partyScreen({
        isHost: false, me: this.relay.id,
        onHero: d => { const ids = this.net.api.HERO_IDS, p = me(); if (!p) return; const h = ids[(ids.indexOf(p.hero) + d + ids.length) % ids.length]; this.net.hero = h; this.relay.send(0, { k: 'hero', hero: h }); },
        onTeam: () => this.relay.send(0, { k: 'team' }),
        onCfg: () => {},
        onLeave: () => this.inbox.put({ type: 'leave' }),
        onStart: () => {},
      });
      const onBack = () => this.inbox.put({ type: 'leave' });
      this.app.pushBack?.(onBack);
      this.screen.render(this.state);
      let act;
      do act = await this.inbox.next(); while (act.type === 'party');
      this.app.popBack?.(onBack);
      this.screen.close();
      this.screen = null;
      if (act.type === 'leave') return '';
      if (act.type === 'gone') { await this.net.goneScreen(this.gone); return ''; }
      if (act.type === 'start') {
        await this.play(act.msg);
        if (this.quitting) return '';
        if (this.gone) { await this.net.goneScreen(this.gone); return ''; }
      }
    }
  }

  async play(start) {
    const app = this.app, api = this.net.api;
    const roster = start.roster.map(r => ({ ...r, control: r.peer === this.relay.id ? 'local' : 'puppet' }));
    if (!roster.some(r => r.control === 'local')) return; // not in this one (joined late)
    app.lobby.exit();
    api.setupRoster(app, roster);
    const me = app.game.brawlers.find(f => f.control === 'local');
    this.sync = this.net.sync = new ClientSync(app, this.relay, me.id);
    this.sync.attach();
    try {
      await api.playMatch(app, null, {
        replica: true, lan: true, duration: start.cfg.duration, koTarget: start.cfg.koTarget,
        onQuit: () => { this.quitting = true; this.relay.close(); app.game.match?.abort(); },
        results: data => (this.gone ? Promise.resolve('menu') : resultsScreen(document.body, { ...data, buttons: [{ id: 'party', label: 'BACK TO PARTY' }], bind: close => { this.closeResults = close; data.bind?.(close); } })),
      });
    } finally {
      this.closeResults = null;
      this.sync.detach();
      this.sync = this.net.sync = null;
    }
  }
}
