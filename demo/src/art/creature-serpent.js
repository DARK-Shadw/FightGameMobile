// Serpents: the Star Serpent and Dream Leviathan titans (flying, sinuous)
// and the Leviathan form (a sea serpent rising from its coil). The body is
// a chain of tapered segments on a bone chain rooted mid-body (front chain
// f1..fN toward the head, back chain b1..bM toward the tail), animated with
// a traveling wave.

import {
  S, P, G, TAU, add, sub, mul, mix3, norm, fx, lerp, smooth, clamp01, tube, horn, spike, flame, tone, glowGrad, glowRadial,
  starry, scaled, mottle, bands, eyes, mouth, hex, mixc,
} from './creature-kit.js';

// Builds a chain body along points (tail → head). Returns spec entries, the
// segment union and the bone name owning each point.
function chainBody(pts, radii, mid) {
  const spec = { root: { pos: [0, 0, 0] }, body: { parent: 'root', pos: pts[mid] } };
  const boneAt = new Array(pts.length);
  boneAt[mid] = 'body';
  let par = 'body';
  for (let i = mid + 1; i < pts.length; i++) { const n = 'f' + (i - mid); spec[n] = { parent: par, pos: pts[i] }; boneAt[i] = n; par = n; }
  par = 'body';
  for (let i = mid - 1; i >= 0; i--) { const n = 'b' + (mid - i); spec[n] = { parent: par, pos: pts[i] }; boneAt[i] = n; par = n; }
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    // segment i..i+1 belongs to the bone nearer the body center
    const owner = i >= mid ? boneAt[i] : boneAt[i + 1];
    segs.push(S.limb(pts[i], pts[i + 1], radii[i], radii[i + 1]).bone(owner));
  }
  return { spec, segs, boneAt };
}

// Dragon-ish head at `h` facing `fwd` (unit, mostly +Z). Returns core (face target), parts.
function serpentHead(h, s, paint, o) {
  const q = (x, y, z) => [h[0] + x * s, h[1] + y * s, h[2] + z * s];
  const core = S.union(0.05 * s,
    S.ellipsoid(q(0, 0.05, 0), [0.22 * s, 0.17 * s, 0.26 * s]),
    S.ellipsoid(q(0, -0.02, 0.24), [0.15 * s, 0.1 * s, 0.2 * s]),
    S.mirror(S.ellipsoid(q(0.12, 0.12, 0.1), [0.09 * s, 0.045 * s, 0.1 * s]).rot(0.2, 0.25, -0.2)),
  ).paint(paint);
  return { core, q };
}

const VARIANTS = {
  // ── Star Serpent (space titan): a cosmic sky-dragon looping through the air.
  space: (C, ctx) => {
    const s = 1.0;
    const hide = starry(tone('#5b21b6', '#1c0b44', '#c084fc', 0.8, 2.6, 0.45, 0.4), '#ffffff', 10, 0.78, 1);
    const bellyP = tone('#f5c2ff', '#c026d3', '#fdf4ff', 0.8, 2.6, 0.4, 0.3);
    const glowM = glowGrad('#e879f9', '#fdf4ff', 1.0, 3.2, 1, 0.5);
    const N = 16, mid = 9;
    const pts = [], radii = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push([1.25 * Math.sin(TAU * 1.05 * u + 0.3) * (0.3 + 0.7 * (1 - u)) * s, (0.9 + 0.8 * Math.sin(Math.PI * u * 1.2) + 1.2 * u * u) * s, (-2.6 + 3.9 * u) * s]);
      radii.push((0.045 + 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.12)) ** 0.5) * s);
    }
    const { spec, segs, boneAt } = chainBody(pts, radii, mid);
    const head = add(pts[N], [0, 0.08 * s, 0.14 * s]);
    spec.head = { parent: boneAt[N], pos: head };
    spec.jaw = { parent: 'head', pos: add(head, [0, -0.06 * s, 0.14 * s]) };
    const body = S.union(0.04 * s, ...segs).paint(hide);
    // belly stripe: slightly smaller, lower copy of the segments
    const bellyStrip = S.union(0.03 * s, ...segs.map((sg, i) => S.limb(add(pts[i], [0, -radii[i] * 0.35, 0]), add(pts[i + 1], [0, -radii[i + 1] * 0.35, 0]), radii[i] * 0.72, radii[i + 1] * 0.72).bone(i >= mid ? boneAt[i] : boneAt[i + 1]))).paint(bellyP);
    const frills = S.union(0.01 * s, ...pts.slice(1, N).map((p, i) => spike(add(p, [0, radii[i + 1] * 0.8, 0]), add(p, [0, radii[i + 1] * 0.8 + 0.16 * s, -0.12 * s]), 0.045 * s).bone(boneAt[i + 1]))).paint(glowM);
    const hs2 = 1.25;
    const { core, q } = serpentHead(head, s * hs2, hide, {});
    const headParts = S.union(0.02 * s,
      core,
      S.mirror(S.union(0.01 * s,
        tube(q(0.1, 0.16, -0.05), q(0.22, 0.45, -0.1), q(0.18, 0.62, -0.32), 0.045 * s, 0.012 * s, 3),
        spike(q(0.19, 0.4, -0.12), q(0.34, 0.5, -0.05), 0.025 * s),
        spike(q(0.2, 0.55, -0.22), q(0.33, 0.66, -0.25), 0.02 * s),
      )).paint(glowM),
      S.mirror(tube(q(0.1, -0.02, 0.36), q(0.3, -0.05, 0.3), q(0.45, -0.2, 0.05), 0.02 * s, 0.006 * s, 3)).paint(glowM),
      S.union(0.01 * s, ...[0, 1, 2, 3].map(i => spike(q(0, 0.2 - i * 0.03, -0.12 - i * 0.1), q(0, 0.42 - i * 0.05, -0.3 - i * 0.12), 0.05 * s))).paint(glowM),
      S.ellipsoid(q(0, -0.07, 0.2), [0.1 * s, 0.04 * s, 0.16 * s]).paint(G('#f5c2ff', 1, 0.5)),
      S.mirror(S.union(0, ...[0, 1, 2].map(i => spike(q(0.09 - i * 0.01, -0.07, 0.26 + i * 0.05), q(0.087 - i * 0.01, -0.12, 0.27 + i * 0.05), 0.016 * s)))).paint(P('#ffffff', 0.5)),
    ).bone('head');
    const jaw = S.ellipsoid(q(0, -0.12, 0.22), [0.12 * s * hs2, 0.05 * s * hs2, 0.19 * s * hs2]).paint(hide).bone('jaw');
    spec.jaw = { parent: 'head', pos: q(0, -0.06, 0.14) };
    const fin = S.union(0.01 * s, ...[-0.6, 0, 0.6].map(a => S.limb(pts[0], add(pts[0], [Math.sin(a) * 0.35 * s, Math.cos(a) * 0.2 * s, -0.3 * s]), 0.06 * s, 0.01 * s))).paint(glowM).bone(boneAt[0]);
    const face = eyes(q(0.14, 0.12, 0.13), [0.1 * s * hs2, 0.075 * s * hs2], { iris: '#ffffff', iris2: '#e879f9', sclera: '#1c0b44', ink: '#1c0b44', angry: 0.6, lidRest: 0.15, irisSize: 0.7, pupilSize: 0.2, dir: [0.8, 0.3, 0.6], glow: 1.0 });
    return {
      spec, sdf: S.union(0.03 * s, body, bellyStrip, frills, headParts, jaw, fin), face: { sdf: core, bone: 'head', features: face },
      height: 3.1 * s, radius: 1.3 * s, cell: 0.03, anim: { fly: 1, amp: 0.1 }, spawn: 'drop', pulse: 0.15,
      props: [0, 1, 2].map(i => ({ sdf: S.union(0.01, S.limb([Math.sin(i * 2.1) * 1.3, 1.6 + i * 0.4, Math.cos(i * 2.1) * 1.3], [Math.sin(i * 2.1) * 1.3, 1.72 + i * 0.4, Math.cos(i * 2.1) * 1.3], 0.05, 0.005), S.limb([Math.sin(i * 2.1) * 1.3, 1.6 + i * 0.4, Math.cos(i * 2.1) * 1.3], [Math.sin(i * 2.1) * 1.3, 1.48 + i * 0.4, Math.cos(i * 2.1) * 1.3], 0.05, 0.005), S.limb([Math.sin(i * 2.1) * 1.3 - 0.12, 1.6 + i * 0.4, Math.cos(i * 2.1) * 1.3], [Math.sin(i * 2.1) * 1.3 + 0.12, 1.6 + i * 0.4, Math.cos(i * 2.1) * 1.3], 0.05, 0.005)).paint(G('#fff6ff', 1, 0.6)), bone: 'root', spin: 0.4, cell: 0.02, outline: false })),
    };
  },

  // ── Dream Leviathan (mind titan): a floating whale of dreams with fins, belly grooves and a crescent horn.
  mind: (C, ctx) => {
    const s = 1.0;
    const hide = starry((x, y, z, l, nx, ny, nz) => {
      const t = smooth((ny + 0.3) / 1.0);
      let col = mixc(hex('#fbcfe8'), hex('#c084fc'), 1 - t);
      col = mixc(col, hex('#f9a8d4'), smooth((ny - 0.5) / 0.4) * 0.6);
      return { color: col, gloss: 0.45, emissive: 0 };
    }, '#ffffff', 9, 0.82, 1);
    const bellyP = bands('#fdf2f8', '#f5d0fe', [0, 0, 0], [1, 0, 0], 0.12, 0.3, 0.3, 0.3);
    const finP = tone('#e879f9', '#a21caf', '#fdf4ff', 1.0, 2.2, 0.35, 0.4);
    const N = 10, mid = 6;
    const pts = [], radii = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push([0.35 * Math.sin(TAU * 0.6 * u + 1.2) * s, (1.55 + 0.15 * Math.sin(TAU * 0.5 * u) + 0.2 * u) * s, (-2.6 + 3.6 * u) * s]);
      radii.push((0.1 + 0.62 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.02)) ** 1.2) * s);
    }
    const { spec, segs, boneAt } = chainBody(pts, radii, mid);
    const head = add(pts[N], [0, 0.0, 0.1 * s]);
    spec.head = { parent: boneAt[N], pos: head };
    spec['fin.L'] = { parent: boneAt[N - 3], pos: add(pts[N - 3], [0.5 * s, -0.2 * s, 0]) };
    spec['fin.R'] = { parent: boneAt[N - 3], pos: add(pts[N - 3], [-0.5 * s, -0.2 * s, 0]) };
    const body = S.union(0.08 * s, ...segs).paint(hide);
    const bellyStrip = S.union(0.05 * s, ...segs.slice(3).map((sg, j) => { const i = j + 3; return S.limb(add(pts[i], [0, -radii[i] * 0.4, 0.02 * s]), add(pts[i + 1], [0, -radii[i + 1] * 0.4, 0.02 * s]), radii[i] * 0.66, radii[i + 1] * 0.66).bone(i >= mid ? boneAt[i] : boneAt[i + 1]); })).paint(bellyP);
    const hc = add(head, [0, 0.02 * s, 0.05 * s]);
    const core = S.ellipsoid(hc, [0.58 * s, 0.55 * s, 0.5 * s]);
    const headParts = S.union(0.04 * s,
      core.paint(hide),
      S.ellipsoid(add(hc, [0, -0.14 * s, 0.4 * s]), [0.36 * s, 0.03 * s, 0.1 * s]).paint(P('#6b21a8', 0.3)),
      tube(add(hc, [0, 0.45 * s, 0.1 * s]), add(hc, [0, 0.85 * s, 0.1 * s]), add(hc, [0, 0.95 * s, -0.25 * s]), 0.09 * s, 0.015 * s, 4).paint(glowGrad('#fde68a', '#fffbeb', hc[1] + 0.4 * s, hc[1] + 0.95 * s, 1, 0.6)),
    ).bone('head');
    const finShape = (side) => S.ellipsoid(add(pts[N - 3], [side * 0.72 * s, -0.25 * s, -0.05 * s]), [0.42 * s, 0.05 * s, 0.22 * s]).rot(0.2, side * 0.3, side * -0.35);
    const fins = S.union(0.03 * s, finShape(1).bone('fin.L'), finShape(-1).bone('fin.R')).paint(finP);
    const dorsal = S.ellipsoid(add(pts[5], [0, radii[5] * 0.95, 0]), [0.05 * s, 0.26 * s, 0.35 * s]).rot(-0.5, 0, 0).paint(finP).bone(boneAt[5]);
    const fluke = S.union(0.02 * s, S.mirror(S.ellipsoid(add(pts[0], [0.32 * s, 0, -0.18 * s]), [0.38 * s, 0.04 * s, 0.2 * s]).rot(0, -0.5, 0))).paint(finP).bone(boneAt[0]);
    const face = [
      ...eyes([0.42 * s, hc[1] + 0.05 * s, hc[2] + 0.26 * s], [0.16 * s, 0.14 * s], { iris: '#ffe14d', iris2: '#c026d3', ink: '#4a0a2c', angry: 0, lidRest: 0.35, irisSize: 0.62, pupilSize: 0.25, dir: [0.85, 0.1, 0.5], glow: 0.7 }),
    ];
    return {
      spec, sdf: S.union(0.03 * s, body, bellyStrip, headParts, fins, dorsal, fluke), face: { sdf: core, bone: 'head', features: face },
      height: 2.7 * s, radius: 1.3 * s, cell: 0.04, anim: { fly: 1, amp: 0.07, slow: 1 }, spawn: 'drop', pulse: 0.1,
      props: [0, 1, 2, 3].map(i => ({ sdf: S.sphere([Math.sin(i * 1.6) * 1.5, 1.2 + (i % 2) * 0.9, Math.cos(i * 1.6) * 1.5], 0.09 - i * 0.012).paint(P('#fce7f3', 0.9, 0.5)), bone: 'root', spin: 0.3, cell: 0.02 })),
    };
  },

  // ── Leviathan (tide form): a sea serpent rising from its coil, finned head, clawed arms, glowing spots.
  tide: (C, ctx) => {
    const s = 1.0;
    const scalesP = (x, y, z, l, nx, ny, nz) => {
      const up = smooth((nz + 0.2) / 0.6);
      let col = mixc(hex('#1e3a8a'), hex('#2f6fed'), smooth((y - 0.2) / 1.2));
      col = mixc(col, hex('#5eead4'), up * smooth((0.12 - Math.abs(x)) / 0.08) * 0.85);
      return { color: col, gloss: 0.55, emissive: 0 };
    };
    const hide = scaled(scalesP, '#12306e', 18, 0.22, 0.1);
    const spots = (x, y, z, l, nx, ny, nz, cell) => {
      const p = hide(x, y, z, l, nx, ny, nz, cell);
      const k = Math.sin(y * 22) * Math.sin(Math.atan2(x, z) * 6);
      const t = smooth((k - 0.8) / 0.1) * smooth((Math.abs(x) - 0.08) / 0.05);
      return t > 0.02 ? { color: mixc(p.color, hex('#a5f3fc'), t), gloss: p.gloss, emissive: t } : p;
    };
    const finP = tone('#38bdf8', '#1d4ed8', '#e0f2fe', 0.8, 2.1, 0.45, 0.4);
    const pts = [[0, 0.2, 0.2], [0, 0.55, 0.22], [0, 0.92, 0.14], [0, 1.25, 0.12], [0, 1.52, 0.2]].map(p => p.map(x => x * s));
    const radii = [0.21, 0.19, 0.17, 0.15, 0.13].map(r => r * s);
    const spec = { root: { pos: [0, 0, 0] }, hips: { parent: 'root', pos: [0, 0.14 * s, -0.1 * s] }, f1: { parent: 'hips', pos: pts[0] }, f2: { parent: 'f1', pos: pts[1] }, f3: { parent: 'f2', pos: pts[2] }, f4: { parent: 'f3', pos: pts[3] }, f5: { parent: 'f4', pos: pts[4] } };
    const head = [0, 1.66 * s, 0.3 * s];
    spec.head = { parent: 'f5', pos: head };
    spec.jaw = { parent: 'head', pos: [0, 1.62 * s, 0.42 * s] };
    for (const [sd, f] of [['L', p => p], ['R', fx]]) {
      spec['upperArm.' + sd] = { parent: 'f3', pos: f([0.16 * s, 1.08 * s, 0.2 * s]) };
      spec['foreArm.' + sd] = { parent: 'upperArm.' + sd, pos: f([0.3 * s, 0.88 * s, 0.3 * s]) };
    }
    spec.b1 = { parent: 'hips', pos: [0.3 * s, 0.1 * s, -0.4 * s] };
    spec.b2 = { parent: 'b1', pos: [0.5 * s, 0.08 * s, -0.1 * s] };
    const segs = [];
    const names = ['f1', 'f2', 'f3', 'f4'];
    for (let i = 0; i < 4; i++) segs.push(S.limb(pts[i], pts[i + 1], radii[i], radii[i + 1]).bone(names[i]));
    segs.push(S.limb(pts[4], head, radii[4], 0.12 * s).bone('f5'));
    const coil = S.union(0.05 * s,
      S.torus([0, 0.15 * s, -0.12 * s], 0.34 * s, 0.16 * s).bone('hips'),
      S.limb([0, 0.18 * s, 0.1 * s], pts[0], 0.2 * s, radii[0]).bone('f1'),
      tube([0.3 * s, 0.12 * s, -0.4 * s], [0.62 * s, 0.1 * s, -0.3 * s], [0.66 * s, 0.1 * s, 0.1 * s], 0.13 * s, 0.03 * s, 3).bone('b2'),
    );
    const body = S.union(0.05 * s, coil, ...segs).paint(spots);
    const crest = S.union(0.01 * s,
      ...[[1.72, 0.2], [1.58, 0.06], [1.36, -0.02], [1.1, -0.03], [0.82, 0.02], [0.52, 0.06]].map(([y, z], i) => spike([0, y * s, z * s], [0, (y + 0.06) * s, (z - 0.2) * s], (0.07 - i * 0.006) * s).bone(i < 2 ? 'head' : i < 3 ? 'f4' : i < 4 ? 'f3' : 'f2')),
    ).paint(finP);
    const hc = [0, 1.72 * s, 0.34 * s];
    const core = S.union(0.05 * s,
      S.ellipsoid(hc, [0.17 * s, 0.14 * s, 0.22 * s]),
      S.ellipsoid([0, 1.66 * s, 0.54 * s], [0.12 * s, 0.08 * s, 0.16 * s]),
      S.mirror(S.ellipsoid([0.1 * s, 1.79 * s, 0.44 * s], [0.08 * s, 0.035 * s, 0.09 * s]).rot(0.2, 0.25, -0.2)),
    ).paint(hide);
    const headParts = S.union(0.015 * s,
      core,
      S.mirror(S.union(0.01 * s,
        S.ellipsoid([0.2 * s, 1.74 * s, 0.26 * s], [0.03 * s, 0.13 * s, 0.14 * s]).rot(0.3, 0.5, -0.4),
        spike([0.18 * s, 1.74 * s, 0.26 * s], [0.34 * s, 1.92 * s, 0.1 * s], 0.025 * s),
        spike([0.18 * s, 1.7 * s, 0.24 * s], [0.36 * s, 1.74 * s, 0.06 * s], 0.022 * s),
      )).paint(finP),
      S.ellipsoid([0, 1.61 * s, 0.5 * s], [0.09 * s, 0.03 * s, 0.14 * s]).paint(P('#3a0a1a', 0.3)),
      S.mirror(S.union(0, ...[0, 1, 2].map(i => spike([(0.085 - i * 0.01) * s, 1.62 * s, (0.56 + i * 0.045) * s], [(0.083 - i * 0.01) * s, 1.57 * s, (0.57 + i * 0.045) * s], 0.016 * s)))).paint(P('#ffffff', 0.5)),
    ).bone('head');
    const jaw = S.ellipsoid([0, 1.575 * s, 0.52 * s], [0.1 * s, 0.045 * s, 0.16 * s]).paint(hide).bone('jaw');
    const arms = S.mirror(S.union(0.02 * s,
      S.limb([0.14 * s, 1.08 * s, 0.2 * s], [0.3 * s, 0.88 * s, 0.3 * s], 0.06 * s, 0.05 * s).bone('upperArm.L'),
      S.limb([0.3 * s, 0.88 * s, 0.3 * s], [0.34 * s, 0.72 * s, 0.44 * s], 0.05 * s, 0.045 * s).bone('foreArm.L'),
      S.ellipsoid([0.35 * s, 0.68 * s, 0.48 * s], [0.06 * s, 0.05 * s, 0.06 * s]).bone('foreArm.L'),
      ...[-1, 0, 1].map(i => tube([(0.35 + i * 0.03) * s, 0.66 * s, 0.52 * s], [(0.36 + i * 0.035) * s, 0.62 * s, 0.6 * s], [(0.36 + i * 0.04) * s, 0.56 * s, 0.62 * s], 0.016 * s, 0.004 * s, 2).paint(P('#e0f2fe', 0.5)).bone('foreArm.L')),
      S.ellipsoid([0.3 * s, 0.9 * s, 0.24 * s], [0.02 * s, 0.1 * s, 0.1 * s]).rot(0.5, 0.3, 0).paint(finP).bone('upperArm.L'),
    )).paint(hide);
    const face = eyes([0.13 * s, 1.78 * s, 0.47 * s], [0.085 * s, 0.07 * s], { iris: '#a5f3fc', iris2: '#0e7490', sclera: '#ecfeff', ink: '#0c2260', angry: 0.75, lidRest: 0.18, irisSize: 0.65, pupilSize: 0.2, dir: [0.7, 0.35, 0.65], glow: 0.8 });
    return {
      spec, sdf: S.union(0.03 * s, body, crest, headParts, jaw, arms), face: { sdf: core, bone: 'head', features: face },
      height: 1.95 * s, radius: 0.6 * s, cell: 0.024, anim: { upright: 1, amp: 0.06 }, spawn: 'pop', pulse: 0.2,
    };
  },
};

export function sculptSerpent(ctx) {
  const { variant, pal: C } = ctx;
  const v = VARIANTS[variant](C, ctx);
  return {
    spec: v.spec, sdf: v.sdf, face: v.face, props: v.props || [],
    cell: v.cell, aoStep: v.cell * 1.4, tau: v.cell * 1.8,
    height: v.height, radius: v.radius,
    anim: 'serpent', animOpts: v.anim, spawn: v.spawn, glow: C.glow, emissivePulse: v.pulse ?? 0,
    stiffness: 160, hitLean: 0.4, stiff: { jaw: 400 },
  };
}

export function poseSerpent(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const o = c.def.animOpts;
  const w = smooth(sp * 1.6);
  const amp = (o.amp ?? 0.1) * (1 + 0.6 * w);
  const rate = (o.slow ? 1.0 : 1.6) * (1 + 1.2 * w);
  let mood = 'idle';
  for (let i = 1; i <= 12; i++) {
    P['f' + i] = [0.04 * Math.sin(t * rate * 0.7 - i * 0.5), amp * Math.sin(t * rate - i * 0.7), 0.03 * Math.sin(t * rate * 0.8 - i * 0.6)];
    P['b' + i] = [0.04 * Math.sin(t * rate * 0.7 + i * 0.5), amp * 1.3 * Math.sin(t * rate + i * 0.7), 0];
  }
  P.body = [0, 0.05 * Math.sin(t * rate * 0.5), 0.04 * Math.sin(t * 0.7)];
  P.head = [0.05 * Math.sin(t * 0.9), -0.15 * Math.sin(t * rate - 5), 0.05 * Math.sin(t * 0.6)];
  P.jaw = [0.08 + 0.06 * Math.max(0, Math.sin(t * 1.3)), 0, 0];
  P['fin.L'] = [0, 0, 0.25 * Math.sin(t * rate * 1.2)]; P['fin.R'] = [0, 0, -0.25 * Math.sin(t * rate * 1.2)];
  P['upperArm.L'] = [-0.2 + 0.1 * Math.sin(t * 1.4), 0, 0.2]; P['upperArm.R'] = [-0.2 + 0.1 * Math.sin(t * 1.4 + 1), 0, -0.2];
  P['foreArm.L'] = [-0.4, 0, 0]; P['foreArm.R'] = [-0.4, 0, 0];
  if (o.fly) { R.y += 0.12 * Math.sin(t * 0.9) * c.def.height / 2.8; R.rx += 0.1 * w; }
  if (o.upright) { R.y += 0.01 * Math.sin(t * 1.3); P.f1 = [0.05 * w + 0.03 * Math.sin(t * 1.2), 0.06 * Math.sin(t * 1.4), 0.04 * Math.sin(t * 1.1)]; }
  if (kind === 'attack') {
    const draw = smooth(k / 0.3), strike = smooth((k - 0.3) / 0.12), back = smooth((k - 0.65) / 0.35);
    const hold = 1 - back, pull = draw * (1 - strike);
    for (let i = 1; i <= 5; i++) P['f' + i][0] += (-0.12 * pull + 0.1 * strike * hold) * (o.upright ? 1.4 : 1);
    P.head[0] += (-0.25 * pull + 0.2 * strike) * hold;
    P.jaw = [0.1 + (0.3 * pull + 0.7 * strike) * hold, 0, 0];
    P['upperArm.L'] = [(-0.6 * pull - 1.2 * strike) * hold - 0.2, 0, 0.3]; P['upperArm.R'] = [(-0.6 * pull - 1.2 * strike) * hold - 0.2, 0, -0.3];
    R.z += 0.15 * strike * hold * c.def.height / 2;
    R.emi = 1 + 1.2 * strike * hold;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    const roar = smooth((k - 0.55) / 0.12) * (1 - smooth((k - 0.9) / 0.1));
    P.jaw = [0.1 + 0.7 * roar, 0, 0]; P.head[0] -= 0.3 * roar;
    mood = roar > 0.3 ? 'fierce' : 'idle';
  } else if (kind === 'hit') {
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.5);
    R.y -= (o.fly ? 0.8 : 0.05) * f * c.def.height / 2.8;
    R.rz += 0.6 * f;
    for (let i = 1; i <= 5; i++) P['f' + i][0] += 0.2 * f;
    P.jaw = [0.5 * f, 0, 0];
    mood = 'ko';
  }
  return mood;
}
