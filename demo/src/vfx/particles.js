// Instanced particle system. CPU simulation, one draw call per blend mode.
// Particles are camera-facing sprites from the atlas; fast ones stretch
// along their screen-space velocity like streaks.

import * as THREE from 'three';
import { getAtlas, ATLAS_GRID, spriteIndex } from './atlas.js';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec4 iMisc;   // size, rotation, sprite, stretch
attribute vec3 iVel;
varying vec2 vUv;
varying vec4 vColor;
uniform float uGrid;
void main() {
  float size = iMisc.x;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 corner = position.xy;          // -0.5..0.5
  vec3 velV = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
  float sp = length(velV.xy);
  vec2 q;
  if (iMisc.w > 0.0 && sp > 0.01) {
    vec2 dir = velV.xy / sp;
    vec2 perp = vec2(-dir.y, dir.x);
    float len = size * (1.0 + sp * iMisc.w);
    q = dir * corner.x * len + perp * corner.y * size;
  } else {
    float c = cos(iMisc.y), s = sin(iMisc.y);
    q = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
  }
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  float idx = iMisc.z;
  vec2 cell = vec2(mod(idx, uGrid), floor(idx / uGrid));
  vec2 uv = position.xy + 0.5;
  if (iMisc.w > 0.0 && sp > 0.01) uv = vec2(uv.x, uv.y);
  vUv = (cell + vec2(uv.x, 1.0 - uv.y)) / uGrid;
  vUv.y = 1.0 - vUv.y;
  vColor = iColor;
}`;

const FRAG = /* glsl */`
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  float a = t.a * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
}`;

export class ParticleSystem {
  constructor(max = 3000, blending = 'add') {
    this.max = max;
    this.n = 0;
    const F = k => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.life = F(1); this.maxLife = F(1);
    this.size0 = F(1); this.size1 = F(1); this.c0 = F(4); this.c1 = F(4);
    this.rot = F(1); this.rotV = F(1); this.sprite = F(1); this.grav = F(1); this.drag = F(1);
    this.stretch = F(1); this.floor = F(1); this.attr = F(4); this.scaled = new Uint8Array(max);
    this.fadeIn = F(1);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uAtlas: { value: getAtlas() }, uGrid: { value: ATLAS_GRID } },
      transparent: true, depthWrite: false,
      blending: blending === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blending === 'add' ? 20 : 10;
    this.geo = geo;
    this.timeScale = 1; // world time (time stop freezes particles with scaled=1)
  }

  // o: { pos, vel, life, size:[a,b], color:[r,g,b,a] or {from,to}, sprite, rot, spin,
  //      gravity, drag, stretch, floor, attract:[x,y,z,strength], unscaled }
  spawn(o) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    const s3 = i * 3, s4 = i * 4;
    this.p[s3] = o.pos[0]; this.p[s3 + 1] = o.pos[1]; this.p[s3 + 2] = o.pos[2];
    const v = o.vel || [0, 0, 0];
    this.v[s3] = v[0]; this.v[s3 + 1] = v[1]; this.v[s3 + 2] = v[2];
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 1;
    const sz = Array.isArray(o.size) ? o.size : [o.size ?? 0.3, o.size ?? 0.3];
    this.size0[i] = sz[0]; this.size1[i] = sz[1];
    const cf = o.color?.from || o.color || [1, 1, 1, 1];
    const ct = o.color?.to || [cf[0], cf[1], cf[2], 0];
    for (let k = 0; k < 4; k++) { this.c0[s4 + k] = cf[k] ?? 1; this.c1[s4 + k] = ct[k] ?? 0; }
    this.rot[i] = o.rot ?? Math.random() * Math.PI * 2;
    this.rotV[i] = o.spin ?? 0;
    this.sprite[i] = typeof o.sprite === 'string' ? spriteIndex(o.sprite) : (o.sprite ?? 0);
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.stretch[i] = o.stretch ?? 0;
    this.floor[i] = o.floor ?? -100;
    const at = o.attract || [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) this.attr[s4 + k] = at[k];
    this.scaled[i] = o.unscaled ? 0 : 1;
    this.fadeIn[i] = o.fadeIn ?? 0.08;
    return i;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const cp = (arr, k) => { for (let q = 0; q < k; q++) arr[i * k + q] = arr[j * k + q]; };
    cp(this.p, 3); cp(this.v, 3); cp(this.c0, 4); cp(this.c1, 4); cp(this.attr, 4);
    for (const a of [this.life, this.maxLife, this.size0, this.size1, this.rot, this.rotV, this.sprite, this.grav, this.drag, this.stretch, this.floor, this.fadeIn]) a[i] = a[j];
    this.scaled[i] = this.scaled[j];
  }

  update(dt) {
    const P = this.aPos.array, C = this.aCol.array, M = this.aMisc.array, VV = this.aVel.array;
    for (let i = 0; i < this.n; i++) {
      const h = this.scaled[i] ? dt * this.timeScale : dt;
      this.life[i] += h;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) { this.kill(i); i--; continue; }
      const s3 = i * 3, s4 = i * 4;
      if (h > 0) {
        const d = Math.max(0, 1 - this.drag[i] * h);
        this.v[s3] *= d; this.v[s3 + 1] = this.v[s3 + 1] * d - this.grav[i] * h; this.v[s3 + 2] *= d;
        const as = this.attr[s4 + 3];
        if (as) {
          const dx = this.attr[s4] - this.p[s3], dy = this.attr[s4 + 1] - this.p[s3 + 1], dz = this.attr[s4 + 2] - this.p[s3 + 2];
          const l = Math.hypot(dx, dy, dz) + 0.05;
          this.v[s3] += dx / l * as * h; this.v[s3 + 1] += dy / l * as * h; this.v[s3 + 2] += dz / l * as * h;
        }
        this.p[s3] += this.v[s3] * h; this.p[s3 + 1] += this.v[s3 + 1] * h; this.p[s3 + 2] += this.v[s3 + 2] * h;
        if (this.p[s3 + 1] < this.floor[i]) { this.p[s3 + 1] = this.floor[i]; this.v[s3 + 1] *= -0.35; this.v[s3] *= 0.6; this.v[s3 + 2] *= 0.6; }
        this.rot[i] += this.rotV[i] * h;
      }
      P[s3] = this.p[s3]; P[s3 + 1] = this.p[s3 + 1]; P[s3 + 2] = this.p[s3 + 2];
      VV[s3] = this.v[s3]; VV[s3 + 1] = this.v[s3 + 1]; VV[s3 + 2] = this.v[s3 + 2];
      const fi = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1;
      for (let k = 0; k < 4; k++) C[s4 + k] = this.c0[s4 + k] + (this.c1[s4 + k] - this.c0[s4 + k]) * t;
      C[s4 + 3] *= fi;
      M[s4] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      M[s4 + 1] = this.rot[i];
      M[s4 + 2] = this.sprite[i];
      M[s4 + 3] = this.stretch[i];
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; this.aVel.needsUpdate = true;
    this.aPos.addUpdateRange(0, this.n * 3); this.aCol.addUpdateRange(0, this.n * 4);
    this.aMisc.addUpdateRange(0, this.n * 4); this.aVel.addUpdateRange(0, this.n * 3);
  }
}
