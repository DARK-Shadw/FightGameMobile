// A brawler in the arena: movement, collisions, health, shields, statuses,
// basic attack, powers and the link between game state and animation.

import * as THREE from 'three';
import { buildHero } from '../art/heroes.js';
import { Animator } from '../engine/anim.js';
import { blobShadow } from '../engine/toon.js';

const TAU = Math.PI * 2;
const angleLerp = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };

// Crowd control that stops movement / actions
const NO_MOVE = ['stun', 'root', 'frozen', 'launch', 'timestop', 'hex_lock'];
const NO_ACT = ['stun', 'frozen', 'launch', 'timestop', 'silence', 'hex', 'fear', 'control'];

let SERIAL = 0;

export class Fighter {
  constructor(world, o) {
    this.id = SERIAL++;
    this.world = world;
    this.team = o.team;
    this.name = o.name || 'Brawler';
    this.isPlayer = !!o.isPlayer;
    this.heroId = o.hero || 'kai';
    this.kind = o.kind || 'brawler';     // brawler | minion | clone | titan
    this.owner = o.owner || null;
    this.model = o.model || buildHero(this.heroId);
    this.anim = o.animator || new Animator(this.model.rig, this.model.face);
    this.group = new THREE.Group();
    this.group.add(this.model.group);
    world.scene.add(this.group);
    this.radius = o.radius ?? 0.42;
    this.blob = blobShadow(this.radius * 1.1, 0.32);
    world.scene.add(this.blob);
    this.pos = new THREE.Vector3(o.x ?? 0, 0, o.z ?? 0);
    this.vel = new THREE.Vector3();
    this.push = new THREE.Vector3(); // knockback impulse
    this.facing = o.facing ?? 0;
    this.height = o.height ?? this.model.def?.height ?? 1.45;
    this.maxHp = o.maxHp ?? 1000;
    this.hp = this.maxHp;
    this.speed = o.speed ?? 4.3;
    this.shieldHp = 0;
    this.shieldT = 0;
    this.statuses = {};
    this.powers = [];
    this.ammo = 3; this.ammoMax = 3; this.reloadT = 0; this.reloadTime = 1.3;
    this.attackCd = 0;
    this.timeScale = 1;
    this.alive = true;
    this.deadT = 0;
    this.lastHurt = 99;
    this.moveInput = new THREE.Vector2();
    this.aimDir = new THREE.Vector2(0, -1);
    this.history = [];
    this.historyT = 0;
    this.actionT = 0;
    this.buffs = { dmg: 1, speed: 1, empowerHits: 0, empowerPct: 0, reflect: 0, invis: 0, lifesteal: 0 };
    this.imbue = null;
    this.stored = 0; // damage stored during time stop
    this.inBush = false;
    this.kills = 0;
    this.essence = o.essence || 'time';
    // every material that makes up the brawler (body + face decals) for flash, tint, ghost...
    this.lookMats = [];
    this.looks = [];
    this.model.group.traverse(m => {
      const u = m.material?.userData?.u;
      if (!u) return;
      this.looks.push(u);                      // body, face decals and outline (dissolve)
      if (u.uFlash) this.lookMats.push(m.material);
    });
    this.flashV = 0;
    this.update(0);
  }

  get hpPct() { return this.hp / this.maxHp; }
  setLook(name, v) {
    for (const u of this.looks) {
      const x = u[name];
      if (!x) continue;
      if (typeof v === 'number') x.value = v; else x.value.set(v);
    }
  }
  has(s) { return !!this.statuses[s]; }
  canMove() { return this.alive && !NO_MOVE.some(s => this.statuses[s]) && !this.dashing; }
  canAct() { return this.alive && !NO_ACT.some(s => this.statuses[s]) && !this.dashing; }
  handPos() {
    const h = this.model.rig?.bones?.['hand.R'];
    if (!h) return [this.pos.x + this.aimDir.x * this.radius, (this.y || 0) + this.height * 0.5, this.pos.z + this.aimDir.y * this.radius];
    const v = new THREE.Vector3();
    h.getWorldPosition(v);
    return [v.x, Math.max(0.5, v.y), v.z];
  }
  center() { return [this.pos.x, (this.y || 0) + this.height * 0.5, this.pos.z]; }

  addStatus(name, dur, data = {}) {
    const cur = this.statuses[name];
    if (cur) { cur.dur = Math.max(cur.dur - cur.t, dur); cur.t = 0; Object.assign(cur, data); return cur; }
    const st = { t: 0, dur, ...data };
    this.statuses[name] = st;
    this.world.fx.status?.start(this, name, st);
    return st;
  }
  // Drop every status without running end effects (round resets, respawns).
  clearStatuses() {
    if (this.statuses.form) this.removeStatus('form');
    for (const [name, st] of Object.entries(this.statuses)) {
      delete this.statuses[name];
      this.world.fx.status?.end(this, name, st);
    }
    this.shieldHp = 0;
  }

  removeStatus(name) {
    const st = this.statuses[name];
    if (!st) return;
    delete this.statuses[name];
    this.world.fx.status?.end(this, name, st);
    st.onEnd?.();
  }

  // ── damage and healing ───────────────────────────────────────────────
  takeDamage(amount, src, o = {}) {
    if (!this.alive || amount <= 0) return 0;
    if (this.statuses.timestop && !o.release) { this.stored += amount; this.world.events.emit('stored', { target: this, amount }); return 0; }
    if (this.statuses.link && this.statuses.link.to?.alive && !o.linked) {
      const share = Math.round(amount * this.statuses.link.pct / 100);
      this.statuses.link.to.takeDamage(share, src, { linked: true, ess: 'blood' });
      amount -= share;
    }
    let dmg = amount;
    if (this.shieldHp > 0) {
      const a = Math.min(this.shieldHp, dmg);
      this.shieldHp -= a; dmg -= a;
      if (this.shieldHp <= 0) this.removeStatus('shield');
    }
    this.hp -= dmg;
    this.lastHurt = 0;
    this.flashV = 0.85;
    this.world.events.emit('damage', { target: this, amount: Math.round(amount), src, ess: o.ess, crit: o.crit, dot: o.dot });
    if (!o.dot && !this.statuses.timestop) {
      this.hitT = 0.3;
      if (!this.action || this.action.kind === 'hit') this.setAction('hit', 0.35, o.dir ? (o.dir[0] > 0 ? 'L' : 'R') : 'R');
    }
    if (src && src !== this && src.alive && src.buffs.lifesteal > 0) src.heal(amount * src.buffs.lifesteal, { quiet: true });
    if (this.hp <= 0) {
      if (this.passiveHook?.('onDeath')) return amount;
      this.die(src);
    } else if (this.hp / this.maxHp < 0.3) this.passiveHook?.('lowHp');
    if (!o.dot) this.passiveHook?.('whenHit');
    return amount;
  }

  heal(amount, o = {}) {
    if (!this.alive || amount <= 0) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (!o.quiet || this.hp - before > 20) this.world.events.emit('heal', { target: this, amount: Math.round(this.hp - before) });
  }

  die(src) {
    this.alive = false;
    this.hp = 0;
    this.deadT = 0;
    for (const s of Object.keys(this.statuses)) this.removeStatus(s);
    this.shieldHp = 0;
    this.world.events.emit('death', { target: this, src });
    if (src && src !== this) { src.kills++; src.passiveHook?.('onKill', { victim: this }); }
  }

  revive(hpPct = 1, pos = null) {
    this.alive = true;
    this.hp = this.maxHp * hpPct;
    if (pos) this.pos.set(pos[0], 0, pos[2]);
    this.anim.s.dead = 0;
    this.setLook('uDissolve', 0);
    this.group.visible = true;
    this.world.events.emit('revive', { target: this });
  }

  setAction(kind, dur, side = 'R') {
    this.action = { kind, dur, t: 0, side };
    this.anim.s.action = this.action;
  }

  knock(dx, dz, strength) {
    const l = Math.hypot(dx, dz) || 1;
    this.push.x += dx / l * strength;
    this.push.z += dz / l * strength;
  }

  // ── per-frame ────────────────────────────────────────────────────────
  update(dt) {
    const w = this.world;
    // personal clock: time slow / haste / stop
    let ts = 1;
    if (this.statuses.timestop) ts = 0;
    else {
      if (this.statuses.clockSlow) ts *= 1 - this.statuses.clockSlow.pct / 100;
      if (this.statuses.clockHaste) ts *= 1 + this.statuses.clockHaste.pct / 100;
    }
    this.timeScale = ts;
    const ldt = dt * ts;

    // statuses tick in world time
    for (const [name, st] of Object.entries(this.statuses)) {
      st.t += dt;
      st.tick?.(dt, this);
      if (st.dur > 0 && st.t >= st.dur) this.removeStatus(name);
    }
    if (this.shieldHp > 0) { this.shieldT -= dt; if (this.shieldT <= 0) { this.shieldHp = 0; this.removeStatus('shield'); } }

    if (!this.alive) {
      this.deadT += dt;
      this.anim.s.dead = Math.min(1, this.deadT * 3);
      this.anim.s.speed = 0;
      this.setLook('uDissolve', Math.max(0, (this.deadT - 0.7) * 1.4));
      if (this.deadT > 1.5) this.group.visible = false;
      this.anim.update(dt);
      this.syncTransform(dt);
      return;
    }

    this.lastHurt += dt;
    if (this.lastHurt > 3.5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12 * dt);
    this.attackCd = Math.max(0, this.attackCd - ldt);
    if (this.ammo < this.ammoMax) {
      this.reloadT += ldt;
      if (this.reloadT >= this.reloadTime) { this.reloadT = 0; this.ammo++; }
    }
    for (const p of this.powers) { if (p.cd > 0) p.cd = Math.max(0, p.cd - ldt); }

    // movement
    let mx = this.moveInput.x, mz = this.moveInput.y;
    if (this.statuses.fear) { const f = this.statuses.fear; mx = this.pos.x - f.from[0]; mz = this.pos.z - f.from[2]; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l; }
    if (this.statuses.confuse) { mx = -mx; mz = -mz; }
    let spd = this.speed * this.buffs.speed;
    if (this.statuses.slow) spd *= 1 - this.statuses.slow.pct / 100;
    if (this.statuses.haste) spd *= 1 + this.statuses.haste.pct / 100;
    if (this.statuses.hex) spd *= 0.6;
    if (!this.canMove() && !this.statuses.fear) { mx = 0; mz = 0; }
    const ml = Math.min(1, Math.hypot(mx, mz));
    if (ml > 0.01) {
      const l = Math.hypot(mx, mz);
      this.vel.x = mx / l * spd * ml; this.vel.z = mz / l * spd * ml;
    } else { this.vel.x *= Math.max(0, 1 - ldt * 14); this.vel.z *= Math.max(0, 1 - ldt * 14); }
    if (this.dashing) {
      const d = this.dashing;
      d.t += ldt;
      const k = Math.min(1, d.t / d.dur);
      this.vel.set(d.dir[0] * d.speed, 0, d.dir[2] * d.speed);
      if (k >= 1) { this.dashing = null; d.onEnd?.(); }
      else d.onStep?.(ldt);
    }
    this.pos.x += (this.vel.x + this.push.x) * ldt;
    this.pos.z += (this.vel.z + this.push.z) * ldt;
    this.push.multiplyScalar(Math.max(0, 1 - ldt * 7));
    w.resolveCircle(this.pos, this.radius, this);

    // airborne (launch / leap) height
    let y = 0;
    if (this.statuses.launch) { const st = this.statuses.launch; y = Math.sin(Math.min(1, st.t / st.dur) * Math.PI) * 1.6; }
    if (this.leap) {
      const L = this.leap;
      L.t += ldt;
      const k = Math.min(1, L.t / L.dur);
      this.pos.x = L.from[0] + (L.to[0] - L.from[0]) * k;
      this.pos.z = L.from[2] + (L.to[2] - L.from[2]) * k;
      y = Math.sin(k * Math.PI) * L.height;
      this.anim.s.airborne = Math.sin(k * Math.PI);
      if (k >= 1) { this.leap = null; this.anim.s.airborne = 0; this.anim.kick(0.5); L.onLand?.(); }
    }
    this.y = y;

    // facing: toward aim while acting, else toward movement
    let targetFacing = this.facing;
    if (this.action && this.action.kind !== 'hit') targetFacing = Math.atan2(this.aimDir.x, this.aimDir.y);
    else if (Math.hypot(this.vel.x, this.vel.z) > 0.3) targetFacing = Math.atan2(this.vel.x, this.vel.z);
    if (!this.statuses.timestop) this.facing = angleLerp(this.facing, targetFacing, Math.min(1, ldt * 16));

    // animation state
    const a = this.anim.s;
    a.speed = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / this.speed);
    a.moveVel = [this.vel.x, this.vel.z];
    a.stunned = !!(this.statuses.stun || this.statuses.confuse);
    a.frozen = !!(this.statuses.timestop || this.statuses.frozen);
    if (this.action) {
      this.action.t += ldt;
      if (this.action.t >= this.action.dur) { this.action = null; a.action = null; }
    }
    a.aimLocal = 0;
    const lookX = Math.max(-1, Math.min(1, this.aimDir.x * Math.cos(this.facing) - this.aimDir.y * Math.sin(this.facing)));
    a.look = [lookX * 0.6, 0];
    this.flashV = Math.max(0, this.flashV - dt * 6);
    this.setLook('uFlash', this.flashV);
    this.anim.update(ldt);

    // rewind history (position + hp every 0.1 s, 6 s deep)
    this.historyT += dt;
    if (this.historyT > 0.1) {
      this.historyT = 0;
      this.history.push({ x: this.pos.x, z: this.pos.z, hp: this.hp, facing: this.facing });
      if (this.history.length > 60) this.history.shift();
    }

    // bushes: hidden from enemies while inside and not attacking
    this.inBush = w.inBush(this.pos.x, this.pos.z);
    this.syncTransform(dt);
  }

  syncTransform() {
    this.group.position.set(this.pos.x, this.y || 0, this.pos.z);
    this.model.group.rotation.y = this.facing;
    this.blob.position.set(this.pos.x, 0.013, this.pos.z);
    const s = 1 - Math.min(0.5, (this.y || 0) * 0.2);
    this.blob.scale.set(s, s, 1);
    this.blob.visible = this.group.visible;
  }

  dispose() {
    this.group.removeFromParent();
    this.blob.removeFromParent();
  }
}
