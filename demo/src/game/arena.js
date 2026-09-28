// The arena: a tile map rendered by one ground shader (checkered grass,
// organic path edges, an animated pond, contact shadows at walls) plus
// instanced sculpted props, swaying bushes, grass and flowers.

import * as THREE from 'three';
import { meshSDF } from '../art/creature-mesher.js';
import { geometryFrom } from '../engine/rig.js';
import { toonMaterial, outlineMaterial, SHARED } from '../engine/toon.js';
import { stoneBlock, crate, barrel, runestone, bush, rock, tree, fence, mushroom } from '../art/props.js';

// Legend: . grass  : path  # stone wall  C crate  O barrel  R runestone  B bush  W water
// Authored as the top-left quarter; mirrored left/right and top/bottom.
const QUARTER = [
  'BB.....##..',
  'BB..C......',
  '....C..BBB:',
  '.O.....BBB:',
  '##.R......:',
  '#....###..:',
  '..B.......:',
  '..BB...C..:',
  ':::::::::.W',
  '....#...WWW',
  'BB..#..WWWW',
];
const mirrorRow = r => r + r.split('').reverse().join('');
const TOP = QUARTER.map(mirrorRow);
export const LAYOUT = [...TOP, ...TOP.slice().reverse()];

const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

const GROUND_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec2 uMapOrigin;
uniform float uMapSize;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
}
vec3 groundColor(vec3 wp, out float waterMask, out float sparkle) {
  vec2 tp = wp.xz - uMapOrigin;
  vec2 tile = floor(tp);
  vec2 f = fract(tp);
  vec4 m = texture2D(uMap, tp / uMapSize);            // bilinear: smooth masks
  float inside = step(0.0, tp.x) * step(0.0, tp.y) * step(tp.x, uMapSize) * step(tp.y, uMapSize);
  float path = smoothstep(0.42, 0.62, m.r + (gNoise(wp.xz * 3.1) - 0.5) * 0.18);
  float water = smoothstep(0.47, 0.53, m.g + (gNoise(wp.xz * 2.3 + 7.0) - 0.5) * 0.12);
  float wallAO = smoothstep(0.0, 0.55, m.b);
  float bushAO = smoothstep(0.0, 0.6, m.a);

  // grass: two-tone checker, per-tile tint, painterly blotches and strokes
  float chk = mod(tile.x + tile.y, 2.0);
  vec3 g1 = vec3(0.46, 0.8, 0.26), g2 = vec3(0.36, 0.69, 0.2);
  vec3 grass = mix(g1, g2, chk);
  grass *= 0.95 + 0.1 * gHash(tile);
  grass = mix(grass, grass * vec3(1.12, 1.08, 0.8), smoothstep(0.55, 0.8, gNoise(wp.xz * 0.7)) * 0.6);
  grass *= 0.93 + 0.14 * gNoise(vec2(wp.x * 14.0, wp.z * 3.0) + gHash(tile) * 10.0);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  grass *= mix(0.9, 1.0, smoothstep(0.0, 0.04, edge));
  grass += vec3(0.04, 0.05, 0.02) * smoothstep(0.08, 0.02, min(f.x, f.y)) * smoothstep(0.0, 0.02, min(f.x, f.y));
  // outside the arena: deeper, bluer grass
  grass = mix(grass * vec3(0.72, 0.8, 0.72), grass, inside);

  // path: warm sand with pebbles and a darker rim
  vec3 sand = vec3(0.93, 0.8, 0.55) * (0.94 + 0.12 * gNoise(wp.xz * 5.0));
  vec2 pc = floor(wp.xz * 4.0);
  vec2 pf = fract(wp.xz * 4.0) - 0.5;
  float peb = step(0.72, gHash(pc)) * smoothstep(0.26, 0.2, length(pf + (vec2(gHash(pc + 3.1), gHash(pc + 5.7)) - 0.5) * 0.4));
  sand = mix(sand, vec3(0.78, 0.68, 0.52), peb * 0.8);
  float rim = smoothstep(0.35, 0.5, path) * smoothstep(0.75, 0.55, path);
  vec3 col = mix(grass, sand, path);
  col = mix(col, vec3(0.55, 0.45, 0.28), rim * 0.45);

  // pond: deep center, bright shallows, moving caustics and a foam ring
  float depth = smoothstep(0.55, 1.0, m.g);
  vec3 deep = vec3(0.02, 0.3, 0.62), shallow = vec3(0.12, 0.72, 0.86);
  vec3 wcol = mix(shallow, deep, depth);
  wcol *= mix(0.72, 1.0, smoothstep(0.52, 0.7, m.g));   // shade under the rim stones
  float t = uTime;
  float c1 = gNoise(wp.xz * 2.2 + vec2(t * 0.35, t * 0.2));
  float c2 = gNoise(wp.xz * 2.6 - vec2(t * 0.25, -t * 0.3) + 4.0);
  float caust = smoothstep(0.62, 0.72, 1.0 - abs(c1 - c2) * 3.0);
  wcol += vec3(0.35, 0.55, 0.6) * caust * 0.32;
  float foam = smoothstep(0.47, 0.55, m.g) * smoothstep(0.7, 0.56, m.g + 0.05 * sin(t * 2.0 + wp.x * 3.0 + wp.z * 2.0));
  wcol = mix(wcol, vec3(0.92, 0.98, 1.0), foam * 0.85);
  sparkle = step(0.985, gHash(floor(wp.xz * 9.0) + floor(t * 3.0))) * (1.0 - foam) * water;
  col = mix(col, wcol, water);
  // wet bank around the pond
  float bank = smoothstep(0.2, 0.46, m.g) * (1.0 - water);
  col = mix(col, col * vec3(0.62, 0.66, 0.6), bank * 0.6);
  waterMask = water;

  // contact shadows at walls and bushes
  col *= 1.0 - wallAO * 0.32 * (1.0 - water);
  col *= 1.0 - bushAO * 0.18;
  return col;
}
`;

export function buildGround(size = 70) {
  const W = LAYOUT[0].length, H = LAYOUT.length;
  const N = Math.max(W, H) + 2; // one tile of margin all around
  const data = new Uint8Array(N * N * 4);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = LAYOUT[r][c];
    const i = ((r + 1) * N + (c + 1)) * 4;
    data[i] = ch === ':' ? 255 : 0;
    data[i + 1] = ch === 'W' ? 255 : 0;
    data[i + 2] = '#COR'.includes(ch) ? 255 : 0;
    data[i + 3] = ch === 'B' ? 255 : 0;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // tile (c, r) covers world x ∈ [c - W/2, c - W/2 + 1], z ∈ [r - H/2, ...]
  const origin = new THREE.Vector2(-W / 2 - 1, -H / 2 - 1);
  const mat = toonMaterial({
    vertexColors: false,
    rim: 0,
    spec: 0,
    hooks: {
      key: 'ground',
      uniforms: { uMap: { value: tex }, uMapOrigin: { value: origin }, uMapSize: { value: N } },
      fragPars: GROUND_FRAG,
      fragColor: 'float gWater; float gSpark; diffuseColor.rgb = groundColor(vWorldPos, gWater, gSpark);',
    },
  });
  // water sparkles glow: patch emissive in after lighting
  mat.userData.u.uEmissive.value = 0;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, map: tex, W, H };
}

// ── Instanced sculpted props ─────────────────────────────────────────────
function propGeometry(sdf, cell) {
  return geometryFrom(meshSDF(sdf, { cell, aoStep: cell * 1.6, aoStrength: 1.1 }));
}

// Instanced props, split into spatial chunks so the camera and the shadow
// map can cull what is off screen.
const CHUNK = 8.5;
function instanced(geo, matrices, opts = {}) {
  const mat = opts.material || toonMaterial({ rim: opts.rim ?? 0.35, hooks: opts.hooks });
  const olMat = opts.outline !== false ? outlineMaterial({ width: opts.outlineWidth ?? 0.0016 }) : null;
  const chunks = new Map();
  const p = new THREE.Vector3();
  for (const m of matrices) {
    p.setFromMatrixPosition(m);
    const key = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(m);
  }
  const group = new THREE.Group();
  for (const list of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    if (olMat) {
      const ol = new THREE.InstancedMesh(geo, olMat, list.length);
      list.forEach((m, i) => ol.setMatrixAt(i, m));
      ol.computeBoundingSphere();
      group.add(ol);
    }
  }
  return group;
}

const SWAY = /* glsl */`
#ifdef USE_INSTANCING
  vec3 iPos = instanceMatrix[3].xyz;
#else
  vec3 iPos = vec3(0.0);
#endif
  float swayH = max(transformed.y, 0.0);
  float ph = uTime * 1.7 + iPos.x * 0.7 + iPos.z * 0.9;
  transformed.x += sin(ph) * swayH * swayH * SWAY_AMT;
  transformed.z += cos(ph * 0.8) * swayH * swayH * SWAY_AMT * 0.6;
`;

function mat4(x, z, rot = 0, s = 1, y = 0) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));
  return m;
}

// Grass tuft: a few curved blades, dark at the base and bright at the tip.
function tuftGeometry() {
  const pos = [], col = [], idx = [];
  const blades = 6;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const r = 0.04 + 0.03 * (b % 3);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = 0.14 + 0.08 * ((b * 37) % 5) / 5;
    const lean = [Math.cos(a) * 0.06, Math.sin(a) * 0.06];
    const w = 0.028;
    const base = pos.length / 3;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + lean[0] * 0.5 - px * 0.5, h * 0.55, bz + lean[1] * 0.5 - pz * 0.5,
      bx + lean[0] * 0.5 + px * 0.5, h * 0.55, bz + lean[1] * 0.5 + pz * 0.5, bx + lean[0], h, bz + lean[1]);
    const dark = [0.18, 0.42, 0.12], mid = [0.36, 0.66, 0.2], tip = [0.72, 0.9, 0.4];
    col.push(...dark, ...dark, ...mid, ...mid, ...tip);
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // blades are thin: light them as if they face up
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  n.needsUpdate = true;
  return g;
}

function flowerGeometry() {
  // a daisy seen from above: rounded petals around a small golden center,
  // petals cupped slightly upward, plus a stem and two leaves
  const pos = [], col = [], idx = [];
  const petals = 7, H = 0.16;
  const tri = (a, b, c) => idx.push(a, b, c);
  const v = (p, c) => { pos.push(...p); col.push(...c); return pos.length / 3 - 1; };
  const center = v([0, H + 0.012, 0], [1, 0.78, 0.18]);
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
    const p0 = v([Math.cos(a0) * 0.028, H + 0.008, Math.sin(a0) * 0.028], [0.95, 0.62, 0.1]);
    const p1 = v([Math.cos(a1) * 0.028, H + 0.008, Math.sin(a1) * 0.028], [0.95, 0.62, 0.1]);
    tri(center, p1, p0);
  }
  for (let p = 0; p < petals; p++) {
    const a = (p / petals) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const at = (along, side, y) => [ca * along - sa * side, H + y, sa * along + ca * side];
    const shade = [0.86, 0.86, 0.9], lit = [1, 1, 1];
    const b = v(at(0.02, 0, 0), shade);
    const l1 = v(at(0.055, -0.026, 0.006), lit), r1 = v(at(0.055, 0.026, 0.006), lit);
    const l2 = v(at(0.095, -0.022, 0.016), lit), r2 = v(at(0.095, 0.022, 0.016), lit);
    const tip = v(at(0.118, 0, 0.022), lit);
    tri(b, l1, r1); tri(l1, l2, r2); tri(l1, r2, r1); tri(l2, tip, r2);
  }
  // stem and leaves
  const g0 = [0.22, 0.5, 0.18], g1 = [0.35, 0.68, 0.26];
  const s0 = v([-0.007, 0, 0], g0), s1 = v([0.007, 0, 0], g0), s2 = v([0, H, 0], g1);
  tri(s0, s1, s2);
  for (const side of [-1, 1]) {
    const a = v([0, 0.03, 0], g0), b = v([side * 0.07, 0.06, 0.02], g1), c = v([side * 0.03, 0.08, -0.01], g1);
    tri(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const nrm = new Float32Array(pos.length).fill(0);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const surf = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < surf.length; i += 2) { surf[i] = 0.1; surf[i + 1] = 0; }
  g.setAttribute('surf', new THREE.BufferAttribute(surf, 2));
  return g;
}

// Builds everything; `onProgress(label)` lets a loading screen follow along.
export async function buildArena(scene, onProgress = () => {}) {
  const arena = { walls: [], bushes: [], water: [], group: new THREE.Group(), W: LAYOUT[0].length, H: LAYOUT.length };
  const W = arena.W, H = arena.H;
  const tileX = c => c - W / 2 + 0.5, tileZ = r => r - H / 2 + 0.5;
  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  const ground = buildGround();
  arena.group.add(ground.mesh);
  arena.ground = ground;

  onProgress('Carving stone'); await yieldUI();
  const blockGeos = [0, 1, 2].map(s => propGeometry(stoneBlock(s + 1), 0.05));
  onProgress('Building crates'); await yieldUI();
  const crateGeo = propGeometry(crate(1), 0.045);
  const barrelGeo = propGeometry(barrel(), 0.04);
  onProgress('Engraving runes'); await yieldUI();
  const runeGeo = propGeometry(runestone(2), 0.042);
  onProgress('Growing bushes'); await yieldUI();
  const bushGeos = [0, 1].map(s => propGeometry(bush(s + 3, 1.05), 0.058));
  onProgress('Placing rocks and trees'); await yieldUI();
  const rockGeos = [0, 1].map(s => propGeometry(rock(s + 5, 1), 0.07));
  const treeGeos = [0, 1].map(s => propGeometry(tree(s + 9, 1.2), 0.13));
  const fenceGeo = propGeometry(fence(), 0.05);
  const mushGeo = propGeometry(mushroom(3), 0.03);

  const blocks = [[], [], []], crates = [], barrels = [], runes = [], bushes = [[], []];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = LAYOUT[r][c];
    const x = tileX(c), z = tileZ(r);
    const h = hash(c, r);
    if (ch === '#') { blocks[Math.floor(h * 3)].push(mat4(x, z, Math.floor(h * 4) * Math.PI / 2, 1)); arena.walls.push({ x, z, hx: 0.5, hz: 0.5, h: 0.62 }); }
    if (ch === 'C') { crates.push(mat4(x, z, (h - 0.5) * 0.12, 1)); arena.walls.push({ x, z, hx: 0.5, hz: 0.5, h: 0.9 }); }
    if (ch === 'O') { barrels.push(mat4(x, z, h * 6, 1.05)); arena.walls.push({ x, z, hx: 0.4, hz: 0.4, h: 0.85, round: true }); }
    if (ch === 'R') { runes.push(mat4(x, z, (h - 0.5) * 0.5, 1)); arena.walls.push({ x, z, hx: 0.35, hz: 0.3, h: 1.4 }); }
    if (ch === 'B') { bushes[Math.floor(h * 2)].push(mat4(x + (h - 0.5) * 0.1, z, h * 6.28, 0.95 + h * 0.2)); arena.bushes.push({ x, z }); }
    if (ch === 'W') arena.water.push({ x, z });
  }
  blocks.forEach((list, i) => list.length && arena.group.add(instanced(blockGeos[i], list)));
  arena.group.add(instanced(crateGeo, crates));
  arena.group.add(instanced(barrelGeo, barrels));
  arena.group.add(instanced(runeGeo, runes, { rim: 0.3 }));
  const bushHooks = { key: 'bush', vertexTransform: SWAY.replace(/SWAY_AMT/g, '0.07') };
  bushes.forEach((list, i) => list.length && arena.group.add(instanced(bushGeos[i], list, { hooks: bushHooks, rim: 0.45 })));

  // Border: fence ring, then rocks and trees outside
  const fences = [];
  for (let c = 0; c < W; c++) { fences.push(mat4(tileX(c), -H / 2 - 0.35, 0)); fences.push(mat4(tileX(c), H / 2 + 0.35, 0)); }
  for (let r = 0; r < H; r++) { fences.push(mat4(-W / 2 - 0.35, tileZ(r), Math.PI / 2)); fences.push(mat4(W / 2 + 0.35, tileZ(r), Math.PI / 2)); }
  arena.group.add(instanced(fenceGeo, fences, { outlineWidth: 0.0012 }));
  const trees = [[], []], rocks = [[], []];
  for (let i = 0; i < 128; i++) {
    const side = i % 4, t = (Math.floor(i / 4) + hash(i, 3)) / 32;
    const along = (t - 0.5) * (W + 8);
    const out = W / 2 + 1.8 + hash(i, 7) * 6;
    const x = side < 2 ? along : (side === 2 ? -out : out);
    const z = side < 2 ? (side === 0 ? -out : out) : along;
    if (hash(i, 11) < 0.75) trees[i % 2].push(mat4(x, z, hash(i, 5) * 6, 0.85 + hash(i, 9) * 0.55));
    else rocks[i % 2].push(mat4(x, z, hash(i, 5) * 6, 1.4 + hash(i, 9) * 1.2));
  }
  trees.forEach((list, i) => list.length && arena.group.add(instanced(treeGeos[i], list, { hooks: { key: 'tree', vertexTransform: SWAY.replace(/SWAY_AMT/g, '0.008') }, outlineWidth: 0.0012 })));
  rocks.forEach((list, i) => list.length && arena.group.add(instanced(rockGeos[i], list)));

  // Pond rim: small flat stones where water meets land; lily pads on the water
  const isWater = (r, c) => r >= 0 && r < H && c >= 0 && c < W && LAYOUT[r][c] === 'W';
  const rimStones = [], pads = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!isWater(r, c)) continue;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      if (isWater(r + dr, c + dc)) continue;
      const n = dr && dc ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const j = hash(r * 7 + k, c * 3 + dr + dc);
        const ox = dc * 0.5 + (dr ? (j - 0.5) * 0.8 : 0), oz = dr * 0.5 + (dc ? (j - 0.5) * 0.8 : 0);
        const m = mat4(tileX(c) + ox, tileZ(r) + oz, j * 6, 0.3 + j * 0.16, -0.03);
        m.multiply(new THREE.Matrix4().makeScale(1.2, 0.55, 1));
        rimStones.push(m);
      }
    }
    if (hash(r + 31, c + 17) < 0.3) pads.push(mat4(tileX(c) + (hash(r, c + 3) - 0.5) * 0.6, tileZ(r) + (hash(r + 3, c) - 0.5) * 0.6, hash(r, c) * 6, 0.8 + hash(c, r) * 0.5, 0.02));
  }
  if (rimStones.length) arena.group.add(instanced(rockGeos[0], rimStones, { outlineWidth: 0.0011 }));
  if (pads.length) {
    const padGeo = new THREE.CircleGeometry(0.22, 18, 0.35, Math.PI * 2 - 0.35);
    padGeo.rotateX(-Math.PI / 2);
    const padMesh = new THREE.InstancedMesh(padGeo, toonMaterial({ vertexColors: false, color: '#4fb34a', rim: 0.2, spec: 0 }), pads.length);
    pads.forEach((m, i) => padMesh.setMatrixAt(i, m));
    padMesh.receiveShadow = true;
    arena.group.add(padMesh);
  }

  // Grass tufts, flowers and mushrooms on open grass
  const tufts = [], flowers = [], flowerCols = [], mush = [];
  const palette = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 0.7, 0.86], [0.8, 0.72, 1], [1, 0.95, 0.6]];
  for (let r = -2; r < H + 2; r++) for (let c = -2; c < W + 2; c++) {
    const inMap = r >= 0 && r < H && c >= 0 && c < W;
    const ch = inMap ? LAYOUT[r][c] : '.';
    if (ch !== '.') continue;
    const n = 1 + Math.floor(hash(c + 0.3, r) * 3);
    for (let k = 0; k < n; k++) {
      const x = tileX(c) + (hash(c * 3 + k, r) - 0.5) * 0.9, z = tileZ(r) + (hash(c, r * 3 + k) - 0.5) * 0.9;
      tufts.push(mat4(x, z, hash(k, c + r) * 6, 0.8 + hash(c, k) * 0.7));
    }
    if (hash(c + 5, r + 9) < 0.18) {
      const x = tileX(c) + (hash(c, r + 1) - 0.5) * 0.7, z = tileZ(r) + (hash(c + 1, r) - 0.5) * 0.7;
      flowers.push(mat4(x, z, hash(c, r) * 6, 0.85 + hash(r, c) * 0.35));
      flowerCols.push(palette[Math.floor(hash(r + 2, c + 7) * palette.length)]);
    }
    if (inMap && hash(c + 13, r + 2) < 0.025) mush.push(mat4(tileX(c) + 0.3, tileZ(r) - 0.2, hash(c, r) * 6, 0.9));
  }
  const tuftMat = toonMaterial({ rim: 0.2, spec: 0, hooks: { key: 'tuft', vertexTransform: SWAY.replace(/SWAY_AMT/g, '1.4') } });
  const tuftMesh = new THREE.InstancedMesh(tuftGeometry(), tuftMat, tufts.length);
  tufts.forEach((m, i) => tuftMesh.setMatrixAt(i, m));
  tuftMesh.receiveShadow = true;
  arena.group.add(tuftMesh);
  const flowerMesh = new THREE.InstancedMesh(flowerGeometry(), toonMaterial({ rim: 0.1, spec: 0 }), flowers.length);
  flowers.forEach((m, i) => { flowerMesh.setMatrixAt(i, m); flowerMesh.setColorAt(i, new THREE.Color(...flowerCols[i])); });
  flowerMesh.receiveShadow = true;
  arena.group.add(flowerMesh);
  if (mush.length) arena.group.add(instanced(mushGeo, mush, { outlineWidth: 0.0012 }));

  scene.add(arena.group);
  arena.stats = { tufts: tufts.length, flowers: flowers.length };
  return arena;
}
