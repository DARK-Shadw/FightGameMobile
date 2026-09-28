// Match replication for LAN play. The host's page runs the real match (every
// rule, every hit, every bot) and mirrors it to the joiners' pages:
//
//   events, every frame   casts and attacks to re-play, damage numbers, deaths,
//                         respawns, summons, forms, level-ups, effects only the
//                         host decides on (world.show) ...
//   snapshots, 20 per s   where everyone is, health, statuses, levels, ammo,
//                         cooldowns, forge shards, score and clock
//
// A joiner re-plays casts for their visuals only (powers.js replay mode never
// applies effects), moves its own brawler itself and reports it 30 times a
// second, and shows everyone else from the snapshots 100 ms in the past so
// motion stays smooth. Knockbacks and teleports the host forces on a joiner's
// brawler go back to that joiner (a `knock` event, or the `warp` counter).

import { castPower, basicAttack, PowerSlot } from '../game/powers.js';
import { dnaOf, botChoice } from '../game/progression.js';
import { summonFighter } from '../game/summons.js';
import { BotBrain } from '../game/bot.js';
import { ESSENCES } from '../../../prototypes/skill-forge/data-essences.js';

const SNAP_EVERY = 0.05;
const INPUT_EVERY = 1 / 30;
const INTERP = 0.1;
const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const TAU = Math.PI * 2;
const angLerp = (a, b, t) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * t;
const PCT = new Set(['slow', 'haste', 'clockSlow', 'clockHaste']);

// [name, seconds left (-1: until removed), essence, extra]
function packStatuses(f) {
  const out = [];
  for (const [name, st] of Object.entries(f.statuses)) {
    let x = 0;
    if (PCT.has(name)) x = st.pct ?? 0;
    else if (name === 'fear' && st.from) x = [r2(st.from[0]), r2(st.from[2])];
    else if (name === 'link' && st.to) x = st.to.id;
    else if (name === 'control' && st.by) x = st.by.id;
    out.push([name, st.dur > 0 ? r2(Math.max(0, st.dur - st.t)) : -1, st.ess || '', x]);
  }
  return out;
}
const packPowers = f => f.powers.map(p => [r1(p.cd), r2(p.charge || 0), p.uses === Infinity ? -1 : p.uses, p.stolen ? 1 : 0, r2(p.cdMax)]);
const packKit = f => [f.kv || 0, f.essence, f.powers.map(p => [p.dna.code, p.index, p.borrowed ? 1 : 0])];
const isFighter = a => a && typeof a === 'object' && a.world && a.pos && typeof a.id === 'number';
const enc = a => (isFighter(a) ? { f: a.id } : Array.isArray(a) ? a.map(x => (typeof x === 'number' ? r2(x) : x)) : a);

// ── host ────────────────────────────────────────────────────────────────
export class HostSync {
  // seats: Map relay peer id → the brawler that joiner plays
  constructor(app, relay, seats) {
    this.app = app;
    this.game = app.game;
    this.world = app.game.world;
    this.relay = relay;
    this.seats = seats;
    this.q = [];
    this.pq = new Map();
    this.snapT = 0;
    this.off = [];
  }

  push(e) { this.q.push(e); }
  pushTo(f, e) { if (f?.remote && f.peer) this.pushPeer(f.peer, e); }
  pushPeer(peer, e) {
    let a = this.pq.get(peer);
    if (!a) this.pq.set(peer, a = []);
    a.push(e);
  }

  attach() {
    const g = this.game, w = this.world, ev = w.events;
    w.net = this;
    const on = (n, fn) => this.off.push(ev.on(n, fn));
    on('cast', e => { if (!e.replay) this.push(['c', e.caster.id, e.dna.code, r2(e.dir[0]), r2(e.dir[2]), e.point ? r2(e.point[0]) : null, e.point ? r2(e.point[2]) : null]); });
    on('damage', e => this.push(['d', e.target.id, e.amount, e.src ? e.src.id : -1, e.ess || '', (e.crit ? 1 : 0) | (e.dot ? 2 : 0)]));
    on('heal', e => this.push(['h', e.target.id, e.amount]));
    on('stored', e => this.push(['st', e.target.id, e.amount]));
    on('death', e => this.push(['x', e.target.id, e.src ? e.src.id : -1]));
    on('respawn', e => this.push(['r', e.f.id, e.first ? 1 : 0]));
    on('transform', e => this.push(['f', e.who.id, e.ess, e.dur, e.bonus]));
    on('levelup', e => this.push(['lv', e.f.id, e.level]));
    on('xp', e => this.pushTo(e.f, ['xp', e.f.id, e.amount, e.why]));
    on('kit', e => { e.f.kv = (e.f.kv || 0) + 1; this.push(['kit', e.f.id, ...packKit(e.f)]); });
    on('shard', e => this.push(['sh', e.f.id, r2(e.x), r2(e.z)]));
    on('overtime', () => this.push(['ot']));
    on('resurrect', e => this.push(['rs', e.target.id]));
    on('summon', e => this.push(['sm', e.caster?.id ?? -1, e.kind]));
    on('offer', e => this.sendOffers(e.f));
    on('picked', e => this.sendOffers(e.f));
    on('matchend', e => this.sendEnd(e));
    // basic attacks are re-played on every screen
    g.attack = (f, dir) => {
      const ok = basicAttack(g, f, dir);
      if (ok) this.push(['a', f.id, r2(dir[0]), r2(dir[2])]);
      return ok;
    };
    this.active = true;
  }

  detach() {
    this.flush();
    this.off.forEach(f => f());
    this.off = [];
    this.world.net = null;
    delete this.game.attack;
    this.active = false;
  }

  // hooks from the game code
  vfx(name, args) { this.push(['v', name, args.map(enc)]); }
  knock(f, dx, dz, s) { this.pushTo(f, ['k', f.id, r2(dx), r2(dz), r2(s)]); }
  summoned(f, spec) { f.spec = spec; this.push(['m', f.id, spec, f.owner ? f.owner.id : -1]); }
  summonAttack(f, t) { this.push(['sa', f.id, t.id]); }
  toast(text) { this.push(['t', text]); this.app.hud.toast(text); }

  sendOffers(f) { if (f.remote && f.peer) this.relay.send(f.peer, { k: 'o', offers: f.offers }); }
  sendEnd(e) {
    const g = this.game, m = g.match;
    this.flush();
    this.relay.send('*', { k: 'end', winner: e.winner, score: g.score.slice(), stats: [...m.stats].map(([f, s]) => [f.id, s.kos, s.deaths, Math.round(s.damage)]) });
  }

  // A joiner's messages during the match.
  onMessage(peer, msg) {
    const f = this.seats.get(peer);
    if (!f || !this.active) return;
    const g = this.game;
    switch (msg.k) {
      case 'in': f.netIn = msg; f.netInAt = performance.now(); break;
      case 'atk': if (f.alive && !g.over) g.attack(f, [msg.dx, 0, msg.dz]); break;
      case 'cast': {
        const slot = msg.i === 3 ? f.powers.find(s => s.borrowed) : f.powers.find(s => !s.passive && s.index === msg.i);
        if (slot && f.alive && !g.over) g.cast(f, slot, { dir: [msg.dx, 0, msg.dz], point: msg.px == null ? null : [msg.px, 0, msg.pz] });
        break;
      }
      case 'pick': g.choose(f, msg.id, msg.i); break;
      case 'resync': this.resync(peer, f); break;
      default: break;
    }
  }

  // A joiner that missed events (it started late, or dropped some): kits,
  // living summons and its pending level-up picks again.
  resync(peer, f) {
    const g = this.game;
    for (const b of g.brawlers) this.pushPeer(peer, ['kit', b.id, ...packKit(b)]);
    for (const s of g.summons) if (s.alive && s.spec) this.pushPeer(peer, ['m', s.id, s.spec, s.owner ? s.owner.id : -1]);
    this.sendOffers(f);
  }

  // A joiner left mid-match: a bot takes their brawler over.
  dropSeat(peer) {
    const f = this.seats.get(peer);
    if (!f) return;
    this.seats.delete(peer);
    f.remote = false;
    f.control = 'bot';
    f.isBot = true;
    f.controller = new BotBrain(this.game, f, { skill: 0.55 });
    for (const offer of f.offers.slice()) this.game.match?.pick(f, botChoice(f, offer), offer.id);
    this.toast(`${f.name} left: a bot takes over`);
  }

  // Before the simulation step: joiners' brawlers follow their reports.
  before(dt) {
    const now = performance.now();
    for (const f of this.seats.values()) {
      const n = f.netIn;
      if (!n || !f.remote) continue;
      if (!f.channeling) f.aimDir.set(n.ax, n.az);
      f.facing = n.fa;
      if (n.w < f.warp || !f.alive) { f.vel.set(0, 0, 0); continue; } // it hasn't seen our teleport yet
      const lag = Math.min(0.1, (now - f.netInAt) / 1000);
      const tx = n.x + n.vx * lag, tz = n.z + n.vz * lag;
      if (Math.hypot(tx - f.pos.x, tz - f.pos.z) > 2.5) f.pos.set(tx, 0, tz);
      else { const k = Math.min(1, dt * 20); f.pos.x += (tx - f.pos.x) * k; f.pos.z += (tz - f.pos.z) * k; }
      f.vel.set(n.vx, 0, n.vz);
    }
  }

  // After it: events go out every frame, a snapshot 20 times a second.
  after(dt) {
    if (!this.active) return;
    this.snapT += dt;
    this.flush();
    if (this.snapT >= SNAP_EVERY && this.game.match) { this.snapT = 0; this.relay.send('*', this.snapshot()); }
  }

  flush() {
    if (this.q.length) { this.relay.send('*', { k: 'e', e: this.q }); this.q = []; }
    for (const [p, a] of this.pq) if (a.length) this.relay.send(p, { k: 'e', e: a });
    this.pq.clear();
  }

  snapshot() {
    const g = this.game, m = g.match;
    const fs = [];
    for (const f of g.brawlers.concat(g.summons)) {
      const e = [f.id, r2(f.pos.x), r2(f.pos.z), r2(f.facing), Math.round(f.hp), Math.round(f.maxHp), Math.round(f.shieldHp), f.alive ? 1 : 0, f.warp, packStatuses(f), r2(f.vel.x), r2(f.vel.z)];
      if (f.kind === 'brawler') e.push(r2(f.aimDir.x), r2(f.aimDir.y), f.level || 1, Math.round(f.xp || 0), f.ammo, f.ammoMax, r2(f.reloadT), r2(f.reloadTime), r2(f.speed), r2(f.buffs.speed), f.kv || 0, packPowers(f));
      fs.push(e);
    }
    return { k: 's', m: [r1(m.time), m.phase, g.score[0], g.score[1]], sh: m.shards.map(s => [s.id, r2(s.x), r2(s.z), s.well ? 1 : 0]), f: fs };
  }
}

// ── joiner ──────────────────────────────────────────────────────────────
export class ClientSync {
  constructor(app, relay, meId) {
    this.app = app;
    this.game = app.game;
    this.world = app.game.world;
    this.relay = relay;
    this.meId = meId;
    this.byId = new Map();
    this.inT = 0;
    this.shards = new Map();
  }

  requestResync() {
    const now = performance.now();
    if (now - (this.resyncAt || 0) < 2000) return;
    this.resyncAt = now;
    this.relay.send(0, { k: 'resync' });
  }

  attach() {
    const g = this.game, w = this.world;
    g.replica = true;
    w.replica = true;
    for (const f of g.brawlers) this.byId.set(f.id, f);
    this.me = this.byId.get(this.meId) || g.player;
    const send = obj => this.relay.send(0, obj);
    // your own actions become requests to the host, which plays them back
    g.attack = (f, dir) => {
      if (f !== this.me || !f.alive || f.ammo <= 0 || f.attackCd > 0 || g.over) return false;
      f.attackCd = 0.3;
      send({ k: 'atk', dx: r2(dir[0]), dz: r2(dir[2]) });
      return true;
    };
    g.cast = (f, slot, aim) => {
      if (f !== this.me || !slot.ready || !f.alive || g.over) return false;
      send({ k: 'cast', i: slot.borrowed ? 3 : slot.index, dx: r2(aim.dir[0]), dz: r2(aim.dir[2]), px: aim.point ? r2(aim.point[0]) : null, pz: aim.point ? r2(aim.point[2]) : null });
      if (!slot.ult) { slot.cd = Math.max(slot.cd, 0.3); slot.guardUntil = performance.now() + 300; } // no double taps while the host answers
      return true;
    };
    g.choose = (f, offerId, i) => {
      if (f !== this.me) return false;
      send({ k: 'pick', id: offerId, i });
      const k = f.offers.findIndex(o => o.id === offerId);
      if (k >= 0) f.offers.splice(k, 1);
      w.events.emit('picked', { f });
      return true;
    };
  }

  detach() {
    const g = this.game;
    g.replica = false;
    this.world.replica = false;
    delete g.attack; delete g.cast; delete g.choose;
    for (const f of this.byId.values()) { f.nb = null; }
  }

  onMessage(msg) {
    if (msg.k === 's') this.applySnapshot(msg);
    else if (msg.k === 'e') for (const e of msg.e) { try { this.applyEvent(e); } catch (err) { console.warn('[net] event', e[0], err); } }
    else if (msg.k === 'o') this.applyOffers(msg.offers);
    else if (msg.k === 'end') this.applyEnd(msg);
  }

  // Before the simulation step: everyone else slides along the snapshots.
  before(dt) {
    const rt = performance.now() / 1000 - INTERP;
    for (const f of this.byId.values()) {
      const b = f.nb;
      if (f === this.me || !b?.length) continue;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      let x, z, fa, vx, vz;
      if (b.length >= 2 && b[0].t <= rt && b[1].t > rt) {
        const a = b[0], c = b[1], k = (rt - a.t) / Math.max(1e-3, c.t - a.t);
        x = a.x + (c.x - a.x) * k; z = a.z + (c.z - a.z) * k; fa = angLerp(a.fa, c.fa, k); vx = c.vx; vz = c.vz;
      } else {
        const a = b[0].t > rt ? b[0] : b[b.length - 1];
        const ex = Math.max(0, Math.min(0.12, rt - a.t));
        x = a.x + a.vx * ex; z = a.z + a.vz * ex; fa = a.fa; vx = a.vx; vz = a.vz;
      }
      f.pos.x = x; f.pos.z = z; f.facing = fa; f.vel.set(vx, 0, vz);
    }
    const m = this.game.match;
    if (m) for (const s of m.shards) { const t = this.shards.get(s.id); if (t) { const k = Math.min(1, dt * 14); s.x += (t.x - s.x) * k; s.z += (t.z - s.z) * k; } }
  }

  // After it: report your brawler.
  after(dt) {
    this.inT += dt;
    const f = this.me;
    if (this.inT < INPUT_EVERY || !f) return;
    this.inT = 0;
    this.relay.send(0, { k: 'in', x: r2(f.pos.x), z: r2(f.pos.z), fa: r2(f.facing), ax: r2(f.aimDir.x), az: r2(f.aimDir.y), vx: r2(f.vel.x), vz: r2(f.vel.z), w: f.warp });
  }

  applySnapshot(s) {
    const g = this.game, m = g.match;
    const now = performance.now() / 1000;
    if (m && s.m) {
      m.time = s.m[0];
      if (m.phase !== 'over') m.phase = s.m[1];
      g.score[0] = s.m[2]; g.score[1] = s.m[3];
      // forge shards: keep the objects the visuals know, glide them to the host's spots
      const next = [];
      const had = new Map(m.shards.map(x => [x.id, x]));
      this.shards.clear();
      for (const [id, x, z, well] of s.sh) {
        const o = had.get(id) || { id, x, z, well: !!well };
        this.shards.set(id, { x, z });
        next.push(o);
      }
      m.shards = next;
    }
    for (const e of s.f) {
      const f = this.byId.get(e[0]);
      if (!f) { if (e[7]) this.requestResync(); continue; }
      const [, x, z, fa, hp, maxHp, sh, alive, warp, st, vx, vz] = e;
      f.maxHp = maxHp; f.hp = hp; f.shieldHp = sh;
      if (!!alive !== f.alive) {
        // a missed death or revival: settle it after a few snapshots
        f.aliveMiss = (f.aliveMiss || 0) + 1;
        if (f.aliveMiss > 3) {
          f.aliveMiss = 0;
          if (alive) { f.revive(Math.max(0.05, hp / maxHp), [x, 0, z]); f.nb = []; } else f.die(null, { net: true });
        }
      } else f.aliveMiss = 0;
      if (f === this.me) {
        if (warp !== f.warp) {
          f.warp = warp;
          f.pos.set(x, 0, z); f.facing = fa;
          f.dashing = null; f.leap = null; f.push.set(0, 0, 0); f.vel.set(0, 0, 0);
        }
      } else {
        if (warp !== f.warp) { f.warp = warp; f.nb = []; f.pos.set(x, 0, z); }
        (f.nb ||= []).push({ t: now, x, z, fa, vx, vz });
        if (f.nb.length > 12) f.nb.shift();
      }
      this.syncStatuses(f, st);
      if (e.length > 12) {
        const [ax, az, level, xp, ammo, ammoMax, reloadT, reloadTime, speed, bspeed, kv, pw] = e.slice(12);
        if (f !== this.me) f.aimDir.set(ax, az);
        f.level = level; f.xp = xp;
        f.ammo = ammo; f.ammoMax = ammoMax; f.reloadT = reloadT; f.reloadTime = reloadTime;
        f.speed = speed; f.buffs.speed = bspeed;
        if ((f.kv || 0) !== kv) { f.kvMiss = (f.kvMiss || 0) + 1; if (f.kvMiss > 20) { f.kvMiss = 0; this.requestResync(); } } else f.kvMiss = 0;
        if ((f.kv || 0) === kv) pw.forEach((p, i) => {
          const slot = f.powers[i];
          if (!slot) return;
          // keep the tap guard until the host has answered the cast
          if (!(p[0] === 0 && slot.guardUntil > performance.now())) slot.cd = p[0];
          slot.charge = p[1]; slot.uses = p[2] < 0 ? Infinity : p[2]; slot.stolen = !!p[3]; slot.cdMax = p[4];
        });
      }
    }
  }

  syncStatuses(f, list) {
    const seen = new Set();
    for (const [name, left, ess, x] of list) {
      seen.add(name);
      if (name === 'form') continue; // forms come with their event (they swap the model)
      const dur = left < 0 ? 0 : left + 0.3;
      const cur = f.statuses[name];
      if (cur) { if (left >= 0) cur.dur = cur.t + dur; continue; }
      const data = {};
      if (ess) data.ess = ess;
      if (PCT.has(name)) data.pct = x;
      if (name === 'fear' && Array.isArray(x)) data.from = [x[0], 0, x[1]];
      if (name === 'link' || name === 'control') { const o = this.byId.get(x); if (o) data[name === 'link' ? 'to' : 'by'] = o; }
      if (name === 'hex') data.critter = (ESSENCES[ess] || ESSENCES.beast).critter;
      f.addStatus(name, dur, data);
    }
    for (const name of Object.keys(f.statuses)) if (!seen.has(name)) f.removeStatus(name);
  }

  applyEvent(e) {
    const g = this.game, w = this.world, ev = w.events, F = id => this.byId.get(id);
    switch (e[0]) {
      case 'c': { const f = F(e[1]); if (f) castPower(g, f, new PowerSlot(dnaOf(e[2])), { dir: [e[3], 0, e[4]], point: e[5] == null ? null : [e[5], 0, e[6]] }, { replay: true }); break; }
      case 'a': { const f = F(e[1]); if (f) basicAttack(g, f, [e[2], 0, e[3]], { replay: true }); break; }
      case 'd': {
        const f = F(e[1]);
        if (!f) break;
        // health bars react now; the next snapshot has the exact numbers
        const a = e[2], s = Math.min(f.shieldHp, a);
        f.shieldHp -= s;
        if (f.alive) f.hp = Math.max(1, f.hp - (a - s));
        f.showDamage(e[2], F(e[3]) || null, { ess: e[4] || undefined, crit: !!(e[5] & 1), dot: !!(e[5] & 2) });
        break;
      }
      case 'h': { const f = F(e[1]); if (f) { f.hp = Math.min(f.maxHp, f.hp + e[2]); ev.emit('heal', { target: f, amount: e[2] }); } break; }
      case 'st': { const f = F(e[1]); if (f) ev.emit('stored', { target: f, amount: e[2] }); break; }
      case 'x': { const f = F(e[1]); if (f?.alive) f.die(F(e[2]) || null, { net: true }); break; }
      case 'r': { const f = F(e[1]); if (f) { g.respawn(f, !!e[2]); f.nb = []; } break; }
      case 'k': { const f = F(e[1]); if (f && f === this.me) f.knock(e[2], e[3], e[4], true); break; }
      case 'v': {
        const args = e[2].map(a => (a && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).length === 1 && 'f' in a ? F(a.f) : a));
        if (!args.includes(undefined)) w.fx[e[1]]?.(...args);
        break;
      }
      case 'm': { if (F(e[1])) break; const f = summonFighter(g, e[2], F(e[3]) || null, e[1]); this.byId.set(f.id, f); break; }
      case 'sa': { const f = F(e[1]), t = F(e[2]); if (f?.alive && t) f.attackFn?.(g, f, t); break; }
      case 'f': { const f = F(e[1]); if (f?.alive) g.transform(f, e[2], e[3], e[4]); break; }
      case 'lv': { const f = F(e[1]); if (f) { f.level = e[2]; ev.emit('levelup', { f, level: e[2] }); } break; }
      case 'xp': { const f = F(e[1]); if (f) ev.emit('xp', { f, amount: e[2], why: e[3] }); break; }
      case 'kit': this.applyKit(F(e[1]), e[2], e[3], e[4]); break;
      case 'sh': { const f = F(e[1]); ev.emit('shard', { f, x: e[2], z: e[3] }); break; }
      case 'ot': { if (g.match) g.match.phase = 'overtime'; ev.emit('overtime', {}); break; }
      case 'rs': { const f = F(e[1]); if (f) ev.emit('resurrect', { target: f }); break; }
      case 'sm': ev.emit('summon', { caster: F(e[1]) || null, kind: e[2] }); break;
      case 't': this.app.hud.toast(e[1]); break;
      default: break;
    }
    // forget summons that are gone
    if (e[0] === 'x' || this.byId.size > 80) for (const [id, f] of this.byId) if (f.kind !== 'brawler' && !f.alive && !this.game.summons.includes(f)) this.byId.delete(id);
  }

  applyKit(f, kv, ess, list) {
    if (!f) return;
    const old = f.powers;
    f.powers = list.map(([code, index, borrowed]) => {
      let s = old.find(p => p.dna.code === code && p.index === index && !!p.borrowed === !!borrowed);
      if (!s) {
        s = new PowerSlot(dnaOf(code));
        s.index = index;
        if (borrowed) s.borrowed = true;
        this.game.prebakeFor(s.dna);
      }
      return s;
    });
    f.kv = kv;
    if (ess) f.essence = ess;
    this.world.events.emit('kit', { f });
  }

  applyOffers(list) {
    const me = this.me;
    if (!me) return;
    const had = new Set((me.offers || []).map(o => o.id));
    me.offers = list;
    const fresh = list.find(o => !had.has(o.id));
    if (fresh) this.world.events.emit('offer', { f: me, offer: fresh });
    else this.world.events.emit('picked', { f: me });
  }

  applyEnd(msg) {
    const g = this.game, m = g.match;
    if (!m) return;
    g.score[0] = msg.score[0]; g.score[1] = msg.score[1];
    for (const [id, kos, deaths, damage] of msg.stats) { const f = this.byId.get(id); if (f) Object.assign(m.statOf(f), { kos, deaths, damage }); }
    m.end(msg.winner);
  }
}
