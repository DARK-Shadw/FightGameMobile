// Creature library: minions, titans, forms (caster transformations) and
// critters (polymorph) for all 16 essences.
//
//   buildCreature(role, essenceId, opts) → {
//     group,            THREE.Group, creature standing at the origin facing +Z
//     height, radius,   meters (for HP bars, hit circles, camera framing)
//     role, essence, name,
//     update(dt, state) state = { speed: 0..1, action: null | { kind: 'attack'|'spawn'|'hit'|'death', t, dur }, time }
//                       the caller advances action.t; a 'death' ends fully dissolved at t = dur (then remove it)
//     dispose()         frees this instance's materials (geometry stays cached)
//     stats             { verts, tris, ms, cell } of the cached bake
//   }
//   opts: { cell (override mesh resolution), seed (0..1, desyncs idle motion) }
//   bakeCreature(role, essenceId) pre-bakes into the cache (e.g. on a loading screen).
//   CREATURE_ROLES[role][essenceId] → display name.
//
// A handful of archetype generators (imp, spirit, quadruped, bird, dragon,
// serpent, giant, kraken, critters) are dressed per essence. Meshes are baked
// once per (role, essence) and cached; every instance gets its own skeleton,
// materials and face uniforms so flashes, dissolves and blinks are per-instance.

import * as THREE from 'three';
import { ESSENCES, ESSENCE_IDS } from '../../../prototypes/skill-forge/data-essences.js';
import { S } from '../engine/sdf.js';
import { meshFast as meshSDF } from './creature-mesher.js';
import { buildSkeleton, geometryFrom } from '../engine/rig.js';
import { toonMaterial, outlineMaterial } from '../engine/toon.js';
import { buildFace } from '../engine/face.js';
import { PAL, clamp01, smooth, lerp } from './creature-kit.js';
import { sculptImp, poseImp } from './creature-imp.js';
import { sculptSpirit, poseSpirit } from './creature-spirit.js';
import { sculptQuad, poseQuad } from './creature-quad.js';
import { sculptBird, poseBird } from './creature-bird.js';
import { sculptCritter, poseCritter } from './creature-critters.js';
import { sculptGiant, poseGiant } from './creature-giant.js';
import { sculptDragon, poseDragon } from './creature-dragon.js';
import { sculptSerpent, poseSerpent } from './creature-serpent.js';
import { sculptKraken, poseKraken } from './creature-kraken.js';

export { ESSENCE_IDS };

// ── Registry ─────────────────────────────────────────────────────────────
// role → essence → [archetype, variant, display name]
const REG = {
  minion: {
    fire: ['imp', 'fire', 'Fire Imp'],
    shadow: ['imp', 'shadow', 'Shade'],
    blood: ['imp', 'blood', 'Blood Thrall'],
    mind: ['imp', 'mind', 'Phantasm'],
    void: ['imp', 'void', 'Hollow'],
    life: ['imp', 'life', 'Sproutling'],
    death: ['imp', 'death', 'Skeleton'],
    stone: ['imp', 'stone', 'Rock Golem'],
    time: ['imp', 'time', 'Past Echo'],
    storm: ['spirit', 'storm', 'Storm Sprite'],
    light: ['spirit', 'light', 'Light Wisp'],
    tide: ['spirit', 'tide', 'Water Spirit'],
    space: ['spirit', 'space', 'Starling'],
    beast: ['quad', 'beast', 'Wolf'],
    frost: ['quad', 'frost', 'Ice Wolf'],
    gale: ['bird', 'gale', 'Wind Hawk'],
  },
  titan: {
    fire: ['dragon', 'fire', 'Fire Drake'],
    frost: ['dragon', 'frost', 'Frost Wyrm'],
    death: ['dragon', 'death', 'Bone Dragon'],
    storm: ['bird', 'storm', 'Thunderbird'],
    gale: ['bird', 'gale', 'Roc'],
    tide: ['kraken', 'tide', 'Kraken'],
    mind: ['serpent', 'mind', 'Dream Leviathan'],
    space: ['serpent', 'space', 'Star Serpent'],
    beast: ['quad', 'direBear', 'Dire Bear'],
    shadow: ['quad', 'nightmare', 'Nightmare'],
    stone: ['giant', 'colossus', 'Stone Colossus'],
    light: ['giant', 'seraph', 'Seraph'],
    life: ['giant', 'treant', 'Ancient Treant'],
    blood: ['giant', 'bloodHorror', 'Blood Horror'],
    time: ['giant', 'futureSelf', 'Future Self'],
    void: ['giant', 'nullAvatar', 'Unmaker'],
  },
  form: {
    fire: ['dragon', 'fire', 'Dragon'],
    frost: ['giant', 'frostGiant', 'Frost Giant'],
    storm: ['giant', 'thunderTitan', 'Thunder Titan'],
    tide: ['serpent', 'tide', 'Leviathan'],
    gale: ['bird', 'gale', 'Storm Roc'],
    beast: ['quad', 'primal', 'Primal Beast'],
    stone: ['giant', 'colossus', 'Colossus'],
    light: ['giant', 'seraph', 'Seraph'],
    shadow: ['giant', 'wraith', 'Wraith'],
    life: ['giant', 'treant', 'Treant'],
    death: ['giant', 'lich', 'Lich'],
    blood: ['giant', 'bloodFiend', 'Blood Fiend'],
    mind: ['giant', 'psion', 'Psion'],
    time: ['giant', 'chrono', 'Chrono Avatar'],
    space: ['giant', 'voidWalker', 'Void Walker'],
    void: ['giant', 'nullAvatar', 'Null Avatar'],
  },
  critter: {
    fire: ['critter', 'fire', 'Ember Newt'],
    frost: ['critter', 'frost', 'Penguin'],
    storm: ['critter', 'storm', 'Sparking Hedgehog'],
    stone: ['critter', 'stone', 'Stone Statue'],
    tide: ['critter', 'tide', 'Frog'],
    gale: ['critter', 'gale', 'Dandelion Puff'],
    light: ['critter', 'light', 'Harmless Moth'],
    shadow: ['critter', 'shadow', 'Bat'],
    life: ['critter', 'life', 'Sapling'],
    death: ['critter', 'death', 'Skeleton Rat'],
    blood: ['critter', 'blood', 'Mosquito'],
    mind: ['critter', 'mind', 'Confused Sheep'],
    time: ['critter', 'time', 'Snail'],
    space: ['critter', 'space', 'Floating Jellyfish'],
    beast: ['critter', 'beast', 'Chicken'],
    void: ['critter', 'void', 'Small Grey Cube'],
  },
};

const ARCH = {
  imp: { sculpt: sculptImp, pose: poseImp, gait: [5.5, 11] },
  spirit: { sculpt: sculptSpirit, pose: poseSpirit, gait: [3, 6] },
  quad: { sculpt: sculptQuad, pose: poseQuad, gait: [6, 12] },
  bird: { sculpt: sculptBird, pose: poseBird, gait: [3, 5] },
  critter: { sculpt: sculptCritter, pose: poseCritter, gait: [7, 13] },
  giant: { sculpt: sculptGiant, pose: poseGiant, gait: [3.2, 6.5] },
  dragon: { sculpt: sculptDragon, pose: poseDragon, gait: [3, 6] },
  serpent: { sculpt: sculptSerpent, pose: poseSerpent, gait: [2, 4] },
  kraken: { sculpt: sculptKraken, pose: poseKraken, gait: [1, 2] },
};

export const CREATURE_ROLES = Object.fromEntries(Object.entries(REG).map(([role, m]) => [role, Object.fromEntries(Object.entries(m).map(([e, r]) => [e, r[2]]))]));

// ── Baking (cached per role/essence) ────────────────────────────────────
const CACHE = new Map();
const TRIVIAL = S.sphere([0, 0, 0], 1);

function bake(role, essence, opts) {
  const t0 = performance.now();
  const entry = REG[role]?.[essence];
  if (!entry) throw new Error(`no creature for ${role}/${essence}`);
  const [arch, variant, name] = entry;
  const A = ARCH[arch];
  const def = A.sculpt({ role, essence, variant, pal: PAL[essence], ess: ESSENCES[essence], name });
  const names = Object.keys(def.spec);
  const cell = opts.cell ?? def.cell;
  const meshOpts = { cell, aoStep: def.aoStep ?? cell * 1.3, tau: def.tau ?? cell * 1.4 };
  const m = meshSDF(def.sdf, { ...meshOpts, bones: names });
  const geo = geometryFrom(m);
  let verts = m.stats.verts;
  const parts = (def.parts || []).map(p => {
    const mm = meshSDF(p.sdf, { ...meshOpts, cell: p.cell ?? cell, bones: names });
    verts += mm.stats.verts;
    return { geo: geometryFrom(mm), ghost: p.ghost };
  });
  const props = (def.props || []).map(p => {
    const mm = meshSDF(p.sdf, { ...meshOpts, cell: p.cell ?? cell });
    verts += mm.stats.verts;
    const g = geometryFrom(mm);
    const bp = def.spec[p.bone].pos;
    const pv = p.pivot ?? bp;
    g.translate(-pv[0], -pv[1], -pv[2]);
    return { geo: g, bone: p.bone, spin: p.spin, spinZ: p.spinZ, offset: [pv[0] - bp[0], pv[1] - bp[1], pv[2] - bp[2]], ghost: p.ghost, outline: p.outline };
  });
  let face = null;
  if (def.face) {
    const bone = def.face.bone ?? 'head';
    const dummy = new THREE.Object3D();
    const f = buildFace(def.face.sdf, dummy, def.spec[bone].pos, def.face.features);
    const hp = def.spec[bone].pos;
    face = { bone, parts: f.meshes.map((mesh, i) => ({ geo: sanitizeDecal(mesh.geometry, def.face.features[i], hp), feature: def.face.features[i] })) };
    f.meshes.forEach(mm => mm.material.dispose());
  }
  const ms = performance.now() - t0;
  return { role, essence, name, arch, A, def, geo, parts, props, face, stats: { verts, tris: m.stats.tris, ms: Math.round(ms), cell } };
}

// A decal ray that misses the head marches off to infinity; collapse such
// vertices onto the patch center (they sit outside the drawn feature anyway).
function sanitizeDecal(geo, f, headPos) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array;
  const cx = f.center[0] - headPos[0], cy = f.center[1] - headPos[1], cz = f.center[2] - headPos[2];
  const lim = Math.max(f.size[0], f.size[1]) * 1.5 + 0.02;
  const dl = Math.hypot(f.dir[0], f.dir[1], f.dir[2]) || 1;
  let bad = 0;
  for (let i = 0; i < p.length; i += 3) {
    const d = Math.hypot(p[i] - cx, p[i + 1] - cy, p[i + 2] - cz);
    const nl = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (!(d < lim) || !(nl > 0.5)) {
      p[i] = cx; p[i + 1] = cy; p[i + 2] = cz;
      n[i] = f.dir[0] / dl; n[i + 1] = f.dir[1] / dl; n[i + 2] = f.dir[2] / dl;
      bad++;
    }
  }
  if (bad) { geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true; geo.computeBoundingSphere(); }
  return geo;
}

export function bakeCreature(role, essence, opts = {}) {
  const key = role + ':' + essence + (opts.cell ? ':' + opts.cell : '');
  let tpl = CACHE.get(key);
  if (!tpl) { tpl = bake(role, essence, opts); CACHE.set(key, tpl); }
  return tpl;
}

// Drops every cached bake and frees its geometry (live instances must be gone).
export function clearCreatureCache() {
  for (const tpl of CACHE.values()) {
    tpl.geo.dispose();
    tpl.parts.forEach(p => p.geo.dispose());
    tpl.props.forEach(p => p.geo.dispose());
    tpl.face?.parts.forEach(p => p.geo.dispose());
  }
  CACHE.clear();
}

// Which archetype generator dresses each creature: role → essence → archetype.
export const CREATURE_ARCHETYPES = Object.fromEntries(Object.entries(REG).map(([role, m]) => [role, Object.fromEntries(Object.entries(m).map(([e, r]) => [e, r[0]]))]));

// A fresh face-decal material (same shader as buildFace) without re-projecting.
function faceMaterial(feature) {
  const f = buildFace(TRIVIAL, new THREE.Object3D(), [0, 0, 0], [{ ...feature, center: [0, 0, 1], dir: [0, 0, 1], res: 1 }]);
  const mesh = f.meshes[0];
  mesh.geometry.dispose();
  return { mat: mesh.material, u: f.u[feature.name] };
}

let SERIAL = 0;

export function buildCreature(role, essence, opts = {}) {
  const tpl = bakeCreature(role, essence, opts);
  const { def } = tpl;
  const rig = buildSkeleton(def.spec);
  const group = new THREE.Group();
  group.name = tpl.name;
  const pivot = new THREE.Group();
  group.add(pivot);
  pivot.add(rig.root);
  const ghost = def.ghost ?? 0;
  const mats = [], outs = [];
  const mkMat = g => {
    const m = toonMaterial({ transparent: g > 0, rim: def.rim ?? 0.55 });
    m.userData.u.uGhost.value = g;
    m.userData.u.uDissolveColor.value.set(def.glow);
    if (g > 0) m.depthWrite = g < 0.5;
    mats.push(m);
    return m;
  };
  const mkOut = g => {
    const o = outlineMaterial({ width: def.outline ?? 0.0024, transparent: true });
    o.userData.base = g > 0 ? 0.3 : 1;
    o.userData.u.uOutlineAlpha.value = o.userData.base;
    o.transparent = g > 0;
    outs.push(o);
    return o;
  };
  const bodyMat = mkMat(ghost), outMat = mkOut(ghost);
  const skinned = (geo, mat, out) => {
    const body = new THREE.SkinnedMesh(geo, mat);
    body.castShadow = ghost < 0.5;
    body.receiveShadow = true;
    body.frustumCulled = false;
    pivot.add(body);
    pivot.updateMatrixWorld(true);
    body.bind(rig.skeleton);
    const ol = new THREE.SkinnedMesh(geo, out);
    ol.frustumCulled = false;
    pivot.add(ol);
    ol.bind(rig.skeleton, body.bindMatrix);
    return { body, ol };
  };
  const meshes = [skinned(tpl.geo, bodyMat, outMat)];
  for (const p of tpl.parts) meshes.push(p.ghost ? skinned(p.geo, mkMat(p.ghost), mkOut(p.ghost)) : skinned(p.geo, bodyMat, outMat));
  const spinners = [];
  for (const p of tpl.props) {
    const mat = p.ghost ? mkMat(p.ghost) : bodyMat;
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.castShadow = !p.ghost;
    const holder = new THREE.Group();
    holder.add(mesh);
    if (p.outline !== false) holder.add(new THREE.Mesh(p.geo, p.ghost ? mkOut(p.ghost) : outMat));
    holder.position.set(p.offset[0], p.offset[1], p.offset[2]);
    rig.bones[p.bone].add(holder);
    if (p.spin || p.spinZ) spinners.push([holder, p.spin ?? 0, p.spinZ ?? 0]);
  }
  const face = { u: {}, mats: [], base: {} };
  if (tpl.face) {
    const hb = rig.bones[tpl.face.bone];
    for (const part of tpl.face.parts) {
      const { mat, u } = faceMaterial(part.feature);
      const mesh = new THREE.Mesh(part.geo, mat);
      mesh.renderOrder = 2;
      mesh.receiveShadow = true;
      hb.add(mesh);
      if (u.uGlow) u.uGlow.value = part.feature.glow ?? def.eyeGlow ?? 0;
      if (ghost > 0) { mat.transparent = true; mat.userData.u.uGhost.value = ghost * 0.6; }
      face.u[part.feature.name] = u;
      face.mats.push(mat);
      face.base[part.feature.name] = Object.fromEntries(Object.entries(u).filter(([, x]) => typeof x.value === 'number').map(([n, x]) => [n, x.value]));
    }
  }
  const inst = {
    group, pivot, rig, meshes, mats, outs, face, spinners, def, tpl,
    role, essence, name: tpl.name, height: def.height, radius: def.radius,
    stats: tpl.stats,
  };
  const anim = new CreatureAnimator(inst, tpl.A, opts.seed ?? (SERIAL++ * 0.618) % 1);
  inst.anim = anim;
  inst.update = (dt, state = {}) => anim.update(dt, state);
  inst.dispose = () => {
    group.removeFromParent();
    for (const m of [...mats, ...outs, ...face.mats]) m.dispose();
  };
  inst.update(0, { speed: 0, action: null });
  return inst;
}

// ── Animation driver ─────────────────────────────────────────────────────
// The archetype's pose function writes target Euler angles per bone (P) and
// a root offset (R); every bone chases its target with a critically damped
// spring (floppy for tails, ears, capes, tentacles). Spawn, hit and death
// overlays (rise/drop/pop, flash, dissolve) are shared by all archetypes.

const LOOSE = /^(tail|ear|cape|tent|hair|mane|fin|antenna|tuft|robe|leaf|rag)/;

class CreatureAnimator {
  constructor(inst, A, seed) {
    this.inst = inst;
    this.A = A;
    this.seed = seed;
    this.t = seed * 17;
    this.ph = seed * Math.PI * 2;
    this.sp = 0;
    this.blinkT = 1 + seed * 3;
    this.blink = 0;
    this.sq = { x: 0, v: 0 };
    this.lastKind = null;
    this.lastT = 0;
    this.lastSpawnK = 0;
    const stiff = inst.def.stiff || {};
    this.ch = [];
    for (const [name, bone] of Object.entries(inst.rig.bones)) {
      if (name === 'root') continue;
      const loose = LOOSE.test(name);
      const k = stiff[name] ?? (loose ? 70 : inst.def.stiffness ?? 300);
      const d = 2 * Math.sqrt(k) * (loose ? 0.45 : 0.85);
      this.ch.push({ name, bone, k, d, x: [0, 0, 0], v: [0, 0, 0] });
    }
    this.mood = {};
  }

  update(dt, st) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    const inst = this.inst, def = inst.def;
    this.t += dt;
    const a = st.action || null;
    const kind = a ? a.kind : null;
    const k = a ? (a.dur > 0 ? clamp01(a.t / a.dur) : 1) : 0;
    if (kind !== this.lastKind || (a && a.t < this.lastT)) this.onAction(kind);
    this.lastKind = kind;
    this.lastT = a ? a.t : 0;
    const target = kind === 'death' ? 0 : clamp01(st.speed ?? 0);
    this.sp += (target - this.sp) * Math.min(1, dt * 7);
    const gait = this.A.gait || [5, 10];
    this.ph += dt * lerp(gait[0], gait[1], this.sp) * (this.sp > 0.01 ? 1 : 0);
    const c = { t: this.t, dt, sp: this.sp, ph: this.ph, kind, k, a, seed: this.seed, def, time: st.time ?? this.t, inst };
    const P = {};
    const R = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sy: 1, s: 1 };
    let mood = this.A.pose(P, R, c) || 'idle';

    // ── shared overlays ──
    const H = def.height;
    let dissolve = 0, flash = 0, emi = 1 + (def.emissivePulse ?? 0) * Math.sin(this.t * 7.3 + this.seed * 9) * Math.sin(this.t * 3.1);
    if (kind === 'spawn') {
      const style = def.spawn ?? 'rise';
      if (style === 'rise') {
        const e = clamp01(k / 0.6);
        R.y -= H * 1.05 * (1 - smooth(e)) ** 1.5;
        R.sy *= 1 + 0.28 * Math.sin(Math.PI * e) * (1 - e * 0.5);
        R.ry += -0.9 * (1 - smooth(e));
        dissolve = 0.75 * (1 - smooth(k / 0.4));
        if (k >= 0.6 && this.lastSpawnK < 0.6) this.kick(0.22);
      } else if (style === 'drop') {
        const e = clamp01(k / 0.42);
        R.y += H * 2.6 * (1 - e * e);
        R.sy *= 1 + 0.3 * (e < 1 ? e * e : 0);
        dissolve = 0.6 * (1 - smooth(k / 0.3));
        if (k >= 0.42 && this.lastSpawnK < 0.42) this.kick(0.35);
      } else {
        // pop: scale in with overshoot and a spin
        const e = clamp01(k / 0.55);
        const back = 1 + 2.2 * (e - 1) ** 3 + 1.2 * (e - 1) ** 2;
        R.s *= Math.max(0.001, back);
        R.ry += -Math.PI * 1.5 * (1 - smooth(e));
        R.y += H * 0.3 * (1 - smooth(e));
      }
      this.lastSpawnK = k;
      emi += 0.8 * (1 - smooth(k / 0.7));
    } else this.lastSpawnK = 0;
    if (kind === 'hit') {
      flash = 0.85 * (1 - smooth(k / 0.35));
      const env = Math.sin(Math.PI * clamp01(k / 0.5)) * (1 - smooth((k - 0.4) / 0.6));
      R.rx -= 0.28 * env * (def.hitLean ?? 1);
      R.z -= 0.06 * H * env;
    }
    if (kind === 'death') {
      const d = clamp01((k - 0.42) / 0.58);
      dissolve = Math.max(dissolve, smooth(d) * 1.02);
      R.s *= 1 - 0.18 * smooth(d);
      emi += 1.2 * d;
      flash = Math.max(flash, 0.6 * (1 - smooth(k / 0.15)));
    }

    // ── bones ──
    for (const ch of this.ch) {
      const tg = P[ch.name];
      const tx = tg ? tg[0] : 0, ty = tg ? tg[1] : 0, tz = tg ? tg[2] : 0;
      const n = Math.max(1, Math.ceil(dt * 100));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        ch.v[0] += (ch.k * (tx - ch.x[0]) - ch.d * ch.v[0]) * h; ch.x[0] += ch.v[0] * h;
        ch.v[1] += (ch.k * (ty - ch.x[1]) - ch.d * ch.v[1]) * h; ch.x[1] += ch.v[1] * h;
        ch.v[2] += (ch.k * (tz - ch.x[2]) - ch.d * ch.v[2]) * h; ch.x[2] += ch.v[2] * h;
      }
      if (dt === 0) { ch.x = [tx, ty, tz]; ch.v = [0, 0, 0]; }
      ch.bone.rotation.set(ch.x[0], ch.x[1], ch.x[2]);
      if (tg && tg.length > 3) ch.bone.position.set(ch.bone.userData.rest.x + tg[3], ch.bone.userData.rest.y + tg[4], ch.bone.userData.rest.z + tg[5]);
    }
    // squash spring (kicked by landings and impacts)
    const n = Math.max(1, Math.ceil(dt * 100)), h = dt / n;
    for (let i = 0; i < n; i++) { this.sq.v += (380 * -this.sq.x - 26 * this.sq.v) * h; this.sq.x += this.sq.v * h; }
    const sq = Math.max(-0.35, Math.min(0.35, this.sq.x));
    const sy = R.sy * (1 - sq);
    const sxz = 1 / Math.sqrt(Math.max(0.2, sy));
    const pv = inst.pivot;
    pv.position.set(R.x, R.y, R.z);
    pv.rotation.set(R.rx, R.ry, R.rz);
    pv.scale.set(R.s * sxz, R.s * sy, R.s * sxz);
    for (const [holder, spin, spinZ] of inst.spinners) { holder.rotation.y += spin * dt; holder.rotation.z += spinZ * dt; }

    // ── materials ──
    emi *= R.emi ?? 1;
    const baseEmi = def.emissive ?? 2.2;
    for (const m of inst.mats) {
      const u = m.userData.u;
      u.uFlash.value = flash;
      u.uDissolve.value = dissolve;
      u.uEmissive.value = baseEmi * emi;
    }
    for (const m of inst.face.mats) m.userData.u.uDissolve.value = dissolve;
    const hideOutline = dissolve > 0.01;
    for (const o of inst.outs) {
      o.userData.u.uOutlineAlpha.value = hideOutline ? 0 : o.userData.base;
      o.visible = !hideOutline;
    }
    this.updateFace(dt, mood);
  }

  onAction(kind) {
    if (kind === 'hit') this.kick(0.18);
    if (kind === 'attack') this.kick(-0.08);
  }

  kick(v) { this.sq.v += v * 8; }

  updateFace(dt, mood) {
    const f = this.inst.face;
    if (!f.mats.length) return;
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = 1.6 + Math.random() * 3; }
    let bl = 0;
    if (this.blink > 0) { this.blink -= dt; bl = Math.sin(clamp01(1 - this.blink / 0.13) * Math.PI); }
    const M = MOODS[mood] || MOODS.idle;
    const r = Math.min(1, dt * 14) || 1;
    const go = (u, key, v) => { if (u[key]) u[key].value += (v - u[key].value) * r; };
    for (const e of ['eyeL', 'eyeR', 'eyeC']) {
      const u = f.u[e];
      if (!u) continue;
      const b = f.base[e];
      go(u, 'uAngry', clamp01(b.uAngry + M.angry));
      go(u, 'uHappy', M.happy);
      go(u, 'uSad', M.sad);
      u.uBlink.value = Math.max(bl * (this.inst.def.noBlink ? 0 : 1), M.closed);
      if (this.inst.def.derp) u.uLook.value.set(e === 'eyeL' ? 0.7 * Math.sin(this.t * 1.3) : -0.7 * Math.sin(this.t * 0.9 + 1), e === 'eyeL' ? 0.5 * Math.cos(this.t * 1.7) : 0.5 * Math.sin(this.t * 1.1));
      else u.uLook.value.set(0.25 * Math.sin(this.t * 0.37 + this.seed * 5), 0.1 * Math.sin(this.t * 0.23));
    }
    for (const e of ['browL', 'browR']) {
      const u = f.u[e];
      if (!u) continue;
      const b = f.base[e];
      go(u, 'uAngle', b.uAngle + M.brow);
      go(u, 'uRaise', b.uRaise + M.raise);
    }
    const m = f.u.mouth;
    if (m) {
      const b = f.base.mouth;
      go(m, 'uOpen', Math.max(0, b.uOpen + M.open));
      go(m, 'uSmile', b.uSmile + M.smile);
      go(m, 'uFrown', M.frown);
    }
  }
}

const MOODS = {
  idle: { angry: 0, happy: 0, sad: 0, closed: 0, brow: 0, raise: 0, open: 0, smile: 0, frown: 0 },
  fierce: { angry: 0.8, happy: 0, sad: 0, closed: 0, brow: 0.5, raise: -0.1, open: 0.55, smile: -0.5, frown: 0.1 },
  hurt: { angry: 0, happy: 0, sad: 1, closed: 0.55, brow: -1.0, raise: 0.12, open: 0.3, smile: -1.2, frown: 1.0 },
  ko: { angry: 0, happy: 0, sad: 1, closed: 1, brow: -1.0, raise: 0.1, open: 0.1, smile: -1.2, frown: 1 },
  happy: { angry: -1, happy: 1, sad: 0, closed: 1, brow: -0.3, raise: 0.1, open: 0.35, smile: 0.4, frown: 0 },
};
