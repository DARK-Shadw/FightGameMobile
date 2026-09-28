// Arena props, sculpted as SDFs. Each builder returns an SDF node sized for
// one 1 m tile unless noted. Variants are seeded so walls don't repeat.

import { S, P, hex, mixc, vnoise, fbm } from '../engine/sdf.js';

const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Stone with moss creeping over upward-facing surfaces and darker cracks.
function stonePaint(base, dark, moss, mossAmt = 0.5, seed = 0) {
  const a = hex(base), b = hex(dark), m = hex(moss);
  return (x, y, z, leaf, nx, ny) => {
    const n = fbm(x * 2.2 + seed, y * 2.2, z * 2.2 - seed, 3);
    let c = mixc(a, b, smooth(0.5 + n * 1.2) * 0.55);
    const blot = vnoise(x * 5.3 + seed, y * 5.3, z * 5.3) * 0.5 + 0.5;
    c = mixc(c, mixc(a, [1, 1, 1], 0.25), smooth((blot - 0.7) * 4) * 0.35);
    const top = smooth((ny - 0.35) * 2.2);
    const mossMask = smooth((top * (0.6 + 0.8 * fbm(x * 3.1 - seed, y * 3.1, z * 3.1, 2)) - (1 - mossAmt)) * 3);
    c = mixc(c, mixc(m, [0.95, 1, 0.6], 0.25 * blot), mossMask);
    return { color: c, gloss: 0.12 + mossMask * 0.08, emissive: 0 };
  };
}

// Wall block: a chunky, beveled stone cube with chipped corners and cracks.
export function stoneBlock(seed = 0, h = 0.62) {
  const r = i => hash(seed * 13.7 + i);
  const body = S.box([0, h / 2, 0], [0.47, h / 2, 0.47], 0.1);
  const chips = [];
  for (let i = 0; i < 3; i++) {
    const cx = (r(i) > 0.5 ? 1 : -1) * 0.47, cz = (r(i + 7) > 0.5 ? 1 : -1) * 0.47;
    chips.push(S.sphere([cx, h * (0.3 + 0.7 * r(i + 3)), cz], 0.1 + 0.07 * r(i + 11)));
  }
  const cracks = [];
  for (let i = 0; i < 2; i++) {
    const side = Math.floor(r(i + 20) * 4);
    const ang = side * Math.PI / 2;
    const px = Math.sin(ang) * 0.48, pz = Math.cos(ang) * 0.48;
    const y0 = h * (0.25 + 0.5 * r(i + 30));
    cracks.push(S.limb([px + Math.cos(ang) * (r(i + 40) - 0.5) * 0.5, y0, pz - Math.sin(ang) * (r(i + 40) - 0.5) * 0.5],
      [px + Math.cos(ang) * (r(i + 50) - 0.5) * 0.6, y0 + 0.18, pz - Math.sin(ang) * (r(i + 50) - 0.5) * 0.6], 0.012, 0.006));
  }
  const top = S.ellipsoid([0.08 * (r(60) - 0.5), h - 0.02, 0.08 * (r(61) - 0.5)], [0.36, 0.06, 0.36]);
  const shape = S.displace(S.sub(0.03, S.union(0.06, body, top), ...chips, ...cracks), 0.018, 5.5, 2, seed * 3.1);
  return shape.paint(stonePaint('#a9b4c9', '#6b7390', '#6fbf4a', 0.55, seed));
}

// Wooden crate with planks, a darker frame and metal corner caps.
export function crate(seed = 0) {
  const wood = hex('#d59a55'), woodDark = hex('#9a6331'), woodLight = hex('#e8b574');
  const planks = (x, y, z, leaf, nx, ny, nz, cell) => {
    // planks run horizontally on the sides, across on the top
    const u = Math.abs(ny) > 0.6 ? x * 0.9 + 0.3 : y;
    const f = (u * 4.2 + 10) % 1;
    const groove = smooth(Math.abs(f - 0.5) * 2 - 0.84) ;
    const grain = vnoise(x * 3 + seed, y * 22, z * 3) * 0.5 + 0.5;
    let c = mixc(wood, woodLight, grain * 0.4);
    c = mixc(c, woodDark, groove * 0.9);
    return { color: c, gloss: 0.12, emissive: 0 };
  };
  const box = S.box([0, 0.46, 0], [0.43, 0.43, 0.43], 0.05).paint(planks);
  const frame = [];
  const e = 0.44, t = 0.055;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push(S.box([sx * e, 0.46, sz * e], [t, 0.45, t], 0.03));
  for (const y of [0.03, 0.89]) {
    for (const sz of [-1, 1]) frame.push(S.box([0, y, sz * e], [0.45, t, t], 0.03));
    for (const sx of [-1, 1]) frame.push(S.box([sx * e, y, 0], [t, t, 0.45], 0.03));
  }
  const frameU = S.union(0.01, ...frame).paint(P('#8a5528', 0.14));
  const caps = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.04, 0.88]) caps.push(S.box([sx * 0.45, y, sz * 0.45], [0.075, 0.075, 0.075], 0.03));
  const capsU = S.union(0.005, ...caps).paint(P('#8d97ad', 0.75));
  const x = S.union(0.01,
    S.limb([-0.36, 0.1, 0.46], [0.36, 0.82, 0.46], 0.04),
    S.limb([-0.36, 0.1, -0.46], [0.36, 0.82, -0.46], 0.04),
  ).paint(P('#a46b35', 0.14));
  return S.union(0.012, box, frameU, capsU, x);
}

// Barrel: bulged staves and two metal hoops.
export function barrel() {
  const staves = (x, y, z) => {
    const a = Math.atan2(z, x);
    const f = ((a / (Math.PI * 2)) * 14 + 10) % 1;
    const g = smooth(Math.abs(f - 0.5) * 2 - 0.86);
    const grain = vnoise(a * 3, y * 18, 0) * 0.5 + 0.5;
    return { color: mixc(mixc(hex('#c9853f'), hex('#dea060'), grain * 0.5), hex('#7d4a22'), g), gloss: 0.14, emissive: 0 };
  };
  const body = S.inter(0.02, S.ellipsoid([0, 0.42, 0], [0.34, 0.5, 0.34]), S.box([0, 0.42, 0], [0.4, 0.4, 0.4], 0.02)).paint(staves);
  const hoops = S.union(0.01, S.torus([0, 0.2, 0], 0.325, 0.022), S.torus([0, 0.64, 0], 0.325, 0.022)).paint(P('#5d6378', 0.7));
  const lid = S.cyl([0, 0.82, 0], 0.27, 0.012, 0.01).paint(P('#8a5528', 0.12));
  return S.union(0.012, body, hoops, lid);
}

// Standing stone with carved glowing runes (emissive).
export function runestone(seed = 0, glow = '#5cf2ff') {
  const g = hex(glow), base = hex('#8d88a8'), dark = hex('#5b5676');
  const paint = (x, y, z, leaf, nx, ny, nz) => {
    const n = fbm(x * 2.5 + seed, y * 2.5, z * 2.5, 3);
    let c = mixc(base, dark, smooth(0.5 + n) * 0.6);
    // rune glyphs on the front and back faces
    let rune = 0;
    if (Math.abs(nz) > 0.55 && y > 0.3 && y < 1.3) {
      const u = x * 7, v = y * 7;
      const cell = Math.floor(v);
      const fu = u - Math.floor(u), fv = v - cell;
      const k = hash(cell * 3.1 + Math.floor(u) + seed);
      if (Math.abs(u) < 2.2) {
        if (k < 0.33) rune = smooth(1 - Math.abs(fu - 0.5) * 9);
        else if (k < 0.66) rune = smooth(1 - Math.abs(fv - 0.5) * 9) * (Math.abs(fu - 0.5) < 0.35 ? 1 : 0);
        else rune = smooth(1 - Math.abs(Math.hypot(fu - 0.5, fv - 0.5) - 0.3) * 12);
      }
    }
    if (rune > 0.05) return { color: mixc(c, g, rune), gloss: 0.4, emissive: rune };
    return { color: c, gloss: 0.15, emissive: 0 };
  };
  const stone = S.displace(S.union(0.05,
    S.taper([0, 0.7, 0], [0.26, 0.7, 0.16], 0.35, 0.08),
    S.ellipsoid([0, 0.1, 0], [0.33, 0.14, 0.24]),
  ), 0.015, 6, 2, seed);
  return stone.paint(paint);
}

// Fluffy bush made of leafy lumps with little leaf points on top.
export function bush(seed = 0, size = 1) {
  const r = i => hash(seed * 7.3 + i);
  const k = size;
  const lumps = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(i) * 0.6;
    const d = 0.26 * k * (0.6 + 0.4 * r(i + 10));
    lumps.push(S.sphere([Math.cos(a) * d, (0.34 + 0.12 * r(i + 20)) * k, Math.sin(a) * d], (0.24 + 0.07 * r(i + 30)) * k));
  }
  lumps.push(S.sphere([0, 0.55 * k, 0], 0.3 * k));
  const tips = [];
  for (let i = 0; i < 9; i++) {
    const a = r(i + 40) * Math.PI * 2, d = 0.3 * k * r(i + 50);
    const base = [Math.cos(a) * d, 0.62 * k, Math.sin(a) * d];
    tips.push(S.limb(base, [base[0] * 1.5, (0.8 + 0.12 * r(i + 60)) * k, base[2] * 1.5], 0.07 * k, 0.012 * k));
  }
  const dark = hex('#2f8a3a'), mid = hex('#4fb83e'), light = hex('#a6e05a');
  const paint = (x, y, z, leaf, nx, ny) => {
    const t = smooth((y / k - 0.1) / 0.75);
    const n = vnoise(x * 9 + seed, y * 9, z * 9) * 0.5 + 0.5;
    let c = mixc(dark, mid, t);
    c = mixc(c, light, smooth((ny * 0.6 + n * 0.6 + t * 0.4 - 0.75) * 3) * 0.8);
    return { color: c, gloss: 0.18, emissive: 0 };
  };
  return S.displace(S.union(0.08 * k, ...lumps, ...tips), 0.03 * k, 7 / k, 2, seed).paint(paint);
}

export function rock(seed = 0, size = 1) {
  const r = i => hash(seed * 5.1 + i);
  const k = size;
  const parts = [S.ellipsoid([0, 0.18 * k, 0], [0.42 * k, 0.28 * k, 0.36 * k]).rot(0, r(1) * 3, 0.15)];
  if (r(2) > 0.4) parts.push(S.ellipsoid([0.28 * k, 0.12 * k, 0.1 * k], [0.22 * k, 0.16 * k, 0.2 * k]).rot(0, r(3) * 3, 0));
  return S.displace(S.union(0.06 * k, ...parts), 0.035 * k, 3.5 / k, 3, seed).paint(stonePaint('#b3b8c8', '#737892', '#79c24e', 0.45, seed));
}

// Stylized tree: bent trunk, big layered canopy.
export function tree(seed = 0, size = 1) {
  const r = i => hash(seed * 3.7 + i);
  const k = size;
  const lean = (r(1) - 0.5) * 0.3;
  const trunk = S.union(0.08 * k,
    S.limb([0, 0, 0], [lean * k, 1.2 * k, 0], 0.22 * k, 0.14 * k),
    S.limb([lean * k, 1.1 * k, 0], [lean * k + 0.35 * k, 1.6 * k, 0.1 * k], 0.1 * k, 0.07 * k),
    S.ellipsoid([0, 0.05 * k, 0], [0.34 * k, 0.12 * k, 0.34 * k]),
  ).paint((x, y, z) => {
    const a = Math.atan2(z, x);
    const g = vnoise(a * 2, y * 8 / k, seed) * 0.5 + 0.5;
    return { color: mixc(hex('#7a4a2c'), hex('#a8703f'), g * 0.7), gloss: 0.1, emissive: 0 };
  });
  const blobs = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(i + 5);
    blobs.push(S.sphere([lean * k + Math.cos(a) * 0.55 * k, (1.75 + 0.3 * r(i + 9)) * k, Math.sin(a) * 0.55 * k], (0.52 + 0.15 * r(i + 13)) * k));
  }
  blobs.push(S.sphere([lean * k, 2.2 * k, 0], 0.7 * k));
  const dark = hex('#1f6e3a'), mid = hex('#3fa144'), light = hex('#9ad45a');
  const canopy = S.displace(S.union(0.18 * k, ...blobs), 0.06 * k, 3 / k, 3, seed).paint((x, y, z, leaf, nx, ny) => {
    const t = smooth((y / k - 1.3) / 1.4);
    const n = vnoise(x * 4 / k + seed, y * 4 / k, z * 4 / k) * 0.5 + 0.5;
    let c = mixc(dark, mid, t);
    c = mixc(c, light, smooth((ny * 0.7 + n * 0.5 - 0.65) * 3) * 0.75);
    return { color: c, gloss: 0.15, emissive: 0 };
  });
  return S.union(0.05 * k, trunk, canopy);
}

export function fence() {
  const wood = P('#c08a52', 0.12);
  return S.union(0.02,
    S.box([-0.42, 0.4, 0], [0.07, 0.4, 0.07], 0.04),
    S.box([0.42, 0.4, 0], [0.07, 0.4, 0.07], 0.04),
    S.box([0, 0.55, 0], [0.5, 0.055, 0.04], 0.03),
    S.box([0, 0.28, 0], [0.5, 0.055, 0.04], 0.03),
    S.ellipsoid([-0.42, 0.82, 0], [0.08, 0.05, 0.08]),
    S.ellipsoid([0.42, 0.82, 0], [0.08, 0.05, 0.08]),
  ).paint(wood);
}

export function mushroom(seed = 0) {
  // a little cluster of toadstools: red caps with crisp white spots
  const r = i => hash(seed * 9.1 + i);
  const spots = [];
  for (let i = 0; i < 7; i++) { const a = i * 2.4 + r(i) * 0.6, d = i ? 0.55 + r(i + 9) * 0.3 : 0; spots.push([Math.cos(a) * d, Math.sin(a) * d]); }
  const capPaint = (cx, cz, R) => (x, y, z) => {
    const u = (x - cx) / R, v = (z - cz) / R;
    let spot = 0;
    for (const [sx, sz] of spots) if (Math.hypot(u - sx * 0.8, v - sz * 0.8) < 0.2) spot = 1;
    const rim = Math.min(1, Math.max(0, (Math.hypot(u, v) - 0.75) / 0.25));
    const col = spot ? [1, 0.98, 0.92] : [0.93 - rim * 0.25, 0.2 - rim * 0.08, 0.26 - rim * 0.08];
    return { color: col, gloss: 0.45, emissive: 0 };
  };
  const one = (x, z, s) => S.union(0.03,
    S.limb([x, 0, z], [x + 0.02 * s, 0.2 * s, z], 0.06 * s, 0.045 * s).paint(P('#f4ead2', 0.2)),
    S.ellipsoid([x + 0.02 * s, 0.22 * s, z], [0.16 * s, 0.085 * s, 0.16 * s]).paint(capPaint(x + 0.02 * s, z, 0.16 * s)),
  );
  return S.union(0.02, one(0, 0, 1), one(0.2, 0.1, 0.62), one(-0.12, 0.17, 0.48));
}
