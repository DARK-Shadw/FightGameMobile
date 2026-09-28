// FX manager: the gameplay layer asks for "a fire impact here" or "a frost
// projectile of this size" and this builds it from particles, energy meshes
// and screen effects, themed by the essence kit.

import * as THREE from 'three';
import { ParticleSystem } from './particles.js';
import { PuffSystem, PUFF } from './puffs.js';
import * as L from './fxlib.js';
import { STYLE, hexToRgb } from './styles.js';
import { getAtlas, ATLAS_GRID, spriteIndex } from './atlas.js';
import { toonMaterial } from '../engine/toon.js';
import { meshSDF } from '../art/creature-mesher.js';
import { geometryFrom } from '../engine/rig.js';
import { S, P } from '../engine/sdf.js';

const R = (a, b) => a + Math.random() * (b - a);
const rnd3 = s => [R(-s, s), R(-s, s), R(-s, s)];

export class FX {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.add = new ParticleSystem(6000, 'add');
    this.alpha = new ParticleSystem(3000, 'alpha');
    this.cloud = new PuffSystem(520);
    this.scene.add(this.add.mesh, this.alpha.mesh, this.cloud.mesh);
    this.effects = [];
    this.timeScale = 1;
    this.shakeAmt = 0;
    this.flashAmt = 0;
    this.chromaAmt = 0;
    this.hitstop = 0;
    this.onNumber = null;
    this.cache = {};
  }

  style(ess) { return STYLE[ess] || STYLE.fire; }

  // Camera-facing atlas sprite mesh (for projectile cores and icons).
  billboard(name, color, size, additive = true, intensity = 1.6) {
    const idx = spriteIndex(name);
    const mat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
        float c = cos(position.z), s = sin(position.z);
        mv.xy += vec2(position.x * sc.x, position.y * sc.y); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uAtlas; uniform vec3 uColor; uniform float uOpacity, uCell, uGrid, uRot; varying vec2 vUv;
        void main(){ vec2 q = vUv - 0.5; float c = cos(uRot), s = sin(uRot); q = vec2(c*q.x - s*q.y, s*q.x + c*q.y) + 0.5;
          if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) discard;
          vec2 cell = vec2(mod(uCell, uGrid), floor(uCell / uGrid)); vec2 uv = (cell + vec2(q.x, 1.0 - q.y)) / uGrid; uv.y = 1.0 - uv.y;
          vec4 t = texture2D(uAtlas, uv); float a = t.a * uOpacity; if (a < 0.01) discard; gl_FragColor = vec4(uColor * t.rgb * ${additive ? 'a' : '1.0'}, a); }`,
      uniforms: { uAtlas: { value: getAtlas() }, uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uOpacity: { value: 1 }, uCell: { value: idx }, uGrid: { value: ATLAS_GRID }, uRot: { value: 0 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const m = new THREE.Mesh(this.cache.bbGeo || (this.cache.bbGeo = new THREE.PlaneGeometry(1, 1)), mat);
    m.scale.setScalar(size);
    m.renderOrder = additive ? 21 : 12;
    m.frustumCulled = false;
    return m;
  }
  push(e) { if (e) this.effects.push(e); return e; }

  update(dt) {
    // hit-stop: freeze world effects for a few frames on big impacts
    const worldDt = this.hitstop > 0 ? 0 : dt * this.timeScale;
    this.hitstop = Math.max(0, this.hitstop - dt);
    this.add.timeScale = this.alpha.timeScale = this.cloud.timeScale = this.hitstop > 0 ? 0 : this.timeScale;
    this.add.update(dt);
    this.alpha.update(dt);
    this.cloud.update(dt);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const alive = e.update(e.unscaled ? dt : worldDt);
      if (!alive) this.effects.splice(i, 1);
    }
    // screen effects decay
    const fx = this.stage.fx;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 5);
    this.chromaAmt = Math.max(0, this.chromaAmt - dt * 3);
    fx.uFlash.value = this.flashAmt;
    fx.uChroma.value = this.chromaAmt;
  }

  // camera shake offset for the camera controller
  shakeOffset(t) {
    const a = this.shakeAmt * this.shakeAmt * 0.35;
    return [Math.sin(t * 61) * a, Math.sin(t * 47 + 1.3) * a * 0.6, Math.sin(t * 53 + 2.1) * a];
  }
  shake(a) { this.shakeAmt = Math.min(1.4, Math.max(this.shakeAmt, a)); }
  flash(color, a) { this.stage.fx.uFlashColor.value.set(color); this.flashAmt = Math.max(this.flashAmt, a); }
  chroma(a) { this.chromaAmt = Math.max(this.chromaAmt, a); }
  freeze(t) { this.hitstop = Math.max(this.hitstop, t); }

  // ── particle helpers ──────────────────────────────────────────────────
  sparks(ess, pos, n, speed = 6, o = {}) {
    const st = this.style(ess);
    const c = hexToRgb(st.core, 3), m = hexToRgb(st.color, 2.2);
    for (let i = 0; i < n; i++) {
      const d = rnd3(1); const l = Math.hypot(...d) || 1;
      const v = speed * R(0.4, 1.1);
      this.add.spawn({ pos: [...pos], vel: [d[0] / l * v, Math.abs(d[1] / l) * v * (o.up ?? 0.8) + (o.lift ?? 1), d[2] / l * v],
        life: R(0.25, 0.55) * (o.life ?? 1), size: [R(0.12, 0.22) * (o.size ?? 1), 0.02], color: { from: [...c, 1], to: [...m, 0] },
        sprite: 'spark', stretch: 0.09, gravity: o.gravity ?? 9, drag: 1.5, floor: 0.03 });
    }
  }
  bits(ess, pos, n, speed = 4, o = {}) {
    const st = this.style(ess);
    const col = hexToRgb(st.color, o.hdr ?? 1.8), core = hexToRgb(st.core, o.hdr ?? 1.8);
    const sprite = o.sprite || st.bit;
    for (let i = 0; i < n; i++) {
      const d = rnd3(1); const l = Math.hypot(...d) || 1;
      const v = speed * R(0.3, 1);
      const dark = st.dark && !o.bright;
      (dark ? this.alpha : this.add).spawn({ pos: [pos[0] + d[0] * 0.1, pos[1] + d[1] * 0.1, pos[2] + d[2] * 0.1],
        vel: [d[0] / l * v, Math.abs(d[1] / l) * v + (o.lift ?? 1.5), d[2] / l * v],
        life: R(0.5, 1.0) * (o.life ?? 1), size: [R(0.22, 0.38) * (o.size ?? 1), R(0.05, 0.15) * (o.size ?? 1)],
        color: dark ? { from: [...hexToRgb(st.edge), 1], to: [...hexToRgb(st.smoke), 0] } : { from: [...core, 1], to: [...col, 0] },
        sprite, spin: R(-6, 6), gravity: o.gravity ?? 5, drag: 1.2, floor: 0.05 });
    }
  }
  puffs(ess, pos, n, radius = 1, o = {}) {
    const st = this.style(ess);
    const sm = hexToRgb(o.color || st.smoke);
    if (!o.noCloud) {
      const c = o.color || st.smoke;
      const k = new THREE.Color(c);
      const hsl = {}; k.getHSL(hsl);
      const lighter = '#' + new THREE.Color().setHSL(hsl.h, hsl.s * 0.8, Math.min(0.95, hsl.l + 0.12)).getHexString();
      const darker = '#' + new THREE.Color().setHSL(hsl.h, hsl.s * 0.7, hsl.l * 0.8).getHexString();
      this.clouds(ess, pos, Math.max(1, Math.round(n * 0.6)), radius * 0.7, { kind: 'smoke', colors: [lighter, c, darker], flat: true, size: (o.size ?? 1) * 0.9, speed: 1.3 });
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = R(0.2, 1) * radius;
      this.alpha.spawn({ pos: [pos[0] + Math.cos(a) * d * 0.3, pos[1] + R(0, 0.3), pos[2] + Math.sin(a) * d * 0.3],
        vel: [Math.cos(a) * d * 2.2, R(0.5, 2) * (o.up ?? 1), Math.sin(a) * d * 2.2],
        life: R(0.6, 1.2) * (o.life ?? 1), size: [R(0.5, 0.9) * (o.size ?? 1), R(1.1, 1.7) * (o.size ?? 1)],
        color: { from: [...sm, o.alpha ?? 0.55], to: [...sm, 0] }, sprite: 'smoke', spin: R(-1, 1), drag: 2.4, fadeIn: 0.15 });
    }
  }
  motes(ess, pos, n, radius = 1, o = {}) {
    const st = this.style(ess);
    const col = hexToRgb(st.color, o.hdr ?? 2.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius;
      this.add.spawn({ pos: [pos[0] + Math.cos(a) * d, pos[1] + R(0, o.height ?? 0.3), pos[2] + Math.sin(a) * d],
        vel: [R(-0.3, 0.3), R(0.6, 2.2) * (o.up ?? 1), R(-0.3, 0.3)], life: R(0.6, 1.4) * (o.life ?? 1),
        size: [R(0.08, 0.2) * (o.size ?? 1), 0], color: { from: [...col, 1], to: [...col, 0] }, sprite: o.sprite || st.spark,
        spin: R(-3, 3), drag: 0.5, fadeIn: 0.2 });
    }
  }
  implode(ess, pos, n, radius = 2, dur = 0.5) {
    const st = this.style(ess);
    const col = hexToRgb(st.color, 2.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = R(0.6, 1) * radius, y = R(0.2, 1.6);
      const p = [pos[0] + Math.cos(a) * d, pos[1] + y, pos[2] + Math.sin(a) * d];
      this.add.spawn({ pos: p, vel: [-Math.cos(a) * d / dur, (pos[1] + 0.8 - p[1]) / dur, -Math.sin(a) * d / dur], life: dur,
        size: [0.05, 0.25], color: { from: [...col, 0], to: [...col, 1] }, sprite: 'spark', stretch: 0.08, fadeIn: 0 });
    }
  }

  // Toon cloud puffs: `kind` 'burst' (hot, fast, outward) or 'smoke' (slow, rising, lingering).
  clouds(ess, pos, n, radius = 1, o = {}) {
    const pf = PUFF[ess] || PUFF.fire;
    const smoke = o.kind === 'smoke';
    const cols = o.colors || (smoke ? pf.smoke : pf.burst);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = o.flat ? R(0.05, 0.35) : R(0.2, 1);
      const sp = (smoke ? R(0.8, 1.8) : R(3.8, 7)) * radius * (o.speed ?? 1);
      const d = [Math.cos(a) * (1 - up * 0.5), up, Math.sin(a) * (1 - up * 0.5)];
      const sz = radius * (smoke ? R(0.26, 0.4) : R(0.2, 0.34)) * (o.size ?? 1);
      this.cloud.spawn({
        pos: [pos[0] + d[0] * radius * 0.2, Math.max(0.1, pos[1] + d[1] * radius * 0.15), pos[2] + d[2] * radius * 0.2],
        vel: [d[0] * sp, d[1] * sp * (o.lift ?? 0.7), d[2] * sp],
        life: (smoke ? R(0.8, 1.3) : R(0.4, 0.7)) * (o.life ?? 1),
        size: [sz * 0.6, sz * (smoke ? 1.7 : 1.35)], squash: o.squash ?? 0.85,
        colors: cols, hot: smoke ? 0 : (o.hot ?? pf.hot), gravity: smoke ? -0.9 : -0.8, drag: smoke ? 2.4 : 5.5,
        cut: smoke ? 0.35 : 0.3, floor: 0.05,
      });
    }
  }

  // A small toon puff left in a projectile's wake.
  trailPuff(ess, pos, size, vel) {
    const pf = PUFF[ess] || PUFF.fire;
    const dark = ['shadow', 'void', 'death', 'space'].includes(ess);
    const l = vel ? Math.hypot(vel[0], vel[2]) || 1 : 1;
    const back = vel ? [-vel[0] / l, -vel[2] / l] : [0, 0];
    const j = size * 0.18;
    this.cloud.spawn({
      pos: [pos[0] + R(-j, j), pos[1] + R(-j, j), pos[2] + R(-j, j)],
      vel: [back[0] * 1.2 + R(-0.4, 0.4), R(0.2, 0.9), back[1] * 1.2 + R(-0.4, 0.4)],
      life: R(0.2, 0.32), size: [size * R(0.3, 0.4), size * R(0.14, 0.24)], squash: 0.9,
      colors: dark ? pf.smoke : pf.burst, hot: dark ? 0.2 : pf.hot * 0.8, gravity: -0.6, drag: 3, cut: 0.25,
    });
  }

  // Bright starburst flash (sprite) at a point.
  flashAt(ess, pos, size = 1.5, dur = 0.14) {
    const st = this.style(ess);
    this.add.spawn({ pos: [...pos], vel: [0, 0, 0], life: dur, size: [size * 0.7, size * 1.25], color: { from: [...hexToRgb(st.core, 3.2), 1], to: [...hexToRgb(st.glow, 2), 0] }, sprite: 'burst', rot: Math.random() * 6.28, spin: 0 });
    this.add.spawn({ pos: [...pos], vel: [0, 0, 0], life: dur * 1.4, size: [size * 0.8, size * 1.2], color: { from: [...hexToRgb(st.color, 1.2), 0.7], to: [...hexToRgb(st.color, 1), 0] }, sprite: 'glow' });
  }

  // ── themed compound effects ───────────────────────────────────────────
  // Explosion / impact. `radius` in meters, `power` 0..1 scales drama.
  impact(ess, pos, radius = 1.2, power = 0.5) {
    const st = this.style(ess);
    const p = [pos[0], Math.max(0.15, pos[1] ?? 0.6), pos[2]];
    const ground = [pos[0], 0, pos[2]];
    // hot starburst + a chunky toon cloud blast that rolls outward, then smoke
    this.flashAt(ess, p, 0.7 + radius * 0.7, 0.1 + power * 0.05);
    this.clouds(ess, p, Math.round(7 + radius * 4 + power * 6), radius * 0.85);
    this.clouds(ess, [p[0], 0.25, p[2]], Math.round(1 + power * 3 + radius), radius * 0.8, { kind: 'smoke' });
    this.push(L.ring(this.scene, { pos: ground, color: st.color, core: st.glow, edge: st.edge, radius: radius * 1.45, dur: 0.35 + power * 0.15, width: 0.16 + radius * 0.05, intensity: 1.6, blending: 'normal' }));
    this.push(L.glowDisc(this.scene, { pos: ground, color: st.color, radius: radius * 1.4, dur: 0.35, opacity: 0.3, intensity: 1 }));
    const n = Math.round(8 + power * 14);
    this.sparks(ess, p, n, 5 + radius * 3);
    this.bits(ess, p, Math.round(4 + power * 8), 3 + radius * 2);
    this.motif(ess, 'impact', p, radius, power);
    this.shake(0.25 + power * 0.6);
    if (power > 0.6) { this.freeze(0.05 + power * 0.03); this.chroma(power); }
  }

  // Muzzle flash at the caster's hand.
  muzzle(ess, pos, dir) {
    const st = this.style(ess);
    const pf = PUFF[ess] || PUFF.fire;
    for (let i = 0; i < 3; i++) this.cloud.spawn({ pos: [...pos], vel: [dir[0] * R(2, 4) + R(-0.6, 0.6), R(0.3, 1.2), dir[2] * R(2, 4) + R(-0.6, 0.6)], life: R(0.22, 0.32), size: [0.1, R(0.18, 0.26)], colors: pf.burst, hot: pf.hot, drag: 6, gravity: -0.5, cut: 0.25 });
    this.push(L.burst(this.scene, { pos, color: st.color, core: st.glow, edge: st.edge, radius: 0.42, dur: 0.18, intensity: 1.5, blending: 'normal' }));
    const c = hexToRgb(st.core, 3), m = hexToRgb(st.color, 2.2);
    for (let i = 0; i < 8; i++) {
      const s = R(3, 7);
      this.add.spawn({ pos: [...pos], vel: [dir[0] * s + R(-1.5, 1.5), R(-0.5, 1.5), dir[2] * s + R(-1.5, 1.5)], life: R(0.12, 0.25),
        size: [0.16, 0.02], color: { from: [...c, 1], to: [...m, 0] }, sprite: 'spark', stretch: 0.07, drag: 4 });
    }
  }

  // Projectile visual: returns { obj, update(dt, pos, vel), stop() }.
  projectile(ess, size = 0.5, o = {}) {
    const st = this.style(ess);
    const group = new THREE.Group();
    this.scene.add(group);
    // colored body (normal blend keeps saturation on bright ground) + small hot center
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), L.energyMaterial({ color: st.color, core: st.glow, edge: st.edge, mode: 1, fresnel: 0.35, intensity: st.dark ? 0.8 : 1.35, erode: 0, noise: 1.6, scroll: [0.8, -2], blending: 'normal' }));
    core.scale.setScalar(size * 0.5);
    group.add(core);
    const hot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), L.energyMaterial({ color: st.core, core: '#ffffff', mode: 1, fresnel: 0.6, intensity: 2.2, erode: 0 }));
    hot.scale.setScalar(size * 0.26);
    group.add(hot);
    const special = this.motifMesh(ess, size);
    if (special) group.add(special);
    const coreScale = special?.userData.hideCore ?? 1;
    const head = [0, 0, 0];
    let alive = true;
    const trail = this.push(L.trail(this.scene, { color: st.color, core: st.glow, edge: st.edge, width: size * (st.trailW / 0.4) * 0.9, points: 16, camera: this.camera, head: () => (alive ? head : null), intensity: st.dark ? 0.9 : 1.3, blending: 'normal' }));
    const light = this.push(L.glowDisc(this.scene, { pos: [0, 0, 0], color: st.color, radius: 0.5 + size * 0.8, opacity: 0.22, intensity: 1, follow: () => head }));
    let emit = 0, t = 0, puffT = 0;
    const self = {
      obj: group,
      update: (dt, pos, vel) => {
        t += dt;
        head[0] = pos[0]; head[1] = pos[1]; head[2] = pos[2];
        group.position.set(...pos);
        core.material.uniforms.uTime.value += dt;
        const pulse = 1 + 0.12 * Math.sin(t * 30);
        const gs = o.grow ? o.grow() : 1;
        core.scale.setScalar(size * 0.5 * pulse * gs * coreScale);
        hot.scale.setScalar(size * 0.26 * gs * Math.max(coreScale, 0.5));
        if (special) { special.scale.setScalar(gs); special.userData.spin?.(special, dt, vel, pos); }
        emit += dt;
        const rate = 0.016;
        while (emit > rate) {
          emit -= rate;
          this.motif(ess, 'trail', pos, size, 0, vel);
        }
        puffT += dt;
        if (puffT > 0.03 && o.puffs !== false) { puffT = 0; this.trailPuff(ess, pos, size, vel); }
      },
      stop: () => {
        alive = false;
        group.removeFromParent();
        core.geometry.dispose();
        light.kill();
      },
    };
    return self;
  }

  // Afterimages: frozen translucent copies of a skinned character. The copy
  // shares the geometry and keeps a snapshot of the bone matrices, which
  // already include the brawler's transform, so the mesh itself stays at
  // the origin.
  afterimage(fighter, ess, alpha = 0.6) {
    const src = fighter.model?.body;
    if (!src || !src.skeleton || !fighter.model.group.visible) return;
    const st = this.style(ess);
    const bones = src.skeleton.bones.map(b => { const c = new THREE.Bone(); c.matrixAutoUpdate = false; c.matrixWorldAutoUpdate = false; c.matrixWorld.copy(b.matrixWorld); return c; });
    const skel = new THREE.Skeleton(bones, src.skeleton.boneInverses);
    const mat = toonMaterial({ transparent: true, rim: 1.4, emissive: 2 });
    const u = mat.userData.u;
    // a solid, glowing essence-colored silhouette that fades out
    u.uTint.value.set(st.color);
    u.uTintAmount.value = 0.5;
    u.uFlashColor.value.set(st.color).multiplyScalar(1.6);
    u.uFlash.value = 0.62;
    u.uGhost.value = 0.12;
    mat.depthWrite = false;
    const ghost = new THREE.SkinnedMesh(src.geometry, mat);
    ghost.bind(skel, src.bindMatrix);
    ghost.matrixAutoUpdate = false;
    ghost.frustumCulled = false;
    ghost.renderOrder = 8;
    this.scene.add(ghost);
    const e = { t: 0, update: dt => {
      e.t += dt;
      const k = e.t / 0.34;
      mat.opacity = Math.min(1, (1 - k) * alpha * 1.5);
      if (k >= 1) { ghost.removeFromParent(); mat.dispose(); return false; }
      return true;
    } };
    this.push(e);
  }

  // Shape each essence's signature particles for a role.
  motif(ess, role, pos, size = 0.5, power = 0.5, vel = null) {
    const st = this.style(ess);
    const col = hexToRgb(st.color, 2.4), core = hexToRgb(st.core, 3), edge = hexToRgb(st.edge, 1.2);
    const add = this.add, alpha = this.alpha;
    const back = vel ? (() => { const l = Math.hypot(vel[0], vel[2]) || 1; return [-vel[0] / l, -vel[2] / l]; })() : [0, 0];
    if (role === 'trail') {
      const jitter = size * 0.25;
      const p = [pos[0] + R(-jitter, jitter), pos[1] + R(-jitter, jitter), pos[2] + R(-jitter, jitter)];
      switch (st.motif) {
        case 'flame':
          alpha.spawn({ pos: p, vel: [back[0] * 1.5 + R(-0.4, 0.4), R(0.6, 1.8), back[1] * 1.5 + R(-0.4, 0.4)], life: R(0.25, 0.45), size: [size * R(0.8, 1.2), size * 0.2], color: { from: [1.6, 1.25, 0.35, 1], to: [1.2, 0.18, 0.05, 0] }, sprite: 'flame', rot: 0, spin: 0, fadeIn: 0.05 });
          if (Math.random() < 0.3) alpha.spawn({ pos: p, vel: [R(-0.3, 0.3), R(0.8, 1.6), R(-0.3, 0.3)], life: R(0.5, 0.9), size: [size * 0.5, size * 1.3], color: { from: [...hexToRgb(st.smoke), 0.35], to: [...hexToRgb(st.smoke), 0] }, sprite: 'smoke', drag: 1 });
          if (Math.random() < 0.35) add.spawn({ pos: p, vel: [R(-1, 1), R(1, 3), R(-1, 1)], life: R(0.4, 0.8), size: [0.06, 0], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'ember', gravity: -1, drag: 0.5 });
          break;
        case 'shard':
          if (Math.random() < 0.5) add.spawn({ pos: p, vel: [back[0] + R(-0.5, 0.5), R(-0.2, 0.6), back[1] + R(-0.5, 0.5)], life: R(0.3, 0.6), size: [size * 0.35, 0.02], color: { from: [...core, 1], to: [...col, 0] }, sprite: Math.random() < 0.5 ? 'snow' : 'shard', spin: R(-4, 4), gravity: 2 });
          alpha.spawn({ pos: p, vel: [back[0] * 0.5, R(-0.1, 0.3), back[1] * 0.5], life: R(0.4, 0.7), size: [size * 0.5, size * 1.2], color: { from: [0.85, 0.97, 1, 0.3], to: [0.85, 0.97, 1, 0] }, sprite: 'smoke', drag: 1.5 });
          break;
        case 'lightning':
          if (Math.random() < 0.6) add.spawn({ pos: p, vel: [R(-3, 3), R(-3, 3), R(-3, 3)], life: R(0.08, 0.18), size: [size * 0.5, 0.02], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'spark', stretch: 0.12 });
          add.spawn({ pos: p, vel: [0, 0, 0], life: 0.15, size: [size * 0.9, 0], color: { from: [...col, 0.6], to: [...col, 0] }, sprite: 'glow' });
          break;
        case 'rock':
          if (Math.random() < 0.4) alpha.spawn({ pos: [p[0], p[1] - 0.1, p[2]], vel: [R(-0.5, 0.5), R(0, 0.6), R(-0.5, 0.5)], life: R(0.5, 0.8), size: [size * 0.5, size * 1.2], color: { from: [...hexToRgb(st.smoke), 0.45], to: [...hexToRgb(st.smoke), 0] }, sprite: 'smoke', drag: 1.5 });
          if (Math.random() < 0.2) alpha.spawn({ pos: p, vel: [R(-1, 1), R(0, 2), R(-1, 1)], life: 0.6, size: [0.08, 0.06], color: { from: [...hexToRgb(st.edge), 1], to: [...hexToRgb(st.edge), 0] }, sprite: 'rock', gravity: 9, spin: 5, floor: 0.04 });
          break;
        case 'wave':
          add.spawn({ pos: p, vel: [back[0] + R(-0.5, 0.5), R(-0.5, 1), back[1] + R(-0.5, 0.5)], life: R(0.3, 0.6), size: [size * R(0.2, 0.35), 0.03], color: { from: [...core, 0.9], to: [...col, 0] }, sprite: Math.random() < 0.5 ? 'drop' : 'bubble', gravity: 4, rot: 0 });
          break;
        case 'swirl':
          add.spawn({ pos: p, vel: [back[0] * 2 + R(-1, 1), R(-0.3, 0.8), back[1] * 2 + R(-1, 1)], life: R(0.3, 0.6), size: [size * 0.35, size * 0.15], color: { from: [...core, 0.8], to: [...col, 0] }, sprite: Math.random() < 0.4 ? 'leaf' : 'streak', spin: R(-8, 8) });
          break;
        case 'ray':
          add.spawn({ pos: p, vel: [R(-0.6, 0.6), R(-0.2, 0.9), R(-0.6, 0.6)], life: R(0.3, 0.7), size: [size * R(0.25, 0.45), 0], color: { from: [...core, 1], to: [...col, 0] }, sprite: Math.random() < 0.5 ? 'sparkle' : 'star4', spin: R(-2, 2) });
          break;
        case 'smoke':
          alpha.spawn({ pos: p, vel: [back[0] * 0.8 + R(-0.3, 0.3), R(0, 0.6), back[1] * 0.8 + R(-0.3, 0.3)], life: R(0.4, 0.8), size: [size * 0.8, size * 1.4], color: { from: [...hexToRgb(st.smoke), 0.8], to: [...hexToRgb(st.edge), 0] }, sprite: 'smoke', drag: 1.8 });
          if (Math.random() < 0.3) add.spawn({ pos: p, vel: [R(-0.5, 0.5), R(0, 0.5), R(-0.5, 0.5)], life: 0.5, size: [size * 0.35, 0.05], color: { from: [...col, 1], to: [...col, 0] }, sprite: 'crescent', spin: R(-5, 5) });
          break;
        case 'vine':
          if (Math.random() < 0.5) add.spawn({ pos: p, vel: [R(-0.8, 0.8), R(-0.2, 0.8), R(-0.8, 0.8)], life: R(0.5, 0.9), size: [size * 0.35, size * 0.2], color: { from: [...core, 1], to: [...col, 0] }, sprite: Math.random() < 0.5 ? 'leaf' : 'petal', spin: R(-6, 6), gravity: 1.2 });
          break;
        case 'soul':
          add.spawn({ pos: p, vel: [back[0] + R(-0.2, 0.2), R(0.3, 1.2), back[1] + R(-0.2, 0.2)], life: R(0.4, 0.7), size: [size * 0.7, size * 0.2], color: { from: [...col, 0.9], to: [...edge, 0] }, sprite: 'soul', rot: 0 });
          if (Math.random() < 0.08) add.spawn({ pos: p, vel: [0, 0.8, 0], life: 0.8, size: [size * 0.4, size * 0.3], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'skull', rot: 0 });
          break;
        case 'blood':
          add.spawn({ pos: p, vel: [back[0] + R(-0.5, 0.5), R(0, 1.2), back[1] + R(-0.5, 0.5)], life: R(0.3, 0.6), size: [size * 0.25, 0.04], color: { from: [...col, 1], to: [...edge, 0] }, sprite: 'drop', gravity: 7, rot: Math.PI, floor: 0.03 });
          break;
        case 'psy':
          if (Math.random() < 0.25) add.spawn({ pos: p, vel: [0, 0, 0], life: 0.5, size: [size * 0.3, size * 1.4], color: { from: [...col, 0.8], to: [...col, 0] }, sprite: 'ring' });
          add.spawn({ pos: p, vel: [R(-0.6, 0.6), R(-0.2, 0.6), R(-0.6, 0.6)], life: 0.5, size: [size * 0.3, 0], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'spiral', spin: 8 });
          break;
        case 'clock':
          if (Math.random() < 0.35) add.spawn({ pos: p, vel: [R(-0.4, 0.4), R(0, 0.6), R(-0.4, 0.4)], life: R(0.5, 0.9), size: [size * 0.4, size * 0.2], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'gear', spin: R(-3, 3) });
          add.spawn({ pos: p, vel: [back[0] * 0.3, 0, back[1] * 0.3], life: 0.35, size: [size * 0.25, 0], color: { from: [...col, 0.9], to: [...col, 0] }, sprite: 'sparkle' });
          break;
        case 'stars':
          add.spawn({ pos: p, vel: [R(-1, 1), R(-0.4, 0.8), R(-1, 1)], life: R(0.4, 0.9), size: [size * R(0.15, 0.3), 0], color: { from: [...core, 1], to: [...col, 0] }, sprite: Math.random() < 0.5 ? 'star5' : 'sparkle', spin: R(-3, 3) });
          if (Math.random() < 0.2) alpha.spawn({ pos: p, vel: [0, 0, 0], life: 0.6, size: [size * 0.6, size * 1.3], color: { from: [...hexToRgb(st.edge), 0.5], to: [...hexToRgb(st.smoke), 0] }, sprite: 'smoke' });
          break;
        case 'claw':
          add.spawn({ pos: p, vel: [back[0] * 2, R(0, 0.5), back[1] * 2], life: R(0.15, 0.3), size: [size * 0.5, 0.05], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'spark', stretch: 0.1 });
          break;
        case 'void':
          alpha.spawn({ pos: p, vel: [R(-0.3, 0.3), R(-0.1, 0.4), R(-0.3, 0.3)], life: R(0.3, 0.6), size: [size * R(0.12, 0.25), 0.01], color: { from: [0.03, 0.03, 0.06, 1], to: [0.03, 0.03, 0.06, 0] }, sprite: 'square', rot: 0 });
          if (Math.random() < 0.3) add.spawn({ pos: p, vel: [R(-1, 1), R(-1, 1), R(-1, 1)], life: 0.25, size: [size * 0.15, 0], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'square', rot: 0 });
          break;
        default:
          add.spawn({ pos: p, vel: [0, 0.5, 0], life: 0.4, size: [size * 0.5, 0], color: { from: [...col, 1], to: [...col, 0] }, sprite: 'glow' });
      }
      return;
    }
    if (role === 'impact') {
      const r = size;
      switch (st.motif) {
        case 'flame':
          for (let i = 0; i < 14 + power * 16; i++) {
            const a = Math.random() * Math.PI * 2, d = R(0, r);
            alpha.spawn({ pos: [pos[0] + Math.cos(a) * d * 0.4, 0.2, pos[2] + Math.sin(a) * d * 0.4], vel: [Math.cos(a) * d * 2.5, R(2, 5), Math.sin(a) * d * 2.5], life: R(0.35, 0.7), size: [R(0.6, 1.0) * (0.6 + r * 0.3), 0.15], color: { from: [1.7, 1.3, 0.4, 1], to: [1.2, 0.15, 0.04, 0] }, sprite: 'flame', rot: 0, drag: 2 });
          }
          this.puffs(ess, [pos[0], 0.3, pos[2]], 8, r, { size: 1 + r * 0.4, alpha: 0.5 });
          break;
        case 'shard':
          for (let i = 0; i < 10 + power * 10; i++) {
            const a = Math.random() * Math.PI * 2;
            add.spawn({ pos: [...pos], vel: [Math.cos(a) * R(3, 7), R(2, 6), Math.sin(a) * R(3, 7)], life: R(0.5, 0.9), size: [R(0.2, 0.35), 0.05], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'shard', spin: R(-10, 10), gravity: 12, floor: 0.05 });
          }
          this.puffs(ess, [pos[0], 0.2, pos[2]], 6, r, { color: '#e8fbff', alpha: 0.6 });
          break;
        case 'lightning': {
          for (let i = 0; i < 4 + power * 4; i++) {
            const a = Math.random() * Math.PI * 2, d = R(0.6, 1.2) * r;
            const to = [pos[0] + Math.cos(a) * d, 0.1, pos[2] + Math.sin(a) * d];
            this.push(L.lightning(this.scene, { ends: () => [[pos[0], pos[1], pos[2]], to], color: st.color, dur: R(0.15, 0.3), width: 0.06, jag: 0.35, segments: 6, branches: 0 }));
          }
          break;
        }
        case 'rock':
          for (let i = 0; i < 10 + power * 12; i++) {
            const a = Math.random() * Math.PI * 2;
            alpha.spawn({ pos: [pos[0], 0.3, pos[2]], vel: [Math.cos(a) * R(2, 6), R(3, 7), Math.sin(a) * R(2, 6)], life: R(0.6, 1.1), size: [R(0.12, 0.28), 0.1], color: { from: [...hexToRgb('#8a6a4a'), 1], to: [...hexToRgb('#6a4a2a'), 1] }, sprite: 'rock', spin: R(-8, 8), gravity: 16, floor: 0.06 });
          }
          this.puffs(ess, [pos[0], 0.1, pos[2]], 12, r * 1.2, { size: 1.2, alpha: 0.65 });
          this.push(L.glowDisc(this.scene, { pos: [pos[0], 0, pos[2]], color: '#6a4a2a', radius: r * 1.1, dur: 1.5, opacity: 0.5, intensity: 0.2 }));
          break;
        case 'wave':
          for (let i = 0; i < 18 + power * 12; i++) {
            const a = Math.random() * Math.PI * 2;
            add.spawn({ pos: [pos[0], 0.3, pos[2]], vel: [Math.cos(a) * R(1, 4), R(3, 7), Math.sin(a) * R(1, 4)], life: R(0.5, 0.9), size: [R(0.12, 0.25), 0.05], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'drop', gravity: 14, rot: 0, floor: 0.04 });
          }
          this.push(L.ring(this.scene, { pos: [pos[0], 0, pos[2]], color: '#e6fbff', core: '#ffffff', radius: r * 1.1, dur: 0.6 }));
          break;
        case 'swirl':
          this.push(L.swirl(this.scene, { pos: [pos[0], 0, pos[2]], color: st.color, core: st.core, edge: st.edge, radius: r * 0.8, height: 1.8, dur: 0.5 }));
          for (let i = 0; i < 12; i++) add.spawn({ pos: [...pos], vel: [R(-5, 5), R(1, 4), R(-5, 5)], life: R(0.4, 0.8), size: [0.2, 0.1], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'leaf', spin: R(-10, 10), gravity: 2 });
          break;
        case 'ray':
          this.push(L.pillar(this.scene, { pos, color: st.color, core: st.core, radius: r * 0.5, height: 6, dur: 0.5 }));
          for (let i = 0; i < 16; i++) add.spawn({ pos: [...pos], vel: [R(-4, 4), R(0, 5), R(-4, 4)], life: R(0.4, 0.8), size: [R(0.15, 0.3), 0], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'star4', spin: R(-3, 3), drag: 2 });
          break;
        case 'smoke':
          this.puffs(ess, [pos[0], 0.3, pos[2]], 12, r, { size: 1.2, alpha: 0.85 });
          for (let i = 0; i < 8; i++) add.spawn({ pos: [...pos], vel: [R(-4, 4), R(0, 3), R(-4, 4)], life: 0.6, size: [0.25, 0.05], color: { from: [...col, 1], to: [...col, 0] }, sprite: 'crescent', spin: R(-8, 8), drag: 2 });
          break;
        case 'vine':
          for (let i = 0; i < 16; i++) add.spawn({ pos: [...pos], vel: [R(-4, 4), R(1, 5), R(-4, 4)], life: R(0.6, 1.1), size: [R(0.15, 0.3), 0.1], color: { from: [...core, 1], to: [...col, 0] }, sprite: Math.random() < 0.5 ? 'leaf' : 'petal', spin: R(-8, 8), gravity: 3, drag: 1 });
          break;
        case 'soul':
          for (let i = 0; i < 6; i++) add.spawn({ pos: [pos[0] + R(-0.5, 0.5), 0.3, pos[2] + R(-0.5, 0.5)], vel: [R(-0.5, 0.5), R(1.5, 3), R(-0.5, 0.5)], life: R(0.7, 1.2), size: [R(0.4, 0.6), 0.2], color: { from: [...col, 1], to: [...edge, 0] }, sprite: i < 2 ? 'skull' : 'soul', rot: 0, drag: 1 });
          this.puffs(ess, [pos[0], 0.2, pos[2]], 6, r, { alpha: 0.7 });
          break;
        case 'blood':
          for (let i = 0; i < 20; i++) add.spawn({ pos: [...pos], vel: [R(-5, 5), R(1, 6), R(-5, 5)], life: R(0.4, 0.8), size: [R(0.12, 0.22), 0.04], color: { from: [...col, 1], to: [...edge, 0] }, sprite: 'drop', gravity: 14, rot: 0, floor: 0.03 });
          this.push(L.glowDisc(this.scene, { pos: [pos[0], 0, pos[2]], color: '#7a0a22', radius: r, dur: 2, opacity: 0.6, intensity: 0.4 }));
          break;
        case 'psy':
          for (let i = 0; i < 3; i++) this.push(L.ring(this.scene, { pos: [pos[0], pos[1], pos[2]], color: st.color, core: st.core, radius: r * (1 + i * 0.4), dur: 0.5 + i * 0.12, y: 0.4 + i * 0.25 }));
          break;
        case 'clock':
          this.push(L.circle(this.scene, { pos: [pos[0], 0, pos[2]], color: st.color, core: st.core, clock: true, radius: r * 1.2, dur: 0.8, spin: 3 }));
          for (let i = 0; i < 8; i++) add.spawn({ pos: [...pos], vel: [R(-3, 3), R(1, 4), R(-3, 3)], life: R(0.6, 1), size: [R(0.2, 0.35), 0.1], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'gear', spin: R(-5, 5), gravity: 4 });
          break;
        case 'stars':
          this.implode(ess, pos, 20, r * 1.5, 0.35);
          for (let i = 0; i < 16; i++) add.spawn({ pos: [...pos], vel: [R(-5, 5), R(-1, 4), R(-5, 5)], life: R(0.5, 0.9), size: [R(0.15, 0.3), 0], color: { from: [...core, 1], to: [...col, 0] }, sprite: 'star5', spin: R(-4, 4), drag: 2 });
          break;
        case 'claw':
          for (let i = 0; i < 3; i++) {
            const a = R(0, Math.PI * 2);
            this.push(L.slash(this.scene, { pos: [pos[0], 0.6 + i * 0.1, pos[2]], dir: [Math.cos(a), 0, Math.sin(a)], color: st.color, core: st.core, edge: st.edge, radius: r * 0.9, arc: 120, width: 0.3, dur: 0.25, tilt: R(-0.5, 0.5) }));
          }
          break;
        case 'void':
          this.implode(ess, pos, 24, r * 1.4, 0.3);
          for (let i = 0; i < 18; i++) alpha.spawn({ pos: [pos[0] + R(-r, r) * 0.5, R(0.1, 1.2), pos[2] + R(-r, r) * 0.5], vel: [0, R(0, 0.5), 0], life: R(0.3, 0.7), size: [R(0.1, 0.3), 0], color: { from: [0.02, 0.02, 0.05, 1], to: [0.02, 0.02, 0.05, 0] }, sprite: 'square', rot: 0 });
          break;
        default: break;
      }
    }
  }

  // Signature core riding inside projectiles. Returns a Group whose
  // userData.spin(group, dt, vel) animates it; userData.hideCore shrinks the orb.
  motifMesh(ess, size) {
    const st = this.style(ess);
    const g = new THREE.Group();
    let t = 0;
    const tick = [];
    const spinTo = vel => (vel ? Math.atan2(vel[0], vel[2]) : 0);
    switch (st.motif) {
      case 'flame': {
        const f1 = this.billboard('flame', '#ff9a2a', size * 1.5, false, 1.5);
        const f2 = this.billboard('flame', '#fff0a0', size * 0.9, true, 1.6);
        f1.position.y = f2.position.y = size * 0.15;
        g.add(f1, f2);
        tick.push(dt => { t += dt; f1.scale.set(size * (1.45 + 0.12 * Math.sin(t * 31)), size * (1.6 + 0.2 * Math.sin(t * 23)), 1); f2.scale.set(size * 0.8, size * (0.95 + 0.15 * Math.sin(t * 37)), 1); });
        g.userData.hideCore = 0.6;
        break;
      }
      case 'shard': {
        const geo = new THREE.OctahedronGeometry(1, 0);
        geo.scale(0.42, 0.42, 1.35);
        const m = new THREE.Mesh(geo, L.energyMaterial({ color: '#9fe6ff', core: '#ffffff', edge: '#2a6fe0', mode: 1, fresnel: 0.5, intensity: 1.5, erode: 0, blending: 'normal' }));
        m.scale.setScalar(size * 0.95);
        g.add(m);
        tick.push((dt, vel) => { m.rotation.y = spinTo(vel); m.rotation.z += dt * 12; });
        g.userData.hideCore = 0.25;
        break;
      }
      case 'lightning': {
        let k = 0;
        tick.push((dt, vel, pos) => {
          k += dt;
          if (k > 0.06 && pos) {
            k = 0;
            for (let i = 0; i < 2; i++) {
              const a = Math.random() * Math.PI * 2, b = a + R(1.5, 3);
              const r = size * 0.9;
              const from = [pos[0] + Math.cos(a) * r * 0.3, pos[1] + R(-0.2, 0.2), pos[2] + Math.sin(a) * r * 0.3];
              const to = [pos[0] + Math.cos(b) * r, pos[1] + R(-0.3, 0.3), pos[2] + Math.sin(b) * r];
              this.push(L.lightning(this.scene, { ends: () => [from, to], color: st.color, dur: 0.07, width: 0.035, jag: 0.18, segments: 4, branches: 0, flicker: 1 }));
            }
          }
        });
        break;
      }
      case 'rock': {
        const geo = this.cache.rock || (this.cache.rock = geometryFrom(meshSDF(S.displace(S.sphere([0, 0, 0], 0.5), 0.12, 3.5, 3, 4).paint(P('#9a7a55', 0.1)), { cell: 0.06 })));
        const m = new THREE.Mesh(geo, toonMaterial({ rim: 0.5 }));
        m.scale.setScalar(size * 1.25);
        m.castShadow = true;
        g.add(m);
        tick.push(dt => { m.rotation.x += dt * 9; m.rotation.z += dt * 4; });
        g.userData.hideCore = 0.01;
        break;
      }
      case 'wave': {
        const b = this.billboard('bubble', '#e8fdff', size * 1.25, true, 1.2);
        g.add(b);
        tick.push(dt => { t += dt; b.scale.set(size * (1.2 + 0.1 * Math.sin(t * 17)), size * (1.2 + 0.1 * Math.cos(t * 13)), 1); });
        break;
      }
      case 'swirl': {
        const geo = new THREE.TorusGeometry(0.5, 0.1, 6, 20, Math.PI * 1.3);
        geo.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(geo, L.energyMaterial({ color: st.color, core: '#ffffff', edge: st.edge, mode: 1, fresnel: 0.3, intensity: 1.6, erode: 0, blending: 'normal' }));
        m.scale.setScalar(size * 1.4);
        g.add(m);
        tick.push(dt => { m.rotation.y += dt * 22; });
        g.userData.hideCore = 0.35;
        break;
      }
      case 'ray': {
        const s1 = this.billboard('star4', '#fff6c0', size * 2.0, true, 1.8);
        g.add(s1);
        tick.push(dt => { t += dt; s1.material.uniforms.uRot.value = t * 3; });
        break;
      }
      case 'smoke': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#150824' }));
        m.scale.setScalar(size * 0.34);
        const rim = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), L.energyMaterial({ color: st.color, core: st.glow, mode: 1, fresnel: 1, intensity: 2, erode: 0 }));
        rim.scale.setScalar(size * 0.42);
        g.add(m, rim);
        g.userData.hideCore = 0.3;
        break;
      }
      case 'vine': {
        const leaves = [0, 1, 2].map(i => { const l = this.billboard('leaf', '#8dff6a', size * 0.7, false, 1.2); g.add(l); return l; });
        tick.push(dt => { t += dt; leaves.forEach((l, i) => { const a = t * 9 + i * 2.1; l.position.set(Math.cos(a) * size * 0.6, Math.sin(a * 0.7) * size * 0.2, Math.sin(a) * size * 0.6); l.material.uniforms.uRot.value = a; }); });
        break;
      }
      case 'soul': {
        const sk = this.billboard('skull', '#6dffe0', size * 1.25, true, 1.8);
        g.add(sk);
        tick.push(dt => { t += dt; sk.position.y = Math.sin(t * 10) * 0.04; });
        g.userData.hideCore = 0.5;
        break;
      }
      case 'blood': {
        const d = this.billboard('drop', '#ff3060', size * 1.2, false, 1.3);
        g.add(d);
        g.userData.hideCore = 0.55;
        break;
      }
      case 'psy': case 'clock': {
        const geo = new THREE.PlaneGeometry(2, 2);
        const m = new THREE.Mesh(geo, L.energyMaterial({ color: st.color, core: st.core, edge: st.edge, mode: st.motif === 'clock' ? 4 : 5, intensity: 2.2, erode: 0, spin: st.motif === 'clock' ? 4 : 2 }));
        m.scale.setScalar(size * 0.95);
        g.add(m);
        tick.push(dt => { m.quaternion.copy(this.camera.quaternion); m.material.uniforms.uTime.value += dt; });
        break;
      }
      case 'stars': {
        const s1 = this.billboard('star5', '#ffe6ff', size * 1.1, true, 1.8);
        const h = this.billboard('halo', '#d86bff', size * 1.8, true, 1.4);
        g.add(h, s1);
        tick.push(dt => { t += dt; s1.material.uniforms.uRot.value = t * 5; });
        break;
      }
      case 'claw': {
        const geo = new THREE.TorusGeometry(0.5, 0.075, 6, 16, Math.PI * 0.85);
        for (let i = -1; i <= 1; i++) {
          const m = new THREE.Mesh(geo, L.energyMaterial({ color: st.color, core: '#ffffff', edge: st.edge, mode: 1, fresnel: 0.2, intensity: 1.7, erode: 0, blending: 'normal' }));
          m.position.x = i * 0.2;
          m.rotation.set(0, Math.PI / 2, 0);
          g.add(m);
        }
        g.scale.setScalar(size * 1.2);
        tick.push((dt, vel) => { g.rotation.y = spinTo(vel); });
        g.userData.hideCore = 0.2;
        break;
      }
      case 'void': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#030306' }));
        m.scale.setScalar(size * 0.4);
        const rim = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), L.energyMaterial({ color: '#dfe3ff', core: '#ffffff', mode: 1, fresnel: 1, intensity: 2.4, erode: 0 }));
        rim.scale.setScalar(size * 0.46);
        g.add(m, rim);
        g.userData.hideCore = 0.01;
        break;
      }
      default: break;
    }
    g.userData.spin = (grp, dt, vel, pos) => tick.forEach(f => f(dt, vel, pos));
    return g;
  }
}
