// Quadrupeds: chibi wolves (minions), and scaled-up beasts (Dire Bear,
// Nightmare, Primal Beast). One skeleton: hips → spine → chest → neck → head
// (+ jaw, ears), four 3-bone legs, a 3-bone tail. Head shapes (wolf, bear,
// horse, cat) and dressings (ruff, mane, crystals, armor, horns, war paint)
// come from the variant.

import { S, P, G, TAU, add, mix3, fx, lerp, smooth, clamp01, tube, horn, spike, flame, tone, glowGrad, scaled, veins, mottle, eyes, brows, hex, mixc } from './creature-kit.js';


// Fur paint: base with a darker saddle on the back, cream underside/chest/muzzle.
export function furPaint(o) {
  const base = hex(o.base), dark = hex(o.dark), cream = hex(o.cream), light = hex(o.light ?? o.base);
  const muzzleZ = o.muzzleZ ?? 0.33, chestZ = o.chestZ ?? 0.13, s = o.s ?? 1, muzzleY = o.muzzleY ?? 0.5, chestY = o.chestY ?? 0.42;
  return (x, y, z, l, nx, ny, nz) => {
    let col = base;
    if (ny > 0) col = mixc(col, light, ny * ny * 0.3);
    const saddle = smooth((ny - 0.35) / 0.35) * smooth((0.24 * s - z) / (0.08 * s)) * (o.saddle ?? 1);
    col = mixc(col, dark, saddle * 0.85);
    const under = smooth((-ny - 0.05) / 0.35);
    const chest = smooth((z - chestZ * s) / (0.05 * s)) * smooth((chestY * s - y) / (0.06 * s)) * smooth((nz - 0.1) / 0.4);
    const muzzle = smooth((z - muzzleZ * s) / (0.03 * s)) * smooth((muzzleY * s - y) / (0.03 * s));
    col = mixc(col, cream, Math.max(under, chest, muzzle) * 0.95);
    if (o.paint) col = o.paint(col, x / s, y / s, z / s, nx, ny, nz);
    return { color: col, gloss: o.gloss ?? 0.22, emissive: 0 };
  };
}

function specFor(J) {
  const sp = {
    root: { pos: [0, 0, 0] },
    hips: { parent: 'root', pos: J.hips },
    spine: { parent: 'hips', pos: J.spine },
    chest: { parent: 'spine', pos: J.chest },
    neck: { parent: 'chest', pos: J.neck },
    head: { parent: 'neck', pos: J.head },
    jaw: { parent: 'head', pos: J.jaw },
  };
  for (const [s, f] of [['L', p => p], ['R', fx]]) {
    sp['ear.' + s] = { parent: 'head', pos: f(J.ear) };
    sp['fl.' + s] = { parent: 'chest', pos: f(J.fs) };
    sp['flo.' + s] = { parent: 'fl.' + s, pos: f(J.fe) };
    sp['fp.' + s] = { parent: 'flo.' + s, pos: f(J.fw) };
    sp['hl.' + s] = { parent: 'hips', pos: f(J.hs) };
    sp['hlo.' + s] = { parent: 'hl.' + s, pos: f(J.he) };
    sp['hp.' + s] = { parent: 'hlo.' + s, pos: f(J.hw) };
  }
  let par = 'hips';
  J.tail.forEach((p, i) => { sp['tail' + (i + 1)] = { parent: par, pos: p }; par = 'tail' + (i + 1); });
  return sp;
}

const scaleJ = (J, s) => Object.fromEntries(Object.entries(J).map(([k, v]) => [k, Array.isArray(v[0]) ? v.map(p => p.map(x => x * s)) : v.map(x => x * s)]));

const WOLF_J = {
  hips: [0, 0.3, -0.15], spine: [0, 0.31, -0.02], chest: [0, 0.33, 0.1], neck: [0, 0.38, 0.17], head: [0, 0.45, 0.22], jaw: [0, 0.43, 0.3],
  ear: [0.075, 0.58, 0.21],
  fs: [0.095, 0.3, 0.12], fe: [0.1, 0.17, 0.13], fw: [0.1, 0.055, 0.14],
  hs: [0.095, 0.29, -0.17], he: [0.1, 0.17, -0.13], hw: [0.1, 0.055, -0.17],
  tail: [[0, 0.34, -0.27], [0, 0.4, -0.35], [0, 0.46, -0.4]],
};

// Chibi wolf body. o: { fur, dark, cream, nose, eye, iris2, ink, claw, crystals, warPaint, s }
function wolf(C, o) {
  const s = o.s ?? 1;
  const J = scaleJ(WOLF_J, s);
  const sp = specFor(J);
  const fur = o.fur;
  const q = p => p.map(x => x * s);
  const claw = P(o.claw ?? '#3a2a22', 0.4);
  const leg = (upper, lower, paw, a, b, c, r1, r2) => S.union(0.025 * s,
    S.limb(a, b, r1, r2 * 1.05).bone(upper),
    S.limb(b, c, r2 * 1.05, r2 * 0.9).bone(lower),
    S.ellipsoid([c[0], 0.036 * s, c[2] + 0.02 * s], q([0.055, 0.038, 0.068])).bone(paw),
    S.union(0, ...[-1, 0, 1].map(i => S.limb([c[0] + i * 0.028 * s, 0.03 * s, c[2] + 0.07 * s], [c[0] + i * 0.03 * s, 0.012 * s, c[2] + 0.095 * s], 0.012 * s, 0.003 * s))).paint(claw).bone(paw),
  );
  const legs = S.mirror(S.union(0.02 * s,
    leg('fl.L', 'flo.L', 'fp.L', J.fs, J.fe, J.fw, 0.052 * s, 0.042 * s),
    S.ellipsoid(q([0.09, 0.3, -0.165]), q([0.062, 0.095, 0.085])).bone('hl.L'),
    leg('hl.L', 'hlo.L', 'hp.L', J.hs, J.he, J.hw, 0.06 * s, 0.042 * s),
  )).paint(fur);
  const torso = S.union(0.06 * s,
    S.ellipsoid(q([0, 0.335, 0.06]), q([0.135, 0.13, 0.16])).bone('chest'),
    S.ellipsoid(q([0, 0.315, -0.04]), q([0.12, 0.115, 0.1])).bone('spine'),
    S.ellipsoid(q([0, 0.31, -0.14]), q([0.12, 0.115, 0.13])).bone('hips'),
    S.ellipsoid(q([0, 0.375, 0.165]), q([0.125, 0.125, 0.1])).bone('neck'),
  ).paint(fur);
  const ruff = S.union(0.01 * s,
    ...[-1, 0, 1].map(i => spike(q([i * 0.06, 0.31, 0.2]), q([i * 0.055, 0.215, 0.235]), 0.04 * s)),
    S.mirror(spike(q([0.1, 0.37, 0.14]), q([0.17, 0.33, 0.1]), 0.04 * s)),
  ).paint(fur).bone('neck');
  const headC = q([0, 0.49, 0.25]), headR = q([0.15, 0.13, 0.135]);
  const headCore = S.union(0.04 * s,
    S.ellipsoid(headC, headR),
    S.ellipsoid(q([0, 0.452, 0.355]), q([0.072, 0.05, 0.085])),
    S.mirror(S.ellipsoid(q([0.105, 0.445, 0.235]), q([0.07, 0.065, 0.06]))),
  ).paint(fur);
  const head = S.union(0.015 * s,
    headCore,
    S.sphere(q([0, 0.472, 0.438]), 0.03 * s).paint(P(o.nose ?? '#2a1a18', 0.6)),
    S.mirror(spike(q([0.15, 0.45, 0.22]), q([0.215, 0.415, 0.19]), 0.045 * s)).paint(fur),
    S.ellipsoid(q([0, 0.428, 0.335]), q([0.05, 0.02, 0.06])).paint(P('#5a1420', 0.3)),
    S.mirror(S.limb(q([0.032, 0.43, 0.405]), q([0.03, 0.4, 0.41]), 0.011 * s, 0.003 * s)).paint(P('#ffffff', 0.5)),
    ...(o.headExtras ? o.headExtras(q, s) : []),
  ).bone('head');
  const jaw = S.ellipsoid(q([0, 0.412, 0.345]), q([0.055, 0.026, 0.074])).paint(fur).bone('jaw');
  const earShape = S.carve(0.006 * s,
    S.union(0.01 * s,
      S.ellipsoid(q([0.085, 0.6, 0.21]), q([0.048, 0.06, 0.025])).rot(0, 0, -0.2),
      S.limb(q([0.09, 0.62, 0.21]), q([0.115, 0.715, 0.2]), 0.03 * s, 0.004 * s),
    ),
    S.ellipsoid(q([0.087, 0.61, 0.232]), q([0.028, 0.045, 0.012])).rot(0, 0, -0.2).paint(P(o.earIn ?? '#5a2a20', 0.25)),
  ).paint(fur).bone('ear.L');
  const tail = S.union(0.03 * s,
    S.limb(J.tail[0], J.tail[1], 0.04 * s, 0.065 * s).bone('tail1'),
    S.limb(J.tail[1], add(J.tail[2], q([0, 0.03, -0.02])), 0.065 * s, 0.02 * s).bone('tail2'),
  ).paint(o.tailPaint ?? fur);
  const sdf = S.union(0.03 * s,
    S.union(0.02 * s, torso, ruff),
    legs, head, jaw, S.mirror(earShape), tail,
    ...(o.extras ? o.extras(q, s, J) : []),
  );
  const f = [
    ...eyes(q([0.066, 0.515, 0.36]), [0.078 * s, 0.088 * s], { iris: o.eye, iris2: o.iris2, ink: o.ink, angry: o.angry ?? 0.45, lidRest: 0.14, irisSize: 0.62, pupilSize: 0.28, yaw: 0.5, pitch: 0.15, glow: o.eyeGlow ?? 0 }),
    ...brows(q([0.07, 0.575, 0.345]), [0.085 * s, 0.05 * s], o.ink, { angle: 0.9, yaw: 0.5, thick: 0.34 }),
  ];
  return { spec: sp, sdf, face: { sdf: headCore, bone: 'head', features: f } };
}

const VARIANTS = {
  // ── Wolf (beast minion): amber fur, cream chest, red war paint.
  beast: C => {
    const warPaint = (col, x, y, z) => {
      const ax = Math.abs(x);
      const stripe = (Math.abs(y - (0.47 + (ax - 0.09) * 0.8)) < 0.011 || Math.abs(y - (0.445 + (ax - 0.09) * 0.8)) < 0.011) && ax > 0.075 && ax < 0.14 && z > 0.28;
      return stripe ? hex(C.accent) : col;
    };
    const fur = furPaint({ base: C.body, dark: C.dark, cream: C.belly, light: C.light, paint: warPaint });
    return { ...wolf(C, { fur, eye: C.eye, iris2: C.eye2, ink: C.ink, tailPaint: tipPaint(fur, C.belly, 0.44), s: 1 }), height: 0.72 };
  },
  // ── Ice wolf (frost minion): frosted white-blue fur, glowing ice crystals on the back.
  frost: C => {
    const fur = furPaint({ base: '#dff3ff', dark: '#6aaede', cream: '#ffffff', light: '#ffffff', gloss: 0.3 });
    const ice = glowGrad('#57c7f5', '#e8fbff', 0.35, 0.55, 0.7, 0.9);
    return {
      ...wolf(C, {
        fur, eye: '#7ff0ff', iris2: '#0a5fb0', ink: C.ink, nose: '#1d3d6b', earIn: '#7fb4de', eyeGlow: 0.5, angry: 0.55, tailPaint: tipPaint(fur, '#9fe6ff', 0.44),
        extras: (q, s) => [
          S.union(0.008 * s,
            S.taper(q([0, 0.46, 0.08]), q([0.03, 0.07, 0.03]), 0.9, 0.006 * s).rot(-0.3, 0.78, 0).bone('chest'),
            S.taper(q([0.03, 0.45, -0.02]), q([0.026, 0.06, 0.026]), 0.9, 0.006 * s).rot(-0.45, 0.78, -0.25).bone('spine'),
            S.taper(q([-0.03, 0.44, -0.07]), q([0.024, 0.055, 0.024]), 0.9, 0.006 * s).rot(-0.5, 0.78, 0.25).bone('spine'),
            S.taper(q([0, 0.43, -0.15]), q([0.022, 0.05, 0.022]), 0.9, 0.006 * s).rot(-0.6, 0.78, 0).bone('hips'),
            S.taper(q([0, 0.5, -0.43]), q([0.028, 0.07, 0.028]), 0.9, 0.006 * s).rot(-1.1, 0.78, 0).bone('tail2'),
          ).paint(ice),
        ],
      }),
      height: 0.72,
    };
  },
};

// ── Big beasts (titans and the Primal Beast form) ────────────────────────
// Joint layouts are authored at full size per body kind.
const BEAST_J = {
  bear: {
    hips: [0, 1.2, -0.7], spine: [0, 1.35, -0.2], chest: [0, 1.42, 0.35], neck: [0, 1.52, 0.78], head: [0, 1.58, 0.98], jaw: [0, 1.42, 1.22],
    ear: [0.25, 1.88, 1.0],
    fs: [0.42, 1.3, 0.48], fe: [0.46, 0.72, 0.56], fw: [0.46, 0.2, 0.6],
    hs: [0.42, 1.15, -0.82], he: [0.47, 0.66, -0.62], hw: [0.47, 0.2, -0.86],
    tail: [[0, 1.3, -1.22], [0, 1.28, -1.36], [0, 1.24, -1.46]],
  },
  horse: {
    hips: [0, 1.45, -0.75], spine: [0, 1.5, -0.2], chest: [0, 1.55, 0.35], neck: [0, 1.9, 0.62], head: [0, 2.28, 0.86], jaw: [0, 2.08, 1.12],
    ear: [0.1, 2.52, 0.8],
    fs: [0.24, 1.42, 0.42], fe: [0.26, 0.82, 0.47], fw: [0.26, 0.22, 0.46],
    hs: [0.26, 1.38, -0.8], he: [0.28, 0.88, -0.96], hw: [0.28, 0.22, -0.86],
    tail: [[0, 1.62, -1.2], [0, 1.4, -1.5], [0, 1.1, -1.7]],
  },
  cat: {
    hips: [0, 0.86, -0.5], spine: [0, 0.92, -0.1], chest: [0, 0.98, 0.3], neck: [0, 1.12, 0.52], head: [0, 1.22, 0.64], jaw: [0, 1.1, 0.84],
    ear: [0.14, 1.44, 0.62],
    fs: [0.24, 0.92, 0.38], fe: [0.27, 0.52, 0.43], fw: [0.27, 0.12, 0.46],
    hs: [0.24, 0.86, -0.56], he: [0.28, 0.5, -0.44], hw: [0.28, 0.12, -0.62],
    tail: [[0, 0.95, -0.82], [0, 0.88, -1.15], [0, 0.95, -1.45]],
  },
};

function beastLeg(u, l, pw, a, b, c, r1, r2, pawR, fur, claw, hoof) {
  return S.union(0.05,
    S.limb(a, b, r1, r2).bone(u),
    S.limb(b, c, r2, r2 * 0.88).bone(l),
    hoof ? S.cyl([c[0], pawR * 0.6, c[2]], pawR, pawR * 0.6, pawR * 0.3).paint(hoof).bone(pw)
      : S.ellipsoid([c[0], pawR * 0.7, c[2] + pawR * 0.4], [pawR * 1.1, pawR * 0.75, pawR * 1.35]).bone(pw),
    ...(hoof ? [] : [-1, 0, 1].map(i => tube([c[0] + i * pawR * 0.55, pawR * 0.6, c[2] + pawR * 1.4], [c[0] + i * pawR * 0.62, pawR * 0.62, c[2] + pawR * 1.9], [c[0] + i * pawR * 0.65, pawR * 0.12, c[2] + pawR * 2.1], pawR * 0.24, pawR * 0.05, 2).paint(claw).bone(pw))),
  ).paint(fur);
}

function bigBeast(C, kind, o) {
  const J = BEAST_J[kind];
  const sp = specFor(J);
  const fur = o.fur, claw = P(o.claw ?? '#2a1a14', 0.5);
  const m = o.mass ?? 1;
  const torso = kind === 'bear' ? S.union(0.12,
    S.ellipsoid([0, 1.5, 0.28], [0.62 * m, 0.62, 0.7]).bone('chest'),
    S.ellipsoid([0, 1.34, -0.2], [0.56 * m, 0.55, 0.5]).bone('spine'),
    S.ellipsoid([0, 1.24, -0.62], [0.52 * m, 0.5, 0.5]).bone('hips'),
    S.limb([0, 1.5, 0.6], J.head, 0.42, 0.34).bone('neck'),
  ) : kind === 'horse' ? S.union(0.12,
    S.ellipsoid([0, 1.58, 0.3], [0.46, 0.52, 0.46]).bone('chest'),
    S.ellipsoid([0, 1.52, -0.22], [0.42, 0.46, 0.52]).bone('spine'),
    S.ellipsoid([0, 1.52, -0.7], [0.43, 0.46, 0.42]).bone('hips'),
    S.limb([0, 1.66, 0.45], J.neck, 0.36, 0.28).bone('neck'),
    S.limb(J.neck, add(J.head, [0, 0.04, 0.0]), 0.28, 0.21).bone('neck'),
  ) : S.union(0.08,
    S.ellipsoid([0, 1.0, 0.24], [0.32, 0.36, 0.38]).bone('chest'),
    S.ellipsoid([0, 0.9, -0.12], [0.27, 0.3, 0.32]).bone('spine'),
    S.ellipsoid([0, 0.88, -0.46], [0.28, 0.3, 0.3]).bone('hips'),
    S.limb([0, 1.05, 0.4], J.head, 0.24, 0.2).bone('neck'),
  );
  const legR = kind === 'bear' ? [0.24, 0.2, 0.24] : kind === 'horse' ? [0.2, 0.13, 0.17] : [0.14, 0.1, 0.12];
  const legs = S.mirror(S.union(0.04,
    beastLeg('fl.L', 'flo.L', 'fp.L', J.fs, J.fe, J.fw, legR[0], legR[1], legR[2], fur, claw, o.hoof),
    beastLeg('hl.L', 'hlo.L', 'hp.L', J.hs, J.he, J.hw, legR[0] * 1.1, legR[1], legR[2], fur, claw, o.hoof),
    ...(kind === 'horse' ? [] : [S.ellipsoid(add(J.hs, [0.02, -0.08, 0.02]), [legR[0] * 1.2, legR[0] * 2, legR[0] * 1.7]).bone('hl.L')]),
  ).paint(fur));
  const headCore = o.headCore(J);
  const head = S.union(0.03, headCore, ...(o.headExtras ? o.headExtras(J) : [])).bone('head');
  const jaw = o.jaw(J).bone('jaw');
  const sdf = S.union(0.04, torso.paint(fur), legs, head, jaw, ...(o.extras ? o.extras(J) : []));
  return { spec: sp, sdf, face: { sdf: headCore, bone: 'head', features: o.face(J) } };
}

VARIANTS.direBear = C => {
  const fur = furPaint({ base: '#7a4a24', dark: '#3a1f0c', cream: '#e8c9a0', light: '#a8703c', s: 3.1, chestZ: 0.13, muzzleZ: 0.44, saddle: 0.8, gloss: 0.18,
    paint: (col, x, y, z) => {
      const ax = Math.abs(x);
      const stripe = z > 0.34 && z < 0.4 && Math.abs(y - (0.53 - (ax - 0.05) * 0.4)) < 0.012 && ax > 0.04 && ax < 0.1;
      return stripe ? hex('#e8412c') : col;
    } });
  const bone = tone('#f3e6cf', '#b8a488', '#ffffff', 1.2, 2.2, 0.45, 0.3);
  const d = bigBeast(C, 'bear', {
    fur,
    headCore: J => S.union(0.08,
      S.ellipsoid([0, 1.66, 1.1], [0.36, 0.32, 0.34]),
      S.ellipsoid([0, 1.52, 1.42], [0.18, 0.15, 0.2]),
      S.mirror(S.ellipsoid([0.24, 1.56, 1.16], [0.14, 0.14, 0.13])),
    ).paint(fur),
    headExtras: J => [
      S.sphere([0, 1.58, 1.62], 0.07).paint(P('#1a0f0a', 0.6)),
      S.mirror(S.union(0.02, S.sphere([0.26, 1.92, 1.02], 0.11), S.sphere([0.27, 1.93, 1.06], 0.06).paint(P('#3a1f0c', 0.2)))).paint(fur),
      S.ellipsoid([0, 1.44, 1.38], [0.12, 0.04, 0.16]).paint(P('#5a1420', 0.3)),
      S.sphere([0, 1.86, 1.36], 0.05).paint(G(C.glow, 1, 0.6)),
    ],
    jaw: J => S.union(0.02,
      S.ellipsoid([0, 1.4, 1.38], [0.15, 0.07, 0.19]).paint(fur),
      S.mirror(tube([0.1, 1.42, 1.5], [0.13, 1.56, 1.58], [0.1, 1.68, 1.56], 0.035, 0.008, 3)).paint(bone),
    ),
    extras: J => [
      S.mirror(S.union(0.02, spike([0.4, 1.96, 0.3], [0.56, 2.28, 0.18], 0.08), spike([0.3, 2.02, 0.05], [0.36, 2.36, -0.12], 0.07), spike([0.2, 1.98, -0.25], [0.22, 2.26, -0.42], 0.06))).paint(bone).bone('chest'),
      S.union(0.02, S.ellipsoid([0, 2.02, 0.2], [0.44, 0.1, 0.4]).rot(-0.1, 0, 0)).paint(furPaint({ base: '#3a1f0c', dark: '#1a0f0a', cream: '#5a3a20', s: 3.1 })).bone('chest'),
      S.ellipsoid([0, 1.3, -1.28], [0.12, 0.12, 0.14]).paint(fur).bone('tail1'),
    ],
    face: J => [
      ...eyes([0.15, 1.74, 1.38], [0.12, 0.1], { iris: '#ffd76a', iris2: '#b45309', ink: '#2e1406', angry: 0.8, lidRest: 0.2, irisSize: 0.6, pupilSize: 0.25, yaw: 0.45, pitch: 0.1, glow: 0.6 }),
      ...brows([0.16, 1.85, 1.36], [0.14, 0.07], '#1a0f0a', { angle: 1.1, yaw: 0.45, thick: 0.4 }),
    ],
  });
  return { ...d, height: 2.45, radius: 1.1, cell: 0.036, s: 3.1 };
};

VARIANTS.nightmare = C => {
  const hide = tone('#3b1a78', '#12082a', '#7c55d8', 0.5, 2.4, 0.4, 0.4);
  const flameV = glowGrad('#8b5cf6', '#f3e8ff', 1.8, 2.8, 1, 0.3);
  const hoofFire = glowGrad('#7c3aed', '#e9d5ff', 0.0, 0.5, 1, 0.3);
  const hornP = tone('#e6dcff', '#4b2596', '#ffffff', 2.3, 2.9, 0.5, 0.3);
  const d = bigBeast(C, 'horse', {
    fur: hide, hoof: P('#1a0d36', 0.6),
    headCore: J => S.union(0.06,
      S.ellipsoid([0, 2.34, 0.88], [0.22, 0.25, 0.3]).rot(0.5, 0, 0),
      S.ellipsoid([0, 2.1, 1.18], [0.16, 0.16, 0.22]).rot(0.6, 0, 0),
    ).paint(hide),
    headExtras: J => [
      S.mirror(horn([0.12, 2.52, 0.8], [0.36, 2.92, 0.5], 0.075, [0.08, 0.1, 0.06], 3)).paint(hornP),
      S.mirror(spike([0.1, 2.5, 0.72], [0.14, 2.66, 0.66], 0.045)).paint(hide),
      S.mirror(S.sphere([0.05, 2.02, 1.3], 0.025)).paint(G('#e9d5ff', 1, 0.5)),
    ],
    jaw: J => S.ellipsoid([0, 2.02, 1.16], [0.1, 0.05, 0.15]).rot(0.6, 0, 0).paint(hide),
    extras: J => [
      S.union(0.03, ...[[2.52, 0.7], [2.34, 0.58], [2.14, 0.48], [1.96, 0.38], [1.78, 0.26]].map(([y, z], i) => flame([0, y, z - 0.08], [0, y + 0.5 - i * 0.03, z - 0.45], 0.14 - i * 0.006, [0, 0.05, 0]))).paint(flameV).bone('neck'),
      S.union(0.02,
        flame([0, 1.62, -1.2], [0, 2.05, -1.65], 0.16, [0, 0.08, -0.05]).bone('tail1'),
        flame([0, 1.45, -1.45], [0, 1.45, -2.0], 0.14, [0, 0.06, -0.05]).bone('tail2'),
        flame([0, 1.2, -1.62], [0, 0.95, -2.1], 0.12, [0, 0, -0.05]).bone('tail3'),
      ).paint(glowGrad('#8b5cf6', '#f3e8ff', 1.0, 1.9, 1, 0.3)),
      S.mirror(S.union(0.01,
        flame([0.26, 0.14, 0.46], [0.26, 0.5, 0.4], 0.18).bone('fp.L'),
        flame([0.28, 0.14, -0.86], [0.28, 0.5, -0.92], 0.18).bone('hp.L'),
      )).paint(hoofFire),
    ],
    face: J => [
      ...eyes([0.17, 2.38, 1.02], [0.13, 0.09], { iris: '#ffffff', iris2: '#c4b5fd', sclera: '#0b0418', ink: '#0b0418', angry: 0.9, lidRest: 0.1, irisSize: 0.75, pupilSize: 0, dir: [0.8, 0.2, 0.55], glow: 1.0 }),
    ],
  });
  return { ...d, height: 2.9, radius: 1.0, cell: 0.036, s: 3.2, pulse: 0.25, noBlink: true };
};

VARIANTS.primal = C => {
  const stripes = (col, x, y, z, nx, ny) => {
    const k = Math.sin(z * 3.2 * 5 + Math.sin(y * 3 * 5) * 0.8);
    const band = k > 0.72 && ny > -0.3 && y > 0.3;
    return band ? mixc(col, hex('#3a1606'), 0.85) : col;
  };
  const fur = furPaint({ base: '#d9782e', dark: '#8a3a10', cream: '#fde6c6', light: '#f2a24a', s: 1.65, muzzleZ: 0.53, muzzleY: 0.74, chestZ: 0.2, chestY: 0.64, saddle: 0.5, paint: stripes });
  const bone = tone('#f5ecd8', '#b8a488', '#ffffff', 0.9, 1.4, 0.5, 0.3);
  const war = G('#ffb347', 1, 0.6);
  const d = bigBeast(C, 'cat', {
    fur, mass: 1,
    headCore: J => S.union(0.06,
      S.ellipsoid([0, 1.3, 0.72], [0.25, 0.22, 0.24]),
      S.ellipsoid([0, 1.2, 0.92], [0.15, 0.11, 0.14]),
      S.mirror(S.ellipsoid([0.15, 1.2, 0.78], [0.12, 0.1, 0.1])),
    ).paint(fur),
    headExtras: J => [
      S.sphere([0, 1.24, 1.05], 0.045).paint(P('#2a1a18', 0.6)),
      S.mirror(S.union(0.015, S.ellipsoid([0.16, 1.48, 0.62], [0.07, 0.08, 0.04]).rot(0, 0, -0.3), S.ellipsoid([0.165, 1.48, 0.645], [0.04, 0.05, 0.02]).rot(0, 0, -0.3).paint(P('#5a2a20', 0.25)))).paint(fur),
      S.mirror(tube([0.07, 1.14, 0.98], [0.08, 1.0, 1.02], [0.06, 0.9, 0.97], 0.032, 0.006, 3)).paint(bone),
      S.ellipsoid([0, 1.12, 0.88], [0.1, 0.04, 0.12]).paint(P('#5a1420', 0.3)),
      S.mirror(S.limb([0.08, 1.4, 0.9], [0.14, 1.36, 0.86], 0.012, 0.01)).paint(war),
    ],
    jaw: J => S.ellipsoid([0, 1.08, 0.9], [0.1, 0.045, 0.13]).paint(fur),
    extras: J => [
      S.union(0.02, ...[-2, -1, 0, 1, 2].map(i => spike([i * 0.1, 1.1 - Math.abs(i) * 0.03, 0.52], [i * 0.13, 0.94 - Math.abs(i) * 0.02, 0.62], 0.07)), S.mirror(spike([0.24, 1.2, 0.5], [0.36, 1.12, 0.42], 0.07))).paint(fur).bone('neck'),
      S.union(0.01, S.torus([0, 1.04, 0.5], 0.24, 0.018).rot(1.1, 0, 0).paint(P('#5a3a20', 0.3)), ...[-1, 0, 1].map(i => S.limb([i * 0.12, 0.96, 0.66], [i * 0.13, 0.86, 0.7], 0.022, 0.006).paint(bone))).bone('chest'),
      S.union(0.02, S.limb([0, 0.95, -0.82], [0, 0.88, -1.15], 0.06, 0.05).bone('tail1'), S.limb([0, 0.88, -1.15], [0, 0.95, -1.42], 0.05, 0.04).bone('tail2'), S.sphere([0, 0.97, -1.48], 0.08).paint(furPaint({ base: '#3a1606', dark: '#1a0a02', cream: '#3a1606', s: 1.65 })).bone('tail3')).paint(fur),
    ],
    face: J => [
      ...eyes([0.1, 1.34, 0.93], [0.1, 0.085], { iris: '#ffd76a', iris2: '#b45309', ink: '#2e1406', angry: 0.8, lidRest: 0.18, irisSize: 0.62, pupilSize: 0.22, yaw: 0.45, pitch: 0.1, glow: 0.7 }),
      ...brows([0.11, 1.43, 0.92], [0.12, 0.06], '#2e1406', { angle: 1.1, yaw: 0.45, thick: 0.38 }),
    ],
  });
  return { ...d, height: 1.55, radius: 0.7, cell: 0.024, s: 1.65 };
};

function tipPaint(fur, tipCol, yTip) {
  const t = hex(tipCol);
  return (x, y, z, l, nx, ny, nz, cell) => {
    const p = fur(x, y, z, l, nx, ny, nz, cell);
    const w = smooth((-z - 0.36) / 0.05);
    return { ...p, color: mixc(p.color, t, w) };
  };
}

export function sculptQuad(ctx) {
  const { variant, pal: C } = ctx;
  const v = VARIANTS[variant](C);
  return {
    spec: v.spec, sdf: v.sdf, face: v.face, props: v.props || [],
    cell: v.cell ?? 0.019, aoStep: 0.024 * (v.s ?? 1), tau: 0.026 * (v.s ?? 1),
    height: v.height ?? 0.7, radius: v.radius ?? 0.3,
    anim: 'quad', animOpts: v.anim ?? {}, spawn: v.spawn ?? (ctx.role === 'titan' ? 'rise' : ctx.role === 'form' ? 'pop' : 'rise'), glow: C.glow, emissivePulse: v.pulse ?? 0,
    noBlink: v.noBlink, stiffness: (v.s ?? 1) > 1.5 ? 220 : 300,
    stiff: { jaw: 600 },
  };
}

export function poseQuad(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const hs = c.def.height / 0.72;
  const w = smooth(sp * 1.6);
  const run = smooth((sp - 0.55) * 2.5);
  const idle = 1 - w;
  const br = Math.sin(t * 2.8);
  let mood = 'idle';
  // idle
  P.chest = [0.02 * br * idle, 0, 0];
  P.neck = [-0.05 + 0.05 * Math.sin(t * 0.7) * idle - 0.1 * w, 0.18 * Math.sin(t * 0.45) * idle, 0];
  P.head = [0.06 * Math.sin(t * 0.9) * idle + 0.1 * w, 0.2 * Math.sin(t * 0.37 + 1) * idle, 0.08 * Math.sin(t * 0.61) * idle];
  P.jaw = [0.05 + 0.05 * Math.max(0, br) * idle + 0.15 * run, 0, 0];
  const twitch = Math.max(0, Math.sin(t * 1.9) - 0.8) * 3;
  P['ear.L'] = [0.1 * twitch, 0, 0.1 * Math.sin(t * 1.3) - 0.15 * run];
  P['ear.R'] = [0.1 * twitch, 0, -0.1 * Math.sin(t * 1.3 + 0.4) + 0.15 * run];
  const wag = Math.sin(t * (7 + 5 * w));
  P.tail1 = [-0.35 + 0.35 * run, 0.45 * wag * (0.4 + 0.6 * idle), 0];
  P.tail2 = [0.1 * Math.sin(t * 2), 0.35 * Math.sin(t * (7 + 5 * w) - 0.8) * (0.4 + 0.6 * idle), 0];
  P.tail3 = [0.1, 0.3 * Math.sin(t * (7 + 5 * w) - 1.6), 0];
  // gait: trot (diagonal pairs) → gallop (front pair / hind pair)
  const A = lerp(0.5, 0.9, run) * w;
  const off = {
    'L.f': lerp(0, 0, run), 'R.f': lerp(Math.PI, 0.5, run),
    'L.h': lerp(Math.PI, Math.PI, run), 'R.h': lerp(0, Math.PI + 0.5, run),
  };
  for (const s of ['L', 'R']) {
    const pf = ph + off[s + '.f'], phh = ph + off[s + '.h'];
    P['fl.' + s] = [-Math.sin(pf) * A, 0, 0];
    P['flo.' + s] = [Math.max(0, Math.cos(pf)) * 1.1 * A, 0, 0];
    P['fp.' + s] = [Math.sin(pf) * 0.4 * A, 0, 0];
    P['hl.' + s] = [-Math.sin(phh) * A * 0.9, 0, 0];
    P['hlo.' + s] = [-Math.max(0, Math.cos(phh)) * 0.9 * A, 0, 0];
    P['hp.' + s] = [Math.sin(phh) * 0.5 * A, 0, 0];
  }
  P.spine = [0.12 * Math.sin(ph) * run, 0, 0];
  P.chest[0] += -0.1 * Math.sin(ph) * run;
  R.y += (Math.abs(Math.sin(ph)) * 0.025 * (1 - run) + Math.max(0, Math.sin(ph)) * 0.05 * run) * w * hs + 0.003 * br * idle;
  R.rx += (0.04 * Math.sin(ph) * run) * w;

  if (kind === 'attack') {
    const wind = smooth(k / 0.32), hit = smooth((k - 0.32) / 0.14), back = smooth((k - 0.6) / 0.4);
    const hold = 1 - back;
    const crouch = wind * (1 - hit);
    R.y += (-0.04 * crouch + 0.05 * Math.sin(Math.PI * clamp01((k - 0.3) / 0.25))) * hs;
    R.z += (-0.04 * crouch + 0.2 * hit * hold) * hs;
    R.rx += (-0.1 * crouch + 0.15 * hit * hold);
    P.neck[0] += (0.3 * crouch - 0.35 * hit) * hold;
    P.head[0] += (-0.2 * crouch + 0.1 * hit) * hold;
    const bite = Math.sin(Math.PI * clamp01((k - 0.2) / 0.3));
    P.jaw = [0.9 * bite, 0, 0];
    for (const s of ['L', 'R']) { P['fl.' + s][0] += (0.3 * crouch - 0.8 * hit) * hold; P['hl.' + s][0] += (-0.3 * crouch + 0.6 * hit) * hold; }
    P.tail1[0] += -0.3 * hold;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    const howl = smooth((k - 0.6) / 0.12) * (1 - smooth((k - 0.9) / 0.1));
    P.neck[0] += -0.8 * howl; P.head[0] += -0.3 * howl; P.jaw = [0.6 * howl, 0, 0];
    mood = howl > 0.3 ? 'happy' : 'idle';
  } else if (kind === 'hit') {
    P.neck[0] += 0.3 * (1 - k); P.jaw = [0.4 * (1 - k), 0, 0];
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.45);
    R.rz += 1.45 * f;
    R.y += (0.05 * Math.sin(Math.PI * clamp01(k / 0.3)) - 0.02 * f) * hs;
    for (const s of ['L', 'R']) { P['fl.' + s] = [-0.4 * f, 0, 0]; P['hl.' + s] = [0.4 * f, 0, 0]; }
    P.neck[0] += 0.3 * f; P.jaw = [0.4 * f, 0, 0];
    mood = 'ko';
  }
  return mood;
}
