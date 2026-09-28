// One continuous match: knockouts score, XP levels brawlers up mid-fight,
// level-ups hand out tier-capped powers (progression.js), forge shards drop
// from the fallen and spawn at two wells beside the pond.
//
// Runs authoritative on a solo game or a LAN host. On a LAN client the host's
// snapshots drive `state`, `shards` and each brawler's level instead.

import * as THREE from 'three';
import * as L from '../vfx/fxlib.js';
import { LEVEL_XP, MAX_LEVEL, XP, levelFor, buildOffer, botChoice, dnaOf, statById, SPELL_SLOTS, MAX_PASSIVES } from './progression.js';

const WELLS = [[-5.5, 0], [5.5, 0]];
const R = (a, b) => a + Math.random() * (b - a);
let SHARD_ID = 1;

export class Match {
  constructor(game, o = {}) {
    this.game = game;
    this.world = game.world;
    this.duration = o.duration ?? 270;
    this.koTarget = o.koTarget ?? 20;
    this.overtime = o.overtime ?? 45;
    this.replica = !!o.replica;
    this.time = this.duration;
    this.phase = 'ready';       // ready | play | overtime | over
    this.winner = null;
    this.shards = [];
    this.shardT = 4;
    this.stats = new Map();
    this.recent = new Map();     // victim → Map(attacker → time of last hit)
    this.visuals = new ShardVisuals(this);
    this.off = [];
    const ev = this.world.events;
    if (!this.replica) {
      this.off.push(ev.on('damage', e => this.onDamage(e)));
      this.off.push(ev.on('death', e => this.onDeath(e)));
    }
  }

  statOf(f) {
    let s = this.stats.get(f);
    if (!s) this.stats.set(f, s = { kos: 0, deaths: 0, damage: 0, name: f.name, team: f.team, hero: f.heroId });
    return s;
  }

  start() {
    const g = this.game;
    g.score = [0, 0];
    for (const f of g.brawlers) {
      f.level = 1; f.xp = 0; f.offers = [];
      this.statOf(f);
    }
    this.phase = 'play';
    this.time = this.duration;
    this.world.events.emit('matchstart', { match: this });
  }

  dispose() {
    this.off.forEach(f => f());
    this.visuals.dispose();
  }

  // ── XP ─────────────────────────────────────────────────────────────────
  addXp(f, amount, why = '') {
    if (!f || f.kind !== 'brawler' || this.phase === 'over' || f.level >= MAX_LEVEL && f.xp >= LEVEL_XP[MAX_LEVEL]) return;
    const g = this.game;
    const behind = g.score[1 - f.team] - g.score[f.team] >= 2;
    const gain = amount * (behind ? 1 + XP.underdog : 1);
    f.xp = Math.min(LEVEL_XP[MAX_LEVEL], f.xp + gain);
    if (why && gain >= 5) this.world.events.emit('xp', { f, amount: Math.round(gain), why });
    const lv = levelFor(f.xp);
    while (f.level < lv) this.levelUp(f);
  }

  levelUp(f) {
    f.level++;
    this.world.events.emit('levelup', { f, level: f.level });
    const offer = buildOffer(f, f.level);
    offer.id = (f.offerSerial = (f.offerSerial || 0) + 1);
    f.offers.push(offer);
    this.world.events.emit('offer', { f, offer });
    if (f.isBot) {
      // bots think for a moment, like a person would
      const at = this.world.time + R(0.6, 2.2);
      this.world.spawn({ owner: f, update: () => {
        if (this.world.time < at) return true;
        if (f.offers[0] === offer) this.pick(f, botChoice(f, offer));
        return false;
      } });
    }
  }

  // Apply option `i` of the brawler's oldest pending offer.
  pick(f, i, offerId = null) {
    const offer = f.offers[0];
    if (!offer || (offerId !== null && offer.id !== offerId)) return false;
    const opt = offer.options[i];
    if (!opt) return false;
    f.offers.shift();
    this.apply(f, opt);
    this.world.events.emit('picked', { f, option: opt, level: offer.level });
    this.world.events.emit('kit', { f });
    return true;
  }

  apply(f, opt) {
    const g = this.game;
    const spells = () => f.powers.filter(p => !p.passive);
    const bySlot = i => f.powers.find(p => !p.passive && p.index === i);
    const remove = p => { f.powers = f.powers.filter(x => x !== p); };
    const freeIndex = () => { for (let i = 0; i < SPELL_SLOTS; i++) if (!bySlot(i)) return i; return 0; };
    let slot = null;
    if (opt.type === 'stat') statById(opt.stat)?.apply(f);
    else if (opt.type === 'new') {
      const dna = dnaOf(opt.code);
      const old = opt.replaces !== undefined ? bySlot(opt.replaces) : null;
      if (old) remove(old);
      if (dna.trigger !== 'cast') {
        const pas = f.powers.filter(p => p.passive);
        if (pas.length >= MAX_PASSIVES) remove(pas[0]);
      }
      const index = dna.trigger === 'cast' ? (old ? old.index : freeIndex()) : -1;
      slot = g.givePower(f, dna);
      slot.index = index;
    } else if (opt.type === 'evolve') {
      const old = bySlot(opt.from);
      if (old) remove(old);
      slot = g.givePower(f, dnaOf(opt.code));
      slot.index = old ? old.index : freeIndex();
      if (old) { slot.cd = Math.min(old.cd, slot.cdMax); slot.charge = old.charge ?? 0; }
    } else if (opt.type === 'fuse') {
      const [a, b] = opt.from.map(bySlot);
      [a, b].forEach(p => p && remove(p));
      slot = g.givePower(f, dnaOf(opt.code));
      slot.index = Math.min(...opt.from);
    }
    if (slot) {
      if (f.cdMul) slot.cdMax *= f.cdMul;
      if (slot.ult) slot.charge = Math.max(slot.charge || 0, 0.25);
      this.game.prebakeFor?.(slot.dna);
    }
    void spells;
  }

  // ── fight hooks ────────────────────────────────────────────────────────
  onDamage({ target, amount, src }) {
    if (this.phase === 'over' || !amount) return;
    const att = src?.owner || src;
    if (!att || att === target || att.team === target.team) return;
    if (att.kind === 'brawler') {
      this.addXp(att, amount * (target.kind === 'brawler' ? XP.damage : XP.damageOther));
      this.statOf(att).damage += amount;
      // ultimates charge from damage dealt
      for (const s of att.powers) if (s.ult && s.charge < 1) s.charge = Math.min(1, s.charge + amount / 1500);
    }
    if (target.kind === 'brawler' && att.kind === 'brawler') {
      let m = this.recent.get(target);
      if (!m) this.recent.set(target, m = new Map());
      m.set(att, this.world.time);
    }
  }

  onDeath({ target, src }) {
    if (this.phase === 'over') return;
    const killer = src?.owner || src;
    if (target.kind === 'brawler') {
      this.statOf(target).deaths++;
      if (killer && killer.team !== target.team && killer.kind === 'brawler') {
        this.statOf(killer).kos++;
        this.addXp(killer, XP.kill + XP.perLevel * (target.level || 1), 'KO');
      }
      const m = this.recent.get(target);
      if (m) for (const [a, t] of m) if (a !== killer && a.alive && this.world.time - t < 6) this.addXp(a, XP.assist, 'assist');
      this.recent.delete(target);
      // forge shards burst out of the fallen: anyone can grab them
      const n = 1 + Math.floor((target.level || 1) / 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R(-0.3, 0.3), sp = R(2.5, 4.5);
        this.addShard(target.pos.x, target.pos.z, Math.cos(a) * sp, Math.sin(a) * sp);
      }
      if (this.phase === 'overtime' && killer && killer.team !== target.team) this.end(killer.team);
    } else if (killer?.kind === 'brawler' && killer.team !== target.team) {
      this.addXp(killer, target.kind === 'titan' ? XP.titan : XP.minion, target.kind === 'titan' ? 'titan' : '');
    }
  }

  addShard(x, z, vx = 0, vz = 0) {
    const s = { id: SHARD_ID++, x, z, vx, vz, t: 0, value: XP.shard, y: 0 };
    this.shards.push(s);
    return s;
  }

  // ── per frame ──────────────────────────────────────────────────────────
  update(dt) {
    this.visuals.update(dt);
    if (this.replica || this.phase === 'over' || this.phase === 'ready') return;
    const g = this.game, w = this.world;
    this.time -= dt;
    for (const f of g.brawlers) {
      if (!f.alive) continue;
      this.addXp(f, XP.trickle * dt);
      for (const s of f.powers) if (s.ult && s.charge < 1) s.charge = Math.min(1, s.charge + dt / 55);
    }
    // wells: a shard every few seconds while few are out
    this.shardT -= dt;
    if (this.shardT <= 0) {
      this.shardT = 9;
      if (this.shards.length < 8) {
        const [x, z] = WELLS[Math.floor(Math.random() * WELLS.length)];
        const s = this.addShard(x + R(-0.6, 0.6), z + R(-0.6, 0.6));
        s.well = true;
      }
    }
    // shards: settle, get pulled toward nearby brawlers, get collected
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      s.vx *= Math.max(0, 1 - dt * 3.5); s.vz *= Math.max(0, 1 - dt * 3.5);
      let best = null, bd = 2.6;
      if (s.t > 0.5) for (const f of g.brawlers) {
        if (!f.alive) continue;
        const d = Math.hypot(f.pos.x - s.x, f.pos.z - s.z);
        if (d < bd) { bd = d; best = f; }
      }
      if (best) {
        const k = (2.6 - bd) * 5 + 2;
        s.vx += (best.pos.x - s.x) / (bd || 1) * k * dt * 6;
        s.vz += (best.pos.z - s.z) / (bd || 1) * k * dt * 6;
        if (bd < 0.55) {
          this.shards.splice(i, 1);
          this.addXp(best, s.value, 'shard');
          w.events.emit('shard', { f: best, x: s.x, z: s.z });
          continue;
        }
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      const p = { x: s.x, z: s.z };
      w.resolveCircle(p, 0.2, null);
      s.x = p.x; s.z = p.z;
      if (s.t > 40 && !s.well) { this.shards.splice(i, 1); }
    }
    // winning
    if (g.score[0] >= this.koTarget || g.score[1] >= this.koTarget) this.end(g.score[0] > g.score[1] ? 0 : 1);
    else if (this.time <= 0) {
      if (this.phase === 'play' && g.score[0] === g.score[1]) {
        this.phase = 'overtime';
        this.time = this.overtime;
        w.events.emit('overtime', {});
      } else this.end(g.score[0] === g.score[1] ? -1 : g.score[0] > g.score[1] ? 0 : 1);
    }
  }

  // Leave mid-match (back button): no results.
  abort() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.aborted = true;
    this.world.events.emit('matchend', { match: this, winner: -1, aborted: true });
  }

  end(winner) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.winner = winner;
    this.world.events.emit('matchend', { match: this, winner });
  }
}

// Forge shards on the ground: faceted gold crystals that bob, spin and fly
// into whoever grabs them. Synced from `match.shards` every frame, so a LAN
// client that only receives the list sees the same thing.
class ShardVisuals {
  constructor(match) {
    this.match = match;
    this.fx = match.world.fx;
    this.scene = match.world.scene;
    this.meshes = new Map();
    const g = new THREE.OctahedronGeometry(0.2, 0);
    g.scale(1, 1.45, 1);
    this.geo = g;
    this.mat = L.energyMaterial({ color: '#ffc53a', core: '#fff6c8', edge: '#c0660c', mode: 1, fresnel: 0.35, intensity: 1.55, erode: 0, noise: 2, blending: 'normal' });
    this.halo = L.energyMaterial({ color: '#ffd76a', core: '#fff3c0', mode: 3, intensity: 1.1, erode: 0, noise: 0.5 });
    this.discGeo = new THREE.PlaneGeometry(1.1, 1.1);
    this.discGeo.rotateX(-Math.PI / 2);
    this.t = 0;
    this.world = match.world;
    this.offShard = this.world.events.on('shard', e => this.collect(e));
  }

  collect({ x, z }) {
    const fx = this.fx;
    fx.sparks('light', [x, 0.6, z], 10, 4);
    this.fx.push(L.ring(this.scene, { pos: [x, 0, z], color: '#ffc53a', core: '#fff6c8', radius: 0.9, dur: 0.3, width: 0.12, blending: 'normal' }));
  }

  update(dt) {
    this.t += dt;
    this.mat.uniforms.uTime.value += dt;
    const seen = new Set();
    for (const s of this.match.shards) {
      seen.add(s.id);
      let m = this.meshes.get(s.id);
      if (!m) {
        m = new THREE.Group();
        const gem = new THREE.Mesh(this.geo, this.mat);
        gem.castShadow = true;
        const disc = new THREE.Mesh(this.discGeo, this.halo);
        disc.position.y = 0.03;
        disc.renderOrder = 14;
        m.add(gem, disc);
        m.userData.gem = gem;
        m.userData.born = this.t;
        this.scene.add(m);
        this.meshes.set(s.id, m);
        if (s.well) this.fx.push(L.pillar(this.scene, { pos: [s.x, 0, s.z], color: '#ffc53a', core: '#fff6c8', radius: 0.35, height: 5, dur: 0.6 }));
      }
      const age = this.t - m.userData.born;
      const pop = Math.min(1, age * 4);
      m.position.set(s.x, 0, s.z);
      const gem = m.userData.gem;
      gem.position.y = 0.45 + Math.sin(this.t * 3 + s.id) * 0.08 + Math.max(0, 0.6 - age * 1.5) * (1 - pop) * 2;
      gem.rotation.y += dt * 2.4;
      gem.scale.setScalar(pop * (1 + 0.08 * Math.sin(this.t * 7 + s.id)));
      if (Math.random() < dt * 2) this.fx.add.spawn({ pos: [s.x + R(-0.2, 0.2), 0.5 + R(-0.1, 0.3), s.z + R(-0.2, 0.2)], vel: [0, 0.6, 0], life: 0.5, size: [0.16, 0], color: { from: [2.6, 2.2, 1.2, 1], to: [2, 1.4, 0.4, 0] }, sprite: 'sparkle', spin: 2 });
    }
    for (const [id, m] of this.meshes) if (!seen.has(id)) { m.removeFromParent(); this.meshes.delete(id); }
  }

  dispose() {
    this.offShard();
    for (const m of this.meshes.values()) m.removeFromParent();
    this.meshes.clear();
  }
}
