// Birds: the wind hawk minion, and (scaled up) Thunderbird, Roc and the
// Storm Roc form. Round body, big head with a hooked beak and crest,
// layered feather wings on two bones each, a fanned tail and taloned legs.
// Birds hover and flap; attacks are a rise-and-swoop with talons forward.

import { S, P, G, TAU, add, mix3, fx, lerp, smooth, clamp01, tube, horn, spike, flame, tone, glowGrad, belly, veins, featherWing, eyes, brows, hex, mixc } from './creature-kit.js';

// Unit layout: a 0.62 m tall chibi hawk. `o` carries palette and dressing.
export function birdBody(o) {
  const s = o.s ?? 1;
  const q = p => p.map(x => x * s);
  const body = o.body, backP = o.back ?? o.body, wingP = o.wing, beakP = o.beak, talon = o.talon, legP = o.leg ?? beakP;
  const spec = {
    root: { pos: [0, 0, 0] },
    body: { parent: 'root', pos: q([0, 0.36, 0]) },
    head: { parent: 'body', pos: q([0, 0.5, 0.05]) },
    crest: { parent: 'head', pos: q([0, 0.66, 0.02]) },
    tail: { parent: 'body', pos: q([0, 0.3, -0.13]) },
    'leg.L': { parent: 'body', pos: q([0.06, 0.28, 0.02]) },
    'leg.R': { parent: 'body', pos: q([-0.06, 0.28, 0.02]) },
  };
  const w = featherWing('wing', 'body', q([0.1, 0.46, -0.02]), (o.span ?? 0.46) * s, { feather: wingP, feather2: o.wing2 ?? wingP, coverts: o.coverts ?? backP }, {
    lift: o.lift ?? 0.3, sweep: 0.12, trail: o.trail ?? [0, -0.2, -1], chord: (o.chord ?? 0.3) * s, primaries: o.primaries ?? 5, secondaries: o.secondaries ?? 4, thick: 0.02 * s, armR: 0.038 * s, featherW: o.featherW ?? 1.1,
  });
  Object.assign(spec, w.bones);
  for (const [n, b] of Object.entries(w.bones)) if (n.endsWith('.L')) spec[n.slice(0, -2) + '.R'] = { parent: b.parent.endsWith('.L') ? b.parent.slice(0, -2) + '.R' : b.parent, pos: fx(b.pos) };
  const torso = S.union(0.05 * s,
    S.ellipsoid(q([0, 0.4, -0.01]), q([0.13, 0.15, 0.145])).rot(-0.35, 0, 0),
    S.ellipsoid(q([0, 0.37, 0.05]), q([0.1, 0.11, 0.08])).paint(o.breast ?? body),
  ).paint(body).bone('body');
  const headC = q([0, 0.585, 0.07]), headR = q([0.12, 0.115, 0.12]);
  const headCore = S.union(0.03 * s,
    S.ellipsoid(headC, headR),
    S.mirror(S.ellipsoid(q([0.06, 0.56, 0.12]), q([0.055, 0.05, 0.05]))),
  ).paint(o.headPaint ?? backP);
  const head = S.union(0.012 * s,
    headCore,
    S.ellipsoid(q([0, 0.63, 0.14]), q([0.1, 0.028, 0.05])).rot(-0.25, 0, 0).paint(o.brow ?? backP),
    tube(q([0, 0.585, 0.165]), q([0, 0.615, 0.25]), q([0, 0.525, 0.27]), 0.045 * s, 0.006 * s, 3).paint(beakP),
    S.ellipsoid(q([0, 0.545, 0.2]), q([0.03, 0.016, 0.04])).paint(beakP),
  ).bone('head');
  const crest = S.union(0.01 * s,
    tube(q([0, 0.67, 0.07]), q([0, 0.75, 0.02]), q([0, 0.76, -0.1]), 0.035 * s, 0.006 * s, 3),
    S.mirror(tube(q([0.03, 0.66, 0.04]), q([0.05, 0.72, -0.02]), q([0.06, 0.7, -0.1]), 0.028 * s, 0.005 * s, 3)),
  ).paint(o.crestPaint ?? backP).bone('crest');
  const tail = S.union(0.012 * s,
    S.ellipsoid(q([0, 0.26, -0.22]), q([0.035, 0.014, 0.1])).rot(0.5, 0, 0),
    S.mirror(S.ellipsoid(q([0.045, 0.265, -0.21]), q([0.032, 0.013, 0.095])).rot(0.5, 0.35, 0)),
  ).paint(o.tailPaint ?? wingP).bone('tail');
  const leg = S.union(0.01 * s,
    S.limb(q([0.06, 0.29, 0.02]), q([0.065, 0.2, 0.04]), 0.034 * s, 0.024 * s).paint(o.thigh ?? body),
    S.limb(q([0.065, 0.2, 0.04]), q([0.065, 0.14, 0.05]), 0.017 * s, 0.015 * s).paint(legP),
    ...[-1, 0, 1].map(i => tube(q([0.065 + i * 0.012, 0.14, 0.05]), q([0.065 + i * 0.03, 0.13, 0.1]), q([0.065 + i * 0.034, 0.1, 0.12]), 0.011 * s, 0.003 * s, 2).paint(talon)),
    tube(q([0.065, 0.14, 0.045]), q([0.065, 0.125, 0.0]), q([0.065, 0.1, -0.01]), 0.01 * s, 0.003 * s, 2).paint(talon),
  ).bone('leg.L');
  const sdf = S.union(0.02 * s,
    S.union(0.03 * s, torso, head),
    crest, tail, S.mirror(leg), S.mirror(w.sdf),
    ...(o.extras ? o.extras(q, s) : []),
  );
  const f = [
    ...eyes(q([0.062, 0.6, 0.165]), [0.07 * s, 0.078 * s], { iris: o.eye, iris2: o.iris2, ink: o.ink, angry: o.angry ?? 0.55, lidRest: 0.16, irisSize: 0.6, pupilSize: 0.26, yaw: 0.55, pitch: 0.05, glow: o.eyeGlow ?? 0 }),
  ];
  return { spec, sdf, face: { sdf: headCore, bone: 'head', features: f } };
}

const MINION_GALE = C => {
    const body = tone(C.body, C.dark, C.light, 0.25, 0.55, 0.25, 0.45);
    const wing = tone(C.body, C.dark, C.light, 0.3, 0.6, 0.25, 0.3);
    const tipDark = (x, y, z, l, nx, ny, nz, cell) => {
      const p = wing(x, y, z, l, nx, ny, nz, cell);
      const t = smooth((Math.abs(x) - 0.36) / 0.08);
      return { ...p, color: mixc(p.color, hex(C.dark), t * 0.8) };
    };
    return {
      ...birdBody({
        body, back: body, wing: tipDark, wing2: tone(C.light, C.body, '#ffffff', 0.3, 0.6, 0.25, 0.3), breast: belly(C.belly, C.belly, '#dfe9c8', 0.2, 0.5, {}),
        beak: tone(C.accent, '#c77800', '#fff2b0', 0.5, 0.62, 0.5, 0.4), talon: P('#2a2418', 0.5), leg: P(C.accent, 0.4),
        crestPaint: glowGrad(C.body, '#e4fbc8', 0.66, 0.78, 0.25, 0.3),
        eye: C.eye, iris2: C.eye2, ink: C.ink,
      }),
      height: 0.8,
    };
};
const VARIANTS = {};

// Wing paint with a dark (or glowing) band toward the tips; `x0` scales with size.
function wingTips(base, dark, light, tip, x0, s, emi = 0) {
  const w = tone(base, dark, light, 0.3 * s, 0.6 * s, 0.25, 0.3);
  const tc = hex(tip);
  return (x, y, z, l, nx, ny, nz, cell) => {
    const p = w(x, y, z, l, nx, ny, nz, cell);
    const t = smooth((Math.abs(x) - x0 * s) / (0.1 * s));
    return t > 0.01 ? { color: mixc(p.color, tc, t * 0.85), gloss: p.gloss, emissive: emi * t } : p;
  };
}
// Lightning-bolt stripes across the wing (emissive zigzags).
function boltStripes(paint, col, s) {
  const c = hex(col);
  return (x, y, z, l, nx, ny, nz, cell) => {
    const p = paint(x, y, z, l, nx, ny, nz, cell);
    const ax = Math.abs(x) / s;
    const zz = z / s + 0.06 * Math.abs(((ax * 9) % 2) - 1);
    const band = Math.abs(zz + 0.12) < 0.018 && ax > 0.16 && ax < 0.62;
    return band ? { color: c, gloss: 0.5, emissive: 1 } : p;
  };
}

VARIANTS.storm = (C, ctx) => {
  // Thunderbird (storm titan): indigo eagle, white head, glowing bolt stripes and a lightning crest.
  const s = 3.5;
  const body = tone('#4f46e5', '#1e1b4b', '#a5b4fc', 0.25 * s, 0.6 * s, 0.3, 0.4);
  const wing = boltStripes(wingTips('#4f46e5', '#1e1b4b', '#a5b4fc', '#11103a', 0.34, s), '#fde047', s);
  return {
    ...birdBody({
      s, body, back: body, wing, wing2: boltStripes(wingTips('#6366f1', '#312a9c', '#c7d2fe', '#1e1b4b', 0.34, s), '#fde047', s),
      coverts: tone('#6366f1', '#312a9c', '#c7d2fe', 0.3 * s, 0.6 * s, 0.3, 0.4), breast: tone('#c7d2fe', '#6366f1', '#ffffff', 0.25 * s, 0.5 * s, 0.25, 0.3),
      headPaint: tone('#ffffff', '#c7d2fe', '#ffffff', 0.5 * s, 0.7 * s, 0.3, 0.3), brow: P('#e0e7ff', 0.3),
      beak: tone('#fde047', '#c78a00', '#fffbe0', 0.5 * s, 0.62 * s, 0.5, 0.4), talon: P('#1a1640', 0.5), leg: P('#fde047', 0.4), thigh: body,
      crestPaint: glowGrad('#fde047', '#fffbe0', 0.66 * s, 0.78 * s, 1, 0.5), tailPaint: wing,
      eye: '#fff7c2', iris2: '#f59e0b', ink: '#11103a', eyeGlow: 0.8, angry: 0.8, span: 0.55, chord: 0.34, featherW: 1.2,
    }),
    height: 0.8 * s, radius: 0.5 * s, cell: 0.036, anim: { hover: 0.3, flap: 3.2 }, spawn: 'drop', pulse: 0.3,
  };
};

VARIANTS.gale = (C, ctx) => {
  const role = ctx.role;
  if (role === 'minion') return MINION_GALE(C);
  const titan = role === 'titan';
  // Roc (gale titan) / Storm Roc (gale form): a great green raptor with a cream breast and a swept crest.
  const s = titan ? 3.7 : 2.3;
  const body = tone(C.body, C.dark, C.light, 0.25 * s, 0.55 * s, 0.25, 0.45);
  const wing = wingTips(C.body, C.dark, C.light, titan ? '#2c4a08' : '#e4fbc8', 0.34, s, titan ? 0 : 0.6);
  return {
    ...birdBody({
      s, body, back: body, wing, wing2: wingTips(C.light, C.body, '#ffffff', titan ? '#3f6d0c' : '#ffffff', 0.34, s, titan ? 0 : 0.6),
      coverts: tone(C.dark, '#223a06', C.body, 0.3 * s, 0.6 * s, 0.3, 0.4), breast: tone(C.belly, '#cfe3a8', '#ffffff', 0.2 * s, 0.5 * s, 0.25, 0.3),
      beak: tone(C.accent, '#c77800', '#fff2b0', 0.5 * s, 0.62 * s, 0.5, 0.4), talon: P('#2a2418', 0.5), leg: P(C.accent, 0.4),
      crestPaint: titan ? tone('#fef9c3', C.body, '#ffffff', 0.62 * s, 0.78 * s, 0.3, 0.3) : glowGrad('#e4fbc8', '#ffffff', 0.62 * s, 0.78 * s, 0.7, 0.4),
      tailPaint: wing, eye: C.eye, iris2: C.eye2, ink: C.ink, angry: 0.7, eyeGlow: titan ? 0.2 : 0.5, span: 0.55, chord: 0.34, featherW: 1.2,
    }),
    height: 0.8 * s, radius: 0.5 * s, cell: titan ? 0.036 : 0.026, anim: { hover: titan ? 0.3 : 0.2, flap: titan ? 3 : 4.5 }, spawn: titan ? 'drop' : 'pop',
  };
};

export function sculptBird(ctx) {
  const { variant, pal: C } = ctx;
  const v = VARIANTS[variant](C, ctx);
  const sc = (v.height ?? 0.8) / 0.8;
  return {
    spec: v.spec, sdf: v.sdf, face: v.face, props: v.props || [],
    cell: v.cell ?? 0.018, aoStep: 0.022 * sc, tau: 0.024 * sc,
    height: v.height ?? 0.8, radius: v.radius ?? 0.3,
    anim: 'bird', animOpts: v.anim ?? { hover: 0.28, flap: 9 }, spawn: v.spawn ?? 'drop', glow: C.glow, emissivePulse: v.pulse ?? 0,
    stiff: { 'wing.L': 420, 'wing.R': 420, 'wingTip.L': 300, 'wingTip.R': 300 },
  };
}

export function poseBird(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const o = c.def.animOpts;
  const hs = c.def.height / 0.8;
  const w = smooth(sp * 1.5);
  let mood = 'idle';
  const rate = (o.flap ?? 9) * (1 + 0.25 * w);
  const fl = Math.sin(t * rate);
  const hover = (o.hover ?? 0.28) * hs;
  R.y += hover + (0.03 * -fl + 0.02 * Math.sin(t * 1.3)) * hs;
  R.rx += 0.35 * w;
  P.body = [0.05 * fl, 0.1 * Math.sin(t * 0.6) * (1 - w), 0];
  P.head = [-0.08 * fl - 0.3 * w, 0.25 * Math.sin(t * 0.5) * (1 - w), 0.08 * Math.sin(t * 0.8)];
  P.crest = [-0.2 * w + 0.08 * Math.sin(t * 3), 0, 0];
  P.tail = [0.15 * fl - 0.2 * w, 0.2 * Math.sin(t * 1.4), 0];
  const amp = 0.75 + 0.2 * w;
  P['wing.L'] = [0, 0.15 * fl, amp * fl + 0.1];
  P['wing.R'] = [0, -0.15 * fl, -amp * fl - 0.1];
  P['wingTip.L'] = [0, 0, 0.5 * Math.sin(t * rate - 0.9)];
  P['wingTip.R'] = [0, 0, -0.5 * Math.sin(t * rate - 0.9)];
  P['leg.L'] = [0.5 + 0.35 * w + 0.1 * fl, 0, 0.05];
  P['leg.R'] = [0.5 + 0.35 * w + 0.1 * fl, 0, -0.05];
  if (kind === 'attack') {
    const rise = smooth(k / 0.35), dive = smooth((k - 0.35) / 0.15), back = smooth((k - 0.6) / 0.4);
    const hold = 1 - back;
    R.y += (0.12 * rise * (1 - dive) - 0.08 * dive * hold) * hs;
    R.z += (-0.05 * rise + 0.3 * dive) * hold * hs;
    R.rx += (-0.4 * rise * (1 - dive) + 0.6 * dive) * hold;
    P['leg.L'] = [(-1.3 * dive) * hold + 0.5, 0, 0.1]; P['leg.R'] = [(-1.3 * dive) * hold + 0.5, 0, -0.1];
    P['wing.L'][2] += 0.6 * rise * (1 - dive); P['wing.R'][2] -= 0.6 * rise * (1 - dive);
    P.head[0] += -0.3 * dive * hold;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    mood = k > 0.5 ? 'fierce' : 'idle';
    P['wing.L'][2] += 0.5 * (1 - smooth(k / 0.5)); P['wing.R'][2] -= 0.5 * (1 - smooth(k / 0.5));
  } else if (kind === 'hit') {
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.45);
    R.y -= hover * f;
    R.rz += 1.3 * f;
    P['wing.L'] = [0, 0, -0.6 * f]; P['wing.R'] = [0, 0, 0.6 * f];
    mood = 'ko';
  }
  return mood;
}
