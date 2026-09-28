// The simulation: fighters, power entities (projectiles, zones...), walls,
// queries, events and the follow camera.

import * as THREE from 'three';
import { FX } from '../vfx/fx.js';
import '../vfx/powerfx.js';
import '../vfx/statusfx.js';

class Emitter {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); return () => { this.h[e] = this.h[e].filter(x => x !== f); }; }
  emit(e, d) { (this.h[e] || []).forEach(f => f(d)); }
}

export class World {
  constructor(stage, arena) {
    this.stage = stage;
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.arena = arena;
    this.fx = new FX(stage);
    this.events = new Emitter();
    this.fighters = [];
    this.entities = [];
    this.dynWalls = [];
    this.time = 0;
    this.timeScale = 1;       // global slow motion
    this.globalStop = null;   // { caster, t, dur } while time is stopped for everyone else
    this.camTarget = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camOffset = new THREE.Vector3(0, 12.5, 8.6);
    this.camZoom = 1;         // < 1 pushes the camera in (cinematic moments)
    this.camZoomT = 1;
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
    this.focus = null;
    // water cells block walking (not shots)
    if (arena?.water && !arena.waterWalls) { arena.waterWalls = true; for (const c of arena.water) arena.walls.push({ x: c.x, z: c.z, hx: 0.5, hz: 0.5, h: 0, low: true }); }
    this.bushSet = new Set((arena?.bushes || []).map(b => `${Math.round(b.x - 0.5)},${Math.round(b.z - 0.5)}`));
  }

  add(f) { this.fighters.push(f); return f; }
  spawn(e) { this.entities.push(e); return e; }

  enemiesOf(f) { return this.fighters.filter(o => o.alive && o.team !== f.team); }
  alliesOf(f) { return this.fighters.filter(o => o.alive && o.team === f.team); }
  inCircle(x, z, r, filter = () => true) {
    return this.fighters.filter(o => o.alive && filter(o) && Math.hypot(o.pos.x - x, o.pos.z - z) <= r + o.radius);
  }
  nearestEnemy(f, maxD = 99) {
    let best = null, bd = maxD;
    for (const o of this.enemiesOf(f)) {
      if (o.inBush && !o.revealed && Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) > 2.5) continue;
      const d = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  inBush(x, z) { return this.bushSet.has(`${Math.round(x - 0.5)},${Math.round(z - 0.5)}`); }

  allWalls() { return this.dynWalls.length ? [...this.arena.walls, ...this.dynWalls] : this.arena.walls; }
  // Is a point inside a wall (optionally grown by r)?
  wallAt(x, z, r = 0, shots = false) {
    for (const w of this.allWalls()) {
      if (shots && w.low) continue;
      if (Math.abs(x - w.x) < w.hx + r && Math.abs(z - w.z) < w.hz + r) return w;
    }
    return null;
  }
  // Push a circle out of walls and keep it in the arena.
  resolveCircle(p, r, who) {
    for (const w of this.allWalls()) {
      if (w.passable?.(who)) continue;
      if (who?.flying && !w.passable) continue; // flying forms cross walls and water
      const dx = p.x - w.x, dz = p.z - w.z;
      const px = w.hx + r - Math.abs(dx), pz = w.hz + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        // nearest point on the box (rounded-corner feel)
        const cx = Math.max(-w.hx, Math.min(w.hx, dx)), cz = Math.max(-w.hz, Math.min(w.hz, dz));
        const ex = dx - cx, ez = dz - cz, d = Math.hypot(ex, ez);
        if (d > 1e-4 && d < r) { p.x += ex / d * (r - d); p.z += ez / d * (r - d); }
        else if (d <= 1e-4) { if (px < pz) p.x += Math.sign(dx || 1) * px; else p.z += Math.sign(dz || 1) * pz; }
      }
    }
    const W = (this.arena?.W ?? 22) / 2 - r, H = (this.arena?.H ?? 22) / 2 - r;
    p.x = Math.max(-W, Math.min(W, p.x));
    p.z = Math.max(-H, Math.min(H, p.z));
    // fighters push each other gently
    if (who) for (const o of this.fighters) {
      if (o === who || !o.alive) continue;
      const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d = Math.hypot(dx, dz), m = r + o.radius;
      if (d > 1e-4 && d < m) { p.x += dx / d * (m - d) * 0.5; p.z += dz / d * (m - d) * 0.5; }
    }
  }
  // First wall hit along a segment (for projectiles and dashes); returns t in 0..1 or null.
  segmentHitsWall(a, b, r = 0) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.15));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.wallAt(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, r, true)) return t;
    }
    return null;
  }

  update(dt) {
    this.time += dt;
    const g = this.globalStop;
    if (g) { g.t += dt; if (g.t >= g.dur) { this.globalStop = null; g.onEnd?.(); } }
    const wdt = dt * this.timeScale;
    for (const f of this.fighters) {
      const frozen = g && f !== g.caster && f.team !== g.caster.team;
      if (!frozen) f.controller?.update(wdt);
      f.update(frozen ? 0 : wdt);
    }
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      const edt = g && e.owner !== g.caster ? 0 : wdt;
      if (e.update(edt) === false) { e.dispose?.(); this.entities.splice(i, 1); }
    }
    for (let i = this.dynWalls.length - 1; i >= 0; i--) { if (this.dynWalls[i].dead) this.dynWalls.splice(i, 1); }
    this.fx.timeScale = g ? 0.0 : this.timeScale;
    this.fx.update(dt);
    this.updateCamera(dt);
  }

  snapCamera() {
    const f = this.focus;
    if (!f) return;
    this.camLook.set(f.pos.x + f.aimDir.x * 0.8, 0, f.pos.z + f.aimDir.y * 0.8 - 0.5);
    this.updateCamera(0);
  }

  updateCamera(dt) {
    const f = this.focus;
    if (!f) return;
    const aim = f.aimDir;
    this.camTarget.set(f.pos.x + aim.x * 0.8, 0, f.pos.z + aim.y * 0.8 - 0.5);
    this.camLook.lerp(this.camTarget, Math.min(1, dt * 5));
    const s = this.fx.shakeOffset(this.time);
    this.camZoom += (this.camZoomT - this.camZoom) * Math.min(1, dt * 4);
    // narrow screens (portrait phones) pull the camera back so the arena still fits sideways
    const fit = Math.max(1, Math.min(1.9, 1.45 / this.camera.aspect));
    this.camera.position.copy(this.camLook).addScaledVector(this.camOffset, this.camZoom * fit).add(new THREE.Vector3(s[0], s[1], s[2]));
    this.camera.lookAt(this.camLook.x + s[0] * 0.3, 0, this.camLook.z + s[2] * 0.3);
    this.stage.followShadow(new THREE.Vector3(this.camLook.x, 0, this.camLook.z - 1));
  }
}
