// Status visuals: what a stun, a root, a hex, a time stop or a shield looks
// like on a brawler. Fighter.addStatus / removeStatus call
// fx.status.start(f, name, st) and fx.status.end(f, name, st).
//
// Each fighter gets a StatusRig that owns overhead icons, the running visuals
// and the material "look" (grey, ghost, tint) resolved from all statuses.

import * as THREE from 'three';
import { FX } from './fx.js';
import * as L from './fxlib.js';
import { STYLE, hexToRgb } from './styles.js';
import { toonMaterial } from '../engine/toon.js';

const R = (a, b) => a + Math.random() * (b - a);
const v3 = new THREE.Vector3();

const headTop = f => (f.y || 0) + (f.model.def?.height ?? 1.5) * (f.model.group.scale.y || 1);
const bonePos = (f, name) => { const b = f.model.rig.bones[name]; if (!b) return f.center(); b.getWorldPosition(v3); return [v3.x, v3.y, v3.z]; };
function drop(m) { m.removeFromParent(); m.material?.dispose?.(); }

class StatusRig {
  constructor(fx, f) {
    this.fx = fx;
    this.f = f;
    this.icons = new Map();
    this.vis = new Map();
    this.look = { grey: 0, ghost: 0, tint: 0 };
    this.tintCol = new THREE.Color();
    this.hadTint = false;
    this.critter = null;
    this.unscaled = true;
    this.dead = false;
    fx.push(this);
  }

  icon(name, sprite, color, o = {}) {
    this.dropIcon(name);
    const m = this.fx.billboard(sprite, color, o.size ?? 0.4, o.additive ?? false, o.intensity ?? 1.3);
    m.renderOrder = 30;
    m.material.depthTest = false;
    this.fx.scene.add(m);
    const back = o.back ? this.fx.billboard(o.back, o.backColor ?? '#2a1a3a', (o.size ?? 0.4) * 1.35, false, 1) : null;
    if (back) { back.renderOrder = 29; back.material.depthTest = false; this.fx.scene.add(back); }
    this.icons.set(name, { m, back, t: 0, o });
  }
  dropIcon(name) {
    const i = this.icons.get(name);
    if (!i) return;
    drop(i.m); if (i.back) drop(i.back);
    this.icons.delete(name);
  }

  update(dt) {
    const f = this.f, w = f.world;
    if (this.dead) return false;
    if (!f.group.parent) { this.dispose(); return false; }
    const gs = w.globalStop;
    const frozen = !!f.statuses.timestop || (gs && gs.caster.team !== f.team);
    const wdt = dt * (w.timeScale ?? 1);
    const vdt = frozen ? 0 : wdt;
    for (const [name, v] of this.vis) v.update?.(name === 'timestop' ? wdt : vdt, f.statuses[name]);
    this.updateIcons(dt);
    this.updateLook(dt);
    return true;
  }

  updateIcons(dt) {
    const f = this.f;
    const n = this.icons.size;
    if (!n) return;
    const y = headTop(f) + 0.62;
    let i = 0;
    for (const [name, ic] of this.icons) {
      ic.t += dt;
      const x = f.pos.x + (i - (n - 1) / 2) * 0.44;
      const bob = Math.sin(ic.t * 4 + i * 1.3) * 0.035;
      let s = ic.o.size ?? 0.4;
      if (ic.o.pulse) {
        const st = f.statuses[name];
        const left = st && st.dur ? Math.max(0, 1 - st.t / st.dur) : 1;
        s *= 1 + 0.18 * Math.max(0, Math.sin(ic.t * (5 + (1 - left) * 22)));
      }
      const pop = Math.min(1, ic.t * 7);
      const k = pop < 1 ? 1.35 - 0.35 * pop : 1;
      ic.m.position.set(x, y + bob, f.pos.z);
      ic.m.scale.setScalar(s * pop * k);
      ic.m.visible = f.group.visible && f.alive;
      if (ic.back) { ic.back.position.copy(ic.m.position); ic.back.scale.setScalar(s * 1.35 * pop * k); ic.back.visible = ic.m.visible; }
      i++;
    }
  }

  // Grey (time stop), ghost (invisibility), tint (fear, control, empower...)
  updateLook(dt) {
    const f = this.f, s = f.statuses;
    const playerTeam = f.world.playerTeam ?? 0;
    let grey = 0, ghost = 0, tint = null, amt = 0;
    const now = f.world.time;
    if (s.timestop) grey = 1; else if (s.clockSlow) grey = 0.4;
    if (s.invis) ghost = f.team === playerTeam ? 0.5 : 1;
    if (s.hex && !this.critter) { tint = '#8cff5a'; amt = 0.45; }
    else if (s.fear) { tint = '#6a2aa8'; amt = 0.38 + 0.08 * Math.sin(now * 22); }
    else if (s.control) { tint = STYLE.mind.color; amt = 0.32 + 0.08 * Math.sin(now * 6); }
    else if (s.fragile) { tint = '#ff3a3a'; amt = 0.1 + 0.1 * Math.max(0, Math.sin(now * 8)); }
    else if (s.empower) { tint = STYLE[s.empower.ess]?.color ?? '#ffb547'; amt = 0.16 + 0.06 * Math.sin(now * 10); }
    else if (s.clockHaste) { tint = STYLE.time.color; amt = 0.14; }
    else if (s.dot && STYLE[s.dot.ess]) { tint = STYLE[s.dot.ess].color; amt = 0.1 + 0.08 * Math.max(0, Math.sin(now * 12)); }
    const k = Math.min(1, dt * 10);
    const L0 = this.look;
    L0.grey += (grey - L0.grey) * (grey > L0.grey ? Math.min(1, dt * 14) : k);
    L0.ghost += (ghost - L0.ghost) * k;
    if (Math.abs(L0.grey) < 0.002) L0.grey = 0;
    if (Math.abs(L0.ghost) < 0.002) L0.ghost = 0;
    f.setLook('uGrey', L0.grey);
    f.setLook('uGhost', Math.min(1, L0.ghost));
    const see = L0.ghost < 0.97;
    const ghosting = L0.ghost > 0.01;
    for (const u of f.lookMats) {
      if (u.transparent !== ghosting) { u.transparent = ghosting; u.needsUpdate = true; }
    }
    if (f.model.outline) f.model.outline.visible = !ghosting;
    f.model.group.visible = see && !this.critter && !f.form?.model;
    if (this.critter) this.critter.group.visible = see;
    if (f.form?.model) f.form.model.model.group.visible = see && !this.critter;
    if (!see) f.blob.visible = false;
    if (tint) {
      this.tintCol.set(tint);
      f.setLook('uTint', this.tintCol);
      L0.tint += (amt - L0.tint) * k;
      f.setLook('uTintAmount', L0.tint);
      this.hadTint = true;
    } else if (this.hadTint) {
      L0.tint += (0 - L0.tint) * k;
      f.setLook('uTintAmount', L0.tint);
      if (L0.tint < 0.005) { L0.tint = 0; f.setLook('uTintAmount', 0); this.hadTint = false; }
    }
  }

  start(name, st) {
    this.end(name, st, true);
    const make = VIS[name];
    if (make) { const v = make(this, st); if (v) this.vis.set(name, v); }
  }
  end(name, st, quiet = false) {
    const v = this.vis.get(name);
    if (v) { this.vis.delete(name); v.kill?.(quiet); }
    this.dropIcon(name);
  }
  dispose() {
    this.dead = true;
    for (const [n] of this.vis) this.end(n, null, true);
    for (const [n] of this.icons) this.dropIcon(n);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────
function orbiters(r, sprite, color, n, o = {}) {
  const fx = r.fx, f = r.f;
  const ms = [];
  for (let i = 0; i < n; i++) {
    const m = fx.billboard(sprite, color, o.size ?? 0.24, o.additive ?? false, o.intensity ?? 1.35);
    m.renderOrder = 24;
    fx.scene.add(m);
    ms.push(m);
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      const y = headTop(f) + (o.lift ?? 0.08);
      ms.forEach((m, i) => {
        const a = t * (o.speed ?? 5) + (i / n) * Math.PI * 2;
        m.position.set(f.pos.x + Math.cos(a) * (o.rx ?? 0.36), y + Math.sin(a * (o.wob ?? 1)) * (o.ry ?? 0.07), f.pos.z + Math.sin(a) * (o.rz ?? 0.26));
        m.material.uniforms.uRot.value = t * (o.spin ?? 3) + i;
        const depth = 0.85 + 0.2 * Math.sin(a);
        m.scale.setScalar((o.size ?? 0.24) * depth);
        m.visible = f.group.visible;
      });
    },
    kill() { ms.forEach(drop); },
  };
}

function every(interval, fn) {
  let acc = Math.random() * interval;
  return dt => { acc += dt; while (acc >= interval) { acc -= interval; fn(); } };
}

function poof(fx, f, ess = 'mind', n = 14) {
  const c = f.center();
  fx.puffs(ess, [c[0], 0.3, c[2]], n, 0.9, { color: '#f4ecff', alpha: 0.85, size: 1.1, up: 1.2 });
  fx.motes(ess, c, 16, 0.6, { sprite: 'sparkle', up: 2.2 });
  fx.push(L.ring(fx.scene, { pos: [c[0], 0, c[2]], color: STYLE[ess]?.color ?? '#ffffff', core: '#ffffff', radius: 1.2, dur: 0.35 }));
}

function shieldBreak(fx, f, color) {
  const c = f.center();
  const col = hexToRgb(color, 2.4);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, e = R(-0.6, 0.9);
    const d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
    fx.add.spawn({ pos: [c[0] + d[0] * 0.8, c[1] + d[1] * 0.8, c[2] + d[2] * 0.8], vel: [d[0] * R(3, 6), d[1] * R(2, 5) + 2, d[2] * R(3, 6)], life: R(0.4, 0.7), size: [R(0.16, 0.28), 0.05], color: { from: [...col, 1], to: [...col, 0] }, sprite: 'shard', spin: R(-12, 12), gravity: 10, floor: 0.04 });
  }
  fx.push(L.burst(fx.scene, { pos: c, color, core: '#ffffff', radius: 1.2, dur: 0.2, intensity: 2 }));
}

// ── one factory per status ───────────────────────────────────────────────
const VIS = {
  stun(r) {
    r.icon('stun', 'star5', '#ffe14a', { size: 0.34 });
    return orbiters(r, 'star5', '#ffe14a', 3, { size: 0.24, speed: 6, lift: 0.1 });
  },

  confuse(r) {
    r.icon('confuse', 'spiral', '#ff8ae6');
    return orbiters(r, 'spiral', '#ff66d8', 3, { size: 0.26, speed: -4, spin: -8, lift: 0.12, additive: true, intensity: 1.8 });
  },

  silence(r, st) {
    r.icon('silence', 'cross', '#e6d0ff', { back: 'glow', backColor: '#6a2ab0', size: 0.3 });
    const fx = r.fx, f = r.f;
    const ring = fx.push(L.circle(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: '#b46bff', core: '#f0dcff', radius: 0.75, dur: 0, spin: 2, opacity: 0.8, follow: () => [f.pos.x, 0, f.pos.z], y: 0.9 }));
    ring.obj.rotation.x = 0;
    let t = 0;
    return {
      update(dt) { t += dt; ring.obj.position.y = (f.y || 0) + 0.95 + Math.sin(t * 3) * 0.05; ring.obj.visible = f.group.visible; },
      kill() { ring.kill(); },
    };
  },

  blind(r) {
    const fx = r.fx, f = r.f;
    r.icon('blind', 'eye', '#3a2a50', { back: 'glow', backColor: '#1a1026' });
    const u = fx.stage.fx.uVignette;
    const emit = every(0.045, () => {
      const a = Math.random() * Math.PI * 2, top = headTop(f);
      fx.alpha.spawn({ pos: [f.pos.x + Math.cos(a) * 0.35, top - 0.25 + R(-0.1, 0.15), f.pos.z + Math.sin(a) * 0.3], vel: [-Math.sin(a) * 1.2, R(0, 0.3), Math.cos(a) * 1.2], life: R(0.4, 0.7), size: [R(0.35, 0.5), R(0.5, 0.8)], color: { from: [0.08, 0.05, 0.14, 0.85], to: [0.05, 0.03, 0.1, 0] }, sprite: 'smoke', spin: R(-2, 2), drag: 1.5, fadeIn: 0.1 });
    });
    return {
      update(dt) { emit(dt); if (f.isPlayer) u.value += (0.85 - u.value) * Math.min(1, dt * 6); },
      kill() { if (f.isPlayer) u.value = 0.32; },
    };
  },

  fear(r) {
    const f = r.f, fx = r.fx;
    r.icon('fear', 'skull', '#e6d6ff', { back: 'glow', backColor: '#4a1a7a' });
    const emit = every(0.12, () => fx.motif('shadow', 'trail', f.center(), 0.5, 0, [0, 0, 0]));
    return {
      update(dt) { emit(dt); f.model.group.position.x = dt > 0 ? R(-0.025, 0.025) : f.model.group.position.x; },
      kill() { f.model.group.position.x = 0; },
    };
  },

  mark(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'fire';
    const S0 = fx.style(ess);
    r.icon('mark', 'rune' + (1 + (f.id % 4)), S0.color, { pulse: true, additive: true, intensity: 2, size: 0.42, back: 'glow', backColor: S0.edge });
    const reticle = fx.push(L.circle(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: S0.color, core: S0.core, radius: 1, dur: 0, spin: -2, opacity: 0.85, follow: () => [f.pos.x, 0, f.pos.z] }));
    return {
      update(dt, s) {
        const left = s && s.dur ? Math.max(0, 1 - s.t / s.dur) : 1;
        reticle.R = 0.55 + left * 0.9;
        reticle.obj.visible = f.group.visible;
      },
      kill() { reticle.kill(); },
    };
  },

  dot(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'fire';
    const emit = every(0.05, () => {
      const c = f.center();
      fx.motif(ess, 'trail', [c[0] + R(-0.25, 0.25), R(0.3, 1.2) + (f.y || 0), c[2] + R(-0.2, 0.2)], 0.45, 0, [0, -1, 0]);
    });
    return { update: dt => emit(dt) };
  },

  slow(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'frost';
    const S0 = fx.style(ess);
    r.icon('slow', 'snow', S0.color === '#74dcff' ? '#bff3ff' : '#9ad8ff', { size: 0.32 });
    const puddle = fx.push(L.glowDisc(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: S0.color, radius: 0.75, opacity: 0.35, intensity: 0.8, follow: () => [f.pos.x, 0, f.pos.z] }));
    const emit = every(0.09, () => {
      const a = Math.random() * Math.PI * 2;
      fx.add.spawn({ pos: [f.pos.x + Math.cos(a) * 0.45, R(0.1, 1.1), f.pos.z + Math.sin(a) * 0.4], vel: [0, -R(0.4, 0.9), 0], life: R(0.5, 0.8), size: [R(0.08, 0.14), 0.02], color: { from: [...hexToRgb(S0.core, 2), 0.9], to: [...hexToRgb(S0.color, 1.6), 0] }, sprite: S0.spark, spin: R(-3, 3) });
    });
    return { update(dt) { emit(dt); puddle.obj.visible = f.group.visible; }, kill() { puddle.kill(); } };
  },

  root(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'life';
    const S0 = fx.style(ess);
    const g = new THREE.Group();
    fx.scene.add(g);
    const parts = [];
    if (S0.motif === 'shard') {
      // encased in an ice block up to the knees
      const geo = new THREE.IcosahedronGeometry(1, 0);
      const ice = new THREE.Mesh(geo, L.energyMaterial({ color: '#9fe6ff', core: '#ffffff', edge: '#3a8ae0', mode: 1, fresnel: 0.55, intensity: 1.2, erode: 0, noise: 2, blending: 'normal', opacity: 0.8 }));
      ice.scale.set(0.58, 0.42, 0.55);
      ice.position.y = 0.26;
      ice.rotation.y = R(0, 3);
      g.add(ice); parts.push(ice);
      for (let i = 0; i < 5; i++) {
        const sg = new THREE.OctahedronGeometry(0.5, 0); sg.scale(0.28, 1, 0.28);
        const sp = new THREE.Mesh(sg, ice.material);
        const a = i / 5 * Math.PI * 2 + 0.3;
        sp.position.set(Math.cos(a) * 0.45, 0.25, Math.sin(a) * 0.45);
        sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        g.add(sp); parts.push(sp);
      }
    } else {
      // thorny vines / stone spikes / rune shackles curling around the ankles
      const col = S0.motif === 'vine' ? '#3f9a3a' : S0.motif === 'rock' ? '#a88a66' : S0.motif === 'blood' ? '#8a1030' : '#5a4a8a';
      const tip = S0.motif === 'vine' ? '#9aff6a' : S0.color;
      const mat = toonMaterial({ vertexColors: false, color: col, rim: 0.5 });
      mat.userData.u.uTint.value.set(tip);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const cg = new THREE.ConeGeometry(0.09, 0.75, 5); cg.translate(0, 0.37, 0);
        const m = new THREE.Mesh(cg, mat);
        m.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
        m.rotation.set(Math.sin(a) * 0.55, R(0, 3), -Math.cos(a) * 0.55);
        m.castShadow = true;
        g.add(m); parts.push(m);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 20), L.energyMaterial({ color: S0.color, core: S0.core, edge: S0.edge, mode: 1, fresnel: 0.3, intensity: 1.6, erode: 0, blending: 'normal' }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
      g.add(ring); parts.push(ring);
    }
    fx.puffs(ess, [f.pos.x, 0.1, f.pos.z], 6, 0.6, { alpha: 0.5, color: S0.smoke });
    let t = 0;
    return {
      update(dt, s) {
        t += dt;
        const left = s && s.dur ? s.dur - s.t : 1;
        const k = Math.min(1, t / 0.15) * Math.min(1, Math.max(0, left / 0.2));
        g.position.set(f.pos.x, (k - 1) * 0.8, f.pos.z);
        g.scale.setScalar(0.6 + 0.4 * k);
        g.visible = f.group.visible;
      },
      kill(quiet) {
        if (!quiet && S0.motif === 'shard') shieldBreak(fx, f, '#bff3ff');
        else if (!quiet) fx.bits(ess, [f.pos.x, 0.3, f.pos.z], 8, 3);
        g.removeFromParent();
        parts.forEach(p => { p.geometry.dispose(); });
      },
    };
  },

  launch(r, st) {
    const fx = r.fx, f = r.f;
    const sw = fx.push(L.swirl(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: '#dfffe0', core: '#ffffff', edge: '#6ac08a', radius: 0.7, height: 1.4, dur: st.dur || 0.8, follow: () => [f.pos.x, 0, f.pos.z] }));
    fx.puffs('gale', [f.pos.x, 0.1, f.pos.z], 8, 0.8, { color: '#f0fff0', alpha: 0.6 });
    return { kill() { sw.kill(); } };
  },

  clockSlow(r) {
    const fx = r.fx, f = r.f;
    r.icon('clockSlow', 'clock', '#ffe0a0', { size: 0.34 });
    const c = fx.push(L.circle(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: '#8ac8ff', core: '#ffffff', clock: true, radius: 0.95, dur: 0, spin: -0.35, opacity: 0.8, follow: () => [f.pos.x, 0, f.pos.z] }));
    const emit = every(0.18, () => fx.add.spawn({ pos: [f.pos.x + R(-0.4, 0.4), R(0.4, 1.3), f.pos.z + R(-0.3, 0.3)], vel: [0, 0.25, 0], life: 1.2, size: [0.16, 0.2], color: { from: [1.4, 1.2, 0.7, 0.9], to: [0.9, 0.7, 0.3, 0] }, sprite: 'gear', spin: -0.8 }));
    return { update(dt) { emit(dt); c.obj.visible = f.group.visible; }, kill() { c.kill(); } };
  },

  clockHaste(r) {
    const fx = r.fx, f = r.f;
    const c = fx.push(L.circle(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: '#ffc95c', core: '#ffffff', clock: true, radius: 0.85, dur: 0, spin: 3, opacity: 0.7, follow: () => [f.pos.x, 0, f.pos.z] }));
    let ghostT = 0;
    const emit = every(0.08, () => fx.motif('time', 'trail', f.center(), 0.5, 0, [f.vel.x, 0, f.vel.z]));
    return {
      update(dt) {
        emit(dt);
        ghostT += dt;
        if (ghostT > 0.09 && Math.hypot(f.vel.x, f.vel.z) > 1) { ghostT = 0; fx.afterimage(f, 'time', 0.45); }
        c.obj.visible = f.group.visible;
      },
      kill() { c.kill(); },
    };
  },

  haste(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'gale';
    let ghostT = 0;
    const S0 = fx.style(ess);
    const col = hexToRgb(S0.core, 2);
    const emit = every(0.03, () => {
      const sp = Math.hypot(f.vel.x, f.vel.z);
      if (sp < 0.5) return;
      const b = [-f.vel.x / sp, -f.vel.z / sp];
      fx.add.spawn({ pos: [f.pos.x + R(-0.3, 0.3), R(0.2, 1.3) + (f.y || 0), f.pos.z + R(-0.3, 0.3)], vel: [b[0] * 6, 0, b[1] * 6], life: 0.18, size: [0.12, 0.02], color: { from: [...col, 0.8], to: [...col, 0] }, sprite: 'streak', stretch: 0.08 });
    });
    return {
      update(dt) {
        emit(dt);
        ghostT += dt;
        if (ghostT > 0.12 && Math.hypot(f.vel.x, f.vel.z) > 2) { ghostT = 0; fx.afterimage(f, ess, 0.35); }
      },
    };
  },

  timestop(r, st) {
    const fx = r.fx, f = r.f;
    // frozen clock on the ground and a crystal of stopped time around the body
    const c = fx.push(L.circle(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: '#ffd27a', core: '#ffffff', clock: true, radius: 1.05, dur: 0, spin: 0.05, opacity: 0.9, follow: () => [f.pos.x, 0, f.pos.z] }));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), L.energyMaterial({ color: '#e8eefc', core: '#ffffff', edge: '#8a9ac8', mode: 1, fresnel: 0.9, intensity: 1.1, erode: 0, noise: 3, opacity: 0.55 }));
    shell.scale.set(0.62, 0.95, 0.62);
    fx.scene.add(shell);
    r.icon('timestop', 'clock', '#fff0c0', { size: 0.36, back: 'glow', backColor: '#9a7020' });
    fx.push(L.ring(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: '#ffe9b0', core: '#ffffff', radius: 1.4, dur: 0.35 }));
    let t = 0;
    return {
      update(dt) {
        t += dt;
        shell.position.set(f.pos.x, (f.y || 0) + 0.78, f.pos.z);
        const pop = Math.min(1, t * 8);
        shell.scale.set(0.62 * pop, 0.95 * pop, 0.62 * pop);
        shell.visible = f.group.visible;
      },
      kill(quiet) {
        c.kill();
        shell.removeFromParent(); shell.geometry.dispose(); shell.material.dispose();
        if (!quiet && f.alive) { shieldBreak(fx, f, '#fff0c0'); fx.shake(0.3); }
      },
    };
  },

  control(r) {
    const fx = r.fx, f = r.f;
    // puppet strings from a glowing hand-rune above the victim
    const anchor = () => [f.pos.x, headTop(f) + 1.4, f.pos.z];
    const rune = fx.push(L.circle(fx.scene, { pos: anchor(), color: '#ff66d8', core: '#ffeafc', radius: 0.45, dur: 0, spin: 2, opacity: 1, y: 0 }));
    const strings = ['hand.L', 'hand.R', 'head'].map(b => fx.push(L.beam(fx.scene, { ends: () => { const a = anchor(); return [a, bonePos(f, b)]; }, color: '#ff66d8', core: '#ffffff', radius: 0.018, intensity: 2.2 })));
    r.icon('control', 'eye', '#ffc6f2', { size: 0.32, additive: true, intensity: 2 });
    return {
      update() { const a = anchor(); rune.obj.position.set(a[0], a[1], a[2]); rune.obj.visible = f.group.visible; strings.forEach(s => { s.obj.visible = f.group.visible; }); },
      kill() { rune.kill(); strings.forEach(s => s.kill()); },
    };
  },

  link(r, st) {
    const fx = r.fx, f = r.f;
    const tv = fx.tetherVisual?.('blood', () => (f.alive && st.to?.alive ? [f.center(), st.to.center()] : null));
    return { kill() { tv?.kill(); } };
  },

  shield(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'light';
    const S0 = fx.style(ess);
    const b = fx.push(L.shield(fx.scene, { follow: () => (f.alive ? [f.pos.x, f.y || 0, f.pos.z] : null), color: S0.color, core: S0.core, radius: 0.92, lift: 0.78, opacity: 0.75, intensity: 1.5 }));
    fx.push(L.ring(fx.scene, { pos: [f.pos.x, 0, f.pos.z], color: S0.color, core: S0.core, radius: 1.3, dur: 0.35 }));
    return {
      update() { b.obj.visible = f.group.visible; },
      kill(quiet) {
        b.kill();
        if (quiet) return;
        if (f.shieldHp <= 0 && st.t < st.dur - 0.05) shieldBreak(fx, f, S0.color);
      },
    };
  },

  reflect(r) {
    const fx = r.fx, f = r.f;
    const b = fx.push(L.shield(fx.scene, { follow: () => (f.alive ? [f.pos.x, f.y || 0, f.pos.z] : null), color: '#dfeaff', core: '#ffffff', radius: 0.98, lift: 0.78, opacity: 0.9, intensity: 1.9 }));
    const emit = every(0.14, () => { const a = Math.random() * Math.PI * 2; fx.add.spawn({ pos: [f.pos.x + Math.cos(a) * 0.8, R(0.3, 1.5), f.pos.z + Math.sin(a) * 0.8], vel: [0, 0, 0], life: 0.3, size: [0.3, 0], color: { from: [2.4, 2.4, 2.6, 1], to: [1.5, 1.6, 2, 0] }, sprite: 'star4', spin: 2 }); });
    return { update(dt) { emit(dt); b.obj.visible = f.group.visible; }, kill() { b.kill(); } };
  },

  empower(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'fire';
    const S0 = fx.style(ess);
    const col = hexToRgb(S0.color, 2.4), core = hexToRgb(S0.core, 2.6);
    const emit = every(0.035, () => {
      for (const h of ['hand.L', 'hand.R']) {
        const p = bonePos(f, h);
        fx.add.spawn({ pos: [p[0] + R(-0.06, 0.06), p[1] + R(-0.06, 0.06), p[2] + R(-0.06, 0.06)], vel: [R(-0.3, 0.3), R(0.6, 1.4), R(-0.3, 0.3)], life: R(0.2, 0.35), size: [R(0.14, 0.22), 0.02], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'glow' });
      }
    });
    r.icon('empower', 'claw', S0.color, { size: 0.34, back: 'glow', backColor: S0.edge });
    return { update: dt => emit(dt) };
  },

  imbue(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'fire';
    const emit = every(0.03, () => { const p = bonePos(f, 'hand.R'); fx.motif(ess, 'trail', p, 0.32, 0, [0, -1, 0]); });
    return { update: dt => emit(dt) };
  },

  invis(r) {
    const fx = r.fx, f = r.f;
    poof(fx, f, 'shadow', 10);
    return { kill(quiet) { if (!quiet) poof(fx, f, 'shadow', 8); } };
  },

  hex(r, st) {
    const fx = r.fx, f = r.f, ess = st.ess || 'mind';
    poof(fx, f, ess, 16);
    let critter = null;
    try { critter = fx.makeCritter?.(ess); } catch (e) { console.warn('critter', e); }
    let t = 0;
    if (critter) { critter.group.scale.setScalar(1.6); f.group.add(critter.group); r.critter = critter; }
    else f.model.group.scale.setScalar(0.55);
    r.icon('hex', 'swirl', '#b8ff8a', { size: 0.3 });
    return {
      update(dt) {
        t += dt;
        if (critter) {
          critter.group.rotation.y = f.facing;
          const sp = Math.min(1, Math.hypot(f.vel.x, f.vel.z) / 2.5);
          critter.update?.(dt, { speed: sp, action: t < 0.4 ? { kind: 'spawn', t, dur: 0.4 } : null, time: t });
        }
      },
      kill() {
        poof(fx, f, ess, 12);
        if (critter) { critter.group.removeFromParent(); critter.dispose?.(); r.critter = null; }
        f.model.group.scale.setScalar(1);
      },
    };
  },

  robbed(r) { r.icon('robbed', 'crack', '#ff7a7a', { size: 0.34, back: 'glow', backColor: '#5a1010' }); },
  revealed(r) { r.icon('revealed', 'eye', '#ffb347', { size: 0.34, additive: true, intensity: 2 }); },
  fragile(r) { r.icon('fragile', 'crack', '#ff4a4a', { size: 0.36 }); },
  bloodDebt(r) { r.icon('bloodDebt', 'drop', '#ff2f5a', { size: 0.34, pulse: true }); },
};

function rigOf(fx, f) { return f._srig && !f._srig.dead ? f._srig : (f._srig = new StatusRig(fx, f)); }

Object.defineProperty(FX.prototype, 'status', {
  get() {
    const fx = this;
    return this._status || (this._status = {
      start(f, name, st) { rigOf(fx, f).start(name, st); },
      end(f, name, st) { f._srig?.end(name, st); },
    });
  },
});
