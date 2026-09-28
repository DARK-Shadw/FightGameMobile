// Faces as procedural decals.
//
// Each feature (eye, brow, mouth) is a small patch projected exactly onto
// the sculpted head, then drawn by a shader: crisp at any size, lit by the
// same toon model as the skin, and fully animatable (look, blink, anger,
// smile, shout) through uniforms.

import * as THREE from 'three';
import { compile } from './sdf.js';
import { toonMaterial } from './toon.js';

const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

function gradient(D, p, e = 0.002) {
  return V.norm([
    D(p[0] + e, p[1], p[2]) - D(p[0] - e, p[1], p[2]),
    D(p[0], p[1] + e, p[2]) - D(p[0], p[1] - e, p[2]),
    D(p[0], p[1], p[2] + e) - D(p[0], p[1], p[2] - e),
  ]);
}

// Grid patch shot along -dir onto the surface, lifted slightly off it.
export function projectPatch(D, center, dir, up, w, h, res = 12, lift = 0.0028) {
  const n = V.norm(dir);
  const t = V.norm(V.cross(up, n));
  const b = V.cross(n, t);
  const pos = [], nor = [], uv = [];
  for (let j = 0; j <= res; j++) for (let i = 0; i <= res; i++) {
    const u = (i / res) * 2 - 1, v = (j / res) * 2 - 1;
    let p = V.add(V.add(center, V.mul(t, u * w * 0.5)), V.mul(b, v * h * 0.5));
    p = V.add(p, V.mul(n, 0.12));
    // march back along -n to the surface
    let s = 0;
    for (let k = 0; k < 64; k++) {
      const q = V.sub(p, V.mul(n, s));
      const d = D(q[0], q[1], q[2]);
      if (Math.abs(d) < 1e-5) break;
      s += d * 0.9;
    }
    const q = V.sub(p, V.mul(n, s));
    const g = gradient(D, q);
    const f = V.add(q, V.mul(g, lift));
    pos.push(...f);
    nor.push(...g);
    uv.push(u, v);
  }
  const idx = [];
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const a = j * (res + 1) + i, b2 = a + 1, c = a + res + 1, d = c + 1;
    idx.push(a, b2, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('dUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const COMMON = /* glsl */`
varying vec2 vDUv;
uniform vec3 uInk;
float aa(float d) { return clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0); }
`;

const EYE = /* glsl */`
uniform vec2 uLook;
uniform float uBlink, uLidRest, uAngry, uSad, uHappy, uSide, uIrisSize, uPupilSize, uGlow;
uniform vec3 uIris, uIris2, uSclera;
void drawFeature(inout vec4 dc) {
  vec2 p = vDUv;
  float inner = -p.x * uSide;                 // +1 toward the nose
  vec2 q = p; q.y *= 1.0 + 0.1 * q.y;         // slightly egg-shaped
  float r = length(q);
  // lids: top comes down with blink and anger, bottom rises with a smile
  float top = mix(1.0 - uLidRest * 2.0, -0.15, uBlink) - uAngry * max(inner + 0.2, 0.0) * 0.55 + uSad * max(-inner + 0.2, 0.0) * 0.45;
  float bottom = -1.2 + uHappy * 0.9 + uBlink * 1.0;
  float lidCurve = top - 0.12 * p.x * p.x;
  float closed = step(lidCurve, bottom + 0.05);
  // shape masks
  float inEye = aa(r - 1.0);
  float below = aa(p.y - lidCurve);
  float underBottom = aa(p.y - bottom);
  float mask = inEye * below * (1.0 - underBottom);
  float lashBand = aa(abs(p.y - lidCurve + 0.03) - 0.14) * aa(r - 1.12) * (1.0 - underBottom);
  if (closed > 0.5) {
    // closed or happy eye: just a thick arc
    float y0 = -0.05 + (uHappy > 0.5 ? -0.3 * (1.0 - p.x * p.x) : 0.12 * p.x * p.x);
    float arc = aa(abs(p.y - y0) - 0.13) * aa(abs(p.x) - 0.95);
    if (arc < 0.02) discard;
    dc.rgb = uInk;
    return;
  }
  if (max(mask, lashBand) < 0.02) discard;
  vec3 col = uSclera * mix(0.7, 1.0, smoothstep(lidCurve, lidCurve - 0.5, p.y));
  vec2 ic = uLook * 0.38;
  float ir = length((p - ic) * vec2(1.0, 0.92));
  float irisM = aa(ir - uIrisSize);
  vec3 irisCol = mix(uIris2, uIris, smoothstep(uIrisSize * 1.0, uIrisSize * 0.1, ir));
  irisCol = mix(irisCol, irisCol * 1.45 + 0.05, smoothstep(0.1, -0.6, p.y - ic.y) * 0.7);
  col = mix(col, irisCol, irisM);
  col = mix(col, vec3(0.02, 0.015, 0.03), aa(ir - uPupilSize));
  col += uIris * uGlow * irisM * 1.5;
  // highlights
  float h1 = aa(length(p - ic - vec2(-0.2, 0.26)) - 0.2);
  float h2 = aa(length(p - ic - vec2(0.2, -0.22)) - 0.08);
  col = mix(col, vec3(1.0), max(h1, h2 * 0.9));
  // outline ring and lash line
  col = mix(col, uInk, (1.0 - aa(r - 0.84)) * inEye);
  col = mix(col, uInk, lashBand);
  dc.rgb = col;
}
`;

const MOUTH = /* glsl */`
uniform float uOpen, uSmile, uWidth, uAsym, uTeeth, uTongue, uFrown;
uniform vec3 uInside, uTeethCol, uTongueCol;
void drawFeature(inout vec4 dc) {
  vec2 p = vDUv;
  float x = p.x / uWidth;
  float ax = abs(x);
  float curve = (uSmile - uFrown) * (x * x - 0.3) * 0.5 + uAsym * x * 0.2 - 0.05;
  float h = uOpen * 0.6 * sqrt(max(1.0 - ax * ax, 0.0));
  float upper = curve + h * 0.3;
  float lower = curve - h;
  float w = 0.11;
  float mid = (upper + lower) * 0.5, half_ = (upper - lower) * 0.5;
  float dy = abs(p.y - mid) - half_;
  // rounded ends
  float dEnd = ax - 1.0;
  float d = max(dy - w * 0.5, dEnd * uWidth);
  float shape = aa(d);
  if (shape < 0.02) discard;
  vec3 col = uInk;
  float inside = aa(dy + w * 0.35) * aa(dEnd * uWidth + 0.06);
  vec3 in_ = uInside;
  in_ = mix(in_, uTeethCol, uTeeth * aa(-(p.y - (upper - 0.16))) * step(0.001, uOpen));
  in_ = mix(in_, uTongueCol, uTongue * aa(length((p - vec2(0.05 * uAsym, lower + 0.02)) * vec2(0.8, 1.6)) - h * 0.6));
  col = mix(col, in_, inside * step(0.02, uOpen));
  dc.rgb = col;
}
`;

const BROW = /* glsl */`
uniform float uAngle, uRaise, uArch, uThick, uSide;
uniform vec3 uBrowCol;
void drawFeature(inout vec4 dc) {
  vec2 p = vDUv;
  float x = p.x;
  float inner = -x * uSide;
  float y = uRaise + uArch * (1.0 - x * x) * 0.35 - uAngle * inner * 0.45;
  float thick = uThick * mix(1.0, 0.55, smoothstep(-0.6, 1.0, -inner));
  float d = max(abs(p.y - y) - thick, abs(x) - 0.92);
  float shape = aa(d);
  if (shape < 0.02) discard;
  dc.rgb = uBrowCol;
}
`;

const DRAWERS = { eye: EYE, mouth: MOUTH, brow: BROW };

function faceMaterial(kind, uniforms) {
  const mat = toonMaterial({
    vertexColors: false,
    rim: 0.25,
    spec: kind === 'eye' ? 1.0 : 0.4,
    hooks: {
      key: 'face-' + kind,
      uniforms,
      vertexPars: 'attribute vec2 dUv;\nvarying vec2 vDUv;',
      vertexMain: 'vDUv = dUv;',
      fragPars: COMMON + DRAWERS[kind],
      fragColor: 'drawFeature(diffuseColor);',
    },
  });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  return mat;
}

const C = c => new THREE.Color(c);

// features: [{ kind, name, center, dir, up?, size:[w,h], side?, ...look }]
// Returns meshes parented to the head bone and a uniforms map by name.
// `cache` (optional, an object) keeps the projected patches so later
// instances of the same face skip the projection.
export function buildFace(sdfRoot, headBone, headPos, features, cache = null) {
  let D = null;
  const out = { meshes: [], u: {} };
  for (const f of features) {
    let geo = cache?.[f.name];
    if (!geo) {
      D ||= compile(sdfRoot).d;
      geo = projectPatch(D, f.center, f.dir, f.up ?? [0, 1, 0], f.size[0], f.size[1], f.res ?? 12);
      geo.translate(-headPos[0], -headPos[1], -headPos[2]);
      // surf attribute (gloss, emissive) for the toon lighting
      const n = geo.attributes.position.count;
      const surf = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { surf[i * 2] = f.kind === 'eye' ? 0.65 : 0.15; surf[i * 2 + 1] = 0; }
      geo.setAttribute('surf', new THREE.BufferAttribute(surf, 2));
      if (cache) { geo.userData.shared = true; cache[f.name] = geo; }
    }
    const uniforms = { uInk: { value: C(f.ink ?? '#2a1622') } };
    if (f.kind === 'eye') Object.assign(uniforms, {
      uLook: { value: new THREE.Vector2(0, 0) }, uBlink: { value: 0 }, uLidRest: { value: f.lidRest ?? 0.08 },
      uAngry: { value: f.angry ?? 0 }, uSad: { value: 0 }, uHappy: { value: 0 }, uSide: { value: f.side ?? 1 },
      uIrisSize: { value: f.irisSize ?? 0.62 }, uPupilSize: { value: f.pupilSize ?? 0.34 }, uGlow: { value: f.glow ?? 0 },
      uIris: { value: C(f.iris ?? '#6b4226') }, uIris2: { value: C(f.iris2 ?? '#24120a') }, uSclera: { value: C(f.sclera ?? '#ffffff') },
    });
    if (f.kind === 'mouth') Object.assign(uniforms, {
      uOpen: { value: f.open ?? 0.35 }, uSmile: { value: f.smile ?? 0.8 }, uWidth: { value: f.width ?? 0.8 }, uAsym: { value: f.asym ?? 0 },
      uTeeth: { value: 1 }, uTongue: { value: 1 }, uFrown: { value: 0 },
      uInside: { value: C(f.inside ?? '#5a1422') }, uTeethCol: { value: C('#ffffff') }, uTongueCol: { value: C('#ff6f84') },
    });
    if (f.kind === 'brow') Object.assign(uniforms, {
      uAngle: { value: f.angle ?? 0.2 }, uRaise: { value: f.raise ?? 0 }, uArch: { value: f.arch ?? 0.4 },
      uThick: { value: f.thick ?? 0.3 }, uSide: { value: f.side ?? 1 }, uBrowCol: { value: C(f.color ?? '#2a1a14') },
    });
    const mat = faceMaterial(f.kind, uniforms);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    headBone.add(mesh);
    out.meshes.push(mesh);
    out.u[f.name] = uniforms;
  }
  return out;
}
