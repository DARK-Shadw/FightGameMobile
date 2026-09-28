// Dragons: Fire Drake, Frost Wyrm and Bone Dragon titans, and the Dragon
// form. Four-legged winged body: deep chest, S-curved neck, horned head with
// a hinged jaw and a glowing throat, back spikes, belly plates, a tapering
// tail, membrane wings on two bones each. The bone dragon swaps flesh for a
// ribcage, vertebrae and tattered wings around a soul-fire core.

import {
  S, P, G, TAU, add, sub, mul, mix3, norm, fx, lerp, smooth, clamp01, tube, horn, spike, flame, tone, glowGrad, glowRadial,
  scaled, veins, mottle, batWing, eyes, hex, mixc,
} from './creature-kit.js';

const J0 = {
  hips: [0, 0.72, -0.35], spine: [0, 0.78, -0.05], chest: [0, 0.82, 0.22],
  neck1: [0, 0.98, 0.42], neck2: [0, 1.18, 0.55], head: [0, 1.32, 0.66], jaw: [0, 1.29, 0.8],
  fs: [0.2, 0.8, 0.3], fe: [0.25, 0.45, 0.36], fw: [0.25, 0.14, 0.38],
  hs: [0.22, 0.74, -0.4], he: [0.28, 0.46, -0.24], hw: [0.28, 0.14, -0.44],
  t1: [0, 0.7, -0.62], t2: [0, 0.6, -0.95], t3: [0, 0.5, -1.25], t4: [0, 0.42, -1.55], t5: [0, 0.38, -1.8],
  wing: [0.16, 1.02, 0.12],
};

function specFor(J) {
  const sp = {
    root: { pos: [0, 0, 0] },
    hips: { parent: 'root', pos: J.hips }, spine: { parent: 'hips', pos: J.spine }, chest: { parent: 'spine', pos: J.chest },
    neck1: { parent: 'chest', pos: J.neck1 }, neck2: { parent: 'neck1', pos: J.neck2 }, head: { parent: 'neck2', pos: J.head }, jaw: { parent: 'head', pos: J.jaw },
    tail1: { parent: 'hips', pos: J.t1 }, tail2: { parent: 'tail1', pos: J.t2 }, tail3: { parent: 'tail2', pos: J.t3 }, tail4: { parent: 'tail3', pos: J.t4 },
  };
  for (const [s, f] of [['L', p => p], ['R', fx]]) {
    sp['fl.' + s] = { parent: 'chest', pos: f(J.fs) }; sp['flo.' + s] = { parent: 'fl.' + s, pos: f(J.fe) }; sp['fp.' + s] = { parent: 'flo.' + s, pos: f(J.fw) };
    sp['hl.' + s] = { parent: 'hips', pos: f(J.hs) }; sp['hlo.' + s] = { parent: 'hl.' + s, pos: f(J.he) }; sp['hp.' + s] = { parent: 'hlo.' + s, pos: f(J.hw) };
  }
  return sp;
}

// Belly plates: lighter bands on the underside and the front of the neck.
function hide(o, s) {
  const base = hex(o.body), dark = hex(o.dark), light = hex(o.light), bel = hex(o.belly), plateLine = hex(o.plateLine ?? o.dark);
  return (x, y, z, l, nx, ny, nz) => {
    let col = mixc(dark, base, smooth((y / s - 0.45) / 0.5) * 0.6 + 0.4);
    if (ny > 0) col = mixc(col, light, ny * ny * 0.35);
    // darker back ridge
    col = mixc(col, dark, smooth((ny - 0.55) / 0.3) * 0.55);
    const under = smooth((-ny + 0.05) / 0.35) * smooth((y / s - 0.35) / 0.1);
    const front = smooth((nz - 0.2) / 0.4) * smooth((z / s - 0.3) / 0.1) * smooth((1.26 - y / s) / 0.06) * smooth((0.14 - Math.abs(x) / s) / 0.05);
    const b = Math.max(under, front);
    if (b > 0) {
      const band = Math.abs(((z / s) * 7.5 + (y / s) * 3) % 1 - 0.5) < 0.08 ? 1 : 0;
      col = mixc(col, mixc(bel, plateLine, band * 0.5), b);
    }
    return { color: col, gloss: o.gloss ?? 0.35, emissive: 0 };
  };
}

function fleshDragon(C, o, s, titan) {
  const J = Object.fromEntries(Object.entries(J0).map(([k, v]) => [k, v.map(x => x * s)]));
  const q = p => p.map(x => x * s);
  const skin = scaled(hide(o, s), o.dark, 16 / s, 0.2, 0.09);
  const hornP = tone(o.hornTip, o.horn, o.hornTip, 1.4 * s, 1.8 * s, 0.5, 0.3);
  const spikeP = tone(o.spikeTip ?? o.hornTip, o.spike ?? o.horn, o.spikeTip ?? o.hornTip, 0.8 * s, 1.3 * s, 0.5, 0.3);
  const claw = P(o.claw ?? '#2a1a14', 0.5);
  const slim = o.slim ?? 1;
  const torso = S.union(0.08 * s,
    S.ellipsoid(q([0, 0.86, 0.18]), q([0.3 * slim, 0.32, 0.36])).bone('chest'),
    S.ellipsoid(q([0, 0.8, -0.08]), q([0.27 * slim, 0.28, 0.26])).bone('spine'),
    S.ellipsoid(q([0, 0.77, -0.32]), q([0.25 * slim, 0.26, 0.3])).bone('hips'),
    S.limb(q([0, 0.95, 0.36]), J.neck1, 0.2 * s * slim, 0.16 * s * slim).bone('neck1'),
    S.limb(J.neck1, J.neck2, 0.16 * s * slim, 0.13 * s * slim).bone('neck1'),
    S.limb(J.neck2, add(J.head, q([0, 0.06, 0.02])), 0.13 * s * slim, 0.12 * s * slim).bone('neck2'),
  ).paint(skin);
  const leg = (u, l, pw, a, b, c, r1, r2, back) => S.union(0.04 * s,
    S.ellipsoid(add(a, q([0.02, -0.04, back ? -0.02 : 0.02])), q([0.11, back ? 0.2 : 0.16, back ? 0.17 : 0.13])).bone(u),
    S.limb(a, b, r1, r2).bone(u),
    S.limb(b, c, r2, r2 * 0.85).bone(l),
    S.ellipsoid([c[0], 0.07 * s, c[2] + 0.06 * s], q([0.1, 0.07, 0.13])).bone(pw),
    ...[-1, 0, 1].map(i => tube([c[0] + i * 0.055 * s, 0.07 * s, c[2] + 0.14 * s], [c[0] + i * 0.065 * s, 0.07 * s, c[2] + 0.22 * s], [c[0] + i * 0.07 * s, 0.015 * s, c[2] + 0.25 * s], 0.03 * s, 0.006 * s, 2).paint(claw).bone(pw)),
  );
  const legs = S.mirror(S.union(0.03 * s,
    leg('fl.L', 'flo.L', 'fp.L', J.fs, J.fe, J.fw, 0.1 * s, 0.075 * s, false),
    leg('hl.L', 'hlo.L', 'hp.L', J.hs, J.he, J.hw, 0.12 * s, 0.08 * s, true),
  )).paint(skin);
  const headCore = S.union(0.05 * s,
    S.ellipsoid(q([0, 1.4, 0.72]), q([0.19, 0.16, 0.22])),
    S.ellipsoid(q([0, 1.33, 0.96]), q([0.13, 0.095, 0.18])),
    S.mirror(S.ellipsoid(q([0.1, 1.47, 0.83]), q([0.085, 0.04, 0.1])).rot(0.2, 0.25, -0.2)),
  ).paint(skin);
  const head = S.union(0.02 * s,
    headCore,
    S.mirror(S.sphere(q([0.05, 1.38, 1.11]), 0.028 * s)).paint(P(o.dark, 0.4)),
    S.mirror(horn(q([0.1, 1.49, 0.64]), q([0.26, 1.72, 0.32]), 0.075 * s, q([0.06, 0.06, 0.0]), 3)).paint(hornP),
    S.mirror(horn(q([0.15, 1.42, 0.62]), q([0.27, 1.5, 0.44]), 0.045 * s, q([0.02, 0.03, 0.0]), 2)).paint(hornP),
    S.mirror(spike(q([0.16, 1.32, 0.72]), q([0.29, 1.33, 0.58]), 0.045 * s)).paint(spikeP),
    S.ellipsoid(q([0, 1.285, 0.86]), q([0.1, 0.04, 0.16])).paint(o.throat),
    S.mirror(S.union(0, ...[0, 1, 2].map(i => spike(q([0.085 - i * 0.01, 1.285, 0.94 + i * 0.055]), q([0.083 - i * 0.01, 1.23, 0.95 + i * 0.055]), 0.018 * s)))).paint(P('#fffaf0', 0.5)),
    ...(o.headExtras ? o.headExtras(q, s) : []),
  ).bone('head');
  const jaw = S.union(0.03 * s,
    S.ellipsoid(q([0, 1.245, 0.9]), q([0.115, 0.05, 0.19])).paint(skin),
    S.mirror(spike(q([0.07, 1.27, 1.02]), q([0.068, 1.32, 1.03]), 0.016 * s)).paint(P('#fffaf0', 0.5)),
  ).bone('jaw');
  const spinePts = [[1.26, 0.52, 'neck2'], [1.12, 0.4, 'neck1'], [1.13, 0.2, 'chest'], [1.08, -0.02, 'spine'], [1.04, -0.24, 'hips'], [0.98, -0.46, 'hips'], [0.86, -0.7, 'tail1'], [0.76, -0.98, 'tail2'], [0.64, -1.26, 'tail3'], [0.54, -1.52, 'tail4']];
  const spikes = S.union(0.015 * s, ...spinePts.map(([y, z, b], i) => {
    const h = (0.2 - Math.abs(i - 3) * 0.018) * (o.spikeScale ?? 1);
    return spike(q([0, y - 0.04, z]), q([0, y + h, z - 0.1]), (0.06 - i * 0.003) * s).bone(b);
  })).paint(spikeP);
  const tail = S.union(0.03 * s,
    S.limb(add(J.hips, q([0, 0.02, -0.15])), J.t2, 0.21 * s * slim, 0.13 * s).bone('tail1'),
    S.limb(J.t2, J.t3, 0.13 * s, 0.085 * s).bone('tail2'),
    S.limb(J.t3, J.t4, 0.085 * s, 0.055 * s).bone('tail3'),
    S.limb(J.t4, J.t5, 0.055 * s, 0.025 * s).bone('tail4'),
  ).paint(skin);
  const tailTip = o.tailTip ? o.tailTip(q, s).bone('tail4') : S.union(0.01 * s,
    S.ellipsoid(q([0, 0.38, -1.84]), q([0.03, 0.14, 0.12])).rot(0.5, 0, 0),
  ).paint(spikeP).bone('tail4');
  const wing = batWing('wing', 'chest', J.wing, 1.55 * s, 1.05 * s, 0.042 * s, 0.055 * s, { bone: o.wingBone ?? skin, membrane: o.membrane, claw: hornP }, { lift: 0.62, sweep: 0.3, trail: [0, -0.55, -1], fingers: 3 });
  const bones = specFor(J);
  Object.assign(bones, wing.bones);
  bones['wing.R'] = { parent: 'chest', pos: fx(wing.bones['wing.L'].pos) };
  bones['wingTip.R'] = { parent: 'wing.R', pos: fx(wing.bones['wingTip.L'].pos) };
  const sdf = S.union(0.03 * s, torso, legs, head, jaw, spikes, tail, tailTip, ...(o.extras ? o.extras(q, s, J) : []));
  const face = eyes(q([0.135, 1.445, 0.84]), [0.1 * s, 0.075 * s], { iris: o.eye, iris2: o.eye2, sclera: o.sclera ?? '#fff8e0', ink: o.ink, angry: 0.85, lidRest: 0.2, irisSize: 0.62, pupilSize: 0.16, dir: [0.75, 0.35, 0.65], glow: 0.7 });
  return { spec: bones, sdf, parts: [S.mirror(wing.sdf)], face: { sdf: headCore, bone: 'head', features: face } };
}

// Skeletal dragon: skull, vertebrae, ribcage with a soul core, bony limbs, tattered wings.
function boneDragon(C, s) {
  const J = Object.fromEntries(Object.entries(J0).map(([k, v]) => [k, v.map(x => x * s)]));
  const q = p => p.map(x => x * s);
  const bone = tone(C.bone, C.boneDark, '#fffaf0', 0.3 * s, 1.5 * s, 0.35, 0.35);
  const socket = P('#08201d', 0.2);
  const soul = glowRadial(q([0, 0.88, 0.06]), 0.2 * s, '#f0fffb', '#14b8a6', 1);
  const mem = tone('#1e5a53', '#0a2522', '#3a8f84', 0.8 * s, 1.8 * s, 0.25, 0.3);
  const vert = (a, b, n, r, boneName) => S.union(0.01 * s, ...[...Array(n)].map((_, i) => S.sphere(mix3(a, b, (i + 0.5) / n), r * (1 - i * 0.04)))).bone(boneName);
  const ribs = S.sub(0.012 * s,
    S.shell(S.ellipsoid(q([0, 0.9, 0.06]), q([0.26, 0.3, 0.4])), 0.03 * s),
    ...[-0.22, -0.07, 0.08, 0.23].map(z => S.box(q([0, 0.9, z]), q([0.4, 0.5, 0.045]), 0.01 * s)),
    S.box(q([0, 0.52, 0.06]), q([0.4, 0.2, 0.6]), 0.01 * s),
    S.box(q([0, 0.75, 0.52]), q([0.4, 0.4, 0.14]), 0.01 * s),
  ).paint(bone).bone('chest');
  const pelvis = S.ellipsoid(q([0, 0.8, -0.38]), q([0.2, 0.1, 0.16])).paint(bone).bone('hips');
  const spineV = S.union(0.01 * s,
    vert(q([0, 1.1, 0.4]), q([0, 1.02, -0.4]), 9, 0.055 * s, 'spine'),
    vert(J.neck1, add(J.head, q([0, 0.05, 0])), 5, 0.06 * s, 'neck2'),
    vert(q([0, 1.1, 0.42]), J.neck1, 3, 0.065 * s, 'neck1'),
    vert(J.t1, J.t2, 4, 0.06 * s, 'tail1'), vert(J.t2, J.t3, 4, 0.045 * s, 'tail2'), vert(J.t3, J.t4, 4, 0.035 * s, 'tail3'), vert(J.t4, J.t5, 3, 0.025 * s, 'tail4'),
  ).paint(bone);
  const bspikes = S.union(0.01 * s, ...[[1.14, 0.3, 'chest'], [1.12, 0.1, 'spine'], [1.1, -0.1, 'spine'], [1.07, -0.3, 'hips'], [0.78, -0.8, 'tail1'], [0.66, -1.1, 'tail2'], [0.55, -1.38, 'tail3']].map(([y, z, b], i) => spike(q([0, y, z]), q([0, y + 0.16 - i * 0.012, z - 0.08]), 0.035 * s).bone(b))).paint(bone);
  const legB = (u, l, pw, a, b, c) => S.union(0.02 * s,
    S.limb(a, b, 0.055 * s, 0.045 * s).bone(u), S.sphere(b, 0.06 * s).bone(l), S.limb(b, c, 0.045 * s, 0.04 * s).bone(l),
    ...[-1, 0, 1].map(i => tube([c[0] + i * 0.04 * s, 0.06 * s, c[2] + 0.02 * s], [c[0] + i * 0.055 * s, 0.07 * s, c[2] + 0.14 * s], [c[0] + i * 0.06 * s, 0.015 * s, c[2] + 0.2 * s], 0.025 * s, 0.006 * s, 2).bone(pw)),
  );
  const legs = S.mirror(S.union(0.02 * s, legB('fl.L', 'flo.L', 'fp.L', J.fs, J.fe, J.fw), legB('hl.L', 'hlo.L', 'hp.L', J.hs, J.he, J.hw), S.sphere(J.fs, 0.08 * s).bone('fl.L'), S.sphere(J.hs, 0.09 * s).bone('hl.L'))).paint(bone);
  const skull = S.carve(0.012 * s,
    S.union(0.04 * s,
      S.ellipsoid(q([0, 1.4, 0.72]), q([0.18, 0.15, 0.21])),
      S.ellipsoid(q([0, 1.33, 0.96]), q([0.11, 0.08, 0.19])),
      S.mirror(S.ellipsoid(q([0.11, 1.47, 0.83]), q([0.08, 0.035, 0.1])).rot(0.2, 0.25, -0.2)),
    ),
    S.mirror(S.ellipsoid(q([0.12, 1.43, 0.85]), q([0.06, 0.055, 0.07])).rot(0, 0.5, 0)).paint(socket),
    S.mirror(S.ellipsoid(q([0.04, 1.38, 1.12]), q([0.025, 0.02, 0.03]))).paint(socket),
  ).paint(bone);
  const head = S.union(0.02 * s,
    skull,
    S.mirror(horn(q([0.1, 1.49, 0.64]), q([0.24, 1.66, 0.28]), 0.065 * s, q([0.05, 0.08, 0.0]), 3)).paint(bone),
    S.ellipsoid(q([0, 1.285, 0.86]), q([0.09, 0.035, 0.15])).paint(G('#99f6e4', 1, 0.5)),
    S.mirror(S.union(0, ...[0, 1, 2, 3].map(i => spike(q([0.075 - i * 0.008, 1.29, 0.9 + i * 0.055]), q([0.073 - i * 0.008, 1.23, 0.91 + i * 0.055]), 0.018 * s)))).paint(P('#fffaf0', 0.5)),
  ).bone('head');
  const jaw = S.union(0.02 * s,
    S.sub(0.01 * s, S.ellipsoid(q([0, 1.245, 0.9]), q([0.105, 0.045, 0.19])), S.ellipsoid(q([0, 1.27, 0.9]), q([0.07, 0.03, 0.16]))),
    S.mirror(S.union(0, ...[0, 1, 2].map(i => spike(q([0.07 - i * 0.008, 1.26, 0.95 + i * 0.05]), q([0.068 - i * 0.008, 1.31, 0.96 + i * 0.05]), 0.016 * s)))),
  ).paint(bone).bone('jaw');
  const core = S.sphere(q([0, 0.88, 0.06]), 0.17 * s).paint(soul).bone('chest');
  const wing = batWing('wing', 'chest', J.wing, 1.55 * s, 1.05 * s, 0.03 * s, 0.045 * s, { bone, membrane: mem, claw: bone }, { lift: 0.62, sweep: 0.3, trail: [0, -0.55, -1], fingers: 4 });
  // tattered holes in the membrane
  const holes = S.mirror(S.union(0, ...[[0.42, 0.45, 0.09], [0.66, 0.62, 0.075], [0.28, 0.72, 0.07], [0.8, 0.35, 0.06]].map(([a, b, r]) => S.sphere(wing.at(a, b), r * s))));
  const bones = specFor(J);
  Object.assign(bones, wing.bones);
  bones['wing.R'] = { parent: 'chest', pos: fx(wing.bones['wing.L'].pos) };
  bones['wingTip.R'] = { parent: 'wing.R', pos: fx(wing.bones['wingTip.L'].pos) };
  const sdf = S.union(0.02 * s, ribs, pelvis, spineV, bspikes, legs, head, jaw, core,
    S.union(0.01 * s, S.limb(J.t4, J.t5, 0.03 * s, 0.01 * s), S.ellipsoid(q([0, 0.38, -1.84]), q([0.025, 0.12, 0.1])).rot(0.5, 0, 0)).paint(bone).bone('tail4'));
  const face = eyes(q([0.12, 1.43, 0.83]), [0.08 * s, 0.07 * s], { iris: '#b8fff4', iris2: '#14b8a6', sclera: '#04100e', ink: '#04100e', angry: 0.8, lidRest: 0.1, irisSize: 0.55, pupilSize: 0.1, dir: [0.8, 0.3, 0.55], glow: 1.0 });
  return { spec: bones, sdf, parts: [S.sub(0.02 * s, S.mirror(wing.sdf), holes)], face: { sdf: skull, bone: 'head', features: face } };
}

const VARIANTS = {
  fire: (C, ctx) => {
    const titan = ctx.role === 'titan';
    const s = titan ? 1.7 : 1.0;
    const pal = titan
      ? { body: '#ff5a1f', dark: '#8a1c08', light: '#ff9a4a', belly: '#ffd27a', horn: '#2a1618', hornTip: '#e8c9a8', spike: '#3a1a14', spikeTip: '#ffb070' }
      : { body: '#ff7a1a', dark: '#b8300c', light: '#ffb45a', belly: '#ffe39a', horn: '#6a3a10', hornTip: '#ffe7a8', spike: '#8a3a10', spikeTip: '#ffd27a' };
    const d = fleshDragon(C, {
      ...pal, eye: '#ffe45c', eye2: '#ff6a00', ink: '#3a0f08', claw: '#2a1414',
      throat: glowGrad('#ff7a1a', '#ffe066', 1.25 * s, 1.32 * s, 1, 0.4),
      membrane: tone('#ff8a3a', '#b8300c', '#ffc27a', 0.8 * s, 1.9 * s, 0.25, 0.3),
      tailTip: (q, s2) => flame(q([0, 0.4, -1.78]), q([0, 0.62, -1.95]), 0.07 * s2, q([0, 0, -0.03])).paint(glowGrad('#ff7a1a', '#ffe066', 0.38 * s2, 0.62 * s2, 1, 0.3)),
    }, s, titan);
    return { ...d, s, height: 1.75 * s, radius: 0.9 * s, pulse: 0.15 };
  },
  frost: (C, ctx) => {
    const s = 1.8;
    const ice = glowGrad('#48c6f4', '#f0fcff', 0.9 * s, 1.5 * s, 0.6, 0.9);
    const d = fleshDragon(C, {
      body: '#9fdcf7', dark: '#2f6fa8', light: '#eefaff', belly: '#ffffff', horn: '#bfefff', hornTip: '#ffffff', spike: '#57c7f5', spikeTip: '#e8fbff',
      eye: '#bff6ff', eye2: '#0b73c7', ink: '#0d3050', claw: '#1d3d6b', slim: 0.85, spikeScale: 1.25,
      throat: glowGrad('#57c7f5', '#ffffff', 1.25 * s, 1.32 * s, 1, 0.5),
      membrane: tone('#cfefff', '#5aa8d6', '#ffffff', 0.8 * s, 1.9 * s, 0.35, 0.3),
      tailTip: (q, s2) => S.taper(q([0, 0.42, -1.86]), q([0.05, 0.16, 0.05]), 0.9, 0.01 * s2).rot(-1.1, 0.78, 0).paint(ice),
      extras: (q, s2) => [
        S.mirror(S.union(0.01 * s2,
          S.taper(q([0.14, 1.02, 0.1]), q([0.035, 0.12, 0.035]), 0.9, 0.008 * s2).rot(-0.3, 0.78, -0.5),
          S.taper(q([0.18, 0.98, -0.2]), q([0.03, 0.1, 0.03]), 0.9, 0.008 * s2).rot(-0.4, 0.78, -0.6),
        )).paint(ice).bone('spine'),
      ],
    }, s, true);
    return { ...d, s, height: 1.75 * s, radius: 0.9 * s };
  },
  death: (C, ctx) => {
    const s = 1.75;
    return { ...boneDragon(C, s), s, height: 1.75 * s, radius: 0.9 * s, pulse: 0.2 };
  },
};

export function sculptDragon(ctx) {
  const { variant, pal: C, role } = ctx;
  const v = VARIANTS[variant](C, ctx);
  const s = v.s;
  const titan = role === 'titan';
  const cell = titan ? 0.022 * s : 0.026 * s;
  const wingCell = titan ? 0.055 * (s / 1.7) : 0.036;
  return {
    spec: v.spec, sdf: v.sdf, face: v.face, props: [],
    parts: (v.parts || []).map(p => ({ sdf: p, cell: wingCell })),
    cell, aoStep: 0.035 * s, tau: 0.045 * s,
    height: v.height, radius: v.radius,
    anim: 'dragon', animOpts: { s }, spawn: titan ? 'drop' : 'pop', glow: C.glow, emissivePulse: v.pulse ?? 0,
    stiffness: 200, hitLean: 0.5,
    stiff: { jaw: 400, 'wing.L': 160, 'wing.R': 160, 'wingTip.L': 120, 'wingTip.R': 120, neck1: 150, neck2: 130, head: 140 },
  };
}

export function poseDragon(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const s = c.def.animOpts.s ?? 1;
  const w = smooth(sp * 1.6);
  const run = smooth((sp - 0.55) * 2.5);
  const idle = 1 - w;
  const br = Math.sin(t * 1.5);
  let mood = 'idle';
  P.chest = [0.03 * br * idle, 0, 0];
  P.spine = [0, 0.04 * Math.sin(t * 0.8) * idle, 0];
  P.neck1 = [-0.05 + 0.04 * Math.sin(t * 0.7) * idle, 0.12 * Math.sin(t * 0.45) * idle, 0];
  P.neck2 = [0.05 * Math.sin(t * 0.7 + 0.8) * idle, 0.1 * Math.sin(t * 0.45 - 0.6) * idle, 0];
  P.head = [0.06 * Math.sin(t * 0.9) * idle + 0.1 * w, 0.12 * Math.sin(t * 0.33 + 1) * idle, 0.06 * Math.sin(t * 0.6)];
  P.jaw = [0.06 + 0.05 * Math.max(0, br) * idle, 0, 0];
  for (let i = 1; i <= 4; i++) P['tail' + i] = [0.05 * Math.sin(t * 1.2 - i * 0.6), 0.22 * Math.sin(t * 1.4 - i * 0.7) * (0.6 + 0.4 * idle), 0];
  // gait like a big quadruped
  const A = lerp(0.45, 0.8, run) * w;
  const off = { 'L.f': 0, 'R.f': lerp(Math.PI, 0.6, run), 'L.h': lerp(Math.PI, Math.PI, run), 'R.h': lerp(0, Math.PI + 0.6, run) };
  for (const side of ['L', 'R']) {
    const pf = ph + off[side + '.f'], phh = ph + off[side + '.h'];
    P['fl.' + side] = [-Math.sin(pf) * A, 0, 0];
    P['flo.' + side] = [Math.max(0, Math.cos(pf)) * 1.0 * A, 0, 0];
    P['fp.' + side] = [Math.sin(pf) * 0.35 * A, 0, 0];
    P['hl.' + side] = [-Math.sin(phh) * A * 0.9, 0, 0];
    P['hlo.' + side] = [-Math.max(0, Math.cos(phh)) * 0.8 * A, 0, 0];
    P['hp.' + side] = [Math.sin(phh) * 0.4 * A, 0, 0];
  }
  R.y += (Math.abs(Math.sin(ph)) * 0.04 * w + 0.008 * br * idle) * s;
  R.rz += 0.03 * Math.cos(ph) * w;
  // wings: half-folded idle beats, spread and pumping when running
  const flap = Math.sin(t * (1.6 + 2.5 * w));
  P['wing.L'] = [0, -0.25 * idle + 0.1 * flap * w, 0.12 * flap * (0.3 + w) - 0.1 * idle];
  P['wing.R'] = [0, 0.25 * idle - 0.1 * flap * w, -0.12 * flap * (0.3 + w) + 0.1 * idle];
  P['wingTip.L'] = [0, 0.4 * idle, 0.2 * Math.sin(t * (1.6 + 2.5 * w) - 0.8) * (0.3 + w) - 0.25 * idle];
  P['wingTip.R'] = [0, -0.4 * idle, -0.2 * Math.sin(t * (1.6 + 2.5 * w) - 0.8) * (0.3 + w) + 0.25 * idle];

  if (kind === 'attack') {
    // rear back, then lunge the head forward and breathe
    const draw = smooth(k / 0.3), blast = smooth((k - 0.3) / 0.12), back = smooth((k - 0.75) / 0.25);
    const hold = 1 - back;
    const pull = draw * (1 - blast);
    P.chest[0] += (-0.25 * pull + 0.08 * blast) * hold;
    P.neck1[0] += (-0.35 * pull + 0.35 * blast) * hold;
    P.neck2[0] += (-0.3 * pull + 0.25 * blast) * hold;
    P.head[0] += (-0.2 * pull + 0.15 * blast) * hold;
    P.jaw = [(0.25 * pull + 0.75 * blast) * hold + 0.05, 0, 0];
    P['wing.L'][2] += 0.5 * draw * hold; P['wing.R'][2] -= 0.5 * draw * hold;
    R.y += 0.05 * pull * s;
    R.emi = 1 + 1.6 * blast * hold;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    const roar = smooth((k - 0.55) / 0.12) * (1 - smooth((k - 0.9) / 0.1));
    const air = 1 - smooth(k / 0.45);
    P['wing.L'][2] += 0.6 * air * Math.sin(t * 9) + 0.4 * roar; P['wing.R'][2] -= 0.6 * air * Math.sin(t * 9) + 0.4 * roar;
    P.neck1[0] -= 0.4 * roar; P.neck2[0] -= 0.3 * roar; P.jaw = [0.8 * roar + 0.05, 0, 0];
    R.emi = 1 + roar;
    mood = roar > 0.3 ? 'fierce' : 'idle';
  } else if (kind === 'hit') {
    P.neck1[0] -= 0.2 * (1 - k); P.jaw = [0.4 * (1 - k), 0, 0];
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.5);
    R.rz += 1.2 * f; R.y -= 0.05 * f * s;
    P.neck1[0] += 0.4 * f; P.neck2[0] += 0.4 * f; P.jaw = [0.5 * f, 0, 0];
    P['wing.L'] = [0, 0, -0.5 * f]; P['wing.R'] = [0, 0, 0.5 * f];
    mood = 'ko';
  }
  return mood;
}
