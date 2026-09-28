// Toon puffs: instanced lumpy cloud balls with cel lighting, a three-stop
// color ramp over their life and a noise dissolve. They are the body of
// stylized explosions, smoke, dust, splashes and magic bursts: solid,
// chunky shapes instead of flat additive glow.

import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iScale;   // sx, sy, sz, yaw
attribute vec3 iA;
attribute vec3 iB;
attribute vec3 iC;
attribute vec4 iP;       // life 0..1, seed, hot, cut start
varying vec3 vN;
varying vec3 vObj;
varying vec3 vCol;
varying vec3 vRim;
varying vec3 vWorld;
varying vec4 vP;
void main() {
  float c = cos(iScale.w), s = sin(iScale.w);
  vec3 p = position;
  vec3 n = normal;
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  vObj = position + iP.y * 3.7;
  vec3 wp = iPos + p * iScale.xyz;
  vN = normalize(n / iScale.xyz);
  float k = iP.x;
  vCol = k < 0.45 ? mix(iA, iB, smoothstep(0.0, 0.45, k)) : mix(iB, iC, smoothstep(0.45, 0.95, k));
  vRim = mix(iB, iC, 0.35 + 0.65 * k);
  vP = iP;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uSun;
uniform vec3 uShade;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vCol;
varying vec3 vRim;
varying vec3 vWorld;
varying vec4 vP;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  float k = vP.x;
  float nz = n3(vObj * 2.6) * 0.65 + n3(vObj * 6.1) * 0.35;
  float cut = smoothstep(vP.w, 1.0, k) * 1.08;
  if (nz < cut) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float d = dot(N, uSun);
  float lit = smoothstep(-0.12, 0.08, d);
  vec3 col = mix(vCol * uShade, vCol, lit);
  // soft top light and a rim so puffs read as volumes
  col *= 0.88 + 0.22 * N.y;
  float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  float hot = vP.z;
  // cool puffs get a light rim; hot ones burn darker toward their edges (fire: yellow core, red rim)
  col += vCol * smoothstep(0.55, 1.0, fres) * 0.35 * lit * (1.0 - hot);
  col = mix(col, vRim * mix(uShade, vec3(1.0), lit), smoothstep(0.25, 0.95, fres) * hot * 0.75);
  // hot puffs: bright (bloom) while young, glowing dissolve rim
  col *= 1.0 + hot * pow(1.0 - k, 2.0) * 2.2;
  col += vCol * smoothstep(cut + 0.07, cut, nz) * step(0.001, cut) * (0.6 + hot * 2.0);
  gl_FragColor = vec4(col, 1.0);
}`;

function lumpyGeometry() {
  // merged icosphere (smooth normals) with a little lumpiness per vertex
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const map = new Map(), verts = [], index = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(key, id);
      const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const k = 0.92 + (h - Math.floor(h)) * 0.16 + 0.05 * Math.sin(x * 5 + z * 3);
      verts.push(x * k, y * k, z * k);
    }
    index.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(index);
  out.computeVertexNormals();
  return out;
}

const _c = new THREE.Color();
const lin = (hex, k = 1) => { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; };

export class PuffSystem {
  constructor(max = 480) {
    this.max = max;
    this.n = 0;
    const F = k => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.life = F(1); this.maxLife = F(1); this.s0 = F(3); this.s1 = F(3);
    this.yaw = F(1); this.spin = F(1); this.grav = F(1); this.drag = F(1); this.floor = F(1);
    this.A = F(3); this.B = F(3); this.C = F(3); this.seed = F(1); this.hot = F(1); this.cut = F(1); this.scaled = new Uint8Array(max);
    const base = lumpyGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    const inst = (k) => new THREE.InstancedBufferAttribute(new Float32Array(max * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aPos = inst(3); this.aScale = inst(4); this.aA = inst(3); this.aB = inst(3); this.aC = inst(3); this.aP = inst(4);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iScale', this.aScale);
    geo.setAttribute('iA', this.aA); geo.setAttribute('iB', this.aB); geo.setAttribute('iC', this.aC); geo.setAttribute('iP', this.aP);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uSun: { value: new THREE.Vector3(-6, 14, 8).normalize() }, uShade: { value: new THREE.Color('#9a86c8') } },
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.geo = geo;
    this.timeScale = 1;
  }

  // o: { pos, vel, life, size (radius) or [start, end], squash (y scale), colors: [a, b, c] (hex),
  //      hot 0..1, gravity (negative rises), drag, floor, cut (dissolve start 0..1), unscaled }
  spawn(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.p.set(o.pos, i3);
    this.v.set(o.vel || [0, 0, 0], i3);
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 0.8;
    const sz = Array.isArray(o.size) ? o.size : [o.size ?? 0.5, (o.size ?? 0.5) * 1.3];
    const sq = o.squash ?? 1;
    this.s0.set([sz[0], sz[0] * sq, sz[0]], i3);
    this.s1.set([sz[1], sz[1] * sq, sz[1]], i3);
    this.yaw[i] = Math.random() * 6.28;
    this.spin[i] = o.spin ?? (Math.random() - 0.5) * 2;
    this.grav[i] = o.gravity ?? -1.2;
    this.drag[i] = o.drag ?? 2.2;
    this.floor[i] = o.floor ?? -99;
    const cols = o.colors || ['#ffffff', '#cccccc', '#888888'];
    const k = o.bright ?? 1;
    this.A.set(lin(cols[0], k), i3); this.B.set(lin(cols[1] ?? cols[0], k), i3); this.C.set(lin(cols[2] ?? cols[1] ?? cols[0], k), i3);
    this.seed[i] = Math.random() * 10;
    this.hot[i] = o.hot ?? 0;
    this.cut[i] = o.cut ?? 0.4;
    this.scaled[i] = o.unscaled ? 0 : 1;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const c3 = (arr) => { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; };
    c3(this.p); c3(this.v); c3(this.s0); c3(this.s1); c3(this.A); c3(this.B); c3(this.C);
    for (const a of [this.life, this.maxLife, this.yaw, this.spin, this.grav, this.drag, this.floor, this.seed, this.hot, this.cut]) a[i] = a[j];
    this.scaled[i] = this.scaled[j];
  }

  update(dt) {
    const P = this.aPos.array, Sc = this.aScale.array, A = this.aA.array, B = this.aB.array, C = this.aC.array, PP = this.aP.array;
    for (let i = 0; i < this.n; i++) {
      const d = this.scaled[i] ? dt * this.timeScale : dt;
      this.life[i] += d;
      if (this.life[i] >= this.maxLife[i]) { this.kill(i); i--; continue; }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * d);
      this.v[i3] *= dr; this.v[i3 + 1] = this.v[i3 + 1] * dr - this.grav[i] * d; this.v[i3 + 2] *= dr;
      this.p[i3] += this.v[i3] * d; this.p[i3 + 1] += this.v[i3 + 1] * d; this.p[i3 + 2] += this.v[i3 + 2] * d;
      if (this.p[i3 + 1] < this.floor[i]) { this.p[i3 + 1] = this.floor[i]; this.v[i3 + 1] *= -0.2; }
      this.yaw[i] += this.spin[i] * d;
    }
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i4 = i * 4;
      const k = this.life[i] / this.maxLife[i];
      const e = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
      const pop = k < 0.12 ? 0.55 + (k / 0.12) * 0.45 : 1;
      P[i3] = this.p[i3]; P[i3 + 1] = this.p[i3 + 1]; P[i3 + 2] = this.p[i3 + 2];
      Sc[i4] = (this.s0[i3] + (this.s1[i3] - this.s0[i3]) * e) * pop;
      Sc[i4 + 1] = (this.s0[i3 + 1] + (this.s1[i3 + 1] - this.s0[i3 + 1]) * e) * pop;
      Sc[i4 + 2] = (this.s0[i3 + 2] + (this.s1[i3 + 2] - this.s0[i3 + 2]) * e) * pop;
      Sc[i4 + 3] = this.yaw[i];
      A[i3] = this.A[i3]; A[i3 + 1] = this.A[i3 + 1]; A[i3 + 2] = this.A[i3 + 2];
      B[i3] = this.B[i3]; B[i3 + 1] = this.B[i3 + 1]; B[i3 + 2] = this.B[i3 + 2];
      C[i3] = this.C[i3]; C[i3 + 1] = this.C[i3 + 1]; C[i3 + 2] = this.C[i3 + 2];
      PP[i4] = k; PP[i4 + 1] = this.seed[i]; PP[i4 + 2] = this.hot[i]; PP[i4 + 3] = this.cut[i];
    }
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aScale, this.aA, this.aB, this.aC, this.aP]) { a.needsUpdate = true; a.addUpdateRange(0, this.n * a.itemSize); }
  }
}

// Color ramps per essence for fiery bursts, lingering smoke and ground dust.
export const PUFF = {
  fire:   { burst: ['#fff6c8', '#ff9a2a', '#5a3530'], smoke: ['#6a4a42', '#4a3434', '#2e2426'], hot: 1 },
  frost:  { burst: ['#ffffff', '#bfefff', '#7fb8d8'], smoke: ['#e8f8ff', '#cfe8f4', '#a8c8dc'], hot: 0.3 },
  storm:  { burst: ['#eef2ff', '#7a6cff', '#2e2080'], smoke: ['#5a5aa8', '#3c3c7a', '#22224a'], hot: 0.8 },
  stone:  { burst: ['#f4e6c8', '#d2b48a', '#8a7058'], smoke: ['#e2d2b4', '#c4ac8a', '#9a8468'], hot: 0 },
  tide:   { burst: ['#ffffff', '#9fe8ff', '#3a9ae0'], smoke: ['#eaffff', '#bfeaff', '#8ac8ec'], hot: 0.1 },
  gale:   { burst: ['#ffffff', '#e8ffe0', '#b8e8b0'], smoke: ['#ffffff', '#eefaea', '#cfe8cc'], hot: 0 },
  light:  { burst: ['#ffffff', '#fff0a0', '#ffb830'], smoke: ['#fffbe0', '#ffeeb0', '#e8c870'], hot: 0.9 },
  shadow: { burst: ['#e0c8ff', '#7a3ae0', '#1e0e36'], smoke: ['#4a2a70', '#2e1a4a', '#160c26'], hot: 0.4 },
  life:   { burst: ['#f4ffd8', '#8aee6a', '#2e8a3a'], smoke: ['#dfffcf', '#a8e890', '#6ab85a'], hot: 0.2 },
  death:  { burst: ['#dffff6', '#3cf0c8', '#0e3a36'], smoke: ['#2a4a48', '#1c3432', '#0e1e1e'], hot: 0.5 },
  blood:  { burst: ['#ffd0da', '#ff2f5a', '#4a0818'], smoke: ['#8a1a30', '#5a0e20', '#2e0610'], hot: 0.5 },
  mind:   { burst: ['#fff0fc', '#ff7ae0', '#8a2aa8'], smoke: ['#f8d8ff', '#e0a8f0', '#b87ad0'], hot: 0.5 },
  time:   { burst: ['#fffbe6', '#ffd070', '#b07a2a'], smoke: ['#fff4d8', '#f0dca8', '#d0b478'], hot: 0.7 },
  space:  { burst: ['#ffffff', '#d86bff', '#1e1446'], smoke: ['#3a2a70', '#241a4a', '#120c26'], hot: 0.6 },
  beast:  { burst: ['#fff2dc', '#ffb070', '#8a4a22'], smoke: ['#e8d0b0', '#c8a680', '#9a7a58'], hot: 0.2 },
  void:   { burst: ['#ffffff', '#6a6a8a', '#08080e'], smoke: ['#2a2a38', '#16161e', '#050508'], hot: 0.3 },
};
