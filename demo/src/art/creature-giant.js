// Giant bipeds: the caster forms (~1.9 m) and the humanoid titans (scaled
// 1.6–1.8x). Four body builds share one humanoid skeleton:
//   hero  — heroic V torso, armor-friendly (Seraph, Thunder Titan, Chrono…)
//   brute — huge chest and fists, small head (Frost Giant, Colossus…)
//   robed — floating robe with a tattered hem (Wraith, Lich, Psion…)
//   tree  — bark trunk, branch arms, root feet, leafy canopy (Treants)
// Each essence dresses its build with armor, horns, wings, halos, capes,
// weapons and glowing accents.

import {
  S, P, G, TAU, add, sub, mul, mix3, norm, fx, lerp, smooth, clamp01, tube, horn, spike, flame, tone, belly, glowGrad, glowRadial,
  veins, mottle, starry, bark, bands, batWing, featherWing, eyes, brows, mouth, hex, mixc,
} from './creature-kit.js';

const BUILDS = {
  hero: {
    hips: [0, 0.88, 0], spine: [0, 1.04, 0.01], chest: [0, 1.24, 0], neck: [0, 1.45, 0.02], head: [0, 1.52, 0.03], jaw: [0, 1.56, 0.1],
    headC: [0, 1.67, 0.05], headR: [0.19, 0.2, 0.19],
    sh: [0.33, 1.4, -0.01], el: [0.45, 1.12, 0.02], wr: [0.5, 0.86, 0.08],
    hip: [0.14, 0.86, 0], kn: [0.16, 0.48, 0.04], an: [0.16, 0.11, -0.01],
  },
  brute: {
    hips: [0, 0.8, 0], spine: [0, 1.0, 0.02], chest: [0, 1.2, 0], neck: [0, 1.44, 0.06], head: [0, 1.5, 0.1], jaw: [0, 1.52, 0.2],
    headC: [0, 1.62, 0.14], headR: [0.19, 0.19, 0.19],
    sh: [0.44, 1.38, 0], el: [0.62, 1.06, 0.07], wr: [0.68, 0.76, 0.14],
    hip: [0.2, 0.78, 0], kn: [0.22, 0.43, 0.05], an: [0.22, 0.11, -0.02],
  },
  robed: {
    hips: [0, 0.95, 0], spine: [0, 1.1, 0.0], chest: [0, 1.28, 0], neck: [0, 1.48, 0.02], head: [0, 1.54, 0.03], jaw: [0, 1.58, 0.1],
    headC: [0, 1.7, 0.04], headR: [0.18, 0.19, 0.18],
    sh: [0.3, 1.42, -0.01], el: [0.44, 1.16, 0.06], wr: [0.5, 0.92, 0.14],
    hip: [0.12, 0.9, 0], kn: [0.14, 0.5, 0.03], an: [0.14, 0.12, 0],
  },
  tree: {
    hips: [0, 0.55, 0], spine: [0, 0.85, 0], chest: [0, 1.12, 0], neck: [0, 1.36, 0.02], head: [0, 1.42, 0.03], jaw: [0, 1.44, 0.1],
    headC: [0, 1.5, 0.07], headR: [0.24, 0.26, 0.2],
    sh: [0.3, 1.26, 0], el: [0.55, 1.06, 0.06], wr: [0.66, 0.8, 0.12],
    hip: [0.17, 0.52, 0], kn: [0.22, 0.3, 0.04], an: [0.24, 0.1, 0.0],
  },
};

const scaleJ = (J, s) => Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v.map(x => x * s)]));

function specFor(J, v, s) {
  const sp = {
    root: { pos: [0, 0, 0] },
    hips: { parent: 'root', pos: J.hips },
    spine: { parent: 'hips', pos: J.spine },
    chest: { parent: 'spine', pos: J.chest },
    neck: { parent: 'chest', pos: J.neck },
    head: { parent: 'neck', pos: J.head },
  };
  if (v.jaw) sp.jaw = { parent: 'head', pos: J.jaw };
  const extra = v.bones ? v.bones(J, s) : {};
  for (const [side, f] of [['L', p => p], ['R', fx]]) {
    sp['upperArm.' + side] = { parent: 'chest', pos: f(J.sh) };
    sp['foreArm.' + side] = { parent: 'upperArm.' + side, pos: f(J.el) };
    sp['hand.' + side] = { parent: 'foreArm.' + side, pos: f(J.wr) };
    if (!v.noLegs) {
      sp['thigh.' + side] = { parent: 'hips', pos: f(J.hip) };
      sp['shin.' + side] = { parent: 'thigh.' + side, pos: f(J.kn) };
      sp['foot.' + side] = { parent: 'shin.' + side, pos: f(J.an) };
    }
  }
  for (const [n, b] of Object.entries(extra)) {
    sp[n] = b;
    if (n.endsWith('.L')) sp[n.slice(0, -2) + '.R'] = { parent: b.parent.endsWith('.L') ? b.parent.slice(0, -2) + '.R' : b.parent, pos: fx(b.pos) };
  }
  for (const [pre, parent] of [['cape', 'chest'], ['tail', 'hips'], ['robe', 'hips']]) {
    if (!v[pre]) continue;
    let par = parent;
    v[pre](J, s).forEach((p, i) => { sp[pre + (i + 1)] = { parent: par, pos: p }; par = pre + (i + 1); });
  }
  return sp;
}

// ── Body parts ───────────────────────────────────────────────────────────
function torsoHero(J, s, paint, b = 1) {
  return S.union(0.07 * s,
    S.ellipsoid([0, J.chest[1] + 0.05 * s, 0], [0.33 * s * b, 0.24 * s, 0.22 * s]).bone('chest'),
    S.ellipsoid([0, J.spine[1], 0.02 * s], [0.24 * s * b, 0.2 * s, 0.18 * s]).bone('spine'),
    S.ellipsoid([0, J.hips[1] - 0.03 * s, 0], [0.25 * s * b, 0.15 * s, 0.19 * s]).bone('hips'),
    S.limb(J.neck, add(J.neck, [0, 0.14 * s, 0.02 * s]), 0.1 * s, 0.09 * s).bone('neck'),
  ).paint(paint);
}
function torsoBrute(J, s, paint, b = 1) {
  return S.union(0.08 * s,
    S.ellipsoid([0, J.chest[1] + 0.06 * s, -0.01 * s], [0.44 * s * b, 0.3 * s, 0.3 * s]).bone('chest'),
    S.mirror(S.sphere([0.36 * s * b, J.chest[1] + 0.19 * s, -0.04 * s], 0.2 * s)).bone('chest'),
    S.ellipsoid([0, J.spine[1], 0.05 * s], [0.34 * s * b, 0.24 * s, 0.27 * s]).bone('spine'),
    S.ellipsoid([0, J.hips[1], 0], [0.3 * s * b, 0.16 * s, 0.22 * s]).bone('hips'),
    S.limb(J.neck, add(J.neck, [0, 0.12 * s, 0.05 * s]), 0.15 * s, 0.13 * s).bone('neck'),
  ).paint(paint);
}
const torsoRobed = (J, s, paint) => torsoHero(J, s, paint, 0.92);
function torsoTree(J, s, paint) {
  return S.displace(S.union(0.08 * s,
    S.limb([0, 0.42 * s, 0], [0, 0.95 * s, 0.01 * s], 0.3 * s, 0.26 * s).bone('spine'),
    S.limb([0, 0.95 * s, 0.01 * s], J.head, 0.26 * s, 0.24 * s).bone('chest'),
    S.ellipsoid([0, 0.5 * s, 0], [0.3 * s, 0.14 * s, 0.25 * s]).bone('hips'),
  ), 0.018 * s, 9 / s, 2, 1.7).paint(paint);
}
const TORSO = { hero: torsoHero, brute: torsoBrute, robed: torsoRobed, tree: torsoTree };

function armDefault(J, s, v) {
  const r = v.armR ?? { hero: [0.1, 0.09, 0.085], brute: [0.15, 0.13, 0.15], robed: [0.08, 0.075, 0.07], tree: [0.11, 0.09, 0.06] }[v.build];
  return S.union(0.04 * s,
    S.limb(J.sh, J.el, r[0] * s, r[1] * s).bone('upperArm.L'),
    S.limb(J.el, J.wr, r[1] * s, r[2] * s).bone('foreArm.L'),
  ).paint(v.armSkin ?? v.skin);
}
// Big mitten fist, knuckles forward.
function fist(wr, s, r, paint) {
  const c = [wr[0] + 0.01 * s, wr[1] - r * 0.8, wr[2] + r * 0.2];
  return S.union(r * 0.3,
    S.ellipsoid(c, [r * 0.95, r * 1.05, r * 1.0]),
    S.ellipsoid([c[0] + r * 0.05, c[1] - r * 0.55, c[2] + r * 0.45], [r * 0.8, r * 0.45, r * 0.6]),
    S.limb([c[0] - r * 0.6, c[1] + r * 0.1, c[2] + r * 0.5], [c[0] - r * 0.55, c[1] - r * 0.4, c[2] + r * 0.9], r * 0.36, r * 0.3),
  ).paint(paint).bone('hand.L');
}
// Clawed hand: palm and three long curved claws.
function clawHand(wr, s, r, skin, clawP, len = 1.6, n = 3) {
  const c = [wr[0] + 0.01 * s, wr[1] - r * 0.7, wr[2] + r * 0.25];
  const parts = [S.ellipsoid(c, [r * 0.9, r * 0.95, r * 0.95]).paint(skin)];
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * r * 0.6;
    const b = [c[0] + r * 0.15, c[1] - r * 0.6, c[2] + r * 0.3 + o];
    const tip = [b[0] + r * 0.05, b[1] - r * len, b[2] + r * len * 0.55];
    parts.push(tube(b, add(mix3(b, tip, 0.5), [0, 0, -r * 0.25]), tip, r * 0.28, r * 0.04, 3).paint(clawP));
  }
  parts.push(S.limb([c[0] - r * 0.55, c[1], c[2] + r * 0.4], [c[0] - r * 0.7, c[1] - r * 0.6, c[2] + r * 0.9], r * 0.3, r * 0.08).paint(clawP));
  return S.union(r * 0.2, ...parts).bone('hand.L');
}
// Skeletal hand: palm and four thin fingers.
function bonyHand(wr, s, r, boneP) {
  const c = [wr[0] + 0.005 * s, wr[1] - r * 0.6, wr[2] + r * 0.2];
  const parts = [S.ellipsoid(c, [r * 0.55, r * 0.7, r * 0.8])];
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5) * r * 0.42;
    const b = [c[0], c[1] - r * 0.55, c[2] + o];
    parts.push(tube(b, [b[0] + r * 0.1, b[1] - r * 0.7, b[2] + r * 0.25], [b[0], b[1] - r * 1.1, b[2] + r * 0.55], r * 0.16, r * 0.08, 2));
  }
  parts.push(S.limb([c[0] - r * 0.3, c[1], c[2] + r * 0.5], [c[0] - r * 0.4, c[1] - r * 0.6, c[2] + r * 0.9], r * 0.16, r * 0.1));
  return S.union(r * 0.12, ...parts).paint(boneP).bone('hand.L');
}
function legDefault(J, s, v) {
  const r = v.legR ?? { hero: [0.13, 0.11, 0.09], brute: [0.18, 0.15, 0.13], robed: [0.1, 0.09, 0.08], tree: [0.14, 0.12, 0.12] }[v.build];
  return S.union(0.04 * s,
    S.limb(J.hip, J.kn, r[0] * s, r[1] * s).bone('thigh.L'),
    S.limb(J.kn, J.an, r[1] * s, r[2] * s).bone('shin.L'),
    v.foot ? v.foot(J, s) : boot(J.an, s, (v.footR ?? (v.build === 'brute' ? 0.13 : 0.1)) * s, v.footSkin ?? v.legSkin ?? v.skin),
  ).paint(v.legSkin ?? v.skin);
}
function boot(an, s, r, paint) {
  return S.union(r * 0.3,
    S.ellipsoid([an[0], r * 0.62, an[2] + r * 0.55], [r * 0.95, r * 0.66, r * 1.5]),
    S.limb([an[0], r * 0.6, an[2]], [an[0], r * 1.6, an[2] - r * 0.05], r * 0.85, r * 0.8),
  ).paint(paint).bone('foot.L');
}

// Layered shoulder armor.
function pauldron(c, r, paint, trim, tilt = -0.45) {
  return S.union(r * 0.1,
    S.ellipsoid(c, [r, r * 0.62, r * 0.95]).rot(0, 0, tilt),
    S.ellipsoid([c[0] + r * 0.18, c[1] - r * 0.42, c[2]], [r * 0.9, r * 0.45, r * 0.9]).rot(0, 0, tilt * 1.3),
    S.torus([c[0] + r * 0.28, c[1] - r * 0.62, c[2]], r * 0.78, r * 0.09).rot(0, 0, tilt * 1.3).paint(trim),
  ).paint(paint);
}
// Glowing crystal prisms from `base` along directions.
function crystals(base, dirs, len, r, paint) {
  return S.union(r * 0.3, ...dirs.map((d, i) => {
    const dd = norm(d);
    const L = len * (1 - i * 0.12);
    const c = add(base, mul(dd, L * 0.5));
    const e = S.taper(c, [r * (1 - i * 0.1), L * 0.5, r * (1 - i * 0.1)], 0.85, r * 0.2);
    // align local +y with dd
    const up = [0, 1, 0];
    const ax = norm([up[1] * dd[2] - up[2] * dd[1], up[2] * dd[0] - up[0] * dd[2], up[0] * dd[1] - up[1] * dd[0]]);
    const ang = Math.acos(Math.max(-1, Math.min(1, dd[1])));
    const cA = Math.cos(ang), sA = Math.sin(ang), t = 1 - cA;
    const [x, y, z] = Number.isFinite(ax[0]) && Math.hypot(...ax) > 0.5 ? ax : [1, 0, 0];
    e.R = [t * x * x + cA, t * x * y - sA * z, t * x * z + sA * y, t * x * y + sA * z, t * y * y + cA, t * y * z - sA * x, t * x * z - sA * y, t * y * z + sA * x, t * z * z + cA];
    return e;
  })).paint(paint);
}
// Flat feather/blade shape: ellipsoid with local x along dir.
function blade2(c, dir, len, width, thick) {
  const d = norm(dir);
  const up = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const z = norm([d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]);
  const y = [z[1] * d[2] - z[2] * d[1], z[2] * d[0] - z[0] * d[2], z[0] * d[1] - z[1] * d[0]];
  const e = S.ellipsoid(add(c, mul(d, len * 0.5)), [len * 0.5, width * 0.5, thick]);
  e.R = [d[0], y[0], z[0], d[1], y[1], z[1], d[2], y[2], z[2]];
  return e;
}
// Puffy cloud cluster.
function cloud(c, r, paint) {
  return S.union(r * 0.35,
    S.sphere(c, r), S.sphere(add(c, [r * 0.7, -r * 0.2, 0.1 * r]), r * 0.7), S.sphere(add(c, [-r * 0.6, -r * 0.25, 0]), r * 0.65),
    S.sphere(add(c, [0.1 * r, r * 0.55, -r * 0.2]), r * 0.62), S.sphere(add(c, [0, -r * 0.1, -r * 0.7]), r * 0.7),
  ).paint(paint);
}
// Zigzag bolt through points.
function bolt(pts, r0, r1) {
  const parts = [];
  for (let i = 1; i < pts.length; i++) parts.push(S.limb(pts[i - 1], pts[i], lerp(r0, r1, (i - 1) / (pts.length - 1)), lerp(r0, r1, i / (pts.length - 1))));
  return S.union(0, ...parts);
}
// Floating robe from the waist to a tattered hem.
function robeSkirt(J, s, paint, inner, o = {}) {
  const top = J.spine[1], bot = (o.bot ?? 0.26) * s, r1 = (o.r1 ?? 0.24) * s, r2 = (o.r2 ?? 0.42) * s;
  const bell = S.union(0.05 * s,
    S.limb([0, top, 0], [0, (top + bot) / 2, -0.02 * s], r1, (r1 + r2) / 2).bone('hips'),
    S.limb([0, (top + bot) / 2, -0.02 * s], [0, bot, -0.04 * s], (r1 + r2) / 2, r2).bone('robe1'),
  );
  const hollow = S.carve(0.03 * s, bell, S.ellipsoid([0, bot - 0.2 * s, -0.04 * s], [r2 * 0.86, 0.28 * s, r2 * 0.84]).paint(inner));
  const n = o.tatters ?? 10;
  const tat = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.15;
    const cx = Math.sin(a), cz = Math.cos(a);
    const len = (o.tatLen ?? 0.22) * s * (0.8 + 0.4 * ((i * 7) % 3) / 2);
    tat.push(S.limb([cx * r2 * 0.9, bot, cz * r2 * 0.9 - 0.04 * s], [cx * r2 * 1.05, bot - len, cz * r2 * 1.05 - 0.07 * s], 0.08 * s, 0.01 * s).bone(cz < -0.3 ? 'robe2' : 'robe1'));
  }
  return S.union(0.03 * s, hollow, ...tat).paint(paint);
}
// Cape hanging from the shoulders down the back.
function capeSheet(J, s, paint, len = 1.0, w = 0.34) {
  const top = J.chest[1] + 0.18 * s;
  return S.union(0.05 * s,
    S.ellipsoid([0, top - 0.05 * s, -0.2 * s], [w * s, 0.1 * s, 0.07 * s]).bone('chest'),
    S.ellipsoid([0, top - 0.3 * len * s, -0.26 * s], [w * 1.05 * s, 0.3 * len * s, 0.035 * s]).rot(-0.12, 0, 0).bone('cape1'),
    S.ellipsoid([0, top - 0.75 * len * s, -0.32 * s], [w * 1.1 * s, 0.3 * len * s, 0.03 * s]).rot(-0.12, 0, 0).bone('cape2'),
  ).paint(paint);
}
// Hood shell around the head with the face opening.
function hoodShell(J, s, paint, inner, tip = true) {
  const hc = J.headC, hr = J.headR;
  const shell = S.ellipsoid([0, hc[1] + 0.03 * s, hc[2] - 0.03 * s], [hr[0] * 1.25, hr[1] * 1.22, hr[2] * 1.25]);
  const open = S.ellipsoid([0, hc[1] - 0.02 * s, hc[2] + hr[2] * 0.8], [hr[0] * 0.92, hr[1] * 0.95, hr[2] * 0.75]).paint(inner);
  const parts = [S.carve(0.03 * s, shell, open)];
  if (tip) parts.push(tube([0, hc[1] + hr[1] * 0.9, hc[2] - hr[2] * 0.5], [0, hc[1] + hr[1] * 1.3, hc[2] - hr[2] * 1.4], [0, hc[1] + hr[1] * 0.6, hc[2] - hr[2] * 2.1], 0.1 * s, 0.02 * s, 3));
  parts.push(S.ellipsoid([0, hc[1] - hr[1] * 0.95, hc[2] - hr[2] * 0.3], [hr[0] * 1.5, hr[1] * 0.45, hr[2] * 1.3]));
  return S.union(0.04 * s, ...parts).paint(paint);
}
function stdEyes(J, s, o) {
  const hc = J.headC, hr = J.headR;
  const ey = hc[1] + hr[1] * (o.y ?? 0.05);
  const ex = hr[0] * (o.x ?? 0.42);
  const f = eyes([ex, ey, hc[2] + hr[2] * 0.9], (o.size ?? [0.1, 0.1]).map(x => x * s), {
    iris: o.iris, iris2: o.iris2, sclera: o.sclera, ink: o.ink, angry: o.angry ?? 0.6, lidRest: o.lidRest ?? 0.15,
    irisSize: o.irisSize ?? 0.6, pupilSize: o.pupilSize ?? 0.25, yaw: o.yaw ?? 0.42, glow: o.glow ?? 0.6,
  });
  if (o.brows) f.push(...brows([ex, ey + hr[1] * 0.4, hc[2] + hr[2] * 0.86], [0.11 * s, 0.06 * s], o.browCol ?? o.ink, { angle: o.browAngle ?? 1.0, yaw: 0.42, thick: 0.34 }));
  if (o.mouth) f.push(mouth([0, hc[1] - hr[1] * (o.mouthY ?? 0.45), hc[2] + hr[2] * 0.92], (o.mouthSize ?? [0.13, 0.07]).map(x => x * s), { open: o.open ?? 0.3, smile: o.smile ?? 0.2, width: 0.8, ink: o.ink, inside: o.inside ?? '#3a0a14', dir: [0, -0.3, 1] }));
  return f;
}

// ── Variants ─────────────────────────────────────────────────────────────
const V = {};

// Frost Giant (frost form): ice-blue brute, icicle beard and crest, crystal pauldrons, fur loincloth.
V.frostGiant = (C, ctx) => {
  const skin = tone('#94d6f5', '#2f7fb8', '#e2f6ff', 0.3, 1.7, 0.3, 0.4);
  const fur = mottle(tone('#f2f6fa', '#aebfd0', '#ffffff', 0.5, 1.0, 0.1, 0.3), '#d6e2ec', 14, 0.4);
  const ice = glowGrad('#48c6f4', '#f0fcff', 1.3, 2.0, 0.55, 0.9);
  const iceB = glowGrad('#bfefff', '#ffffff', 1.1, 1.6, 0.25, 0.9);
  const leather = P('#3b3f5c', 0.3);
  return {
    build: 'brute', skin, legSkin: skin, footSkin: fur, jaw: false,
    headExtras: (J, s) => [
      S.union(0.01 * s, ...[-2, -1, 0, 1, 2].map(i => spike([i * 0.06 * s, 1.535 * s, 0.26 * s - Math.abs(i) * 0.03 * s], [i * 0.085 * s, (1.3 + Math.abs(i) * 0.04) * s, 0.32 * s - Math.abs(i) * 0.04 * s], (0.06 - Math.abs(i) * 0.008) * s))).paint(iceB),
      S.ellipsoid([0, 1.69 * s, 0.27 * s], [0.17 * s, 0.035 * s, 0.06 * s]).rot(-0.25, 0, 0).paint(iceB),
      spike([0, 1.76 * s, 0.14 * s], [0, 2.0 * s, -0.04 * s], 0.08 * s).paint(ice),
      S.mirror(spike([0.1 * s, 1.74 * s, 0.1 * s], [0.18 * s, 1.93 * s, -0.04 * s], 0.06 * s)).paint(ice),
    ],
    hand: (J, s) => S.union(0.02 * s, fist(J.wr, s, 0.16 * s, skin), crystals([J.wr[0] + 0.02 * s, J.wr[1] - 0.22 * s, J.wr[2] + 0.2 * s], [[0.3, -0.2, 1], [0.1, 0.1, 1]], 0.14 * s, 0.035 * s, ice).bone('hand.L')),
    extras: (J, s) => [
      S.mirror(crystals([0.42 * s, 1.5 * s, -0.02 * s], [[0.3, 1, -0.2], [0.9, 0.7, 0.1], [0.1, 0.8, -0.8]], 0.36 * s, 0.075 * s, ice).bone('chest')),
      S.union(0.02 * s,
        S.ellipsoid([0, 0.72 * s, 0.03 * s], [0.34 * s, 0.2 * s, 0.26 * s]).paint(fur),
        S.torus([0, 0.86 * s, 0.02 * s], 0.3 * s, 0.045 * s).paint(leather),
        crystals([0, 0.86 * s, 0.3 * s], [[0, 1, 0.3]], 0.12 * s, 0.05 * s, ice),
      ).bone('hips'),
      S.mirror(S.torus([J.wr[0] - 0.05 * s, J.wr[1] + 0.12 * s, J.wr[2] - 0.03 * s], 0.13 * s, 0.05 * s).rot(0.25, 0, 0.25).paint(fur).bone('foreArm.L')),
    ],
    face: (J, s) => stdEyes(J, s, { iris: '#aef6ff', iris2: '#0b73c7', sclera: '#e8fbff', ink: '#0d3050', angry: 0.8, glow: 0.8, size: [0.095, 0.085], y: 0.08, brows: false, mouth: true, mouthY: 0.5, mouthSize: [0.11, 0.05], open: 0.25, smile: -0.4 }),
    anim: { attack: 'slam', heavy: 1 },
  };
};

// Thunder Titan (storm form): indigo armor with lightning veins, storm-cloud pauldrons, bolt horns.
V.thunderTitan = (C, ctx) => {
  const armor = veins(tone('#5a52f0', '#1e1b4b', '#b4bdfd', 0.3, 1.8, 0.7, 0.45), '#e8f4ff', 5, 0.03, 1, 7);
  const dark = tone('#2a2470', '#12103a', '#4f46e5', 0.3, 1.7, 0.5, 0.3);
  const gold = P('#fde047', 0.85);
  const volt = glowGrad('#ffe14d', '#fffbe0', 1.4, 2.1, 1, 0.6);
  const cl = tone('#6b6fb0', '#2a2c50', '#d7d9f7', 1.3, 1.7, 0.3, 0.6);
  return {
    build: 'hero', skin: armor, armSkin: armor, legSkin: dark, bulk: 1.12, s: 1.08,
    cape: (J, s) => [[0, 1.25 * s, -0.26 * s], [0, 0.8 * s, -0.3 * s]],
    headCore: (J, s) => S.union(0.03 * s,
      S.ellipsoid(J.headC, J.headR),
      S.ellipsoid([0, J.headC[1] - 0.09 * s, J.headC[2] + 0.06 * s], [0.15 * s, 0.1 * s, 0.14 * s]),
    ),
    headSkin: tone('#5a52f0', '#1e1b4b', '#b4bdfd', 1.5, 1.85, 0.8, 0.5),
    headExtras: (J, s) => [
      S.ellipsoid([0, J.headC[1] + 0.13 * s, J.headC[2] + 0.13 * s], [0.17 * s, 0.03 * s, 0.07 * s]).rot(-0.45, 0, 0).paint(gold),
      S.mirror(bolt([[0.14 * s, 1.74 * s, 0.03 * s], [0.24 * s, 1.86 * s, 0.0], [0.19 * s, 1.88 * s, 0.0], [0.3 * s, 2.04 * s, -0.04 * s]], 0.045 * s, 0.012 * s)).paint(volt),
    ],
    hand: (J, s) => S.union(0.02 * s, fist(J.wr, s, 0.12 * s, dark), S.torus([J.wr[0], J.wr[1] + 0.02 * s, J.wr[2]], 0.1 * s, 0.03 * s).rot(0.2, 0, 0.2).paint(gold).bone('foreArm.L')),
    extras: (J, s) => [
      capeSheet(J, s, tone('#312a9c', '#12103a', '#6366f1', 0.2, 1.6, 0.15, 0.35), 1.0, 0.34),
      S.mirror(S.union(0.02 * s,
        cloud([0.4 * s, 1.52 * s, -0.02 * s], 0.17 * s, cl),
        bolt([[0.44 * s, 1.4 * s, 0.06 * s], [0.49 * s, 1.3 * s, 0.1 * s], [0.46 * s, 1.27 * s, 0.1 * s], [0.52 * s, 1.16 * s, 0.13 * s]], 0.022 * s, 0.006 * s).paint(volt),
      ).bone('chest')),
      bolt([[0.05 * s, 1.4 * s, 0.24 * s], [-0.04 * s, 1.28 * s, 0.26 * s], [0.03 * s, 1.26 * s, 0.26 * s], [-0.05 * s, 1.12 * s, 0.24 * s]], 0.035 * s, 0.015 * s).paint(volt).bone('chest'),
      S.torus([0, 0.96 * s, 0.02 * s], 0.25 * s, 0.04 * s).paint(gold).bone('spine'),
    ],
    face: (J, s) => stdEyes(J, s, { iris: '#ffffff', iris2: '#9fe8ff', sclera: '#0e0b2a', ink: '#0e0b2a', angry: 0.9, glow: 1.0, size: [0.1, 0.06], y: 0.1, irisSize: 0.75, pupilSize: 0 }),
    anim: { attack: 'punch', heavy: 0.5 }, noBlink: true, pulse: 0.2,
  };
};

// Colossus (stone form) / Stone Colossus (titan): stacked boulders, glowing runes, moss and crystals.
V.colossus = (C, ctx) => {
  const titan = ctx.role === 'titan';
  const rock = veins(mottle(tone('#c9c1b7', '#6f675f', '#eee8df', 0.2, 1.8, 0.15, 0.35), '#8c837a', 3.2, 0.35), '#ffae42', 2.6, 0.045, 1, 3);
  const mossy = (x, y, z, l, nx, ny, nz, cell) => {
    const p = rock(x, y, z, l, nx, ny, nz, cell);
    const m = smooth((ny - 0.55) / 0.25) * smooth((y - 0.9) / 0.1);
    return m > 0 ? { ...p, color: mixc(p.color, hex('#6f9d3c'), m), emissive: p.emissive * (1 - m) } : p;
  };
  const crystal = glowGrad('#ff9f3a', '#ffe7a8', 1.4, 2.2, 1, 0.8);
  return {
    build: 'brute', s: titan ? 1.75 : 1.0, skin: mossy, legSkin: rock, armSkin: rock, jaw: false,
    torso: (J, s) => S.union(0.04 * s,
      S.displace(torsoBrute(J, s, mossy, 1.05), 0.022 * s, 7 / s, 2, 1.3),
      S.ellipsoid([0, 1.28 * s, 0.25 * s], [0.13 * s, 0.13 * s, 0.07 * s]).paint(glowRadial([0, 1.28 * s, 0.3 * s], 0.13 * s, '#fff4d0', '#ff8c1a', 1)).bone('chest'),
    ),
    headCore: (J, s) => S.displace(S.ellipsoid(J.headC, [0.17 * s, 0.16 * s, 0.17 * s]), 0.012 * s, 10 / s, 2, 4.4),
    headSkin: rock,
    headExtras: (J, s) => [S.ellipsoid([0, J.headC[1] + 0.07 * s, J.headC[2] + 0.12 * s], [0.18 * s, 0.05 * s, 0.08 * s]).rot(-0.3, 0, 0).paint(mossy)],
    hand: (J, s) => S.displace(fist(J.wr, s, 0.18 * s, rock), 0.015 * s, 8 / s, 2, 6.1),
    extras: (J, s) => [
      S.mirror(S.displace(S.ellipsoid([0.46 * s, 1.52 * s, -0.02 * s], [0.24 * s, 0.17 * s, 0.24 * s]).rot(0, 0, -0.35), 0.02 * s, 6 / s, 2, 2.2).paint(mossy).bone('chest')),
      crystals([0.2 * s, 1.55 * s, -0.25 * s], [[0.3, 1, -0.5], [0.6, 0.8, -0.2], [-0.1, 1, -0.7]], 0.34 * s, 0.07 * s, crystal).bone('chest'),
      ...(titan ? [
        crystals([-0.25 * s, 1.5 * s, -0.22 * s], [[-0.4, 1, -0.5], [-0.7, 0.7, -0.1]], 0.3 * s, 0.06 * s, crystal).bone('chest'),
        S.mirror(crystals([0.5 * s, 1.66 * s, -0.02 * s], [[0.2, 1, 0.1], [0.6, 0.8, -0.3]], 0.22 * s, 0.05 * s, crystal).bone('chest')),
      ] : []),
    ],
    face: (J, s) => stdEyes(J, s, { iris: '#ffd08a', iris2: '#c25a00', sclera: '#1e1a17', ink: '#1e1a17', angry: 0.9, glow: 1.0, size: [0.075, 0.06], y: 0.0, x: 0.4, irisSize: 0.72, pupilSize: 0.15 }),
    anim: { attack: 'slam', heavy: 1 }, noBlink: true,
  };
};

// Seraph (light form / titan): golden armor, white tasset skirt, great feathered wings, halo, holy lance.
V.seraph = (C, ctx) => {
  const titan = ctx.role === 'titan';
  const gold = tone('#f2c21b', '#9a6406', '#fff3b0', 0.4, 1.9, 0.85, 0.5);
  const plate = tone('#ffe27a', '#c08a10', '#fffbe0', 0.9, 1.6, 0.9, 0.5);
  const cloth = tone('#fffaf0', '#d9c9a4', '#ffffff', 0.5, 1.1, 0.12, 0.35);
  const feather = tone('#ffffff', '#e0d2b0', '#ffffff', 0.8, 2.0, 0.25, 0.25);
  const feather2 = tone('#fff8e8', '#d8c49c', '#ffffff', 0.8, 2.0, 0.25, 0.25);
  const glowW = G('#fff4c2', 1, 0.6);
  const wingO = s => ({ lift: 0.85, sweep: 0.35, trail: [0, -1, -0.5], chord: 0.95 * s, primaries: 6, secondaries: 4, thick: 0.03 * s, armR: 0.05 * s, featherW: 1.45 });
  const wingBO = s => ({ lift: 0.15, sweep: 0.5, trail: [0, -1, -0.7], chord: 0.6 * s, primaries: 4, secondaries: 3, thick: 0.028 * s, armR: 0.04 * s, featherW: 1.35 });
  const rootA = s => [0.12 * s, 1.46 * s, -0.17 * s], rootB = s => [0.11 * s, 1.22 * s, -0.18 * s];
  return {
    build: 'hero', s: titan ? 1.65 : 1.0, skin: gold, armSkin: gold, legSkin: gold,
    bones: (J, s) => ({ ...featherWing('wing', 'chest', rootA(s), 1.1 * s, {}, wingO(s)).bones, ...(titan ? featherWing('wingB', 'chest', rootB(s), 0.8 * s, {}, wingBO(s)).bones : {}) }),
    headCore: (J, s) => S.union(0.03 * s, S.ellipsoid(J.headC, J.headR), S.ellipsoid([0, J.headC[1] - 0.07 * s, J.headC[2] + 0.07 * s], [0.14 * s, 0.11 * s, 0.13 * s])),
    headSkin: tone('#f2c21b', '#9a6406', '#fff3b0', 1.5, 1.9, 0.9, 0.5),
    headExtras: (J, s) => [
      S.limb([0, J.headC[1] + 0.13 * s, J.headC[2] + 0.12 * s], [0, J.headC[1] + 0.28 * s, J.headC[2] - 0.12 * s], 0.045 * s, 0.018 * s).paint(gold),
      S.mirror(S.union(0.008 * s,
        blade2([0.2 * s, J.headC[1] + 0.07 * s, J.headC[2] - 0.03 * s], [0.5, 1, -0.6], 0.2 * s, 0.07 * s, 0.018 * s),
        blade2([0.19 * s, J.headC[1] + 0.02 * s, J.headC[2] - 0.05 * s], [0.6, 0.6, -0.8], 0.16 * s, 0.06 * s, 0.016 * s),
      )).paint(feather),
    ],
    hand: (J, s) => S.union(0.02 * s, fist(J.wr, s, 0.1 * s, gold), S.limb(mix3(J.el, J.wr, 0.45), mix3(J.el, J.wr, 0.95), 0.1 * s, 0.11 * s).paint(plate).bone('foreArm.L')),
    extras: (J, s) => {
      const out = [
        S.mirror(pauldron([0.36 * s, 1.47 * s, -0.01 * s], 0.15 * s, gold, P('#fffaf0', 0.5)).bone('chest')),
        S.ellipsoid([0, 1.31 * s, 0.075 * s], [0.28 * s, 0.19 * s, 0.17 * s]).paint(plate).bone('chest'),
        S.union(0.03 * s,
          S.sub(0.02 * s, S.limb([0, 1.0 * s, 0.01 * s], [0, 0.64 * s, -0.01 * s], 0.25 * s, 0.31 * s), S.box([0, 0.3 * s, 0], [0.6 * s, 0.32 * s, 0.6 * s], 0.02 * s)),
          S.torus([0, 0.94 * s, 0.01 * s], 0.25 * s, 0.035 * s).paint(gold),
          S.torus([0, 0.66 * s, -0.01 * s], 0.305 * s, 0.024 * s).paint(gold),
        ).paint(cloth).bone('hips'),
        S.union(0.01 * s,
          S.ellipsoid([0, 1.32 * s, 0.24 * s], [0.07 * s, 0.07 * s, 0.03 * s]).paint(glowW),
          ...[0, 1, 2, 3, 4, 5].map(i => { const a = (i / 6) * TAU; return spike([Math.sin(a) * 0.06 * s, 1.32 * s + Math.cos(a) * 0.06 * s, 0.245 * s], [Math.sin(a) * 0.13 * s, 1.32 * s + Math.cos(a) * 0.13 * s, 0.23 * s], 0.022 * s); }),
        ).paint(glowW).bone('chest'),
        S.union(0.01 * s,
          S.limb([-0.51 * s, 0.84 * s, -0.4 * s], [-0.51 * s, 0.8 * s, 0.9 * s], 0.026 * s).paint(gold),
          S.limb([-0.51 * s, 0.8 * s, 0.9 * s], [-0.51 * s, 0.8 * s, 1.2 * s], 0.06 * s, 0.006 * s).paint(glowW),
          S.torus([-0.51 * s, 0.8 * s, 0.9 * s], 0.06 * s, 0.018 * s).rot(Math.PI / 2, 0, 0).paint(gold),
        ).bone('hand.R').rigid(),
      ];
      return out;
    },
    parts: (J, s) => [
      S.mirror(featherWing('wing', 'chest', rootA(s), 1.1 * s, { feather, feather2, coverts: gold }, wingO(s)).sdf),
      ...(titan ? [S.mirror(featherWing('wingB', 'chest', rootB(s), 0.8 * s, { feather: feather2, feather2: feather, coverts: gold }, wingBO(s)).sdf)] : []),
    ],
    props: (J, s) => [{ sdf: S.torus([0, J.headC[1] + 0.1 * s, J.headC[2] - 0.26 * s], 0.3 * s, 0.032 * s).rot(Math.PI / 2 - 0.2, 0, 0).paint(G('#ffe680', 1, 0.8)), bone: 'head' }],
    face: (J, s) => stdEyes(J, s, { iris: '#ffffff', iris2: '#ffe68a', sclera: '#5a3a00', ink: '#3a2400', angry: 0.4, glow: 1.0, size: [0.09, 0.05], y: 0.05, irisSize: 0.8, pupilSize: 0 }),
    anim: { attack: 'lance', heavy: 0.3, wingFlap: 1 }, noBlink: true, cell: (titan ? 0.04 : 0.026),
  };
};

// Wraith (shadow form): hooded, floating, tattered cloak, long spectral claws.
V.wraith = (C, ctx) => {
  const cloak = tone('#4a2396', '#12082a', '#7c55d8', 0.2, 1.9, 0.12, 0.35);
  const inner = P('#07030e', 0.1);
  const spectral = tone('#e6dcff', '#8b6fd8', '#ffffff', 0.7, 1.1, 0.4, 0.4);
  const claw = G('#efe6ff', 0.4, 0.6);
  return {
    build: 'robed', noLegs: true, skin: cloak, armSkin: cloak, armR: [0.1, 0.1, 0.13],
    robe: (J, s) => [[0, 0.62 * s, -0.02 * s], [0, 0.35 * s, -0.08 * s]],
    headSkin: inner,
    headExtras: (J, s) => [hoodShell(J, s, cloak, inner, true)],
    hand: (J, s) => clawHand(J.wr, s, 0.075 * s, spectral, claw, 2.4, 3),
    extras: (J, s) => [
      robeSkirt(J, s, cloak, inner, { bot: 0.3, r1: 0.26, r2: 0.46, tatters: 11, tatLen: 0.3 }),
      S.mirror(S.union(0.03 * s,
        S.ellipsoid([0.28 * s, 1.44 * s, -0.02 * s], [0.16 * s, 0.1 * s, 0.16 * s]).rot(0, 0, -0.5),
        spike([0.36 * s, 1.36 * s, -0.08 * s], [0.46 * s, 1.18 * s, -0.16 * s], 0.07 * s),
        spike([0.28 * s, 1.36 * s, -0.14 * s], [0.3 * s, 1.14 * s, -0.26 * s], 0.07 * s),
      ).paint(cloak).bone('chest')),
      S.ellipsoid([0, 1.3 * s, 0.2 * s], [0.06 * s, 0.09 * s, 0.03 * s]).paint(G('#b99cff', 1, 0.4)).bone('chest'),
    ],
    face: (J, s) => stdEyes(J, s, { iris: '#f4efff', iris2: '#b99cff', sclera: '#07030e', ink: '#07030e', angry: 0.7, glow: 1.0, size: [0.085, 0.06], y: 0.0, irisSize: 0.8, pupilSize: 0 }),
    anim: { attack: 'swipe', hover: 0.18, heavy: 0 }, noBlink: true,
  };
};

// Treant (life form) / Ancient Treant (titan): bark body, branch arms, root feet, leafy canopy.
V.treant = (C, ctx) => {
  const titan = ctx.role === 'titan';
  const barkP = mottle(bark('#8b5a2b', '#4a2c14', '#c9955e', 14), '#5f8f3a', 5, 0.25);
  const leaves = mottle(tone('#3fcf6e', '#157a3a', '#b2f5b8', 1.4, 2.2, 0.25, 0.45), '#1f9e4a', 7, 0.4);
  const blossom = P('#ff8cc6', 0.35);
  const glow = G('#d9ff8a', 1, 0.5);
  const canopy = (J, s) => {
    const c = [0, J.headC[1] + 0.34 * s, J.headC[2] - 0.08 * s];
    const blobs = [[0, 0, 0, 0.3], [0.26, -0.08, 0.02, 0.22], [-0.26, -0.06, 0.0, 0.22], [0.1, 0.18, -0.06, 0.22], [-0.12, 0.14, 0.05, 0.2], [0, -0.02, -0.24, 0.24], [0.2, 0.05, -0.2, 0.18], [-0.2, 0.04, -0.2, 0.18]];
    if (titan) blobs.push([0.38, -0.14, -0.08, 0.2], [-0.38, -0.12, -0.08, 0.2], [0, 0.3, -0.12, 0.2]);
    return S.union(0.06 * s, ...blobs.map(b => S.sphere(add(c, [b[0] * s, b[1] * s, b[2] * s]), b[3] * s))).paint(leaves);
  };
  return {
    build: 'tree', s: titan ? 1.7 : 1.0, skin: barkP, armSkin: barkP, legSkin: barkP, armR: [0.12, 0.1, 0.07],
    headCore: (J, s) => S.displace(S.ellipsoid(J.headC, J.headR), 0.012 * s, 12 / s, 2, 3.3),
    headExtras: (J, s) => [
      canopy(J, s),
      S.ellipsoid([0, J.headC[1] + 0.07 * s, J.headC[2] + 0.15 * s], [0.2 * s, 0.045 * s, 0.07 * s]).rot(-0.2, 0, 0).paint(barkP),
      S.union(0.01 * s, ...[[0.18, 0.5, 0.2], [-0.24, 0.42, 0.14], [0.05, 0.62, 0.1], [0.3, 0.3, -0.05], [-0.12, 0.55, -0.2]].map(([x, y, z]) => S.sphere([x * s, J.headC[1] + y * s, J.headC[2] + z * s], 0.045 * s))).paint(blossom),
    ],
    hand: (J, s) => S.union(0.015 * s, ...[[0.05, -0.2, 0.08], [0.08, -0.24, 0.0], [0.02, -0.22, -0.08], [-0.08, -0.1, 0.1]].map(([x, y, z]) => tube(J.wr, add(J.wr, [x * 0.6 * s, y * 0.5 * s, z * 0.6 * s]), add(J.wr, [x * s, y * s, z * s]), 0.05 * s, 0.012 * s, 2))).paint(barkP).bone('hand.L'),
    foot: (J, s) => S.union(0.02 * s, ...[[0.12, 0.2], [0.0, 0.24], [-0.1, 0.16], [0.08, -0.14]].map(([x, z]) => tube([J.an[0], 0.14 * s, J.an[2]], [J.an[0] + x * 0.6 * s, 0.06 * s, J.an[2] + z * 0.6 * s], [J.an[0] + x * s, 0.02 * s, J.an[2] + z * s], 0.08 * s, 0.02 * s, 2))).paint(barkP).bone('foot.L'),
    extras: (J, s) => [
      S.mirror(S.union(0.04 * s,
        S.sphere([0.3 * s, 1.3 * s, -0.02 * s], 0.2 * s),
        tube([0.3 * s, 1.42 * s, -0.08 * s], [0.38 * s, 1.7 * s, -0.12 * s], [0.5 * s, 1.82 * s, -0.2 * s], 0.06 * s, 0.015 * s, 3).paint(barkP),
      ).paint(leaves).bone('chest')),
      ...(titan ? [S.union(0.01 * s, ...[[0.22, 0.72, 0.2], [0.26, 0.66, 0.1], [-0.2, 0.9, 0.2]].map(([x, y, z]) => S.union(0.01 * s, S.limb([x * s, y * s, z * s], [x * s, (y + 0.05) * s, z * s], 0.02 * s), S.ellipsoid([x * s, (y + 0.06) * s, z * s], [0.05 * s, 0.025 * s, 0.05 * s]).paint(glow)))).paint(P('#f4e6c8', 0.3)).bone('spine')] : []),
    ],
    face: (J, s) => stdEyes(J, s, { iris: '#eaff9a', iris2: '#5aa000', sclera: '#1a0f06', ink: '#1a0f06', angry: 0.3, glow: 1.0, size: [0.1, 0.08], y: 0.02, irisSize: 0.7, pupilSize: 0.15, mouth: true, mouthY: 0.5, mouthSize: [0.16, 0.06], open: 0.3, smile: -0.2, inside: '#1a0f06' }),
    anim: { attack: 'slam', heavy: 1 }, noBlink: true,
  };
};

// Lich (death form): robed skeleton king with a crown, soul-lit ribcage and a staff.
V.lich = (C, ctx) => {
  const robe = tone('#2f7a70', '#0f2a27', '#5fb3a6', 0.2, 1.8, 0.12, 0.4);
  const trim = tone('#e8dcc0', '#a89878', '#ffffff', 0.9, 1.7, 0.4, 0.3);
  const bone = tone(C.bone, C.boneDark, '#fffaf0', 1.4, 1.9, 0.35, 0.35);
  const metal = tone('#3a4a4a', '#16201f', '#6b8a86', 1.7, 2.1, 0.8, 0.4);
  const soul = G('#99f6e4', 1, 0.5);
  const socket = P('#0a1a18', 0.2);
  return {
    build: 'robed', noLegs: true, skin: robe, armSkin: robe, armR: [0.1, 0.1, 0.12],
    robe: (J, s) => [[0, 0.62 * s, -0.02 * s], [0, 0.35 * s, -0.08 * s]],
    torso: (J, s) => S.carve(0.02 * s, torsoRobed(J, s, robe), S.ellipsoid([0, 1.22 * s, 0.24 * s], [0.14 * s, 0.24 * s, 0.14 * s]).paint(P('#061210', 0.1))),
    headCore: (J, s) => S.carve(0.012 * s,
      S.union(0.04 * s,
        S.ellipsoid(J.headC, [0.17 * s, 0.18 * s, 0.17 * s]),
        S.ellipsoid([0, J.headC[1] - 0.12 * s, J.headC[2] + 0.06 * s], [0.11 * s, 0.07 * s, 0.1 * s]),
        S.mirror(S.ellipsoid([0.09 * s, J.headC[1] - 0.08 * s, J.headC[2] + 0.08 * s], [0.06 * s, 0.05 * s, 0.06 * s])),
      ),
      S.mirror(S.ellipsoid([0.068 * s, J.headC[1] + 0.005 * s, J.headC[2] + 0.155 * s], [0.052 * s, 0.056 * s, 0.05 * s]).rot(0, 0, -0.2)).paint(socket),
      S.ellipsoid([0, J.headC[1] - 0.06 * s, J.headC[2] + 0.175 * s], [0.02 * s, 0.026 * s, 0.03 * s]).paint(socket),
    ),
    headSkin: bone,
    headExtras: (J, s) => [
      S.union(0.01 * s,
        S.cyl([0, J.headC[1] + 0.13 * s, J.headC[2] - 0.01 * s], 0.16 * s, 0.04 * s, 0.015 * s),
        ...[0, 1, 2, 3, 4, 5, 6].map(i => { const a = (i / 7) * TAU; return spike([Math.sin(a) * 0.15 * s, J.headC[1] + 0.15 * s, J.headC[2] - 0.01 * s + Math.cos(a) * 0.15 * s], [Math.sin(a) * 0.19 * s, J.headC[1] + (0.34 - (i % 2) * 0.08) * s, J.headC[2] - 0.01 * s + Math.cos(a) * 0.19 * s], 0.03 * s); }),
        S.sphere([0, J.headC[1] + 0.14 * s, J.headC[2] + 0.16 * s], 0.035 * s).paint(soul),
      ).paint(metal),
    ],
    hand: (J, s) => bonyHand(J.wr, s, 0.075 * s, bone),
    extras: (J, s) => [
      robeSkirt(J, s, robe, P('#050c0b', 0.1), { bot: 0.28, r1: 0.25, r2: 0.44, tatters: 9, tatLen: 0.24 }),
      // open robe front showing ribs and the soul
      S.union(0.01 * s,
        S.sub(0.01 * s,
          S.shell(S.ellipsoid([0, 1.24 * s, 0.1 * s], [0.13 * s, 0.17 * s, 0.13 * s]), 0.018 * s),
          ...[1.2, 1.26, 1.32].map(y => S.box([0, y * s, 0.2 * s], [0.3 * s, 0.014 * s, 0.1 * s], 0.005 * s)),
          S.box([0, 1.26 * s, 0.22 * s], [0.016 * s, 0.3 * s, 0.08 * s], 0.005 * s),
        ).paint(bone),
        S.sphere([0, 1.24 * s, 0.1 * s], 0.075 * s).paint(glowRadial([0, 1.24 * s, 0.14 * s], 0.09 * s, '#f0fffb', '#14b8a6', 1)),
      ).bone('chest'),
      S.mirror(S.union(0.02 * s,
        S.ellipsoid([0.3 * s, 1.47 * s, -0.01 * s], [0.14 * s, 0.1 * s, 0.14 * s]).rot(0, 0, -0.4).paint(bone),
        spike([0.34 * s, 1.52 * s, -0.02 * s], [0.44 * s, 1.72 * s, -0.08 * s], 0.045 * s).paint(bone),
      ).bone('chest')),
      S.torus([0, 1.1 * s, 0.0], 0.24 * s, 0.03 * s).paint(trim).bone('spine'),
      S.sub(0.02 * s, S.shell(S.ellipsoid([0, 1.6 * s, -0.08 * s], [0.3 * s, 0.26 * s, 0.2 * s]), 0.02 * s), S.ellipsoid([0, 1.64 * s, 0.14 * s], [0.34 * s, 0.34 * s, 0.24 * s]), S.box([0, 1.2 * s, 0], [0.5 * s, 0.2 * s, 0.5 * s], 0.01 * s)).paint(trim).bone('chest'),
      S.union(0.01 * s, S.mirror(S.limb([0.13 * s, 1.44 * s, 0.2 * s], [0.07 * s, 1.0 * s, 0.26 * s], 0.03 * s, 0.025 * s))).paint(trim).bone('chest'),
      // staff with a soul cage
      S.union(0.01 * s,
        S.limb([-0.5 * s, 0.1 * s, 0.16 * s], [-0.5 * s, 1.75 * s, 0.14 * s], 0.028 * s).paint(P('#3a2a22', 0.3)),
        S.sub(0.005 * s, S.shell(S.sphere([-0.5 * s, 1.86 * s, 0.14 * s], 0.1 * s), 0.014 * s), S.box([-0.5 * s, 1.86 * s, 0.14 * s], [0.2 * s, 0.03 * s, 0.2 * s], 0.005 * s), S.box([-0.5 * s, 1.86 * s, 0.14 * s], [0.03 * s, 0.2 * s, 0.2 * s], 0.005 * s)).paint(metal),
        S.sphere([-0.5 * s, 1.86 * s, 0.14 * s], 0.06 * s).paint(soul),
      ).bone('hand.R').rigid(),
    ],
    face: (J, s) => [
      ...eyes([0.068 * s, J.headC[1] + 0.005 * s, J.headC[2] + 0.145 * s], [0.075 * s, 0.08 * s], { iris: '#8ff7e6', iris2: '#0f9d8c', sclera: '#050c0b', ink: '#050c0b', irisSize: 0.5, pupilSize: 0.1, lidRest: 0.05, yaw: 0.35, glow: 1.0 }),
    ],
    anim: { attack: 'cast', hover: 0.16, heavy: 0 }, noBlink: true,
  };
};

// Blood Fiend (blood form): crimson demon, bat wings, horns, claws, spade tail.
V.bloodFiend = (C, ctx) => {
  const skin = veins(tone('#e11d48', '#6b0a22', '#ff7a94', 0.3, 1.8, 0.3, 0.4), '#5a0418', 3.5, 0.035, 0, 2);
  const bone = tone('#f3e2d2', '#9a8068', '#ffffff', 1.5, 2.1, 0.45, 0.3);
  const mem = tone('#7a0f2a', '#3a0512', '#b3264a', 1.0, 2.0, 0.25, 0.3);
  return {
    build: 'hero', s: 1.02, skin, armSkin: skin, legSkin: tone('#7a0f2a', '#3a0512', '#b3264a', 0.1, 0.9, 0.25, 0.3), bulk: 1.12, jaw: false,
    tail: (J, s) => [[0, 0.88 * s, -0.2 * s], [0, 0.7 * s, -0.42 * s], [0, 0.6 * s, -0.66 * s]],
    bones: (J, s) => batWing('wing', 'chest', [0.12 * s, 1.42 * s, -0.18 * s], 1.05 * s, 0.75 * s, 0.028 * s, 0.038 * s, {}, { lift: 0.6, sweep: 0.35, trail: [0, -1, -0.55], fingers: 3 }).bones,
    headExtras: (J, s) => [
      S.mirror(horn([0.11 * s, J.headC[1] + 0.12 * s, J.headC[2] + 0.02 * s], [0.3 * s, J.headC[1] + 0.34 * s, J.headC[2] - 0.2 * s], 0.065 * s, [0.12 * s, -0.05 * s, 0.08 * s], 4)).paint(bone),
      S.ellipsoid([0, J.headC[1] + 0.05 * s, J.headC[2] + 0.16 * s], [0.16 * s, 0.035 * s, 0.05 * s]).rot(-0.25, 0, 0).paint(skin),
      S.mirror(S.limb([0.045 * s, J.headC[1] - 0.1 * s, J.headC[2] + 0.18 * s], [0.042 * s, J.headC[1] - 0.15 * s, J.headC[2] + 0.19 * s], 0.014 * s, 0.003 * s)).paint(P('#ffffff', 0.5)),
    ],
    hand: (J, s) => clawHand(J.wr, s, 0.09 * s, skin, bone, 1.9, 3),
    foot: (J, s) => S.union(0.02 * s, S.ellipsoid([J.an[0], 0.06 * s, J.an[2] + 0.07 * s], [0.08 * s, 0.06 * s, 0.13 * s]), ...[-1, 0, 1].map(i => spike([J.an[0] + i * 0.05 * s, 0.05 * s, J.an[2] + 0.17 * s], [J.an[0] + i * 0.06 * s, 0.01 * s, J.an[2] + 0.26 * s], 0.025 * s).paint(bone))).paint(tone('#7a0f2a', '#3a0512', '#b3264a', 0.0, 0.2)).bone('foot.L'),
    extras: (J, s) => {
      return [
        S.mirror(S.union(0.02 * s, spike([0.33 * s, 1.5 * s, -0.04 * s], [0.46 * s, 1.72 * s, -0.12 * s], 0.06 * s), spike([0.25 * s, 1.52 * s, -0.12 * s], [0.3 * s, 1.72 * s, -0.24 * s], 0.05 * s)).paint(bone).bone('chest')),
        S.union(0.02 * s,
          S.limb([0, 0.88 * s, -0.18 * s], [0, 0.7 * s, -0.42 * s], 0.07 * s, 0.05 * s).bone('tail1'),
          S.limb([0, 0.7 * s, -0.42 * s], [0, 0.62 * s, -0.66 * s], 0.05 * s, 0.03 * s).bone('tail2'),
          S.ellipsoid([0, 0.61 * s, -0.74 * s], [0.02 * s, 0.07 * s, 0.09 * s]).rot(0.6, 0, 0).paint(bone).bone('tail3'),
        ).paint(skin),
        S.torus([0, 0.96 * s, 0.02 * s], 0.24 * s, 0.045 * s).paint(P('#2a0a12', 0.5)).bone('spine'),
      ];
    },
    parts: (J, s) => [S.mirror(batWing('wing', 'chest', [0.12 * s, 1.42 * s, -0.18 * s], 1.05 * s, 0.75 * s, 0.028 * s, 0.038 * s, { bone: tone('#6b0a22', '#3a0512', '#b3264a', 1, 2), membrane: mem, claw: bone }, { lift: 0.6, sweep: 0.35, trail: [0, -1, -0.55], fingers: 3 }).sdf)],
    face: (J, s) => stdEyes(J, s, { iris: '#ffe0e6', iris2: '#ff2a55', sclera: '#2a0008', ink: '#2a0008', angry: 0.9, glow: 1.0, size: [0.09, 0.075], y: 0.05, irisSize: 0.6, pupilSize: 0.1, mouth: true, mouthY: 0.5, mouthSize: [0.14, 0.06], open: 0.35, smile: 0.6, inside: '#2a0008' }),
    anim: { attack: 'swipe', heavy: 0.4, wingFlap: 1 }, noBlink: true,
  };
};

// Psion (mind form): floating mind-mage with an exposed glowing brain, third eye and orbiting shards.
V.psion = (C, ctx) => {
  const robe = tone('#c0287f', '#5a0a3a', '#f472b6', 0.2, 1.8, 0.15, 0.35);
  const trim = tone('#a78bfa', '#5b21b6', '#ddd6fe', 0.2, 1.8, 0.5, 0.3);
  const skin = tone('#ffc6e2', '#e879b8', '#fff0f8', 1.4, 1.9, 0.25, 0.4);
  const brain = (x, y, z, l, nx, ny, nz, cell) => ({ ...tone('#ffc9e6', '#f06aae', '#fff2fa', 1.72, 2.05, 0.45, 0.45)(x, y, z, l, nx, ny, nz, cell), emissive: 0.18 });
  const shard = P('#c4b5fd', 0.85, 0.9);
  return {
    build: 'robed', noLegs: true, skin: robe, armSkin: robe, armR: [0.08, 0.08, 0.1], headSkin: skin,
    robe: (J, s) => [[0, 0.62 * s, -0.02 * s], [0, 0.35 * s, -0.08 * s]],
    J: { headC: [0, 1.66, 0.05], headR: [0.16, 0.16, 0.16] },
    headExtras: (J, s) => [
      S.sub(0.016 * s,
        S.ellipsoid([0, 1.83 * s, -0.01 * s], [0.25 * s, 0.19 * s, 0.24 * s]),
        S.ellipsoid([0, 2.0 * s, -0.04 * s], [0.025 * s, 0.1 * s, 0.22 * s]),
        S.mirror(S.ellipsoid([0.13 * s, 1.97 * s, -0.02 * s], [0.14 * s, 0.02 * s, 0.22 * s]).rot(0, 0, 0.45)),
        S.mirror(S.ellipsoid([0.2 * s, 1.84 * s, -0.08 * s], [0.02 * s, 0.1 * s, 0.14 * s]).rot(0.3, 0, 0.2)),
      ).paint(brain),
      S.union(0.02 * s, S.torus([0, 1.52 * s, 0.0], 0.13 * s, 0.05 * s), S.mirror(spike([0.13 * s, 1.52 * s, -0.04 * s], [0.26 * s, 1.72 * s, -0.1 * s], 0.06 * s))).paint(trim),
    ],
    hand: (J, s) => S.union(0.015 * s, S.ellipsoid([J.wr[0], J.wr[1] - 0.06 * s, J.wr[2] + 0.02 * s], [0.055 * s, 0.07 * s, 0.06 * s]).paint(skin), S.sphere([J.wr[0] + 0.01 * s, J.wr[1] - 0.08 * s, J.wr[2] + 0.08 * s], 0.045 * s).paint(G('#f0abfc', 1, 0.5))).bone('hand.L'),
    extras: (J, s) => [
      robeSkirt(J, s, robe, P('#2a0418', 0.1), { bot: 0.3, r1: 0.23, r2: 0.4, tatters: 8, tatLen: 0.16 }),
      S.mirror(S.union(0.02 * s, S.ellipsoid([0.28 * s, 1.46 * s, -0.01 * s], [0.13 * s, 0.08 * s, 0.13 * s]).rot(0, 0, -0.45)).paint(trim).bone('chest')),
      S.union(0.01 * s, S.limb([0, 1.4 * s, 0.2 * s], [0, 0.4 * s, 0.4 * s], 0.06 * s, 0.1 * s)).paint(trim).bone('chest'),
    ],
    props: (J, s) => [0, 1, 2, 3].map(i => {
      const a = (i / 4) * TAU;
      const c = [Math.sin(a) * 0.46 * s, (1.72 + 0.1 * (i % 2)) * s, Math.cos(a) * 0.46 * s];
      return { sdf: S.union(0.01 * s, S.limb(c, add(c, [0, 0.13 * s, 0]), 0.055 * s, 0.006 * s), S.limb(c, add(c, [0, -0.09 * s, 0]), 0.055 * s, 0.006 * s)).paint(shard), bone: 'head', spin: 0.9 };
    }),
    face: (J, s) => [
      ...stdEyes(J, s, { iris: '#c4b5fd', iris2: '#6d28d9', ink: '#4a0a2c', angry: 0.35, glow: 0.8, size: [0.085, 0.09], y: -0.05, irisSize: 0.6, mouth: true, mouthY: 0.52, mouthSize: [0.09, 0.05], open: 0.1, smile: 0.4 }),
      { kind: 'eye', name: 'eyeC', side: 1, center: [0, 1.76 * s, 0.19 * s], dir: [0, 0.3, 1], size: [0.08 * s, 0.07 * s], iris: '#ffe14d', iris2: '#c026d3', lidRest: 0.2, irisSize: 0.55, pupilSize: 0.2, ink: '#4a0a2c', glow: 1.0 },
    ],
    anim: { attack: 'cast', hover: 0.2, heavy: 0 },
  };
};

// Chrono Avatar (time form): brass clockwork knight with a clock halo, hourglass core and cape.
V.chrono = (C, ctx) => {
  const brass = tone('#e2aa3c', '#7c5419', '#f8dc98', 0.3, 1.9, 0.85, 0.45);
  const darkB = tone('#8a5a1e', '#3f2a08', '#c8963e', 0.2, 1.4, 0.6, 0.35);
  const cyan = G('#5fd4ff', 1, 0.7);
  const capeP = tone('#1d4e89', '#0c2244', '#3b82c4', 0.2, 1.6, 0.12, 0.3);
  const clockFace = (x, y, z) => ({ color: hex('#fff4d0'), gloss: 0.6, emissive: 0.75 });
  return {
    build: 'hero', s: 1.02, skin: brass, armSkin: brass, legSkin: darkB,
    cape: (J, s) => [[0, 1.25 * s, -0.26 * s], [0, 0.8 * s, -0.3 * s]],
    headCore: (J, s) => S.union(0.03 * s, S.ellipsoid(J.headC, J.headR), S.ellipsoid([0, J.headC[1] - 0.08 * s, J.headC[2] + 0.07 * s], [0.14 * s, 0.1 * s, 0.13 * s])),
    headSkin: brass,
    headExtras: (J, s) => [
      S.union(0.01 * s, ...[-1, 0, 1].map(i => spike([i * 0.08 * s, J.headC[1] + 0.16 * s, J.headC[2] + 0.02 * s], [i * 0.12 * s, J.headC[1] + (0.34 - Math.abs(i) * 0.08) * s, J.headC[2] - 0.02 * s], 0.035 * s))).paint(brass),
      S.sphere([0, J.headC[1] + 0.12 * s, J.headC[2] + 0.17 * s], 0.035 * s).paint(cyan),
    ],
    hand: (J, s) => fist(J.wr, s, 0.11 * s, darkB),
    extras: (J, s) => [
      capeSheet(J, s, capeP, 1.05, 0.33),
      S.mirror(S.union(0.01 * s,
        pauldron([0.36 * s, 1.47 * s, -0.01 * s], 0.15 * s, brass, darkB),
        S.cyl([0.44 * s, 1.47 * s, 0.0], 0.06 * s, 0.015 * s, 0.008 * s).rot(0, 0, Math.PI / 2 - 0.45).paint(G('#fff4d0', 0.7, 0.6)),
      ).bone('chest')),
      // hourglass core
      S.union(0.01 * s,
        S.cyl([0, 1.4 * s, 0.22 * s], 0.08 * s, 0.015 * s, 0.008 * s).paint(darkB),
        S.cyl([0, 1.14 * s, 0.22 * s], 0.08 * s, 0.015 * s, 0.008 * s).paint(darkB),
        S.limb([0, 1.38 * s, 0.22 * s], [0, 1.27 * s, 0.22 * s], 0.065 * s, 0.012 * s).paint(cyan),
        S.limb([0, 1.16 * s, 0.22 * s], [0, 1.27 * s, 0.22 * s], 0.065 * s, 0.012 * s).paint(G('#ffe7a8', 1, 0.6)),
      ).bone('chest'),
      S.torus([0, 0.96 * s, 0.02 * s], 0.24 * s, 0.04 * s).paint(darkB).bone('spine'),
    ],
    props: (J, s) => {
      const c = [0, J.headC[1] + 0.05 * s, J.headC[2] - 0.24 * s];
      const ring = S.union(0.01 * s,
        S.torus(c, 0.36 * s, 0.03 * s).rot(Math.PI / 2, 0, 0).paint(brass),
        ...[...Array(12)].map((_, i) => { const a = (i / 12) * TAU; return S.sphere([c[0] + Math.sin(a) * 0.36 * s, c[1] + Math.cos(a) * 0.36 * s, c[2]], (i % 3 ? 0.022 : 0.036) * s).paint(i % 3 ? brass : cyan); }),
      );
      return [
        { sdf: ring, bone: 'head' },
        { sdf: S.limb(c, [c[0], c[1] + 0.3 * s, c[2] + 0.02 * s], 0.022 * s, 0.01 * s).paint(cyan), bone: 'head', spinZ: -2.0, pivot: c },
        { sdf: S.limb(c, [c[0] + 0.2 * s, c[1], c[2] + 0.03 * s], 0.026 * s, 0.012 * s).paint(G('#ffe7a8', 1, 0.6)), bone: 'head', spinZ: -0.3, pivot: c },
      ];
    },
    face: (J, s) => stdEyes(J, s, { iris: '#bff1ff', iris2: '#1b8fc4', sclera: '#1a1206', ink: '#1a1206', angry: 0.5, glow: 1.0, size: [0.09, 0.055], y: 0.06, irisSize: 0.8, pupilSize: 0 }),
    anim: { attack: 'cast', heavy: 0.4 }, noBlink: true,
  };
};

// Void Walker (space form): a star-filled cosmic silhouette with glowing rings and orbiting planets.
V.voidWalker = (C, ctx) => {
  const cosmos = starry(tone('#3b1587', '#12063a', '#7c3aed', 0.2, 1.9, 0.45, 0.3), '#ffffff', 9, 0.8, 1);
  const ringP = G('#f0abfc', 1, 0.6);
  return {
    build: 'hero', skin: cosmos, armSkin: cosmos, legSkin: cosmos, bulk: 0.92, headSkin: cosmos,
    armR: [0.085, 0.08, 0.075], legR: [0.11, 0.095, 0.08],
    headExtras: (J, s) => [
      S.union(0.01 * s, S.torus([0, J.headC[1] + 0.07 * s, J.headC[2] - 0.02 * s], 0.2 * s, 0.018 * s).rot(0.3, 0, 0)).paint(ringP),
      tube([0, J.headC[1] + 0.12 * s, J.headC[2] - 0.05 * s], [0, J.headC[1] + 0.35 * s, J.headC[2] - 0.1 * s], [0, J.headC[1] + 0.3 * s, J.headC[2] - 0.35 * s], 0.06 * s, 0.01 * s, 3).paint(cosmos),
    ],
    hand: (J, s) => S.union(0.015 * s, fist(J.wr, s, 0.09 * s, cosmos), S.torus([J.wr[0], J.wr[1] + 0.06 * s, J.wr[2]], 0.09 * s, 0.018 * s).rot(0.2, 0, 0.2).paint(ringP).bone('foreArm.L')),
    extras: (J, s) => [
      S.torus([0, 0.96 * s, 0.02 * s], 0.24 * s, 0.022 * s).paint(ringP).bone('spine'),
      S.mirror(S.torus([J.el[0], J.el[1] + 0.12 * s, J.el[2]], 0.095 * s, 0.018 * s).rot(0.1, 0, 0.35).paint(ringP).bone('upperArm.L')),
      S.union(0.01 * s, S.ellipsoid([0, 1.32 * s, 0.215 * s], [0.07 * s, 0.07 * s, 0.03 * s]).paint(G('#ffffff', 1, 0.5)), ...[0, 1, 2, 3].map(i => { const a = (i / 4) * TAU + 0.78; return spike([Math.sin(a) * 0.05 * s, 1.32 * s + Math.cos(a) * 0.05 * s, 0.22 * s], [Math.sin(a) * 0.14 * s, 1.32 * s + Math.cos(a) * 0.14 * s, 0.2 * s], 0.02 * s); })).paint(ringP).bone('chest'),
    ],
    props: (J, s) => [
      { sdf: S.union(0.01 * s, S.sphere([0.55 * s, 1.5 * s, 0.1 * s], 0.08 * s).paint(tone('#7dd3fc', '#1d4ed8', '#e0f2fe', 1.42, 1.58, 0.4, 0.4)), S.torus([0.55 * s, 1.5 * s, 0.1 * s], 0.13 * s, 0.014 * s).rot(0.4, 0, 0.3).paint(ringP)), bone: 'chest', spin: 0.7 },
      { sdf: S.sphere([-0.45 * s, 1.75 * s, -0.2 * s], 0.055 * s).paint(tone('#fbbf24', '#b45309', '#fef3c7', 1.7, 1.8, 0.3, 0.3)), bone: 'chest', spin: 0.7 },
      { sdf: S.sphere([0.1 * s, 1.1 * s, -0.5 * s], 0.045 * s).paint(G('#f5c2ff', 1, 0.4)), bone: 'chest', spin: 0.7 },
    ],
    face: (J, s) => stdEyes(J, s, { iris: '#ffffff', iris2: '#f0abfc', sclera: '#12063a', ink: '#12063a', angry: 0.5, glow: 1.0, size: [0.085, 0.06], y: 0.02, irisSize: 0.8, pupilSize: 0 }),
    anim: { attack: 'cast', heavy: 0.2, hover: 0.08 }, noBlink: true,
  };
};

// Null Avatar (void form) / Unmaker (titan): faceless grey sentinel, white rune lines, void core, cube halo.
V.nullAvatar = (C, ctx) => {
  const titan = ctx.role === 'titan';
  const armor = bands(titan ? '#1f1f24' : '#71717a', titan ? '#0c0c0f' : '#3f3f46', [0, 0, 0], [0, 1, 0], 0.16, 0.12, 0.6, 0.25);
  const runes = veins(tone(titan ? '#2a2a31' : '#8a8a94', titan ? '#0c0c0f' : '#3f3f46', titan ? '#52525b' : '#d4d4d8', 0.2, 1.9, 0.6, 0.45), '#f4f4ff', 4, 0.025, 1, 11);
  const white = G('#f4f4ff', 1, 0.6);
  const s0 = titan ? 1.75 : 1.0;
  return {
    build: titan ? 'robed' : 'hero', noLegs: titan, s: s0, skin: runes, armSkin: runes, legSkin: armor, bulk: titan ? 0.9 : 1.0,
    armR: titan ? [0.07, 0.065, 0.06] : undefined,
    J: titan ? { el: [0.48, 1.08, 0.08], wr: [0.56, 0.74, 0.18] } : undefined,
    robe: titan ? (J, s) => [[0, 0.62 * s, -0.02 * s], [0, 0.35 * s, -0.08 * s]] : undefined,
    headCore: (J, s) => titan
      ? S.sub(0.02 * s, S.ellipsoid(J.headC, [0.17 * s, 0.21 * s, 0.17 * s]), S.ellipsoid([0, J.headC[1], J.headC[2] + 0.19 * s], [0.12 * s, 0.15 * s, 0.1 * s]))
      : S.union(0.03 * s, S.ellipsoid(J.headC, J.headR), S.ellipsoid([0, J.headC[1] - 0.06 * s, J.headC[2] + 0.06 * s], [0.14 * s, 0.12 * s, 0.13 * s])),
    headSkin: runes,
    headExtras: (J, s) => titan ? [
      S.ellipsoid([0, J.headC[1], J.headC[2] + 0.1 * s], [0.1 * s, 0.13 * s, 0.05 * s]).paint(P('#000000', 0.9)),
      S.torus([0, J.headC[1], J.headC[2] + 0.12 * s], 0.12 * s, 0.018 * s).rot(Math.PI / 2, 0, 0).paint(white),
      S.mirror(horn([0.1 * s, J.headC[1] + 0.14 * s, J.headC[2] - 0.02 * s], [0.26 * s, J.headC[1] + 0.52 * s, J.headC[2] - 0.12 * s], 0.05 * s, [0.06 * s, 0, 0], 3)).paint(runes),
    ] : [
      S.box([0, J.headC[1] + 0.02 * s, J.headC[2] + 0.18 * s], [0.12 * s, 0.018 * s, 0.03 * s], 0.012 * s).paint(white),
      S.limb([0, J.headC[1] + 0.12 * s, J.headC[2] + 0.1 * s], [0, J.headC[1] + 0.3 * s, J.headC[2] - 0.12 * s], 0.04 * s, 0.015 * s).paint(runes),
    ],
    hand: (J, s) => titan ? clawHand(J.wr, s, 0.06 * s, runes, white, 2.6, 3) : fist(J.wr, s, 0.1 * s, armor),
    torso: (J, s) => S.union(0.02 * s,
      S.sub(0.02 * s, TORSO[titan ? 'robed' : 'hero'](J, s, runes, titan ? 0.9 : 1.0), S.cyl([0, 1.28 * s, 0], 0.075 * s, 0.4 * s, 0.01 * s).rot(Math.PI / 2, 0, 0)),
      S.torus([0, 1.28 * s, 0.2 * s], 0.08 * s, 0.018 * s).rot(Math.PI / 2 + 0.1, 0, 0).paint(white).bone('chest'),
    ),
    extras: (J, s) => [
      S.mirror(pauldron([0.35 * s, 1.47 * s, -0.01 * s], 0.14 * s, armor, white).bone('chest')),
      ...(titan ? [robeSkirt(J, s, runes, P('#000000', 0.1), { bot: 0.3, r1: 0.22, r2: 0.46, tatters: 12, tatLen: 0.3 })] : [S.torus([0, 0.96 * s, 0.02 * s], 0.24 * s, 0.035 * s).paint(white).bone('spine')]),
    ],
    props: (J, s) => [...Array(titan ? 8 : 6)].map((_, i) => {
      const a = (i / (titan ? 8 : 6)) * TAU;
      const R = (titan ? 0.42 : 0.32) * s;
      const c = [Math.sin(a) * R, J.headC[1] + 0.05 * s + Math.cos(a) * R, J.headC[2] - 0.25 * s];
      return { sdf: S.box(c, [0.045 * s, 0.045 * s, 0.045 * s], 0.01 * s).rot(a, a * 0.7, 0.3).paint(i % 2 ? white : tone('#71717a', '#27272a', '#d4d4d8', c[1] - 0.05 * s, c[1] + 0.05 * s, 0.6, 0.5)), bone: 'head', spinZ: 0.5, pivot: [0, J.headC[1] + 0.05 * s, J.headC[2] - 0.25 * s] };
    }),
    face: (J, s) => titan
      ? eyes([0.045 * s, J.headC[1] + 0.02 * s, J.headC[2] + 0.13 * s], [0.04 * s, 0.04 * s], { iris: '#ffffff', iris2: '#c7c7ff', sclera: '#000000', ink: '#000000', irisSize: 0.6, pupilSize: 0, yaw: 0.3, glow: 1.0 })
      : [],
    anim: { attack: 'cast', heavy: titan ? 0 : 0.4, hover: titan ? 0.2 : 0 }, noBlink: true,
  };
};

// Blood Horror (blood titan): hunched flesh brute, gaping jaw with teeth, many eyes, bone spikes, pulsing veins.
V.bloodHorror = (C, ctx) => {
  const flesh = veins(mottle(tone('#d8324f', '#5a0418', '#ff8fa3', 0.3, 2.6, 0.35, 0.35), '#8a1230', 4, 0.35), '#ff4d6d', 3, 0.04, 0.8, 5);
  const bone = tone('#f3e2d2', '#9a8068', '#ffffff', 1.0, 3.0, 0.45, 0.3);
  const maw = P('#2a0008', 0.3);
  return {
    build: 'brute', s: 1.6, skin: flesh, armSkin: flesh, legSkin: flesh, jaw: true, bulk: 1.12,
    J: { headC: [0, 1.5, 0.3], headR: [0.24, 0.2, 0.22], head: [0, 1.42, 0.2], neck: [0, 1.36, 0.12], jaw: [0, 1.42, 0.28] },
    headCore: (J, s) => S.union(0.05 * s, S.ellipsoid(J.headC, J.headR), S.mirror(S.ellipsoid([0.14 * s, J.headC[1] + 0.02 * s, J.headC[2] + 0.02 * s], [0.12 * s, 0.13 * s, 0.14 * s]))),
    headExtras: (J, s) => [
      S.ellipsoid([0, J.headC[1] - 0.1 * s, J.headC[2] + 0.1 * s], [0.18 * s, 0.05 * s, 0.13 * s]).paint(maw),
      S.union(0.005 * s, ...[-2, -1, 0, 1, 2].map(i => spike([i * 0.06 * s, J.headC[1] - 0.08 * s, J.headC[2] + (0.2 - Math.abs(i) * 0.03) * s], [i * 0.062 * s, J.headC[1] - 0.17 * s, J.headC[2] + (0.22 - Math.abs(i) * 0.03) * s], 0.028 * s))).paint(bone),
    ],
    hand: (J, s) => clawHand(J.wr, s, 0.15 * s, flesh, bone, 1.6, 3),
    extras: (J, s) => [
      S.union(0.03 * s,
        S.ellipsoid([0, J.jaw[1] - 0.08 * s, J.jaw[2] + 0.12 * s], [0.2 * s, 0.08 * s, 0.17 * s]).paint(flesh),
        S.ellipsoid([0, J.jaw[1] - 0.04 * s, J.jaw[2] + 0.12 * s], [0.16 * s, 0.03 * s, 0.13 * s]).paint(maw),
        ...[-2, -1, 0, 1, 2].map(i => spike([i * 0.06 * s, J.jaw[1] - 0.05 * s, J.jaw[2] + (0.26 - Math.abs(i) * 0.03) * s], [i * 0.06 * s, J.jaw[1] + 0.05 * s, J.jaw[2] + (0.27 - Math.abs(i) * 0.03) * s], 0.028 * s).paint(bone)),
      ).bone('jaw'),
      S.union(0.02 * s,
        spike([0, 1.62 * s, -0.12 * s], [0, 1.95 * s, -0.36 * s], 0.09 * s),
        spike([0.16 * s, 1.56 * s, -0.16 * s], [0.3 * s, 1.84 * s, -0.4 * s], 0.08 * s),
        spike([-0.18 * s, 1.52 * s, -0.16 * s], [-0.34 * s, 1.76 * s, -0.4 * s], 0.08 * s),
        spike([0, 1.3 * s, -0.28 * s], [0, 1.44 * s, -0.56 * s], 0.08 * s),
        S.mirror(spike([0.46 * s, 1.52 * s, -0.04 * s], [0.66 * s, 1.72 * s, -0.12 * s], 0.07 * s)),
      ).paint(bone).bone('chest'),
    ],
    face: (J, s) => {
      const hc = J.headC;
      return [
        ...eyes([0.1 * s, hc[1] + 0.06 * s, hc[2] + 0.17 * s], [0.08 * s, 0.08 * s], { iris: '#fff0c2', iris2: '#ff7a00', sclera: '#ffe9ec', ink: '#2a0008', angry: 0.9, irisSize: 0.55, pupilSize: 0.2, glow: 0.7, yaw: 0.5 }),
        { kind: 'eye', name: 'eyeC', side: 1, center: [0, hc[1] + 0.13 * s, hc[2] + 0.16 * s], dir: [0, 0.5, 1], size: [0.07 * s, 0.07 * s], iris: '#fff0c2', iris2: '#ff7a00', sclera: '#ffe9ec', ink: '#2a0008', angry: 0.9, irisSize: 0.5, pupilSize: 0.2, glow: 0.7 },
      ];
    },
    anim: { attack: 'slam', heavy: 1, hunch: 0.3 }, noBlink: false, pulse: 0.25,
  };
};

// Future Self (time titan): a grown-up hero in brass armor with a red scarf, spiky blue hair, cape and a chrono blade.
V.futureSelf = (C, ctx) => {
  const brass = tone('#e2aa3c', '#7c5419', '#f8dc98', 0.3, 3.2, 0.85, 0.45);
  const darkB = tone('#6b4a1a', '#2a1a06', '#a8742c', 0.2, 2.6, 0.6, 0.35);
  const skinP = tone('#f7c6a0', '#d9956a', '#ffe0c8', 2.3, 3.2, 0.22, 0.3);
  const hair = tone('#4a86f0', '#18215a', '#9cc4ff', 2.8, 3.4, 0.2, 0.5);
  const scarf = bands('#e8384f', '#fff1e6', [0, 0, 0], [0, 1, 0.3], 0.3, 0.15, 0.15, 0.2);
  const capeP = tone('#1d4e89', '#0c2244', '#3b82c4', 0.2, 2.6, 0.12, 0.3);
  const cyan = G('#5fd4ff', 1, 0.7);
  return {
    build: 'hero', s: 1.6, skin: brass, armSkin: brass, legSkin: darkB, headSkin: skinP,
    cape: (J, s) => [[0, 1.25 * s, -0.26 * s], [0, 0.8 * s, -0.3 * s]],
    headExtras: (J, s) => {
      const hc = J.headC;
      const clumps = [[0, 0.16, 0.04, 0, 0.36, -0.1], [0.12, 0.14, 0.0, 0.24, 0.3, -0.12], [-0.12, 0.14, 0.0, -0.24, 0.3, -0.12], [0.08, 0.1, -0.14, 0.16, 0.2, -0.32], [-0.08, 0.1, -0.14, -0.16, 0.2, -0.32], [0.18, 0.05, -0.05, 0.3, 0.08, -0.15], [-0.18, 0.05, -0.05, -0.3, 0.08, -0.15], [0.0, 0.16, 0.12, 0.06, 0.12, 0.26]];
      return [
        S.union(0.02 * s,
          S.ellipsoid([0, hc[1] + 0.09 * s, hc[2] - 0.04 * s], [0.2 * s, 0.13 * s, 0.19 * s]),
          ...clumps.map(([ax, ay, az, bx, by, bz]) => S.limb([ax * s, hc[1] + ay * s, hc[2] + az * s], [bx * s, hc[1] + by * s, hc[2] + bz * s], 0.07 * s, 0.012 * s)),
        ).paint(hair),
      ];
    },
    hand: (J, s) => fist(J.wr, s, 0.11 * s, darkB),
    extras: (J, s) => [
      capeSheet(J, s, capeP, 1.05, 0.34),
      S.mirror(S.union(0.01 * s, pauldron([0.36 * s, 1.47 * s, -0.01 * s], 0.15 * s, brass, darkB), S.cyl([0.45 * s, 1.47 * s, 0.0], 0.05 * s, 0.012 * s, 0.006 * s).rot(0, 0, Math.PI / 2 - 0.45).paint(G('#fff4d0', 0.7, 0.6))).bone('chest')),
      S.union(0.02 * s,
        S.torus([0, 1.47 * s, 0.03 * s], 0.13 * s, 0.055 * s).rot(0.12, 0, 0),
        S.limb([0.1 * s, 1.44 * s, -0.1 * s], [0.2 * s, 1.26 * s, -0.3 * s], 0.06 * s, 0.045 * s),
      ).paint(scarf).bone('chest'),
      S.ellipsoid([0, 1.3 * s, 0.2 * s], [0.07 * s, 0.07 * s, 0.03 * s]).paint(cyan).bone('chest'),
      S.torus([0, 0.96 * s, 0.02 * s], 0.24 * s, 0.04 * s).paint(darkB).bone('spine'),
      // chrono blade
      S.union(0.01 * s,
        S.box([-0.51 * s, 0.84 * s, 0.62 * s], [0.018 * s, 0.07 * s, 0.5 * s], 0.012 * s).paint(glowGrad('#5fd4ff', '#e8fbff', 0.8 * s, 0.9 * s, 0.7, 0.9)),
        S.box([-0.51 * s, 0.84 * s, 0.11 * s], [0.04 * s, 0.13 * s, 0.025 * s], 0.012 * s).paint(brass),
        S.limb([-0.51 * s, 0.84 * s, -0.08 * s], [-0.51 * s, 0.84 * s, 0.09 * s], 0.03 * s).paint(darkB),
      ).bone('hand.R').rigid(),
    ],
    face: (J, s) => stdEyes(J, s, { iris: '#9ff0ff', iris2: '#1b6f9a', ink: '#1b2560', angry: 0.5, glow: 0.8, size: [0.085, 0.1], y: 0.02, brows: true, browCol: '#18215a', browAngle: 0.9, mouth: true, mouthY: 0.45, mouthSize: [0.12, 0.06], open: 0.2, smile: 0.7 }),
    anim: { attack: 'lance', heavy: 0.5 },
  };
};

// ── Sculpt ───────────────────────────────────────────────────────────────
export const GIANT_VARIANTS = Object.keys(V);

export function sculptGiant(ctx) {
  const { variant, pal: C, role } = ctx;
  const v = V[variant](C, ctx);
  const s = v.s ?? 1;
  const J = scaleJ({ ...BUILDS[v.build], ...(v.J || {}) }, s);
  const spec = specFor(J, v, s);
  const headCore = (v.headCore ? v.headCore(J, s) : S.ellipsoid(J.headC, J.headR)).paint(v.headSkin ?? v.skin);
  const head = S.union(0.02 * s, headCore, ...(v.headExtras ? v.headExtras(J, s) : [])).bone('head');
  const torso = v.torso ? v.torso(J, s) : TORSO[v.build](J, s, v.skin, v.bulk ?? 1);
  const limbs = [v.arm ? v.arm(J, s) : armDefault(J, s, v), v.hand ? v.hand(J, s) : fist(J.wr, s, 0.1 * s, v.handSkin ?? v.skin)];
  if (!v.noLegs) limbs.push(v.leg ? v.leg(J, s) : legDefault(J, s, v));
  const sdf = S.union(0.03 * s, torso, S.mirror(S.union(0.03 * s, ...limbs)), head, ...(v.extras ? v.extras(J, s) : []));
  const titan = role === 'titan';
  const props = (v.props ? v.props(J, s) : []).map(p => ({ ...p }));
  const cell = v.cell ?? (titan ? 0.021 * s : 0.024 * s);
  return {
    spec, sdf, face: v.face ? { sdf: headCore, bone: 'head', features: v.face(J, s) } : null, props,
    parts: (v.parts ? v.parts(J, s) : []).map(p => ({ sdf: p, cell: cell * 0.92 })),
    cell, aoStep: 0.035 * s, tau: 0.045 * s,
    height: v.height ?? 1.9 * s + (v.anim?.hover ?? 0) * s, radius: (v.radius ?? 0.55) * s,
    anim: 'giant', animOpts: { ...(v.anim || {}), build: v.build }, spawn: titan ? 'rise' : 'pop', glow: C.glow,
    emissivePulse: v.pulse ?? 0, noBlink: v.noBlink, stiffness: 240, hitLean: 0.7,
    stiff: { 'wing.L': 200, 'wing.R': 200, 'wingTip.L': 150, 'wingTip.R': 150, 'wingB.L': 200, 'wingB.R': 200, 'wingBTip.L': 150, 'wingBTip.R': 150 },
  };
}

// ── Animation ────────────────────────────────────────────────────────────
export function poseGiant(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const o = c.def.animOpts;
  const hs = c.def.height / 1.9;
  const heavy = o.heavy ?? 0.5;
  const float = o.hover ?? 0;
  const idle = 1 - smooth(sp * 2);
  const w = smooth(sp * 1.6);
  const run = smooth((sp - 0.5) * 2.5);
  const br = Math.sin(t * (1.8 - heavy * 0.5));
  const sn = Math.sin(ph), cs = Math.cos(ph);
  const A = lerp(0.42, 0.75, run) * w;
  const spread = o.build === 'brute' ? 0.3 : 0.14;
  let mood = 'idle';
  P.hips = [0, sn * 0.12 * w, cs * 0.04 * w * (1 + heavy)];
  P.spine = [0.02 * idle + 0.06 * w + (o.hunch ?? 0), -sn * 0.06 * w, 0.015 * Math.sin(t * 0.7) * idle];
  P.chest = [0.035 * br * idle + 0.08 * run, -sn * 0.1 * w, 0];
  P.neck = [-0.02 * br * idle - (o.hunch ?? 0) * 0.8, 0.12 * Math.sin(t * 0.33) * idle, 0];
  P.head = [-0.03 * br * idle - 0.05 * w, 0.1 * Math.sin(t * 0.41 + 1) * idle + sn * 0.05 * w, 0.03 * Math.sin(t * 0.6) * idle];
  P['upperArm.L'] = [0.05 * br * idle + sn * A * 0.8, 0, spread + 0.03 * br * idle];
  P['upperArm.R'] = [0.05 * br * idle - sn * A * 0.8, 0, -spread - 0.03 * br * idle];
  P['foreArm.L'] = [-0.3 - 0.4 * w, 0, 0];
  P['foreArm.R'] = [-0.3 - 0.4 * w, 0, 0];
  P['hand.L'] = [0, 0, 0]; P['hand.R'] = [0, 0, 0];
  P['thigh.L'] = [-sn * A, 0, 0.03];
  P['thigh.R'] = [sn * A, 0, -0.03];
  P['shin.L'] = [(0.1 + 0.95 * Math.max(0, cs)) * A, 0, 0];
  P['shin.R'] = [(0.1 + 0.95 * Math.max(0, -cs)) * A, 0, 0];
  P['foot.L'] = [sn * 0.3 * A, 0, 0];
  P['foot.R'] = [-sn * 0.3 * A, 0, 0];
  R.y += ((Math.abs(cs) * 0.05 - 0.02) * w + 0.006 * br * idle) * hs;
  R.rz += cs * 0.035 * w * (1 + heavy);
  if (float) {
    R.y += (float + 0.03 * Math.sin(t * 1.4)) * hs;
    R.rx += 0.15 * w;
    P.spine[0] += 0.05 * w;
  }
  for (let i = 1; i <= 3; i++) {
    P['cape' + i] = [-0.08 - 0.35 * w - 0.2 * run + 0.05 * Math.sin(t * 2 - i), 0.05 * Math.sin(t * 1.3 - i), 0];
    P['robe' + i] = [-0.05 - 0.2 * w + 0.05 * Math.sin(t * 1.8 - i), 0.08 * Math.sin(t * 1.1 - i), 0.05 * Math.sin(t * 1.5 - i)];
    P['tail' + i] = [0.1 * Math.sin(t * 1.6 - i * 0.7), 0.3 * Math.sin(t * 1.9 - i * 0.8), 0];
  }
  const flap = o.wingFlap ? Math.sin(t * (2.2 + 2 * w)) : Math.sin(t * 1.2) * 0.3;
  const wa = 0.18 + 0.25 * w;
  P['wing.L'] = [0, -0.1 * flap, wa * flap - 0.05];
  P['wing.R'] = [0, 0.1 * flap, -wa * flap + 0.05];
  P['wingTip.L'] = [0, 0, 0.3 * Math.sin(t * (2.2 + 2 * w) - 0.8) * (o.wingFlap ? 1 : 0.3)];
  P['wingTip.R'] = [0, 0, -0.3 * Math.sin(t * (2.2 + 2 * w) - 0.8) * (o.wingFlap ? 1 : 0.3)];
  P['wingB.L'] = [0, 0, 0.6 * P['wing.L'][2] - 0.1];
  P['wingB.R'] = [0, 0, 0.6 * P['wing.R'][2] + 0.1];
  P.jaw = [0.08 + 0.05 * Math.max(0, br), 0, 0];

  if (kind === 'attack') {
    const style = o.attack ?? 'punch';
    const wind = smooth(k / 0.35), hit = smooth((k - 0.35) / 0.13), back = smooth((k - 0.6) / 0.4);
    const hold = 1 - back, up = wind * (1 - hit);
    if (style === 'slam') {
      P['upperArm.L'] = [(-2.7 * up - 0.7 * hit) * hold, 0, 0.35 * up + spread];
      P['upperArm.R'] = [(-2.7 * up - 0.7 * hit) * hold, 0, -0.35 * up - spread];
      P['foreArm.L'] = [(-0.5 * up) * hold - 0.2, 0, 0];
      P['foreArm.R'] = [(-0.5 * up) * hold - 0.2, 0, 0];
      P.spine[0] += (-0.3 * up + 0.55 * hit) * hold;
      P.chest[0] += (-0.1 * up + 0.2 * hit) * hold;
      R.y += (0.05 * up - 0.1 * hit * hold) * hs;
      P['thigh.L'][0] += -0.4 * hit * hold; P['thigh.R'][0] += -0.4 * hit * hold;
      P['shin.L'][0] += 0.7 * hit * hold; P['shin.R'][0] += 0.7 * hit * hold;
      P.jaw = [0.5 * hit * hold + 0.2 * up, 0, 0];
    } else if (style === 'punch') {
      P['upperArm.R'] = [(0.6 * up - 1.6 * hit) * hold, (-0.2 * hit) * hold, -spread - 0.2 * up];
      P['foreArm.R'] = [(-1.8 * up + 1.5 * hit) * hold - 0.3, 0, 0];
      P['upperArm.L'] = [(-0.5 * up + 0.5 * hit) * hold, 0, spread + 0.3 * hit * hold];
      P.chest[1] += (0.4 * up - 0.5 * hit) * hold;
      P.spine[0] += 0.15 * hit * hold;
      R.z += 0.12 * hit * hold * hs;
    } else if (style === 'cast') {
      const gather = smooth(k / 0.35), rel = smooth((k - 0.35) / 0.12);
      P['upperArm.L'] = [(0.4 * gather - 1.8 * rel) * hold, -0.2 * rel * hold, (0.9 * gather * (1 - rel)) * hold + spread];
      P['upperArm.R'] = [(0.4 * gather - 1.8 * rel) * hold, 0.2 * rel * hold, -(0.9 * gather * (1 - rel)) * hold - spread];
      P['foreArm.L'] = [(-1.2 * gather + 1.1 * rel) * hold - 0.2, 0, 0];
      P['foreArm.R'] = [(-1.2 * gather + 1.1 * rel) * hold - 0.2, 0, 0];
      P.spine[0] += (-0.15 * gather + 0.25 * rel) * hold;
      R.emi = 1 + 1.4 * rel * hold;
    } else if (style === 'swipe') {
      P['upperArm.R'] = [(-2.2 * up - 0.5 * hit) * hold, (0.4 * up - 0.9 * hit) * hold, (-0.8 * up + 0.4 * hit) * hold - spread];
      P['foreArm.R'] = [(-0.6 * up) * hold - 0.3, 0, 0];
      P['upperArm.L'] = [(-0.8 * up + 0.4 * hit) * hold, 0, 0.6 * up * hold + spread];
      P.chest[1] += (-0.4 * up + 0.5 * hit) * hold;
      P.spine[0] += (-0.1 * up + 0.3 * hit) * hold;
      R.z += 0.15 * hit * hold * hs;
    } else if (style === 'lance') {
      P['upperArm.R'] = [(0.5 * up - 1.2 * hit) * hold, 0, -spread - 0.1];
      P['foreArm.R'] = [(-1.4 * up + 1.2 * hit) * hold - 0.3, 0, 0];
      P.chest[1] += (0.5 * up - 0.45 * hit) * hold;
      P.spine[0] += (-0.1 * up + 0.25 * hit) * hold;
      R.z += 0.22 * hit * hold * hs;
    }
    mood = 'fierce';
  } else if (kind === 'spawn') {
    const roar = smooth((k - 0.55) / 0.15) * (1 - smooth((k - 0.88) / 0.12));
    P['upperArm.L'] = [-1.0 * roar, 0, 1.1 * roar + spread];
    P['upperArm.R'] = [-1.0 * roar, 0, -1.1 * roar - spread];
    P['foreArm.L'] = [-0.6 * roar - 0.3, 0, 0]; P['foreArm.R'] = [-0.6 * roar - 0.3, 0, 0];
    P.spine[0] += -0.25 * roar; P.neck[0] += -0.2 * roar;
    P.jaw = [0.6 * roar, 0, 0];
    P['wing.L'][2] += 0.5 * roar; P['wing.R'][2] -= 0.5 * roar;
    mood = roar > 0.3 ? 'fierce' : 'idle';
  } else if (kind === 'hit') {
    mood = 'hurt';
    P.spine[0] += -0.2 * (1 - k);
  } else if (kind === 'death') {
    const f = smooth(k / 0.5);
    if (float) R.y -= (float + 0.03) * hs * f;
    R.rx -= 1.2 * f * (float ? 0.4 : 1);
    P['thigh.L'] = [-0.8 * f, 0, 0.1]; P['thigh.R'] = [-0.6 * f, 0, -0.1];
    P['upperArm.L'] = [-1.6 * f, 0, 0.9 * f]; P['upperArm.R'] = [-1.4 * f, 0, -1.0 * f];
    P.head[0] -= 0.4 * f;
    P.jaw = [0.5 * f, 0, 0];
    mood = 'ko';
  }
  return mood;
}
