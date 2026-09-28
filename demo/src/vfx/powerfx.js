// Power visuals built on the FX manager: zones, auras, beams, cones, walls,
// traps, tethers, sky strikes, dashes, and the big law moments (time stop,
// rewind, arena-wide weather).

import * as THREE from 'three';
import { FX } from './fx.js';
import * as L from './fxlib.js';
import { STYLE, hexToRgb } from './styles.js';
import { PUFF } from './puffs.js';
import { toonMaterial, outlineMaterial, SHARED } from '../engine/toon.js';
import { meshSDF } from '../art/creature-mesher.js';
import { geometryFrom } from '../engine/rig.js';
import { rock } from '../art/props.js';

const R = (a, b) => a + Math.random() * (b - a);

// Generic persistent effect driven by a callback until killed or timed out.
function live(fx, dur, fn, onKill) {
  const e = { t: 0, dead: false, update(dt) { if (e.dead) return false; e.t += dt; fn(dt, e); if (dur > 0 && e.t >= dur) { e.kill(); return false; } return true; },
    kill() { if (e.dead) return; e.dead = true; onKill?.(); } };
  fx.push(e);
  return e;
}

Object.assign(FX.prototype, {
  hitSpark(ess, target) {
    const c = target.center();
    this.sparks(ess, c, 8, 5);
    this.bits(ess, c, 3, 3, { size: 0.7 });
  },

  execute(ess, target) {
    const c = target.center();
    const sk = this.billboard('skull', '#ffffff', 1.2, true, 2.4);
    sk.position.set(c[0], 1.8, c[2]);
    this.scene.add(sk);
    live(this, 0.9, (dt, e) => { sk.position.y += dt * 1.2; sk.material.uniforms.uOpacity.value = 1 - e.t / 0.9; sk.scale.setScalar(1.2 + e.t); }, () => sk.removeFromParent());
    this.impact(ess, c, 1.4, 1);
    this.flash('#ffffff', 0.35);
  },

  teleport(ess, pos) {
    const st = this.style(ess);
    this.implode(ess, pos, 16, 1.2, 0.2);
    this.push(L.burst(this.scene, { pos, color: st.color, core: st.core, radius: 0.9, dur: 0.25, intensity: 2.2 }));
    this.push(L.ring(this.scene, { pos: [pos[0], 0, pos[2]], color: st.color, core: st.core, radius: 1.2, dur: 0.35 }));
    this.motes(ess, pos, 12, 0.5, { sprite: 'sparkle', up: 2 });
  },

  exchange(ess, a, b) {
    for (const [from, to, col] of [[a, b, '#ff5a7a'], [b, a, '#7affb0']]) {
      const f = from.center(), tt = to.center();
      for (let i = 0; i < 10; i++) this.add.spawn({ pos: [...f], vel: [(tt[0] - f[0]) * 1.6 + R(-1, 1), R(2, 4), (tt[2] - f[2]) * 1.6 + R(-1, 1)], life: 0.6, size: [0.35, 0.2], color: { from: [...hexToRgb(col, 2.5), 1], to: [...hexToRgb(col, 2), 0] }, sprite: 'heart', gravity: 6 });
    }
    this.flash('#ffffff', 0.25);
  },

  steal(ess, target, caster) {
    const st = this.style(ess);
    const orb = this.billboard('star4', st.color, 0.7, true, 2.5);
    this.scene.add(orb);
    const a = target.center();
    live(this, 0.6, (dt, e) => {
      const b = caster.center(), k = e.t / 0.6;
      orb.position.set(a[0] + (b[0] - a[0]) * k, a[1] + Math.sin(k * Math.PI) * 1.5, a[2] + (b[2] - a[2]) * k);
      this.motif(ess, 'trail', [orb.position.x, orb.position.y, orb.position.z], 0.4);
    }, () => { orb.removeFromParent(); this.selfBurst(ess, caster, 0.7); });
  },

  healBurst(ess, who) {
    const c = who.center();
    for (let i = 0; i < 12; i++) this.add.spawn({ pos: [c[0] + R(-0.4, 0.4), R(0.2, 1.2), c[2] + R(-0.4, 0.4)], vel: [0, R(1, 2.5), 0], life: R(0.6, 1), size: [0.3, 0.15], color: { from: [0.5, 2.4, 0.8, 1], to: [0.3, 2, 0.5, 0] }, sprite: 'plus', rot: 0 });
    this.push(L.ring(this.scene, { pos: [c[0], 0, c[2]], color: '#6aff8a', core: '#e8ffe8', radius: 1.1, dur: 0.5 }));
  },

  cleanse(ess, who) { this.motes('light', who.center(), 16, 0.6, { sprite: 'sparkle', up: 2 }); },

  rewind(ess, who, trailPts) {
    const st = this.style('time');
    // ghost copies stepping back along the path
    const pts = trailPts.slice().reverse();
    pts.forEach((h, i) => {
      if (i % 3) return;
      const g = this.billboard('halo', st.color, 1.1, true, 1.6);
      g.position.set(h.x, 0.8, h.z);
      this.scene.add(g);
      live(this, 0.5 + i * 0.01, (dt, e) => { g.material.uniforms.uOpacity.value = 1 - e.t / (0.5 + i * 0.01); }, () => g.removeFromParent());
    });
    this.push(L.circle(this.scene, { pos: [who.pos.x, 0, who.pos.z], color: st.color, core: st.core, clock: true, radius: 1.8, dur: 1.0, spin: -6 }));
    const u = this.stage.fx.uRewind;
    live(this, 0.7, (dt, e) => { u.value = Math.sin(Math.min(1, e.t / 0.7) * Math.PI) * 0.9; }, () => { u.value = 0; }).unscaled = true;
    this.chroma(0.8);
  },

  lawWindup(ess, caster, dur, law) {
    const st = this.style(ess);
    const pos = [caster.pos.x, 0, caster.pos.z];
    const follow = () => [caster.pos.x, 0, caster.pos.z];
    const R0 = 1.8 + law * 0.7;
    // two counter-rotating circles: runes outside, the essence's own face inside
    this.push(L.circle(this.scene, { pos, color: st.color, core: st.core, edge: st.edge, radius: R0, dur: dur + 0.35, spin: 1.2, follow }));
    this.push(L.circle(this.scene, { pos, color: st.color, core: st.glow, edge: st.edge, clock: ess === 'time', radius: R0 * 0.62, dur: dur + 0.35, spin: -2.2, follow, y: 0.08, intensity: 1.5 }));
    this.implode(ess, [pos[0], 0.2, pos[2]], 30 + law * 20, 3, dur);
    caster.setLook('uTint', st.color);
    live(this, dur, (dt, e) => {
      caster.setLook('uTintAmount', 0.4 * Math.sin(Math.min(1, e.t / dur) * Math.PI));
      if (Math.random() < dt * 40) this.motif(ess, 'trail', [caster.pos.x + R(-1.2, 1.2), R(0.1, 0.4), caster.pos.z + R(-1.2, 1.2)], 0.6, 0, [0, -3, 0]);
    }, () => { caster.setLook('uTintAmount', 0); });
    if (law >= 2) {
      // the world holds its breath: slow motion, camera pushes in, a pillar of light answers
      const world = caster.world;
      const vig = this.stage.fx.uVignette;
      const v0 = 0.32;
      this.push(L.pillar(this.scene, { pos, color: st.color, core: st.core, edge: st.edge, radius: 0.9, height: 16, dur: dur + 0.3, intensity: 2 }));
      live(this, dur + 0.25, (dt, e) => {
        world.timeScale = 0.35;
        world.camZoomT = 0.72;
        vig.value = v0 + 0.45 * Math.sin(Math.min(1, e.t / (dur + 0.25)) * Math.PI);
      }, () => { world.timeScale = 1; world.camZoomT = 1; vig.value = v0; this.shake(0.6); this.flash(st.glow, 0.25); }).unscaled = true;
      caster.world.events.emit('godly', { caster, ess });
    }
  },

  charge(ess, caster, dur) {
    const st = this.style(ess);
    const col = hexToRgb(st.color, 2.5);
    live(this, dur, () => {
      const h = caster.handPos();
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2, d = R(0.4, 0.8);
        const p = [h[0] + Math.cos(a) * d, h[1] + R(-0.3, 0.4), h[2] + Math.sin(a) * d];
        this.add.spawn({ pos: p, vel: [(h[0] - p[0]) * 5, (h[1] - p[1]) * 5, (h[2] - p[2]) * 5], life: 0.2, size: [0.12, 0.02], color: { from: [...col, 0], to: [...col, 1] }, sprite: 'spark', stretch: 0.06, fadeIn: 0 });
      }
    });
  },

  echo(ess, pos) {
    const st = this.style(ess);
    this.push(L.circle(this.scene, { pos, color: st.color, core: st.core, clock: true, radius: 1.3, dur: 0.6, spin: -4 }));
    this.push(L.ring(this.scene, { pos, color: st.color, core: st.core, radius: 2, dur: 0.5 }));
  },

  nova(ess, at, r) {
    const st = this.style(ess);
    const pf = PUFF[ess] || PUFF.fire;
    // a wall of toon puffs racing outward along the ground, a bright core flash and a shock ring
    this.flashAt(ess, [at[0], 0.6, at[2]], 0.9 + r * 0.3, 0.12);
    const n = Math.round(14 + r * 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R(-0.1, 0.1);
      const sp = r * R(3.2, 4.2);
      this.cloud.spawn({ pos: [at[0] + Math.cos(a) * 0.4, R(0.25, 0.55), at[2] + Math.sin(a) * 0.4], vel: [Math.cos(a) * sp, R(0.5, 1.5), Math.sin(a) * sp],
        life: R(0.38, 0.52), size: [0.2, R(0.42, 0.62) * (0.7 + r * 0.12)], squash: 0.8, colors: pf.burst, hot: pf.hot, drag: 4.4, gravity: -0.4, cut: 0.35, floor: 0.12 });
    }
    this.clouds(ess, [at[0], 0.4, at[2]], 4, 0.9);
    this.push(L.ring(this.scene, { pos: at, color: st.color, core: st.glow, edge: st.edge, radius: r * 1.08, dur: 0.4, width: 0.35, intensity: 1.6, blending: 'normal' }));
    this.push(L.ring(this.scene, { pos: at, color: st.core, core: '#ffffff', radius: r * 1.15, dur: 0.28, width: 0.12, intensity: 2.2 }));
    this.push(L.glowDisc(this.scene, { pos: at, color: st.color, radius: r * 1.1, dur: 0.45, opacity: 0.35 }));
    if (st.motif === 'lightning') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + R(-0.2, 0.2);
        const to = [at[0] + Math.cos(a) * r, 0.1, at[2] + Math.sin(a) * r];
        this.push(L.lightning(this.scene, { ends: () => [[at[0], 0.7, at[2]], to], color: st.color, dur: R(0.18, 0.3), width: 0.08, jag: 0.5, segments: 8, branches: 1 }));
      }
    } else if (st.motif === 'shard') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.add.spawn({ pos: [at[0] + Math.cos(a) * r * 0.85, 0.25, at[2] + Math.sin(a) * r * 0.85], vel: [Math.cos(a) * 1.5, R(3, 5), Math.sin(a) * 1.5], life: 0.6, size: [0.35, 0.2], color: { from: [2.2, 2.6, 3, 1], to: [1.2, 1.8, 2.6, 0] }, sprite: 'shard', spin: R(-8, 8), gravity: 12, floor: 0.05 });
      }
    }
    this.sparks(ess, [at[0], 0.6, at[2]], 14, 6 + r * 2, { up: 0.3 });
    this.motif(ess, 'impact', [at[0], 0.5, at[2]], r * 0.6, 0.6);
    this.shake(0.3 + r * 0.08);
  },

  telegraphCircle(ess, at, r, dur) { this.push(L.telegraph(this.scene, { pos: at, radius: r, color: this.style(ess).color, dur })); },

  coneBlast(ess, at, dir, len, angle) {
    const st = this.style(ess);
    const pf = PUFF[ess] || PUFF.fire;
    const a0 = Math.atan2(dir[2], dir[0]), half = (angle * Math.PI / 180) / 2;
    // the breath itself: a torrent of toon puffs fanning out, small at the mouth, big at the end
    const n = Math.round(10 + len * 3.5 + angle / 10);
    for (let i = 0; i < n; i++) {
      const a = a0 + R(-half, half) * 0.92;
      const sp = len * R(2.4, 3.8);
      const delay = R(0, 0.15);
      const p0 = [at[0] + Math.cos(a) * (0.4 + delay * sp), R(0.45, 0.85), at[2] + Math.sin(a) * (0.4 + delay * sp)];
      this.cloud.spawn({ pos: p0, vel: [Math.cos(a) * sp, R(-0.2, 0.9), Math.sin(a) * sp], life: R(0.3, 0.48), size: [0.1, R(0.22, 0.55) * (0.6 + len * 0.1)],
        squash: R(0.7, 0.95), colors: pf.burst, hot: pf.hot, drag: 3.2, gravity: -0.5, cut: 0.35, floor: 0.12 });
    }
    this.push(L.cone(this.scene, { pos: at, dir, length: len, angle, color: st.color, core: st.glow, edge: st.edge, dur: 0.4, intensity: 1.6, blending: 'normal' }));
    for (let i = 0; i < 12; i++) {
      const a = a0 + R(-half, half), sp = R(len * 1.6, len * 3);
      this.add.spawn({ pos: [at[0], 0.7, at[2]], vel: [Math.cos(a) * sp, R(0.2, 1.5), Math.sin(a) * sp], life: R(0.2, 0.35), size: [0.2, 0.05], color: { from: [...hexToRgb(st.core, 2.5), 1], to: [...hexToRgb(st.color, 2), 0] }, sprite: 'spark', stretch: 0.05, drag: 2 });
      if (i % 2) this.motif(ess, 'trail', [at[0] + Math.cos(a) * len * R(0.3, 0.9), 0.6, at[2] + Math.sin(a) * len * R(0.3, 0.9)], 0.8, 0, [-Math.cos(a), 0, -Math.sin(a)]);
    }
    if (st.motif === 'lightning') for (let i = 0; i < 4; i++) {
      const a = a0 + R(-half, half);
      const to = [at[0] + Math.cos(a) * len, 0.5, at[2] + Math.sin(a) * len];
      this.push(L.lightning(this.scene, { ends: () => [[at[0], 0.8, at[2]], to], color: st.color, dur: 0.25, width: 0.07, jag: 0.45, segments: 8, branches: 1 }));
    }
    this.shake(0.25);
  },

  zoneVisual(ess, pos, radius, dur, o = {}) {
    const st = this.style(ess);
    const follow = o.follow;
    const aura = o.kind === 'aura';
    const circle = L.circle(this.scene, { pos, color: st.color, core: st.core, edge: st.edge, clock: ess === 'time', radius, dur: 0, spin: aura ? 1.2 : 0.4, opacity: o.kind === 'terrain' ? 0.5 : 0.9, follow, grow: true });
    const fill = L.glowDisc(this.scene, { pos, color: st.color, radius: radius * 1.05, opacity: st.dark ? 0.5 : 0.28, intensity: st.dark ? 0.3 : 1, follow });
    const edge = aura ? L.shield(this.scene, { follow: () => (follow ? follow() : pos), color: st.color, radius: radius * 0.9, lift: 0, opacity: 0.18, intensity: 1 }) : null;
    this.push(circle); this.push(fill); if (edge) this.push(edge);
    let acc = 0, strike = 0;
    const area = Math.PI * radius * radius;
    const e = live(this, dur, (dt, self) => {
      const c = follow ? follow() : pos;
      const g = o.grow ? o.grow() : 1;
      if (c) { pos[0] = c[0]; pos[2] = c[2]; }
      circle.R = radius * g;
      fill.obj.scale.setScalar(radius * 1.05 * g);
      acc += dt * (4 + area * 2.2);
      while (acc > 1) {
        acc -= 1;
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius * g;
        this.motif(ess, 'trail', [pos[0] + Math.cos(a) * d, R(0.1, 0.5), pos[2] + Math.sin(a) * d], 0.7, 0, [0, -2, 0]);
      }
      // essence extras
      strike += dt;
      if (st.motif === 'lightning' && strike > 0.35) {
        strike = 0;
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius * g;
        const at = [pos[0] + Math.cos(a) * d, 0.05, pos[2] + Math.sin(a) * d];
        this.push(L.lightning(this.scene, { ends: () => [[at[0] + R(-0.5, 0.5), 5, at[2] + R(-0.5, 0.5)], at], color: st.color, dur: 0.15, width: 0.08, jag: 0.5, branches: 1 }));
        this.sparks(ess, at, 6, 4);
      }
      if (st.motif === 'flame' && strike > 0.08) {
        strike = 0;
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius * g;
        this.alpha.spawn({ pos: [pos[0] + Math.cos(a) * d, 0.1, pos[2] + Math.sin(a) * d], vel: [0, R(1.2, 2.5), 0], life: R(0.4, 0.7), size: [R(0.5, 0.8), 0.1], color: { from: [1.7, 1.2, 0.35, 1], to: [1.1, 0.12, 0.04, 0] }, sprite: 'flame', rot: 0 });
      }
      if (st.motif === 'shard' && strike > 0.3) {
        strike = 0;
        this.puffs(ess, [pos[0] + R(-radius, radius) * 0.6, 0.1, pos[2] + R(-radius, radius) * 0.6], 1, radius * 0.4, { color: '#e8fbff', alpha: 0.35, up: 0.3, noCloud: true });
      }
      if (st.motif === 'stars' && strike > 0.05) {
        strike = 0;
        const a = Math.random() * Math.PI * 2, d = radius * g;
        const p = [pos[0] + Math.cos(a) * d, R(0.2, 1), pos[2] + Math.sin(a) * d];
        this.add.spawn({ pos: p, vel: [(pos[0] - p[0]) * 1.5 - Math.sin(a) * 3, 0, (pos[2] - p[2]) * 1.5 + Math.cos(a) * 3], life: 0.6, size: [0.18, 0], color: { from: [...hexToRgb(st.core, 2.5), 1], to: [...hexToRgb(st.color, 2), 0] }, sprite: 'star5', spin: 3 });
      }
    }, () => { circle.kill(); fill.kill(); edge?.kill(); });
    return e;
  },

  afterglow(ess, pos, radius, dur) {
    const st = this.style(ess);
    const fill = this.push(L.glowDisc(this.scene, { pos, color: st.color, radius, dur, opacity: 0.3 }));
    let acc = 0;
    return live(this, dur, dt => {
      acc += dt * 6;
      while (acc > 1) { acc -= 1; const a = Math.random() * Math.PI * 2, d = Math.random() * radius; this.motif(ess, 'trail', [pos[0] + Math.cos(a) * d, 0.2, pos[2] + Math.sin(a) * d], 0.45, 0, [0, -1, 0]); }
    }, () => fill.kill());
  },

  beamVisual(ess, ends, radius, dur) {
    const st = this.style(ess);
    const pf = PUFF[ess] || PUFF.fire;
    const R0 = Math.max(0.3, radius * 1.4);
    // solid colored body (reads on bright ground) with a white-hot additive core
    const b = this.push(L.beam(this.scene, { ends, color: st.color, core: st.glow, edge: st.edge, radius: R0, intensity: st.dark ? 1.2 : 1.5, blending: 'normal' }));
    const core = this.push(L.beam(this.scene, { ends, color: st.core, core: '#ffffff', radius: R0 * 0.45, intensity: 2.4 }));
    let acc = 0, ring = 0;
    return live(this, dur, (dt) => {
      const [a, c] = ends();
      acc += dt; ring += dt;
      if (acc > 0.05) {
        acc = 0;
        // splash where it hits and a glow in the hand
        this.cloud.spawn({ pos: [c[0], Math.max(0.3, c[1]), c[2]], vel: [R(-2, 2), R(0.5, 2), R(-2, 2)], life: R(0.25, 0.4), size: [0.15, R(0.3, 0.45)], colors: pf.burst, hot: pf.hot, drag: 4, cut: 0.3 });
        this.sparks(ess, c, 2, 5, { life: 0.6 });
        this.add.spawn({ pos: [...a], vel: [0, 0, 0], life: 0.1, size: [R0 * 3, R0 * 3.6], color: { from: [...hexToRgb(st.core, 2.6), 0.9], to: [...hexToRgb(st.color, 2), 0] }, sprite: 'burst', rot: Math.random() * 6 });
      }
      if (ring > 0.22) { ring = 0; this.push(L.ring(this.scene, { pos: [c[0], 0, c[2]], color: st.color, core: st.glow, radius: 1.1, dur: 0.3, width: 0.15, blending: 'normal' })); }
      if (Math.random() < 0.6) this.motif(ess, 'trail', [a[0] + (c[0] - a[0]) * Math.random(), a[1], a[2] + (c[2] - a[2]) * Math.random()], 0.5, 0, [a[0] - c[0], 0, a[2] - c[2]]);
      this.add.spawn({ pos: [...c], vel: [0, 0, 0], life: 0.12, size: [R0 * 4, R0 * 3], color: { from: [...hexToRgb(st.core, 2.2), 0.8], to: [...hexToRgb(st.color, 2), 0] }, sprite: 'glow' });
      this.shake(0.12);
    }, () => { b.kill(); core.kill(); });
  },

  dashStart(ess, f, dir) {
    const st = this.style(ess);
    this.puffs(ess, [f.pos.x, 0.1, f.pos.z], 6, 0.6, { color: '#e8dcc0', alpha: 0.5, up: 0.4 });
    this.push(L.ring(this.scene, { pos: [f.pos.x, 0, f.pos.z], color: st.color, core: '#ffffff', radius: 1.2, dur: 0.3, blending: 'normal', width: 0.2 }));
    this.flashAt(ess, f.center(), 1.1, 0.1);
    // a wide essence streak that follows the dasher, and an afterimage right away
    let alive = true;
    const head = () => (alive && f.alive ? [f.pos.x, (f.y || 0) + 0.7, f.pos.z] : null);
    const tr = this.push(L.trail(this.scene, { color: st.color, core: st.glow, edge: st.edge, width: 1.1, points: 14, camera: this.camera, head, intensity: st.dark ? 1 : 1.5, blending: 'normal' }));
    f._dashTrail = { stop: () => { alive = false; tr.stop?.(); } };
    this.afterimage(f, ess, 0.7);
  },
  dashEnd(ess, f) {
    this.puffs(ess, [f.pos.x, 0.1, f.pos.z], 5, 0.5, { color: '#e8dcc0', alpha: 0.45, up: 0.4 });
    this.clouds(ess, [f.pos.x, 0.5, f.pos.z], 4, 0.7);
    f._dashTrail?.stop();
    f._dashTrail = null;
  },
  slamCracks(ess, at, r) {
    this.puffs(ess, [at[0], 0.05, at[2]], 10, r, { color: '#d8c8a8', alpha: 0.55, up: 0.5, size: 1.2 });
    this.push(L.ring(this.scene, { pos: at, color: '#8a7058', core: '#d8c8a8', radius: r * 1.2, dur: 0.5, width: 0.3, blending: 'normal', intensity: 1 }));
  },

  trapVisual(ess, at, r) {
    const st = this.style(ess);
    const c = L.circle(this.scene, { pos: at, color: st.color, core: st.core, radius: r, dur: 0, spin: 0.8, opacity: 0.4 });
    this.push(c);
    return live(this, 0, (dt, e) => { c.mats?.[0] && (c.mats[0].uniforms.uOpacity.value = 0.3 + 0.12 * Math.sin(e.t * 4)); if (Math.random() < 0.08) this.motes(ess, at, 1, r * 0.8, { up: 0.5 }); }, () => c.kill());
  },

  wallVisual(ess, center, perp, length, dur) {
    const st = this.style(ess);
    const n = Math.max(3, Math.round(length / 0.55));
    const group = new THREE.Group();
    this.scene.add(group);
    const pieces = [];
    for (let i = 0; i < n; i++) {
      const k = (i / (n - 1) - 0.5) * length;
      let m;
      if (st.motif === 'rock' || st.motif === 'claw' || st.motif === 'blood') {
        const geo = this.cache.pillar || (this.cache.pillar = geometryFrom(meshSDF(rock(3, 1), { cell: 0.045, aoStep: 0.07 })));
        geo.userData.shared = true;
        m = new THREE.Group();
        const body = new THREE.Mesh(geo, this.cache.pillarMat || (this.cache.pillarMat = toonMaterial({ rim: 0.4 })));
        const ol = new THREE.Mesh(geo, this.cache.pillarOl || (this.cache.pillarOl = outlineMaterial({ width: 0.0018 })));
        body.castShadow = true;
        m.add(body, ol);
        m.scale.set(R(0.9, 1.15), R(2.4, 3.2), R(0.9, 1.15));
        m.rotation.y = R(0, 6.28);
        if (st.motif !== 'rock') { const tint = st.motif === 'blood' ? '#7a1a2a' : '#8a5a3a'; body.material = toonMaterial({ rim: 0.4 }); body.material.userData.u.uTint.value.set(tint); body.material.userData.u.uTintAmount.value = 0.35; }
      } else if (st.motif === 'shard') {
        const g = new THREE.OctahedronGeometry(0.5, 0); g.scale(0.5, 1.6, 0.5);
        m = new THREE.Mesh(g, L.energyMaterial({ color: '#a8eaff', core: '#ffffff', edge: '#2a6fe0', mode: 1, fresnel: 0.5, intensity: 1.4, erode: 0, blending: 'normal' }));
        m.rotation.z = R(-0.2, 0.2);
      } else if (st.motif === 'vine') {
        const g = new THREE.ConeGeometry(0.22, 1.4, 6); g.translate(0, 0.7, 0);
        m = new THREE.Mesh(g, toonMaterial({ vertexColors: false, color: '#3f9a3a', rim: 0.4 }));
        m.rotation.set(R(-0.3, 0.3), 0, R(-0.3, 0.3));
      } else {
        const g = new THREE.CylinderGeometry(0.26, 0.32, 1.5, 12, 1, true); g.translate(0, 0.75, 0);
        m = new THREE.Mesh(g, L.energyMaterial({ color: st.color, core: st.glow, edge: st.edge, mode: 2, fresnel: 0.6, intensity: 1.3, erode: 0.2, noise: 1.5, scroll: [0, -2], blending: st.dark ? 'normal' : undefined, soft: 0.3 }));
      }
      m.position.set(center[0] + perp[0] * k, 0, center[2] + perp[2] * k);
      m.userData.h = 0;
      group.add(m);
      pieces.push(m);
    }
    this.impact(ess, [center[0], 0.3, center[2]], length * 0.3, 0.5);
    for (let i = 0; i < n; i += 2) this.puffs(ess, [pieces[i].position.x, 0.1, pieces[i].position.z], 2, 0.5, { color: '#d8c8a8', alpha: 0.5, up: 0.6 });
    let acc = 0;
    return live(this, dur, (dt, e) => {
      const rise = Math.min(1, e.t / 0.25), fall = Math.min(1, Math.max(0, (dur - e.t) / 0.3));
      const k = Math.min(rise, fall);
      pieces.forEach((m, i) => {
        m.position.y = (k - 1) * 1.8;
        if (m.material?.uniforms?.uTime) m.material.uniforms.uTime.value += dt;
      });
      acc += dt * 12;
      while (acc > 1) { acc -= 1; const m = pieces[Math.floor(Math.random() * n)]; this.motif(ess, 'trail', [m.position.x, R(0.2, 1.3), m.position.z], 0.6, 0, [0, -1, 0]); }
    }, () => group.removeFromParent());
  },

  tetherVisual(ess, endsFn) {
    const st = this.style(ess);
    let last = null;
    const b = this.push(L.beam(this.scene, { ends: () => { const e = endsFn(); if (e) last = e; return last || [[0, -9, 0], [0, -9, 0.1]]; }, color: st.color, core: st.glow, edge: st.edge, radius: 0.12, intensity: 1.6, blending: 'normal' }));
    const core = this.push(L.beam(this.scene, { ends: () => last || [[0, -9, 0], [0, -9, 0.1]], color: st.core, core: '#ffffff', radius: 0.05, intensity: 2.4 }));
    let pulse = 0;
    const col = hexToRgb(st.glow, 2.6);
    return live(this, 0, (dt, e) => {
      const ends = endsFn();
      if (!ends) { e.kill(); return; }
      pulse += dt;
      if (pulse > 0.12) {
        pulse = 0;
        const [a, c] = ends, d = Math.hypot(c[0] - a[0], c[2] - a[2]) || 1, sp = 9;
        this.add.spawn({ pos: [...c], vel: [(a[0] - c[0]) / d * sp, (a[1] - c[1]) / d * sp, (a[2] - c[2]) / d * sp], life: d / sp, size: [0.3, 0.2], color: { from: [...col, 1], to: [...col, 0.3] }, sprite: 'glow' });
      }
      if (Math.random() < 0.6) { const k = Math.random(); this.motif(ess, 'trail', [ends[0][0] + (ends[1][0] - ends[0][0]) * k, ends[0][1] + (ends[1][1] - ends[0][1]) * k, ends[0][2] + (ends[1][2] - ends[0][2]) * k], 0.3); }
    }, () => { b.kill(); core.kill(); });
  },

  skyFall(ess, at, r, delay) {
    const st = this.style(ess);
    if (st.motif === 'lightning') {
      setTimeoutFx(this, delay, () => {
        this.push(L.lightning(this.scene, { ends: () => [[at[0], 12, at[2]], [at[0], 0.05, at[2]]], color: st.color, dur: 0.35, width: 0.22, jag: 0.9, branches: 3 }));
        this.flash('#e8ecff', 0.35);
      });
      return;
    }
    if (st.motif === 'ray') { setTimeoutFx(this, Math.max(0, delay - 0.15), () => this.push(L.pillar(this.scene, { pos: at, color: st.color, core: st.core, radius: r * 0.7, height: 14, dur: 0.6 }))); return; }
    // a falling core (meteor, glacier, boulder, star...) streaking in from the sky
    const from = [at[0] - 3.5, 13, at[2] - 4.5];
    const vis = this.projectile(ess, 1.1 + r * 0.3, { puffs: false });
    live(this, delay, (dt, e) => {
      const k = Math.min(1, e.t / delay);
      const kk = k * k;
      vis.update(dt, [from[0] + (at[0] - from[0]) * kk, from[1] + (0.4 - from[1]) * kk, from[2] + (at[2] - from[2]) * kk], [(at[0] - from[0]) * 2 * k, -26 * k, (at[2] - from[2]) * 2 * k]);
    }, () => vis.stop());
  },

  chainArc(ess, a, b) {
    const st = this.style(ess);
    this.push(L.lightning(this.scene, { ends: () => [a, b], color: st.color, dur: 0.2, width: 0.06, jag: 0.35, segments: 7, branches: 0 }));
  },

  selfBurst(ess, f, scale = 1) {
    const st = this.style(ess);
    const c = f.center();
    this.push(L.burst(this.scene, { pos: c, color: st.color, core: st.glow, edge: st.edge, radius: 1.1 * scale, dur: 0.35, intensity: 1.3, blending: 'normal', fresnel: 0.9 }));
    this.push(L.ring(this.scene, { pos: [c[0], 0, c[2]], color: st.color, core: st.core, radius: 1.6 * scale, dur: 0.45 }));
    this.motes(ess, [c[0], 0.1, c[2]], 22, 0.7, { up: 2.2, height: 1.2 });
  },

  timeStop(caster, dur) {
    const u = this.stage.fx;
    const cam = this.camera;
    const v = new THREE.Vector3(caster.pos.x, 0.8, caster.pos.z).project(cam);
    u.uTimeStopCenter.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    this.flash('#ffffff', 0.6);
    this.chroma(1.2);
    this.push(L.circle(this.scene, { pos: [caster.pos.x, 0, caster.pos.z], color: '#ffd27a', core: '#ffffff', clock: true, radius: 3.4, dur: dur, spin: 0.6, follow: () => [caster.pos.x, 0, caster.pos.z] }));
    // the caster's side keeps its color; the rest of the world greys out behind a spreading wave
    const world = caster.world;
    const keep = world.fighters.filter(f => f.team === caster.team);
    keep.forEach(f => f.setLook('uKeep', 1));
    const stop = SHARED.uStop.value;
    stop.set(caster.pos.x, caster.pos.z, 0, 0.9);
    const e = live(this, dur, (dt, self) => {
      const k = self.t;
      u.uTimeStop.value = Math.min(0.35, k * 2);
      u.uTimeStopRing.value = Math.min(1.8, k * 2.8);
      stop.z = k * 34;
      stop.w = 0.92 * Math.min(1, (dur - k) * 4);
      world.fighters.forEach(f => { if (f.team === caster.team) f.setLook('uKeep', 1); });
    }, () => { u.uTimeStop.value = 0; u.uTimeStopRing.value = 0; stop.set(0, 0, 0, 0); keep.forEach(f => f.setLook('uKeep', 0)); world.fighters.forEach(f => f.setLook('uKeep', 0)); });
    e.unscaled = true;
    caster.world.events.emit('timestop', { caster, dur });
  },

  timeResume(caster) {
    this.flash('#ffffff', 0.45);
    this.chroma(1);
    this.shake(0.8);
    const c = caster.center();
    this.push(L.ring(this.scene, { pos: [c[0], 0, c[2]], color: '#ffe9b0', core: '#ffffff', radius: 14, dur: 0.6, width: 1.2 }));
  },

  globalVisual(ess, dur, caster) {
    const st = this.style(ess);
    const u = this.stage.fx;
    u.uTint.value.set(st.color);
    const world = caster.world;
    const vig = u.uVignette, v0 = 0.32;
    let acc = 0, strike = 0;
    const fall = ['flame', 'shard', 'wave', 'blood', 'vine', 'rock'].includes(st.motif);
    // the sky answers first: a pillar over the caster and a ring racing across the arena
    this.push(L.pillar(this.scene, { pos: [caster.pos.x, 0, caster.pos.z], color: st.color, core: st.core, edge: st.edge, radius: 1.6, height: 18, dur: 0.9, intensity: 2 }));
    this.push(L.ring(this.scene, { pos: [caster.pos.x, 0, caster.pos.z], color: st.color, core: st.glow, radius: 18, dur: 0.9, width: 0.9, blending: 'normal' }));
    const e = live(this, dur, (dt, self) => {
      const k = Math.min(1, self.t * 3, (dur - self.t) * 3);
      u.uTintAmount.value = 0.32 * k;
      vig.value = v0 + 0.25 * k;
      const c = world.camLook;
      acc += dt * 70;
      while (acc > 1) {
        acc -= 1;
        const p = [c.x + R(-12, 12), R(6, 10), c.z + R(-10, 8)];
        this.add.spawn({ pos: p, vel: fall ? [R(-1, 1), -R(7, 12), R(-1, 1)] : [R(-1.5, 1.5), R(-1, 1), R(-1.5, 1.5)], life: 1.2, size: [R(0.14, 0.32), 0.06],
          color: { from: [...hexToRgb(st.core, 2.4), 0.9], to: [...hexToRgb(st.color, 2), 0] }, sprite: st.spark, stretch: fall ? 0.06 : 0, floor: 0.05, spin: R(-2, 2) });
      }
      // strikes: on enemies and on open ground all over the view
      strike += dt;
      if (strike > 0.16) {
        strike = 0;
        const foes = world.enemiesOf(caster);
        const t = Math.random() < 0.45 && foes.length ? foes[Math.floor(Math.random() * foes.length)] : null;
        const at = t ? [t.pos.x + R(-0.6, 0.6), 0, t.pos.z + R(-0.6, 0.6)] : [c.x + R(-10, 10), 0, c.z + R(-7, 6)];
        if (st.motif === 'lightning') {
          this.push(L.lightning(this.scene, { ends: () => [[at[0] + R(-1, 1), 12, at[2] + R(-1, 1)], at], color: st.color, dur: 0.22, width: 0.16, jag: 0.9, branches: 2 }));
          this.impact(ess, [at[0], 0.3, at[2]], 0.9, 0.35);
        } else if (st.motif === 'ray') {
          this.push(L.pillar(this.scene, { pos: at, color: st.color, core: st.core, radius: 0.7, height: 14, dur: 0.45 }));
          this.impact(ess, [at[0], 0.3, at[2]], 0.9, 0.35);
        } else if (fall || st.motif === 'stars') {
          this.skyFall(ess, at, 0.9, 0.45);
          setTimeoutFx(this, 0.45, () => this.impact(ess, [at[0], 0.3, at[2]], 1.1, 0.45));
        } else {
          // eruptions from below: geysers of the essence's clouds
          this.clouds(ess, [at[0], 0.2, at[2]], 6, 1, { lift: 2.2, speed: 0.6 });
          this.motif(ess, 'impact', [at[0], 0.4, at[2]], 1, 0.5);
          this.push(L.ring(this.scene, { pos: at, color: st.color, core: st.glow, radius: 1.3, dur: 0.4, width: 0.2, blending: 'normal' }));
        }
      }
    }, () => { u.uTintAmount.value = 0; vig.value = v0; });
    e.unscaled = true;
    this.flash(st.glow, 0.45);
    this.shake(0.9);
    return e;
  },
});

function setTimeoutFx(fx, t, fn) { live(fx, t, () => {}, fn); }
