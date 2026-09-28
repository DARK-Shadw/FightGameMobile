// Opponent brawlers. Same definition format as kai() in heroes.js:
// () => { spec, J, sdf, face: { sdf, features }, height }
//
//   brute — Viking wrestler: horned steel helmet, singlet, championship belt,
//           tattooed boulder arms, taped wrists, fists with gold knuckle-dusters.
//   punk  — agile punk girl: gel-spiked hot-pink twin tails (cloth bones),
//           cropped purple bomber with lime trim, plaid skirt, stompy boots.
//   bot   — capsule robot: teal egg whose lid floats on a glowing hover seam,
//           screen face, springy antenna (cloth bones), claw + blaster, hover boots.
//
// Mesher notes that shaped these sculpts:
//  - Paint borders are softened against the nearest differently-painted leaf by
//    RAW primitive distance, ignoring inter/sub clipping. Any surface that sits
//    inside a clipped or inflated primitive of another paint picks up a 50%
//    tint, so layered clothing shares one region paint function (edges stay
//    anti-aliased) and the enveloped layers are marked hard().
//  - Parts that must not deform (helmet, lid, blaster) are rigid() and grouped.

import { S, P, hex, mixc, alignY, compile } from '../engine/sdf.js';
import { humanoid, hand, hairClump, lerp3, add3, flipX } from './kit.js';

// ── Small helpers ────────────────────────────────────────────────────────
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sideOf = side => (side > 0 ? p => p : flipX);
const sfx = side => (side > 0 ? 'L' : 'R');
// Hard paint edges: the mesher softens paint borders using raw primitive
// distances, so layers under clipped/inflated overlays must opt out or they
// pick up a 50% tint of the overlay everywhere.
const hard = node => { node.leaves().forEach(l => { l._hardEdge = true; }); return node; };

// Point on an ellipsoid surface in direction d (for placing studs/rivets).
function onEllipsoid(c, r, d) {
  const n = norm3(d);
  const t = 1 / Math.hypot(n[0] / r[0], n[1] / r[1], n[2] / r[2]);
  return add3(c, scale3(n, t));
}

// Box whose local Y runs a→b and whose thin local Z faces `normal`.
// Straps, belts and plates that follow a surface.
function strap(a, b, halfW, halfT, normal, round = 0.008) {
  const y = norm3(sub3(b, a));
  let z = sub3(normal, scale3(y, dot3(normal, y)));
  z = norm3(z);
  const x = cross3(y, z);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const box = S.box(lerp3(a, b, 0.5), [halfW, len / 2, halfT], round);
  box.R = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  return box;
}

// Torus whose axis points along `axis` (rings around limbs, collars).
function ring(c, axis, R, r) {
  const t = S.torus(c, R, r);
  t.R = alignY(axis[0], axis[1], axis[2]);
  return t;
}

// Cylinder along `axis` (bolts, hinges, muzzles).
function disc(c, axis, r, h, round = 0.006) {
  const t = S.cyl(c, r, h, round);
  t.R = alignY(axis[0], axis[1], axis[2]);
  return t;
}

// Uniformly scale a finished hero definition (design at a reference size,
// then fit the vertex budget). Paint functions keep sampling design space.
function scaleDef(def, k) {
  const wrapped = new Map();
  const seen = new Set();
  const walk = n => {
    if (seen.has(n)) return;
    seen.add(n);
    delete n._f; delete n._b;
    if (n.t === 'prim') {
      n.c = scale3(n.c, k);
      for (const key of ['r', 'rx', 'ry', 'rz', 'bx', 'by', 'bz', 'r1', 'r2', 'h', 'R', 'rr']) if (key in n.p) n.p[key] *= k;
      if (typeof n._paint === 'function') {
        const f = n._paint;
        if (!wrapped.has(f)) wrapped.set(f, (x, y, z, leaf, nx, ny, nz, cell) => f(x / k, y / k, z / k, leaf, nx, ny, nz, cell / k));
        n._paint = wrapped.get(f);
      }
      return;
    }
    if (n.t === 'deform') {
      const q = n.p;
      if (q.center) q.center = scale3(q.center, k);
      if (n.kind === 'twist' || n.kind === 'bend') q.rate /= k;
      if (n.kind === 'displace') { q.amp *= k; q.freq /= k; }
      if (n.kind === 'round') q.r *= k;
      if (n.kind === 'shell') q.t *= k;
      walk(n.child);
      return;
    }
    n.k *= k;
    n.children.forEach(walk);
  };
  walk(def.sdf);
  walk(def.face.sdf);
  for (const b of Object.values(def.spec)) b.pos = scale3(b.pos, k);
  const J = {};
  for (const [key, v] of Object.entries(def.J)) J[key] = Array.isArray(v) ? scale3(v, k) : v * k;
  const features = def.face.features.map(f => ({ ...f, center: scale3(f.center, k), size: [f.size[0] * k, f.size[1] * k] }));
  return { ...def, J, face: { sdf: def.face.sdf, features }, height: def.height * k };
}

// Tattoo band around a limb axis: a zig-zag tribal stripe with thin rules.
function tattooBand(base, ink, a, b, t0, halfW, teeth = 5) {
  const ax = sub3(b, a);
  const L = Math.hypot(ax[0], ax[1], ax[2]);
  const u = scale3(ax, 1 / L);
  let ref = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm3(sub3(ref, scale3(u, dot3(ref, u))));
  const e2 = cross3(u, e1);
  const B = hex(base), I = hex(ink);
  return (x, y, z, leaf, nx, ny, nz, cell) => {
    const p = [x - a[0], y - a[1], z - a[2]];
    const t = dot3(p, u) / L;
    const ang = Math.atan2(dot3(p, e2), dot3(p, e1));
    const saw = Math.abs(((ang / (2 * Math.PI)) * teeth % 1 + 1) % 1 - 0.5) * 2; // 0..1 triangle
    const e = (cell * 0.8) / L;
    const zig = t - (t0 + (saw - 0.5) * halfW * 1.3);
    const band = sstep(halfW * 0.5 + e, halfW * 0.5 - e, Math.abs(zig));
    const rule = Math.max(sstep(0.018 + e, 0.018 - e, Math.abs(t - (t0 + halfW * 1.25))), sstep(0.018 + e, 0.018 - e, Math.abs(t - (t0 - halfW * 1.25))));
    const m = Math.max(band, rule);
    return { color: mixc(B, I, m * 0.92), gloss: 0.22, emissive: 0 };
  };
}

// ── BRUTE ────────────────────────────────────────────────────────────────
// A walking wall with a championship belt. Tiny legs, a barrel chest, fists
// like anvils with gold knuckle-dusters, and a horned steel helmet.
function brute() {
  const { spec, J } = humanoid({
    hipY: 0.48, chestY: 0.88, neckY: 1.12, headY: 1.18,
    shoulder: [0.37, 1.05, -0.02], elbow: [0.5, 0.81, -0.03], wrist: [0.56, 0.61, 0.03],
    hip: [0.14, 0.45, 0], knee: [0.16, 0.29, 0.03], ankle: [0.17, 0.14, 0],
  });

  // palette: steel blue (dominant), gold (accent), tan skin / ivory / white (neutrals)
  const SKIN = '#e9ab7c';
  const skinP = P(SKIN, 0.22);
  const steel = P('#4f7fc6', 0.14);
  const gold = P('#f7c24a', 0.9), goldDark = P('#c9902e', 0.85);
  const white = P('#f4efe6', 0.14);
  const ivory = (x, y) => ({ color: mixc(hex('#c9a874'), hex('#fdf3dc'), sstep(1.6, 1.78, y)), gloss: 0.45, emissive: 0 });

  // ── Head: small crown, square bulldog jaw, flat boxer's nose ──
  const skinBase = hex(SKIN), blush = hex('#e97d62'), stub = hex('#b8968c');
  const headSkin = (x, y, z) => {
    let c = skinBase;
    const dc = Math.hypot(Math.abs(x) - 0.135, y - 1.37, z - 0.22);
    c = mixc(c, blush, (1 - Math.min(1, dc / 0.07)) ** 2 * 0.5);
    const jaw = sstep(1.33, 1.3, y - 0.6 * x * x) * sstep(0.0, 0.1, z);
    c = mixc(c, stub, jaw * 0.4);
    const dn = Math.hypot(x, y - 1.4, z - 0.3);
    c = mixc(c, blush, (1 - Math.min(1, dn / 0.075)) * 0.45);
    return { color: c, gloss: 0.22, emissive: 0 };
  };
  const skull = S.union(0.055,
    S.ellipsoid([0, 1.5, 0.04], [0.185, 0.18, 0.185]),
    S.ellipsoid([0, 1.415, 0.1], [0.18, 0.12, 0.16]),
    S.box([0, 1.3, 0.11], [0.212, 0.095, 0.155], 0.065),
    S.box([0, 1.262, 0.19], [0.14, 0.055, 0.075], 0.05),
  ).paint(headSkin);
  const browRidge = S.ellipsoid([0, 1.492, 0.2], [0.165, 0.042, 0.065]).paint(headSkin);
  const nose = S.union(0.022,
    S.ellipsoid([0.004, 1.4, 0.27], [0.064, 0.05, 0.05]),
    S.mirror(S.ellipsoid([0.046, 1.386, 0.252], [0.032, 0.032, 0.032])),
  ).paint(headSkin);
  const faceProj = S.union(0.035, skull, browRidge, nose);
  const ears = S.mirror(S.union(0.02,
    S.ellipsoid([0.19, 1.41, 0.04], [0.04, 0.062, 0.05]),
    S.ellipsoid([0.215, 1.43, 0.045], [0.02, 0.032, 0.03]),
  )).paint(headSkin);
  const plaster = S.union(0.004,
    strap([0.112, 1.305, 0.27], [0.185, 1.352, 0.257], 0.022, 0.008, [0.25, 0, 1], 0.008).paint(P('#fff1d8', 0.2)),
    strap([0.137, 1.321, 0.273], [0.16, 1.336, 0.269], 0.016, 0.008, [0.25, 0, 1], 0.006).paint(P('#e6c9a0', 0.2)),
  );

  // ── Horned helmet: steel dome with a gold crest and brim, ivory horns ──
  const HC = [0, 1.52, 0.03], HR = [0.212, 0.2, 0.222];
  const helmPaint = (x, y, z, leaf, nx, ny, nz, cell) => {
    const crest = sstep(0.034 + cell * 0.5, 0.034 - cell * 0.5, Math.abs(x));
    const base = mixc(hex('#3f6db3'), hex('#6f9fe2'), sstep(0.2, 0.95, ny));
    return { color: mixc(base, hex('#f7c24a'), crest), gloss: 0.8 + 0.1 * crest, emissive: 0 };
  };
  const brimCut = () => S.box([0, 1.72, 0.03], [0.4, 0.2, 0.4], 0.02).rot(-0.2, 0, 0);
  const dome = S.union(0.012,
    S.inter(0.015, S.ellipsoid(HC, HR).paint(helmPaint), brimCut()),
    S.inter(0.01, S.ellipsoid(HC, [HR[0] + 0.02, HR[1] + 0.02, HR[2] + 0.02]).paint(helmPaint),
      S.box([0, 1.62, 0.03], [0.03, 0.2, 0.3], 0.02), brimCut()),
  );
  const brim = ring([0, 1.527, 0.035], [0, 0.98, -0.2], 0.222, 0.027).paint(gold);
  const hornPath = [[0.18, 1.59, 0.02], [0.29, 1.625, 0.04], [0.37, 1.69, 0.085], [0.405, 1.775, 0.13]];
  const hornR = [0.068, 0.054, 0.038, 0.01];
  const horn = S.mirror(S.union(0.03, ...[0, 1, 2].map(i => S.limb(hornPath[i], hornPath[i + 1], hornR[i], hornR[i + 1]))).paint(ivory));
  const hornCollar = S.mirror(ring([0.22, 1.605, 0.028], [1, 0.38, 0.18], 0.064, 0.02).paint(gold));
  const head = S.union(0.03,
    hard(faceProj), ears, plaster,
    S.union(0.012, hard(dome), brim, horn, hornCollar),
  ).bone('head').rigid().group('head');
  const neck = S.limb([0, 1.1, 0.02], [0, 1.27, 0.07], 0.12).paint(skinP).bone('neck');

  // ── Torso: barrel chest under a wrestling singlet ──
  // One paint for skin, singlet and side stripes; the cutters that shape the
  // singlet also drive the paint so edges stay crisp but anti-aliased.
  const cutters = () => [
    S.ellipsoid([0, 1.15, 0.3], [0.135, 0.25, 0.22]),
    S.ellipsoid([0, 1.17, -0.3], [0.13, 0.21, 0.2]),
    S.mirror(S.ellipsoid([0.365, 1.07, -0.01], [0.14, 0.22, 0.3])),
  ];
  const cutD = compile(S.union(0, ...cutters())).d;
  const cSkin = hex(SKIN), cSteel = hex('#4f7fc6'), cStripe = hex('#8ab4ef'), cBelly = hex('#5e8fd6');
  const torsoPaint = (x, y, z, leaf, nx, ny, nz, cell) => {
    const e = cell * 0.55;
    const suit = sstep(-0.006 - e, -0.006 + e, cutD(x, y, z));
    const stripe = sstep(0.028 + e, 0.028 - e, Math.abs(Math.abs(x) - 0.285)) * sstep(0.06, 0.0, z) * sstep(0.62, 0.66, y);
    let cloth = mixc(cSteel, cStripe, stripe);
    cloth = mixc(cloth, cBelly, sstep(0.1, 0.25, z) * sstep(1.0, 0.8, y) * sstep(0.64, 0.7, y) * 0.35);
    return { color: mixc(cSkin, cloth, suit), gloss: 0.22 - 0.08 * suit, emissive: 0 };
  };
  const torsoShapes = inf => S.union(0.08,
    S.ellipsoid([0, 0.97, 0.0], [0.36 + inf, 0.25 + inf, 0.235 + inf]).bone('chest'),
    S.ellipsoid([0, 0.73, 0.04], [0.3 + inf, 0.24 + inf, 0.23 + inf]).bone('spine'),
    S.mirror(S.ellipsoid([0.135, 1.0, 0.14], [0.155 + inf, 0.11 + inf, 0.1 + inf]).rot(0, 0, -0.25)).bone('chest'),
    S.mirror(S.ellipsoid([0.16, 1.13, -0.03], [0.165 + inf, 0.08 + inf, 0.13 + inf]).rot(0, 0, 0.45)).bone('chest'),
    S.ellipsoid([0, 0.5, 0.01], [0.25 + inf, 0.12 + inf, 0.2 + inf]).bone('hips'),
  ).paint(torsoPaint);
  const torso = hard(S.union(0.01, torsoShapes(0), S.sub(0.015, torsoShapes(0.014), ...cutters())));

  // ── Championship belt ──
  const beltBase = (inf, paint) => S.union(0.08,
    S.ellipsoid([0, 0.73, 0.04], [0.3 + inf, 0.24 + inf, 0.23 + inf]),
    S.ellipsoid([0, 0.5, 0.01], [0.25 + inf, 0.12 + inf, 0.2 + inf]),
  ).paint(paint);
  const belt = S.union(0.006,
    hard(S.inter(0.008, beltBase(0.032, P('#2a2238', 0.3)), S.box([0, 0.585, 0], [0.5, 0.05, 0.5], 0.012))),
    S.inter(0.01, beltBase(0.06, gold), S.box([0, 0.585, 0.3], [0.13, 0.08, 0.3], 0.04)),
    S.inter(0.01, beltBase(0.052, goldDark), S.mirror(S.box([0.23, 0.585, 0.2], [0.045, 0.048, 0.2], 0.03))),
    S.ellipsoid([0, 0.588, 0.29], [0.058, 0.045, 0.03]).paint(P('#3d6fd0', 0.95)),
    S.ellipsoid([-0.018, 0.604, 0.31], [0.02, 0.013, 0.01]).paint(P('#dcecff', 0.95)),
  ).bone('spine');

  // ── Arms: boulder shoulders, Popeye forearms, taped wrists ──
  const arm = side => {
    const f = sideOf(side), s = sfx(side);
    const sh = f(J.sh), el = f(J.el), wr = f(J.wr);
    const upperPaint = side > 0 ? tattooBand(SKIN, '#2c4a86', sh, el, 0.52, 0.22, 5) : skinP;
    const upper = S.union(0.05,
      S.sphere(sh, 0.148),
      S.limb(sh, el, 0.122, 0.1),
      S.ellipsoid(add3(lerp3(sh, el, 0.48), [0, 0, 0.035]), [0.095, 0.115, 0.09]),
    ).paint(upperPaint).bone('upperArm.' + s);
    const fore = S.union(0.05,
      S.sphere(el, 0.095),
      S.limb(el, lerp3(el, wr, 0.5), 0.1, 0.128),
      S.limb(lerp3(el, wr, 0.5), wr, 0.128, 0.1),
    ).paint(skinP).bone('foreArm.' + s);
    const tape = S.union(0.008,
      S.limb(lerp3(el, wr, 0.8), lerp3(el, wr, 1.1), 0.112, 0.108),
      ring(lerp3(el, wr, 0.88), sub3(wr, el), 0.112, 0.01),
    ).paint(white).bone('foreArm.' + s);
    return S.union(0.03, upper, fore, tape);
  };

  // Fist, palm facing back: knuckles along the bottom-front edge wearing a
  // gold duster, curled fingers on the back, thumb tucked on the inside,
  // tape around the top of the hand.
  const fist = side => {
    const f = sideOf(side), s = sfx(side);
    const wr = f(J.wr);
    const fc = add3(wr, [0.016 * side, -0.165, 0.008]);
    const kx = i => fc[0] + i * 0.076 * side;
    const block = S.union(0.05,
      S.box(fc, [0.155, 0.138, 0.128], 0.1),
      ...[-1.5, -0.5, 0.5, 1.5].map(i => S.ellipsoid([kx(i), fc[1] - 0.095, fc[2] + 0.062], [0.04, 0.066, 0.074])),
      S.limb([fc[0] - 0.14 * side, fc[1] + 0.05, fc[2] - 0.035], [fc[0] - 0.152 * side, fc[1] - 0.06, fc[2] - 0.075], 0.056, 0.05),
    ).paint(skinP);
    const grooves = [-1, 0, 1].map(i => S.box([kx(i), fc[1] - 0.06, fc[2] - 0.11], [0.005, 0.1, 0.06], 0.004));
    const hand = S.sub(0.012, block, ...grooves);
    const tape = S.inter(0.01,
      S.box(add3(fc, [0, 0.0, 0.0]), [0.166, 0.15, 0.14], 0.1),
      S.box(add3(fc, [0, 0.13, 0]), [0.25, 0.055, 0.25], 0.01),
    ).paint(white);
    const duster = S.union(0.012,
      S.box([fc[0], fc[1] - 0.112, fc[2] + 0.108], [0.165, 0.036, 0.032], 0.028).rot(-0.55, 0, 0).paint(gold),
      ...[-1.5, -0.5, 0.5, 1.5].map(i => S.sphere([kx(i), fc[1] - 0.132, fc[2] + 0.142], 0.03).paint(goldDark)),
    );
    return S.union(0.012, hand, tape, duster).bone('hand.' + s);
  };

  // ── Legs: singlet shorts, tall wrestling boots ──
  const bootP = P('#2d3d70', 0.3);
  const leg = side => {
    const f = sideOf(side), s = sfx(side);
    const kn = f(J.kn), an = f(J.an);
    return S.union(0.03,
      hard(S.limb(f(J.hip), kn, 0.125, 0.11).paint(steel)).bone('thigh.' + s),
      S.union(0.015,
        S.limb(an, add3(kn, [0, -0.035, 0]), 0.1, 0.106).paint(bootP),
        ring(add3(kn, [0, -0.04, -0.004]), [0, 1, 0], 0.104, 0.02).paint(gold),
      ).bone('shin.' + s),
    );
  };
  const boot = side => {
    const f = sideOf(side), s = sfx(side);
    const [ax, , az] = f(J.an);
    const sole = S.box([ax, 0.028, az + 0.045], [0.11, 0.028, 0.17], 0.026).paint(white);
    const foot = S.union(0.05,
      S.ellipsoid([ax, 0.11, az - 0.005], [0.106, 0.09, 0.12]),
      S.ellipsoid([ax, 0.085, az + 0.1], [0.098, 0.066, 0.1]),
    ).paint(bootP);
    const laces = [0, 1, 2].map(i => S.limb([ax - 0.042, 0.2 - i * 0.04, az + 0.1 - i * 0.012], [ax + 0.042, 0.2 - i * 0.04, az + 0.1 - i * 0.012], 0.012).paint(gold));
    return S.union(0.012, sole, foot, ...laces).bone('foot.' + s);
  };

  const body = S.union(0.03,
    S.union(0.02, torso, neck),
    belt,
    arm(1), arm(-1), fist(1), fist(-1),
    leg(1), leg(-1), boot(1), boot(-1),
    head,
  );

  // Face: heavy-lidded gold eyes tilted into a permanent scowl, big grin.
  const tilt = (side, a) => [-Math.sin(a) * side, Math.cos(a), 0];
  const eye = side => ({ kind: 'eye', name: side > 0 ? 'eyeL' : 'eyeR', side, center: [0.08 * side, 1.44, 0.24], dir: [0.3 * side, 0.02, 1], up: tilt(side, 0.2), size: [0.112, 0.122], iris: '#f2b33a', iris2: '#7a4610', lidRest: 0.2, irisSize: 0.6, pupilSize: 0.3, ink: '#2a160e' });
  const brow = side => ({ kind: 'brow', name: side > 0 ? 'browL' : 'browR', side, center: [0.085 * side, 1.502, 0.26], dir: [0.25 * side, 0.35, 1], up: tilt(side, 0.32), size: [0.15, 0.075], color: '#2e1c12', angle: 0.4, raise: -0.1, thick: 0.46 });
  return scaleDef({
    spec, J, sdf: body,
    face: {
      sdf: faceProj,
      features: [eye(1), eye(-1), brow(1), brow(-1),
        { kind: 'mouth', name: 'mouth', center: [0.0, 1.297, 0.27], dir: [0, -0.1, 1], size: [0.23, 0.11], open: 0.4, smile: 0.9, width: 0.92, asym: 0.22, inside: '#4a1018' },
      ],
    },
    height: 1.78,
  }, 0.965);
}

// ── PUNK ─────────────────────────────────────────────────────────────────
// Skate-rat punk: gel-spiked twin tails that stream behind her when she
// runs, a cropped bomber worn open with the sleeves shoved up, plaid skirt,
// striped thigh-highs and platform stompers. Freckles and a smirk.
function punk() {
  const tailBones = {};
  for (const [s, f] of [['L', p => p], ['R', flipX]]) {
    tailBones['cloth' + s + '1'] = { parent: 'head', pos: f([0.25, 1.28, -0.08]) };
    tailBones['cloth' + s + '2'] = { parent: 'cloth' + s + '1', pos: f([0.39, 1.41, -0.15]) };
  }
  const { spec, J } = humanoid({
    hipY: 0.43, chestY: 0.635, neckY: 0.765, headY: 0.835,
    shoulder: [0.18, 0.695, -0.01], elbow: [0.252, 0.55, 0.0], wrist: [0.294, 0.425, 0.03],
    hip: [0.088, 0.41, 0], knee: [0.098, 0.245, 0.02], ankle: [0.104, 0.1, 0],
    extra: tailBones,
  });

  // palette: hot pink + purple (dominant), lime (accent), ink black / white (neutrals)
  const lime = P('#b4f03a', 0.14), limeDark = P('#7fc21c', 0.14);
  const black = P('#2b2536', 0.2), blackShiny = P('#2b2536', 0.55);
  const silver = P('#dfe3ee', 0.9);
  const jacketP = P('#7446c8', 0.12);
  const SKIN = '#f8c9a6';
  const skinP = P(SKIN, 0.22);

  // ── Head: soft round face, button nose, freckles ──
  const B = hex(SKIN), blushC = hex('#ff8c86'), frC = hex('#b86a4c');
  const dots = [[0.092, 0.944], [0.132, 0.951], [0.17, 0.938], [0.113, 0.92], [0.152, 0.917]];
  const faceSkin = (x, y, z, leaf, nx, ny, nz, cell) => {
    let c = B;
    const db = Math.hypot(Math.abs(x) - 0.175, y - 0.955, z - 0.225);
    c = mixc(c, blushC, (1 - Math.min(1, db / 0.075)) ** 2 * 0.6);
    if (z > 0.12) {
      let m = 0;
      for (const [dx, dy] of dots) m = Math.max(m, sstep(0.0105 + cell * 0.45, 0.0105 - cell * 0.45, Math.hypot(Math.abs(x) - dx, y - dy)));
      c = mixc(c, frC, m * 0.72);
    }
    return { color: c, gloss: 0.22, emissive: 0 };
  };
  const faceShape = S.union(0.07,
    S.ellipsoid([0, 1.06, 0.01], [0.3, 0.285, 0.272]),
    S.ellipsoid([0, 0.955, 0.05], [0.245, 0.19, 0.222]),
  ).paint(faceSkin);
  const nose = S.ellipsoid([0, 0.99, 0.29], [0.034, 0.027, 0.026]).paint(faceSkin);
  const faceProj = S.union(0.03, faceShape, nose);
  const ears = S.mirror(S.ellipsoid([0.285, 1.03, -0.01], [0.042, 0.065, 0.04]).rot(0, 0, -0.15)).paint(faceSkin);
  const earrings = S.mirror(ring([0.3, 0.955, 0.0], [1, 0, 0.25], 0.03, 0.012)).paint(silver);
  const headAll = S.union(0.02, faceProj, ears, earrings).bone('head');

  // ── Hair: pink with magenta roots, side-swept fringe ──
  const hairP = (x, y, z, leaf, nx, ny, nz) => {
    const t = clamp01((y - 0.98) / 0.52);
    let c = mixc(hex('#a3175f'), hex('#ff4fa6'), Math.min(1, t * 1.25));
    const band = Math.max(0, ny) * Math.max(0, 1 - Math.abs(y - 1.32) / 0.1);
    c = mixc(c, hex('#ffc2e2'), Math.min(1, band * 1.6) * 0.55);
    return { color: c, gloss: 0.22, emissive: 0 };
  };
  const clumps = [
    // the swoop: parts on her left, sweeps across the forehead to the right
    [[0.15, 1.345, 0.07], [-0.01, 1.29, 0.31], 0.08, [0, 0.04, 0.02]],
    [[0.03, 1.35, 0.09], [-0.15, 1.262, 0.29], 0.076, [0, 0.035, 0.02]],
    [[-0.09, 1.335, 0.08], [-0.255, 1.215, 0.24], 0.068, [0, 0.03, 0.01]],
    [[-0.21, 1.28, 0.06], [-0.305, 1.12, 0.16], 0.058, [0, 0.02, 0.0]],
    [[0.22, 1.31, 0.05], [0.305, 1.2, 0.12], 0.056, [0, 0.02, 0]],
    // short spiky nape
    [[0.0, 1.12, -0.25], [0.04, 0.97, -0.36], 0.08, [0, 0, -0.02]],
    [[0.15, 1.1, -0.22], [0.23, 0.97, -0.3], 0.066, [0, 0, -0.02]],
    [[-0.15, 1.1, -0.22], [-0.23, 0.975, -0.3], 0.066, [0, 0, -0.02]],
  ].map(([a, b, r, bend]) => hairClump(a, b, r, 0.016, bend));
  const hairMass = S.union(0.028,
    S.ellipsoid([0, 1.22, -0.075], [0.322, 0.176, 0.3]),
    S.ellipsoid([0, 1.06, -0.14], [0.3, 0.23, 0.2]),
    ...clumps,
  ).paint(hairP).bone('head').group('hair');

  // Twin tails: gel-spiked, up and out like horns, with lime scrunchies.
  const tail = side => {
    const f = sideOf(side), s = sfx(side);
    const root = f([0.25, 1.28, -0.08]), mid = f([0.39, 1.41, -0.15]);
    const scrunchie = S.union(0.01,
      ring(f([0.255, 1.284, -0.083]), f([0.78, 0.55, -0.3]), 0.064, 0.028).paint(lime),
      ring(f([0.262, 1.289, -0.086]), f([0.78, 0.55, -0.3]), 0.08, 0.009).paint(limeDark),
    ).bone('head');
    const base = hairClump(f([0.22, 1.26, -0.07]), mid, 0.07, 0.072, [0, 0.02, 0]).bone('cloth' + s + '1');
    const spikes = S.union(0.022,
      hairClump(mid, f([0.55, 1.535, -0.21]), 0.074, 0.014, [0, 0.03, 0]),
      hairClump(mid, f([0.53, 1.375, -0.26]), 0.056, 0.012, [0, 0.02, 0]),
      hairClump(add3(mid, [0, 0.02, 0]), f([0.44, 1.6, -0.11]), 0.05, 0.01, [0, 0, 0]),
    ).bone('cloth' + s + '2');
    return S.union(0.02, scrunchie, S.union(0.025, base, spikes).paint(hairP)).group('tail' + s);
  };

  // ── Neck and studded choker ──
  const neck = S.limb([0, 0.72, 0], [0, 0.88, 0.01], 0.058).paint(skinP).bone('neck');
  const choker = S.union(0.006,
    ring([0, 0.8, 0.004], [0, 1, 0.05], 0.058, 0.016).paint(black),
    S.sphere([0, 0.79, 0.075], 0.017).paint(silver),
  ).bone('neck');

  // ── Torso: black tee under a cropped, open bomber ──
  const openCut = () => S.ellipsoid([0, 0.49, 0.22], [0.068, 0.28, 0.13]);
  const openD = compile(openCut()).d;
  const cJacket = hex('#7446c8'), cJacketDk = hex('#553099'), cTee = hex('#2b2536'), cLime = hex('#b4f03a'), cLimeDk = hex('#86c81f');
  const seg2 = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, t = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy));
    return Math.hypot(px - ax - vx * t, py - ay - vy * t);
  };
  const torsoPaint = (x, y, z, leaf, nx, ny, nz, cell) => {
    const e = cell * 0.55;
    const open = sstep(-0.004 + e, -0.004 - e, openD(x, y, z));
    let c = mixc(cJacketDk, cJacket, sstep(0.45, 0.75, ny + 0.4));
    // lime lightning bolt across the back
    if (z < -0.02) {
      const d = Math.min(seg2(x, y, 0.05, 0.75, -0.035, 0.645), seg2(x, y, 0.035, 0.66, -0.05, 0.55));
      c = mixc(c, cLime, sstep(0.023 + e, 0.023 - e, d));
    }
    // ribbed hem
    const hem = sstep(0.527 - e, 0.527 + e, y) * sstep(0.575 + e, 0.575 - e, y);
    c = mixc(c, mixc(cLime, cLimeDk, sstep(0.55, 0.53, y)), hem);
    const tee = Math.max(open, sstep(0.527 + e, 0.527 - e, y));
    c = mixc(c, cTee, tee);
    return { color: c, gloss: 0.12, emissive: 0 };
  };
  const torsoShapes = inf => S.union(0.06,
    S.ellipsoid([0, 0.635, 0], [0.198 + inf, 0.145 + inf, 0.148 + inf]).bone('chest'),
    S.ellipsoid([0, 0.515, 0.01], [0.162 + inf, 0.1 + inf, 0.128 + inf]).bone('spine'),
  ).paint(torsoPaint);
  const jacket = S.sub(0.012,
    S.inter(0.01, torsoShapes(0.03), S.box([0, 0.72, 0], [0.4, 0.19, 0.4], 0.01)),
    openCut(),
  );
  const collar = S.sub(0.01,
    ring([0, 0.765, -0.01], [0, 1, 0.22], 0.11, 0.036).paint(lime),
    openCut(),
  ).bone('chest');
  const patch = S.union(0.004,
    disc([0.105, 0.665, 0.172], [0.35, 0.15, 0.92], 0.046, 0.008, 0.006).paint(P('#ff5fb4', 0.3)),
    disc([0.107, 0.666, 0.18], [0.35, 0.15, 0.92], 0.02, 0.006, 0.005).paint(lime),
  ).bone('chest');
  const torso = S.union(0.01, hard(torsoShapes(0)), hard(jacket), collar, patch);

  // ── Plaid skirt and studded belt ──
  const cPlaid = hex('#4b2a74'), cPlaidDk = hex('#221630'), cPink = hex('#ff5fb4');
  const plaid = (x, y, z, leaf, nx, ny, nz, cell) => {
    const u = Math.atan2(x, z) * 0.22, v = y;
    const line = (t, period, w, off) => { const q = Math.abs((((t / period + off) % 1) + 1) % 1 - 0.5) * period; return sstep(w + cell * 0.4, w - cell * 0.4, q); };
    let c = cPlaid;
    c = mixc(c, cPlaidDk, Math.max(line(u, 0.075, 0.014, 0), line(v, 0.075, 0.014, 0.2)) * 0.8);
    c = mixc(c, cPink, Math.max(line(u, 0.075, 0.0065, 0.5), line(v, 0.075, 0.0065, 0.7)) * 0.9);
    c = mixc(c, cPlaidDk, sstep(0.39, 0.38, y));
    return { color: c, gloss: 0.12, emissive: 0 };
  };
  const skirt = hard(S.sub(0.01,
    S.inter(0.01, S.limb([0, 0.6, 0.01], [0, 0.36, 0.01], 0.172, 0.25).paint(plaid), S.box([0, 0.462, 0], [0.4, 0.085, 0.4], 0.01)),
    S.ellipsoid([0, 0.365, 0.01], [0.2, 0.05, 0.19]),
  )).bone('hips');
  const belt = S.union(0.006,
    ring([0, 0.548, 0.01], [0, 1, 0], 0.184, 0.02).paint(black),
    S.box([0.0, 0.548, 0.2], [0.03, 0.024, 0.01], 0.008).paint(silver),
    ...[-0.6, -0.3, 0.3, 0.6].map(a => S.sphere([Math.sin(a) * 0.2, 0.548, 0.01 + Math.cos(a) * 0.2], 0.016).paint(silver)),
  ).bone('hips');

  // ── Arms: puffy sleeves shoved up, bare forearms, fingerless gloves ──
  const arm = side => {
    const f = sideOf(side), s = sfx(side);
    const sh = f(J.sh), el = f(J.el), wr = f(J.wr);
    const sleeve = S.union(0.04,
      S.sphere(sh, 0.086),
      S.limb(sh, lerp3(sh, el, 0.9), 0.084, 0.08),
    ).paint(jacketP).bone('upperArm.' + s);
    const cuff = ring(lerp3(sh, el, 0.9), sub3(el, sh), 0.064, 0.026).paint(lime).bone('upperArm.' + s);
    const fore = S.limb(el, wr, 0.05, 0.043).paint(skinP).bone('foreArm.' + s);
    const band = side > 0
      ? S.union(0.004, ring(lerp3(el, wr, 0.8), sub3(wr, el), 0.046, 0.017).paint(black),
        ...[0, 2.1, 4.2].map(a => S.sphere(add3(lerp3(el, wr, 0.8), [Math.cos(a) * 0.058 * side, 0, Math.sin(a) * 0.058]), 0.014).paint(silver)))
      : S.union(0.004, ring(lerp3(el, wr, 0.74), sub3(wr, el), 0.047, 0.012).paint(lime), ring(lerp3(el, wr, 0.86), sub3(wr, el), 0.045, 0.012).paint(P('#ff5fb4', 0.3)));
    const gloveY = wr[1] - 0.075;
    const glove = (x, y) => (y > gloveY ? { color: hex('#2b2536'), gloss: 0.25, emissive: 0 } : { color: B, gloss: 0.22, emissive: 0 });
    const h = hand(wr, side, 0.066, glove, 'hand.' + s);
    const patchS = side < 0 ? disc(add3(lerp3(sh, el, 0.45), [-0.075, 0, 0.02]), [-1, 0.05, 0.25], 0.036, 0.008, 0.006).paint(lime).bone('upperArm.' + s) : null;
    return S.union(0.02, sleeve, cuff, fore, band.bone('foreArm.' + s), h, patchS);
  };

  // ── Legs: striped thigh-highs, platform stompers ──
  const sock = (x, y, z, leaf, nx, ny, nz, cell) => {
    const e = cell * 0.5;
    if (y > 0.31 + e) return { color: B, gloss: 0.22, emissive: 0 };
    const k = (((y - 0.16) / 0.046) % 1 + 1) % 1;
    const st = sstep(0.55 - e / 0.046, 0.55 + e / 0.046, k) * sstep(1 - e / 0.046, 0.98 - e / 0.046, k);
    const col = mixc(hex('#2b2536'), hex('#ff5fb4'), st);
    return { color: mixc(col, B, sstep(0.31 - e, 0.31 + e, y)), gloss: 0.14, emissive: 0 };
  };
  const leg = side => {
    const f = sideOf(side), s = sfx(side);
    return S.union(0.03,
      S.limb(f(J.hip), f(J.kn), 0.07, 0.058).paint(sock).bone('thigh.' + s),
      S.limb(f(J.kn), f(J.an), 0.055, 0.05).paint(sock).bone('shin.' + s),
      ring(f([0.097, 0.312, 0.01]), [0, 1, 0.05], 0.062, 0.012).paint(black).bone('thigh.' + s),
    );
  };
  const boot = side => {
    const f = sideOf(side), s = sfx(side);
    const [ax, , az] = f(J.an);
    const sole = S.union(0.01,
      S.box([ax, 0.036, az + 0.035], [0.082, 0.036, 0.128], 0.03).paint(P('#f6f0f8', 0.3)),
      S.box([ax, 0.052, az + 0.035], [0.084, 0.008, 0.13], 0.008).paint(P('#ff5fb4', 0.3)),
    );
    const upper = S.union(0.035,
      S.ellipsoid([ax, 0.115, az - 0.005], [0.078, 0.066, 0.098]),
      S.ellipsoid([ax, 0.1, az + 0.075], [0.073, 0.052, 0.075]),
      S.limb([ax, 0.11, az - 0.012], [ax, 0.172, az - 0.006], 0.07, 0.066),
    ).paint(black);
    const toe = S.ellipsoid([ax, 0.094, az + 0.105], [0.066, 0.046, 0.05]).paint(blackShiny);
    const laces = [0, 1, 2].map(i => S.limb([ax - 0.04, 0.158 - i * 0.022, az + 0.066 - i * 0.026], [ax + 0.04, 0.158 - i * 0.022, az + 0.066 - i * 0.026], 0.011).paint(lime));
    const strapB = S.union(0.004,
      ring([ax, 0.2, az - 0.006], [0, 1, 0], 0.068, 0.014).paint(black),
      S.box([ax + 0.07 * side, 0.2, az], [0.008, 0.02, 0.022], 0.006).paint(silver),
    );
    return S.union(0.012, sole, upper, toe, strapB, ...laces).bone('foot.' + s);
  };

  const body = S.union(0.03,
    S.union(0.04, torso, neck, choker),
    skirt, belt,
    arm(1), arm(-1),
    leg(1), leg(-1), boot(1), boot(-1),
    headAll, hairMass, tail(1), tail(-1),
  );

  // Face: lime cat-eyes, one cocked brow, lopsided smirk.
  const tilt = (side, a) => [-Math.sin(a) * side, Math.cos(a), 0];
  const eye = side => ({ kind: 'eye', name: side > 0 ? 'eyeL' : 'eyeR', side, center: [0.115 * side, 1.058, 0.262], dir: [0.36 * side, 0.02, 1], up: tilt(side, -0.1), size: [0.15, 0.178], iris: '#8fe23a', iris2: '#2c6a12', lidRest: 0.2, irisSize: 0.66, pupilSize: 0.34, ink: '#2a1030' });
  return {
    spec, J, sdf: body,
    face: {
      sdf: faceProj,
      features: [eye(1), eye(-1),
        { kind: 'brow', name: 'browL', side: 1, center: [0.122, 1.19, 0.25], dir: [0.36, 0.05, 1], up: tilt(1, -0.18), size: [0.16, 0.085], color: '#8a1d5c', angle: 0.4, raise: -0.1, thick: 0.3 },
        { kind: 'brow', name: 'browR', side: -1, center: [-0.122, 1.176, 0.25], dir: [-0.36, 0.05, 1], up: tilt(-1, 0.12), size: [0.16, 0.085], color: '#8a1d5c', angle: 0.4, raise: -0.1, thick: 0.3 },
        { kind: 'mouth', name: 'mouth', center: [0.018, 0.905, 0.28], dir: [0, -0.3, 1], up: [-0.1, 1, 0], size: [0.19, 0.12], open: 0.4, smile: 0.9, width: 0.7, asym: 0.6 },
      ],
    },
    height: 1.52,
  };
}

// ── BOT ──────────────────────────────────────────────────────────────────
// Capsule bot. Its top half is a lid that floats on a hover seam (so the
// head can swivel without tearing the shell), the face is a screen, the
// feet are hover boots. One claw for grabbing, one blaster for everything else.
function bot() {
  const { spec, J } = humanoid({
    hipY: 0.36, chestY: 0.6, neckY: 0.68, headY: 0.72,
    shoulder: [0.35, 0.7, 0.0], elbow: [0.44, 0.585, 0.02], wrist: [0.482, 0.475, 0.045],
    hip: [0.13, 0.34, 0], knee: [0.14, 0.23, 0.02], ankle: [0.15, 0.13, 0.0],
    extra: {
      clothA1: { parent: 'head', pos: [0, 1.16, -0.02] },
      clothA2: { parent: 'clothA1', pos: [0, 1.285, 0.0] },
    },
  });

  // palette: teal (dominant), orange (accent), cream / gunmetal (neutrals)
  const cTeal = hex('#1fb3a6'), cTealDk = hex('#11796f'), cTealLt = hex('#6fe6d6'), cCream = hex('#f3eee2');
  const cOrange = hex('#ff8a1f');
  const teal = P('#1fb3a6', 0.55), tealDark = P('#11796f', 0.5), cream = P('#f3eee2', 0.5);
  const gun = P('#39424f', 0.6), gunLight = P('#6b7686', 0.7);
  const orange = P('#ff8a1f', 0.55), glowO = P('#ffab3d', 0.9, 1.0);
  const EC = [0, 0.72, 0], ER = [0.365, 0.43, 0.35];
  const SEAM = 0.805, GAP = 0.026, LID = 0.014;

  // Screen: a recess that follows the shell (screen prism minus a shrunken
  // shell), tilted up toward the top-down camera.
  const scrN = norm3([0, 0.5, 0.87]);
  const scrC = add3(onEllipsoid(EC, [ER[0] + LID, ER[1] + LID, ER[2] + LID], [0, 0.683, 0.731]), scale3(scrN, 0.038));
  const prism = () => S.box(scrC, [0.205, 0.135, 0.2], 0.06).rot(-Math.acos(scrN[2]), 0, 0);
  const prismD = compile(prism()).d;

  // One paint for the whole shell (body and lid share it so the mesher never
  // cross-blends them): teal with a lighter crown, cream belly, glowing hover
  // seam on the body's top face, dark underside of the lid.
  const shellPaint = (x, y, z, leaf, nx, ny, nz, cell) => {
    const e = cell * 0.5;
    const seam = sstep(SEAM - 0.03, SEAM - 0.012, y) * sstep(SEAM + 0.012, SEAM + 0.004, y) * sstep(0.35, 0.75, ny);
    if (y > SEAM + GAP - 0.004 && y < SEAM + GAP + 0.012 && ny < -0.7) return { color: hex('#262d38'), gloss: 0.4, emissive: 0 };
    let c = mixc(cTealDk, cTeal, sstep(0.3, 0.62, y));
    c = mixc(c, cTealLt, sstep(0.55, 1.0, ny) * 0.5);
    if (y > SEAM) c = mixc(c, hex('#0f3b40'), sstep(0.03, 0.004, prismD(x, y, z)));
    const b = Math.hypot(x / 0.2, (y - 0.58) / 0.17);
    c = mixc(c, cCream, sstep(1.02 + e / 0.18, 1.02 - e / 0.18, b) * sstep(0.12, 0.2, z));
    return { color: mixc(c, hex('#ffab3d'), seam), gloss: 0.55 + 0.35 * seam, emissive: seam };
  };
  const egg = inf => S.ellipsoid(EC, [ER[0] + inf, ER[1] + inf, ER[2] + inf]).paint(shellPaint);

  // ── Lid (head): screen face, ear lights, antenna socket ──
  const lidShell = S.inter(0.014, egg(LID), S.box([0, SEAM + GAP + 0.3, 0], [0.5, 0.3, 0.5], 0.01));
  const screen = S.sub(0,
    prism(),
    S.ellipsoid(EC, [ER[0] + LID - 0.013, ER[1] + LID - 0.013, ER[2] + LID - 0.013]),
  );
  const scrPaint = (x, y, z, leaf, nx, ny, nz) => {
    // dark glass with a soft glare band in the upper left
    const g = sstep(0.05, 0.0, Math.abs((x + 0.1) * 0.6 + (y - 1.04) - 0.0)) * sstep(-0.02, 0.06, y - 0.99);
    return { color: mixc(hex('#0a1d26'), hex('#2d5561'), g * 0.7), gloss: 0.95, emissive: 0.45 };
  };
  const lid = S.carve(0.008, lidShell, hard(screen.paint(scrPaint)));
  const ears = S.mirror(S.union(0.006,
    disc([0.335, 0.94, -0.01], [1, 0.25, 0], 0.07, 0.018, 0.008).paint(orange),
    disc([0.352, 0.945, -0.01], [1, 0.25, 0], 0.032, 0.012, 0.006).paint(gun),
  ));
  const head = S.union(0.01, lid, hard(ears)).bone('head').rigid().group('lid');
  const antenna = S.union(0.012,
    hard(disc([0, 1.158, -0.02], [0, 1, -0.05], 0.042, 0.02, 0.01).paint(gun)).bone('head'),
    S.limb([0, 1.16, -0.02], [0, 1.285, 0.0], 0.019, 0.017).paint(gunLight).bone('clothA1'),
    S.limb([0, 1.285, 0.0], [0, 1.37, 0.03], 0.017, 0.016).paint(gunLight).bone('clothA2'),
    S.sphere([0, 1.405, 0.04], 0.046).paint(glowO).bone('clothA2'),
  ).group('antenna');

  // ── Body shell: belly panel, core light, rivets, panel lines, back hatch ──
  const bodyShell = S.inter(0.014, egg(0), S.box([0, SEAM - 0.3, 0], [0.5, 0.3, 0.5], 0.01));
  const grooves = hard(S.mirror(S.box([0.258, 0.55, 0.0], [0.009, 0.25, 0.5], 0.004)).paint(P('#0e4f4b', 0.4)));
  const bellyPlate = S.inter(0.006, egg(0.01), S.box([0, 0.58, 0.3], [0.19, 0.16, 0.2], 0.15));
  const body = S.carve(0.006, S.union(0.008, bodyShell, bellyPlate), grooves);
  const coreC = onEllipsoid(EC, ER, [0, -0.3, 1]);
  const core = hard(S.union(0.006,
    ring(coreC, [0, -0.28, 1], 0.058, 0.02).paint(gun),
    S.ellipsoid(add3(coreC, [0, 0.0, 0.004]), [0.05, 0.05, 0.022]).paint(glowO),
  ));
  const front = (x, y, inf) => [x, y, EC[2] + (ER[2] + inf) * Math.sqrt(Math.max(0, 1 - ((x - EC[0]) / (ER[0] + inf)) ** 2 - ((y - EC[1]) / (ER[1] + inf)) ** 2))];
  const rivets = hard(S.union(0.004, ...[[0.15, 0.69], [-0.15, 0.69], [0.15, 0.47], [-0.15, 0.47]].map(([x, y]) =>
    S.sphere(front(x, y, 0.01), 0.02).paint(P('#9aa6b4', 0.8)))));
  const hatchC = onEllipsoid(EC, ER, [0, -0.1, -1]);
  const hatch = hard(S.union(0.006,
    S.inter(0.006, egg(0.012).paint(cream), S.box(hatchC, [0.14, 0.13, 0.2], 0.05)),
    ...[-1, 0, 1].map(i => S.box(add3(hatchC, [0, 0.04 * i, -0.012]), [0.09, 0.009, 0.02], 0.008).paint(gun)),
  ));
  const bottom = hard(S.union(0.01,
    ring([0, 0.305, 0], [0, 1, 0], 0.1, 0.03).paint(gun),
    S.ellipsoid([0, 0.296, 0], [0.085, 0.02, 0.085]).paint(glowO),
  ));
  const torso = S.union(0.01, body, core, rivets, hatch, bottom).bone('chest').rigid().group('shell');

  // ── Arms: ball-jointed stubs; claw on the left, blaster on the right ──
  const arm = side => {
    const f = sideOf(side), s = sfx(side);
    const sh = f(J.sh), el = f(J.el), wr = f(J.wr);
    const socket = hard(ring(add3(sh, [0.012 * side, 0, 0]), [side, 0.1, 0], 0.074, 0.02).paint(P('#11796f', 0.5))).bone('chest').rigid();
    const ball = hard(S.sphere(sh, 0.07).paint(gun)).bone('upperArm.' + s);
    const upper = S.limb(sh, el, 0.056, 0.05).paint(teal).bone('upperArm.' + s);
    const elbow = S.sphere(el, 0.052).paint(gun).bone('foreArm.' + s);
    const fore = S.limb(el, wr, 0.052, 0.06).paint(teal).bone('foreArm.' + s);
    const cuff = ring(lerp3(el, wr, 0.82), sub3(wr, el), 0.06, 0.016).paint(orange).bone('foreArm.' + s);
    return S.union(0.012, socket, ball, upper, elbow, fore, cuff);
  };
  const claw = () => {
    const wr = J.wr;
    const d = norm3(sub3(J.wr, J.el));
    const palm = add3(wr, scale3(d, 0.04));
    const finger = (dir, len, bend) => {
      const a = add3(palm, scale3(dir, 0.03));
      const b = add3(a, add3(scale3(dir, len * 0.55), bend));
      const c = add3(b, add3(scale3(dir, len * 0.5), scale3(bend, 1.6)));
      return S.union(0.012, S.limb(a, b, 0.029, 0.024), S.limb(b, c, 0.024, 0.007));
    };
    return S.union(0.012,
      S.sphere(palm, 0.05).paint(gun),
      S.union(0.01,
        finger(norm3([0.25, -1, 0.45]), 0.11, [0, 0, 0.03]),
        finger(norm3([0.55, -1, -0.25]), 0.11, [0.03, 0, -0.01]),
        finger(norm3([-0.45, -1, 0.1]), 0.1, [-0.03, 0, 0.01]),
      ).paint(orange),
    ).bone('hand.L').rigid();
  };
  const blaster = () => {
    const wr = flipX(J.wr), el = flipX(J.el);
    const d = norm3(sub3(wr, el));
    const at = t => add3(wr, scale3(d, t));
    // bold hazard chevrons on the housing only
    const hazard = (x, y, z, leaf, nx, ny, nz, cell) => {
      const t = (x - wr[0]) * d[0] + (y - wr[1]) * d[1] + (z - wr[2]) * d[2];
      const k = (((t * 11 + (x - z) * 4) % 1) + 1) % 1;
      const m = sstep(0.45, 0.52, k) * sstep(0.97, 0.9, k) * sstep(0.012, 0.03, t) * sstep(0.118, 0.1, t);
      return { color: mixc(cOrange, hex('#2c2f38'), m), gloss: 0.55, emissive: 0 };
    };
    return S.union(0.012,
      strap(at(-0.02), at(0.135), 0.08, 0.08, [0, 0, 1], 0.05).paint(hazard),
      S.carve(0.006,
        S.union(0.012,
          S.limb(at(0.1), at(0.215), 0.052, 0.052).paint(gun),
          ring(at(0.215), d, 0.054, 0.022).paint(orange),
        ),
        disc(at(0.24), d, 0.034, 0.03, 0.01).paint(glowO),
      ),
      S.box(add3(at(0.05), [0, 0, 0.085]), [0.028, 0.045, 0.02], 0.012).paint(glowO),
    ).bone('hand.R').rigid();
  };

  // ── Hover boots: chunky, floating, thruster glow underneath ──
  const boot = side => {
    const f = sideOf(side), s = sfx(side);
    const [ax, , az] = f(J.an);
    const shoe = S.union(0.03,
      S.ellipsoid([ax, 0.13, az - 0.01], [0.098, 0.085, 0.118]).paint(teal),
      S.ellipsoid([ax, 0.104, az + 0.085], [0.088, 0.062, 0.078]).paint(cream),
      S.box([ax, 0.068, az + 0.02], [0.104, 0.03, 0.152], 0.03).paint(gun),
    );
    const top = S.union(0.006,
      ring([ax, 0.208, az - 0.015], [0, 1, 0], 0.062, 0.02).paint(orange),
      S.cyl([ax, 0.212, az - 0.015], 0.05, 0.012, 0.008).paint(gun),
    );
    const glow = S.cyl([ax, 0.032, az + 0.02], 0.072, 0.009, 0.008).paint(glowO);
    return S.union(0.01, shoe, top, glow).bone('foot.' + s).rigid().group('boot' + s);
  };

  const all = S.union(0,
    head,
    S.union(0.012, torso, arm(1), arm(-1), claw(), blaster(), antenna),
    boot(1), boot(-1),
  );

  // Face on the screen: big glowing eyes, LED brows, a pixel-line mouth.
  const up = [0, 0.87, -0.5];
  const eye = side => ({ kind: 'eye', name: side > 0 ? 'eyeL' : 'eyeR', side, center: [0.088 * side, 1.0, 0.31], dir: [0.18 * side, 0.5, 0.87], up, size: [0.125, 0.14],
    sclera: '#fff1d6', iris: '#ff9a2a', iris2: '#ff5a00', ink: '#ff7a14', lidRest: 0.06, irisSize: 0.74, pupilSize: 0.26, glow: 1 });
  return {
    spec, J, sdf: all,
    face: {
      sdf: lid,
      features: [eye(1), eye(-1),
        { kind: 'brow', name: 'browL', side: 1, center: [0.095, 1.072, 0.27], dir: [0.18, 0.5, 0.87], up: [-0.15, 0.86, -0.49], size: [0.11, 0.05], color: '#ff9a2a', angle: 0.4, raise: -0.1, thick: 0.34, arch: 0.1 },
        { kind: 'brow', name: 'browR', side: -1, center: [-0.095, 1.072, 0.27], dir: [-0.18, 0.5, 0.87], up: [0.15, 0.86, -0.49], size: [0.11, 0.05], color: '#ff9a2a', angle: 0.4, raise: -0.1, thick: 0.34, arch: 0.1 },
        { kind: 'mouth', name: 'mouth', center: [0, 0.92, 0.335], dir: [0, 0.5, 0.87], up, size: [0.13, 0.07], open: 0.4, smile: 0.9, width: 0.8, asym: 0, ink: '#ff8a1f', inside: '#3a1204' },
      ],
    },
    height: 1.45,
  };
}

export const HEROES2 = { brute, punk, bot };
