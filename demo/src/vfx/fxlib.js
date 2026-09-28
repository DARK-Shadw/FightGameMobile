// Mesh-based effects. Every effect is { obj, update(dt) → alive, kill() }.
// One energy shader covers most of them: a color ramp (hot core → essence
// color → dark edge), scrolling noise, erosion over its life and fresnel.

import * as THREE from 'three';

const NOISE = /* glsl */`
float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return fn(p) * 0.55 + fn(p * 2.1 + 3.1) * 0.3 + fn(p * 4.3 + 7.7) * 0.15; }
`;

// Modes: 0 ring (uv.y radial 0..1 inner→outer), 1 surface (uv wraps object), 2 beam/cone (uv.y along),
// 3 disc (uv centered), 4 clock (disc with ticks), 5 rune circle, 6 slash (uv.x along arc, uv.y across)
const VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform vec3 uCore, uColor, uEdge;
uniform float uTime, uLife, uOpacity, uIntensity, uErode, uFresnel, uNoise, uMode, uSoft, uWidth, uSeed, uSpin, uSolid;
uniform vec2 uScroll;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
${NOISE}
vec3 safeN(vec3 n) { float l = length(n); return l > 1e-5 ? n / l : vec3(0.0, 1.0, 0.0); }
vec3 ramp(float t) { return t > 0.5 ? mix(uColor, uCore, (t - 0.5) * 2.0) : mix(uEdge, uColor, t * 2.0); }
void main() {
  vec2 uv = vUv;
  float heat = 1.0, alpha = 1.0;
  float n = fbm(uv * vec2(6.0, 3.0) * uNoise + uScroll * uTime + uSeed);
  if (uMode < 0.5) {                     // ring: bright band in the middle of the strip
    float d = abs(uv.y - 0.5) * 2.0;
    heat = 1.0 - d;
    alpha = smoothstep(1.0, 0.55, d);
  } else if (uMode < 1.5) {              // surface (spheres, shells)
    float f = 1.0 - abs(dot(safeN(vN), normalize(vV)));
    heat = mix(1.0, pow(f, 1.5), uFresnel);
    alpha = mix(1.0, smoothstep(0.0, 0.9, f), uFresnel);
  } else if (uMode < 2.5) {              // beams and cones: bright core along the axis
    float across = abs(uv.x - 0.5) * 2.0;
    float f = 1.0 - abs(dot(safeN(vN), normalize(vV)));
    heat = mix(1.0 - across, 1.0 - f, uFresnel);
    alpha = smoothstep(1.0, 0.2, max(across, f * uFresnel)) * smoothstep(0.0, uSoft, uv.y) * smoothstep(1.0, 1.0 - uSoft, uv.y);
  } else if (uMode < 3.5) {              // disc
    float r = length(uv - 0.5) * 2.0;
    heat = 1.0 - r;
    alpha = smoothstep(1.0, 0.7, r);
  } else if (uMode < 4.5) {              // clock face
    vec2 p = uv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x) + uTime * uSpin;
    float rim = smoothstep(0.08, 0.0, abs(r - 0.92)) + smoothstep(0.04, 0.0, abs(r - 0.78)) * 0.7;
    float ticks = step(0.8, r) * step(r, 0.9) * smoothstep(0.35, 0.0, abs(fract(a / 6.2831853 * 12.0) - 0.5) * 12.0 - 0.1);
    float hand1 = smoothstep(0.025, 0.0, abs(dot(p, vec2(-sin(uTime * uSpin * 3.0), cos(uTime * uSpin * 3.0))))) * step(r, 0.7) * step(0.0, dot(p, vec2(cos(uTime * uSpin * 3.0), sin(uTime * uSpin * 3.0))));
    float hand2 = smoothstep(0.03, 0.0, abs(dot(p, vec2(-sin(uTime * uSpin * 0.4), cos(uTime * uSpin * 0.4))))) * step(r, 0.5) * step(0.0, dot(p, vec2(cos(uTime * uSpin * 0.4), sin(uTime * uSpin * 0.4))));
    float m = max(max(rim, ticks), max(hand1, hand2));
    heat = 0.4 + 0.6 * m;
    alpha = m + smoothstep(1.0, 0.0, r) * 0.08;
  } else if (uMode < 5.5) {              // rune circle
    vec2 p = uv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x) + uTime * uSpin;
    float rings = smoothstep(0.05, 0.0, abs(r - 0.93)) + smoothstep(0.03, 0.0, abs(r - 0.72));
    float cell = floor((a / 6.2831853 + 0.5) * 16.0);
    float glyph = step(0.76, r) * step(r, 0.89) * step(0.35, fh(vec2(cell, uSeed))) * step(0.2, fract((a / 6.2831853 + 0.5) * 16.0)) * step(fract((a / 6.2831853 + 0.5) * 16.0), 0.8);
    float star = smoothstep(0.03, 0.0, abs(r * cos(mod(a * 5.0 / 2.0 + 0.3, 3.14159 / 1.0) - 1.5708) - 0.36)) * step(r, 0.72);
    float m = max(rings, max(glyph * 0.9, star * 0.8));
    heat = 0.4 + 0.6 * m;
    alpha = m + smoothstep(1.0, 0.0, r) * 0.1;
  } else {                               // slash arc
    float across = abs(uv.y - 0.5) * 2.0;
    float along = uv.x;
    float head = smoothstep(uLife - 0.05, uLife + 0.35, along);
    heat = (1.0 - across) * (0.4 + 0.6 * along);
    alpha = smoothstep(1.0, 0.3, across) * smoothstep(0.0, 0.25, along) * (1.0 - head * 0.0);
  }
  // erosion: noise eats the effect as it ages
  float e = uErode * uLife;
  alpha *= smoothstep(e, e + 0.18, n + (1.0 - uErode) * 0.4);
  heat = clamp(heat * (0.8 + 0.4 * n), 0.0, 1.0);
  vec3 col = ramp(heat) * uIntensity;
  float a = alpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * a, a * uSolid);
}`;

export function energyMaterial(o = {}) {
  const C = c => new THREE.Color(c ?? '#ffffff');
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uCore: { value: C(o.core ?? '#ffffff') }, uColor: { value: C(o.color) }, uEdge: { value: C(o.edge ?? o.color) },
      uTime: { value: 0 }, uLife: { value: 0 }, uOpacity: { value: o.opacity ?? 1 }, uIntensity: { value: o.intensity ?? 2 },
      uErode: { value: o.erode ?? 0.8 }, uFresnel: { value: o.fresnel ?? 0.6 }, uNoise: { value: o.noise ?? 1 },
      uMode: { value: o.mode ?? 1 }, uSoft: { value: o.soft ?? 0.15 }, uWidth: { value: 1 }, uSeed: { value: Math.random() * 50 },
      uSolid: { value: o.blending === 'normal' ? 1 : 0 }, uSpin: { value: o.spin ?? 0.5 }, uScroll: { value: new THREE.Vector2(...(o.scroll ?? [0, -1.5])) },
    },
    transparent: true, depthWrite: false,
    blending: o.blending === 'normal' ? THREE.CustomBlending : THREE.AdditiveBlending,
    blendSrc: THREE.OneFactor, blendDst: o.blending === 'normal' ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor,
    side: o.side ?? THREE.DoubleSide,
  });
}

class Effect {
  constructor(obj, dur, onUpdate) {
    this.obj = obj; this.dur = dur; this.t = 0; this.onUpdate = onUpdate; this.dead = false;
    this.mats = [];
    obj.traverse(o => { if (o.material?.uniforms?.uLife) this.mats.push(o.material); });
  }
  update(dt) {
    if (this.dead) return false;
    this.t += dt;
    const k = this.dur > 0 ? Math.min(1, this.t / this.dur) : 0;
    for (const m of this.mats) { m.uniforms.uTime.value += dt; m.uniforms.uLife.value = k; }
    this.onUpdate?.(k, dt, this);
    if (this.dur > 0 && this.t >= this.dur) { this.kill(); return false; }
    return true;
  }
  kill() {
    this.dead = true;
    this.obj.removeFromParent();
    this.obj.traverse(o => { if (o.isMesh) { o.geometry.userData.shared || o.geometry.dispose(); o.material.dispose?.(); } });
  }
}

const easeOut = t => 1 - (1 - t) * (1 - t);
const easeOut3 = t => 1 - Math.pow(1 - t, 3);

// Shared geometries
const G = {};
function shared(key, make) { if (!G[key]) { G[key] = make(); G[key].userData.shared = true; } return G[key]; }
const ringGeo = () => shared('ring', () => { const g = new THREE.RingGeometry(0.5, 1, 64, 1); g.rotateX(-Math.PI / 2);
  // uv.y: 0 inner → 1 outer
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); uv.setXY(i, Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 0.5, (r - 0.5) / 0.5); }
  return g; });
const sphereGeo = () => shared('sphere', () => new THREE.SphereGeometry(1, 32, 20));
const discGeo = () => shared('disc', () => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; });
const cylGeo = () => shared('cyl', () => { const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); g.translate(0, 0.5, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i)); return g; });

// ── Ground shockwave ring ──
export function ring(scene, o) {
  const mat = energyMaterial({ color: o.color, core: o.core, edge: o.edge, mode: 0, intensity: o.intensity ?? 2.5, erode: o.erode ?? 0.6, noise: 1.5, scroll: [0.3, 0], blending: o.blending });
  const mesh = new THREE.Mesh(ringGeo(), mat);
  mesh.position.set(o.pos[0], (o.pos[1] ?? 0) + (o.y ?? 0.05), o.pos[2]);
  mesh.renderOrder = 15;
  scene.add(mesh);
  const r0 = o.from ?? 0.2, r1 = o.radius ?? 3, w = o.width ?? 0.35;
  return new Effect(mesh, o.dur ?? 0.5, k => {
    const r = r0 + (r1 - r0) * easeOut3(k);
    // keep the band width constant in world units: inner radius = r - w
    mesh.scale.set(r, 1, r);
    const inner = Math.max(0, 1 - w / Math.max(r, 0.01));
    mesh.material.uniforms.uOpacity.value = (1 - k) * (o.opacity ?? 1);
    mesh.material.uniforms.uWidth.value = inner;
  });
}

// ── Expanding shell / burst ──
export function burst(scene, o) {
  const mat = energyMaterial({ color: o.color, core: o.core, edge: o.edge, mode: 1, fresnel: o.fresnel ?? 0.85, intensity: o.intensity ?? 2.2, erode: o.erode ?? 0.9, noise: 1.2, scroll: [0.2, -0.8], blending: o.blending });
  const mesh = new THREE.Mesh(sphereGeo(), mat);
  mesh.position.set(...o.pos);
  mesh.renderOrder = 16;
  scene.add(mesh);
  const r0 = o.from ?? 0.1, r1 = o.radius ?? 1.5;
  return new Effect(mesh, o.dur ?? 0.4, k => {
    const r = r0 + (r1 - r0) * easeOut(k);
    mesh.scale.set(r, r * (o.flatten ?? 1), r);
    mesh.material.uniforms.uOpacity.value = 1 - k * k;
  });
}

// ── Flat glowing disc (ground light pool, flash) ──
export function glowDisc(scene, o) {
  const mat = energyMaterial({ color: o.color, core: o.core ?? o.color, mode: 3, intensity: o.intensity ?? 1.2, erode: 0, noise: 0.5 });
  const mesh = new THREE.Mesh(discGeo(), mat);
  mesh.position.set(o.pos[0], (o.pos[1] ?? 0) + 0.04, o.pos[2]);
  mesh.scale.setScalar(o.radius ?? 1);
  mesh.renderOrder = 14;
  scene.add(mesh);
  const e = new Effect(mesh, o.dur ?? 0, (k, dt, self) => {
    if (o.follow) { const p = o.follow(); if (p) mesh.position.set(p[0], 0.04, p[2]); }
    mesh.material.uniforms.uOpacity.value = (o.dur ? (1 - k) : 1) * (o.opacity ?? 0.6);
  });
  return e;
}

// ── Magic circles (rune ring or clock face) on the ground or upright ──
export function circle(scene, o) {
  // solid (premultiplied) lines by default: additive gold vanishes on sunny grass
  const add = o.blending === 'add';
  const mat = energyMaterial({ color: o.color, core: add ? o.core : o.color, edge: o.edge ?? o.color, mode: o.clock ? 4 : 5, intensity: o.intensity ?? (add ? 1.8 : 1.25), erode: 0, spin: o.spin ?? 0.6, blending: add ? undefined : 'normal' });
  const mesh = new THREE.Mesh(discGeo(), mat);
  mesh.position.set(o.pos[0], (o.pos[1] ?? 0) + (o.y ?? 0.06), o.pos[2]);
  if (o.upright) mesh.rotation.x = Math.PI / 2;
  if (o.rot) mesh.rotation.set(...o.rot);
  mesh.renderOrder = 15;
  scene.add(mesh);
  const e = new Effect(mesh, o.dur ?? 1, (k, dt, self) => {
    // grow in over the first quarter of a timed circle, or the first 0.25 s of a persistent one
    const grow = o.grow === false ? 1 : easeOut3(Math.min(1, self.dur > 0 ? k * 4 : self.t * 4));
    mesh.scale.setScalar(self.R * grow);
    const fade = o.dur ? Math.min(1, (1 - k) * 5) : 1;
    mesh.material.uniforms.uOpacity.value = fade * (o.opacity ?? 1);
    if (o.follow) { const p = o.follow(); if (p) mesh.position.set(p[0], (o.y ?? 0.06), p[2]); }
  });
  e.R = o.radius ?? 1.5;
  return e;
}

// ── Beam between two points (updated each frame by the owner) ──
export function beam(scene, o) {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(cylGeo(), energyMaterial({ color: o.color, core: o.core, edge: o.edge, mode: 2, fresnel: 0.3, intensity: o.intensity ?? 2.2, erode: 0.2, noise: 1.3, scroll: [0, -4], soft: 0.04, blending: o.blending }));
  const inner = new THREE.Mesh(cylGeo(), energyMaterial({ color: o.core ?? '#ffffff', core: '#ffffff', mode: 2, fresnel: 0.1, intensity: 3, erode: 0, noise: 2, scroll: [0, -7], soft: 0.04 }));
  inner.scale.set(0.35, 1, 0.35);
  group.add(outer, inner);
  group.renderOrder = 17;
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  const e = new Effect(group, o.dur ?? 0, (k) => {
    const [from, to] = o.ends();
    a.set(...from); b.set(...to);
    d.subVectors(b, a);
    const L = d.length();
    group.position.copy(a);
    group.quaternion.setFromUnitVectors(up, d.normalize());
    const w = (o.radius ?? 0.25) * (o.dur ? Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.4 + 0.8 : 1) * (0.9 + 0.1 * Math.sin(e.t * 40));
    outer.scale.set(w, L, w);
    inner.scale.set(w * 0.35, L, w * 0.35);
    for (const m of [outer.material, inner.material]) m.uniforms.uOpacity.value = o.dur ? Math.min(1, (1 - k) * 6) : 1;
  });
  return e;
}

// ── Cone / breath blast (a fan of energy that sweeps outward) ──
export function cone(scene, o) {
  const len = o.length ?? 4, ang = (o.angle ?? 60) * Math.PI / 180;
  const geo = new THREE.CircleGeometry(1, 24, -ang / 2, ang);
  // uv: x across (angle), y along (radius)
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x);
    uv.setXY(i, (a / ang) + 0.5, r);
  }
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, energyMaterial({ color: o.color, core: o.core, edge: o.edge, mode: 2, fresnel: 0, intensity: o.intensity ?? 2.2, erode: 0.9, noise: 1.4, scroll: [0, -3], soft: 0.2 }));
  mesh.position.set(o.pos[0], (o.pos[1] ?? 0) + 0.6, o.pos[2]);
  mesh.rotation.y = Math.atan2(o.dir[0], o.dir[2]) - Math.PI / 2;
  mesh.renderOrder = 16;
  scene.add(mesh);
  return new Effect(mesh, o.dur ?? 0.45, k => {
    const r = len * easeOut3(Math.min(1, k * 2.2));
    mesh.scale.set(r, 1, r);
    mesh.material.uniforms.uOpacity.value = 1 - k * 0.6;
  });
}

// ── Ribbon trail following a moving point ──
export function trail(scene, o) {
  const N = o.points ?? 18;
  const pts = [];
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2);
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  for (let i = 0; i < N; i++) { uv[i * 4] = 0; uv[i * 4 + 1] = i / (N - 1); uv[i * 4 + 2] = 1; uv[i * 4 + 3] = i / (N - 1); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * 2 * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const mat = energyMaterial({ color: o.color, core: o.core, edge: o.edge, mode: 2, fresnel: 0, intensity: o.intensity ?? 2, erode: 0.3, noise: 1, scroll: [0, 2], soft: 0.5, blending: o.blending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 16;
  scene.add(mesh);
  const cam = o.camera;
  const tmp = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
  let fading = -1;
  const e = new Effect(mesh, 0, (k, dt) => {
    const head = o.head();
    if (head === undefined) return; // not started yet
    if (head && fading < 0) { pts.unshift(head.slice()); if (pts.length > N) pts.pop(); }
    else { fading = Math.max(0, fading < 0 ? 0 : fading) + dt; pts.pop(); if (!pts.length) { e.kill(); return; } }
    const w = o.width ?? 0.3;
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, pts.length - 1)] || head || [0, 0, 0];
      const q = pts[Math.min(i + 1, pts.length - 1)] || p;
      tmp.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (tmp.lengthSq() < 1e-8) tmp.set(0, 0, 1);
      view.set(cam.position.x - p[0], cam.position.y - p[1], cam.position.z - p[2]);
      side.crossVectors(tmp, view).normalize().multiplyScalar(w * (1 - i / N) * 0.5);
      pos.set([p[0] - side.x, p[1] - side.y, p[2] - side.z, p[0] + side.x, p[1] + side.y, p[2] + side.z], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
  });
  e.stop = () => { fading = 0; };
  return e;
}

// ── Lightning: jagged ribbons regenerated every few frames ──
export function lightning(scene, o) {
  const group = new THREE.Group();
  group.renderOrder = 18;
  scene.add(group);
  const mat = energyMaterial({ color: o.color, core: '#ffffff', edge: o.edge ?? o.color, mode: 2, fresnel: 0, intensity: o.intensity ?? 3.2, erode: 0, noise: 0.5, soft: 0.02 });
  let timer = 0;
  const build = () => {
    group.children.forEach(c => c.geometry.dispose());
    group.clear();
    const [from, to] = o.ends();
    const segs = o.segments ?? 10;
    const makeBolt = (a, b, width, jag) => {
      const pts = [a];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        pts.push([a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * jag, a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * jag * 0.6, a[2] + (b[2] - a[2]) * t + (Math.random() - 0.5) * jag]);
      }
      pts.push(b);
      const pos = [], uv = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
        const dx = q[0] - r[0], dz = q[2] - r[2];
        const l = Math.hypot(dx, dz) || 1;
        const sx = -dz / l * width, sz = dx / l * width;
        pos.push(p[0] - sx, p[1] + width * 0.3, p[2] - sz, p[0] + sx, p[1] - width * 0.3, p[2] + sz);
        uv.push(0, i / (pts.length - 1), 1, i / (pts.length - 1));
        if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      group.add(m);
      return pts;
    };
    const main = makeBolt(from, to, o.width ?? 0.09, o.jag ?? 0.6);
    for (let b = 0; b < (o.branches ?? 2); b++) {
      const start = main[1 + Math.floor(Math.random() * (main.length - 2))];
      const end = [start[0] + (Math.random() - 0.5) * 1.6, start[1] - Math.random() * 0.5, start[2] + (Math.random() - 0.5) * 1.6];
      makeBolt(start, end, (o.width ?? 0.09) * 0.5, 0.35);
    }
  };
  build();
  return new Effect(group, o.dur ?? 0.3, (k, dt) => {
    timer += dt;
    if (timer > (o.flicker ?? 0.05)) { timer = 0; build(); }
    mat.uniforms.uOpacity.value = 1 - k * k;
  });
}

// ── Hex shield bubble ──
export function shield(scene, o) {
  const mat = energyMaterial({ color: o.color, core: o.core ?? '#ffffff', mode: 1, fresnel: 1, intensity: o.intensity ?? 1.6, erode: 0, noise: 3, scroll: [0.5, 0.5] });
  const mesh = new THREE.Mesh(sphereGeo(), mat);
  mesh.renderOrder = 19;
  scene.add(mesh);
  return new Effect(mesh, o.dur ?? 0, (k, dt, e) => {
    const p = o.follow();
    if (!p) { e.kill(); return; }
    mesh.position.set(p[0], p[1] + (o.lift ?? 0.7), p[2]);
    const pop = Math.min(1, e.t * 6);
    const r = (o.radius ?? 0.85) * (1.15 - 0.15 * pop) * (1 + 0.02 * Math.sin(e.t * 9));
    mesh.scale.set(r, r * 1.05, r);
    mat.uniforms.uOpacity.value = (o.opacity ?? 0.8) * pop * (o.dur ? Math.min(1, (1 - k) * 5) : 1);
  });
}

// ── Vertical pillar of light / energy from the sky ──
export function pillar(scene, o) {
  const mesh = new THREE.Mesh(cylGeo(), energyMaterial({ color: o.color, core: o.core ?? '#ffffff', edge: o.edge, mode: 2, fresnel: 0.6, intensity: o.intensity ?? 2.5, erode: 0.7, noise: 1.2, scroll: [0, -3], soft: 0.25 }));
  mesh.position.set(o.pos[0], 0, o.pos[2]);
  mesh.renderOrder = 17;
  scene.add(mesh);
  const R = o.radius ?? 1, H = o.height ?? 8;
  return new Effect(mesh, o.dur ?? 0.6, k => {
    const w = R * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) * 0.8);
    mesh.scale.set(Math.max(0.01, w), H, Math.max(0.01, w));
  });
}

// ── Slash arc (claws, melee swipes) ──
export function slash(scene, o) {
  const r = o.radius ?? 1.2, arc = (o.arc ?? 150) * Math.PI / 180, w = o.width ?? 0.5;
  const geo = new THREE.RingGeometry(r - w, r, 32, 1, -arc / 2, arc);
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const a = Math.atan2(y, x), rr = Math.hypot(x, y);
    uv.setXY(i, (a + arc / 2) / arc, (rr - (r - w)) / w);
  }
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, energyMaterial({ color: o.color, core: o.core, edge: o.edge, mode: 6, intensity: o.intensity ?? 2.6, erode: 0.7, noise: 1.3, scroll: [2, 0] }));
  mesh.position.set(o.pos[0], (o.pos[1] ?? 0.7), o.pos[2]);
  mesh.rotation.y = Math.atan2(o.dir[0], o.dir[2]) - Math.PI / 2;
  if (o.tilt) mesh.rotateX(o.tilt);
  mesh.renderOrder = 18;
  scene.add(mesh);
  return new Effect(mesh, o.dur ?? 0.25, k => {
    mesh.material.uniforms.uOpacity.value = 1 - k;
    mesh.scale.setScalar(0.85 + 0.25 * easeOut(k));
  });
}

// ── Tornado / swirl column ──
export function swirl(scene, o) {
  const geo = new THREE.CylinderGeometry(1, 0.35, 1, 24, 6, true);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geo, energyMaterial({ color: o.color, core: o.core, edge: o.edge, mode: 2, fresnel: 0.7, intensity: o.intensity ?? 1.8, erode: 0.5, noise: 1.2, scroll: [3, -1.5], soft: 0.2 }));
  mesh.position.set(...o.pos);
  mesh.renderOrder = 17;
  scene.add(mesh);
  const R = o.radius ?? 1.2, H = o.height ?? 2.5;
  return new Effect(mesh, o.dur ?? 1, (k, dt) => {
    mesh.rotation.y += dt * 6;
    const g = Math.min(1, k * 5) * Math.min(1, (1 - k) * 4);
    mesh.scale.set(R * (0.6 + 0.4 * g), H * g, R * (0.6 + 0.4 * g));
    if (o.follow) { const p = o.follow(); if (p) mesh.position.set(p[0], 0, p[2]); }
  });
}

// ── Ground telegraph (circle, cone or line) with a sweeping fill ──
const TELE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uProg, uOpacity, uShape, uAngle, uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float inside, edge, fill;
  if (uShape < 0.5) {                     // circle
    inside = step(r, 1.0);
    edge = smoothstep(0.9, 0.95, r) * step(r, 1.0);
    fill = step(r, uProg);
  } else if (uShape < 1.5) {              // cone pointing +y
    float a = abs(atan(p.x, p.y));
    inside = step(r, 1.0) * step(a, uAngle * 0.5);
    edge = inside * max(smoothstep(0.92, 0.97, r), smoothstep(uAngle * 0.5 - 0.06, uAngle * 0.5, a));
    fill = step(r, uProg);
  } else {                                // line (rect) along +y
    inside = step(abs(p.x), 1.0) * step(-1.0, p.y) * step(p.y, 1.0);
    edge = inside * max(smoothstep(0.85, 0.95, abs(p.x)), smoothstep(0.93, 0.99, abs(p.y)));
    fill = step((p.y + 1.0) * 0.5, uProg);
  }
  float dash = step(0.5, fract(atan(p.y, p.x) * 6.0 + uTime * 0.8));
  float a = inside * (0.16 + 0.22 * fill) + edge * (0.55 + 0.45 * dash);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a * 1.6, a * uOpacity);
}`;
export function telegraph(scene, o) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: TELE_FRAG,
    uniforms: { uColor: { value: new THREE.Color(o.color) }, uProg: { value: 0 }, uOpacity: { value: 1 }, uShape: { value: { circle: 0, cone: 1, line: 2 }[o.shape ?? 'circle'] },
      uAngle: { value: (o.angle ?? 60) * Math.PI / 180 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const geo = new THREE.PlaneGeometry(2, 2);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 13;
  const R = o.radius ?? 2;
  if (o.shape === 'line') mesh.scale.set(o.width ?? 0.5, 1, (o.length ?? 6) / 2);
  else mesh.scale.set(R, 1, R);
  mesh.position.set(o.pos[0], 0.06, o.pos[2]);
  if (o.dir) mesh.rotation.y = Math.atan2(o.dir[0], o.dir[2]) + Math.PI;
  if (o.shape === 'line' && o.dir) mesh.position.set(o.pos[0] + o.dir[0] * (o.length ?? 6) / 2, 0.06, o.pos[2] + o.dir[2] * (o.length ?? 6) / 2);
  scene.add(mesh);
  return new Effect(mesh, o.dur ?? 1, (k, dt) => {
    mat.uniforms.uTime.value += dt;
    mat.uniforms.uProg.value = k;
    mat.uniforms.uOpacity.value = k > 0.9 ? (1 - k) * 10 : 1;
  });
}
