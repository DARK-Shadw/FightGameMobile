// Small biped minions: fire imps, shades, blood thralls, phantasms, hollows,
// sproutlings, skeletons, rock golems and the time echo. One skeleton and
// one body plan, dressed per essence with its own silhouette features.

import {
  S, P, G, TAU, add, mix3, fx, lerp, smooth, clamp01, tube, horn, spike, flame, tone, belly, glowGrad, glowRadial,
  veins, mottle, scaled, eyes, brows, mouth, hex,
} from './creature-kit.js';

// Joint layout (unit scale ≈ 0.72 m creature). Variants override and scale.
function joints(v) {
  const s = v.s ?? 1;
  const J = {
    hips: [0, 0.2, 0], chest: [0, 0.34, 0], head: [0, 0.4, 0.01],
    sh: [0.13, 0.37, 0], el: [0.19, 0.29, 0.02], wr: [0.21, 0.21, 0.05],
    hip: [0.07, 0.19, 0], kn: [0.085, 0.115, 0.04], an: [0.085, 0.055, -0.015],
    headC: [0, 0.52, 0.01], headR: [0.18, 0.165, 0.165],
  };
  if (v.J) Object.assign(J, v.J);
  const out = {};
  for (const [k, p] of Object.entries(J)) out[k] = p.map(x => x * s);
  return out;
}

function skeleton(J, v, s) {
  const spec = {
    root: { pos: [0, 0, 0] },
    hips: { parent: 'root', pos: J.hips },
    chest: { parent: 'hips', pos: J.chest },
    head: { parent: 'chest', pos: J.head },
  };
  for (const [side, f] of [['L', p => p], ['R', fx]]) {
    spec['upperArm.' + side] = { parent: 'chest', pos: f(J.sh) };
    spec['foreArm.' + side] = { parent: 'upperArm.' + side, pos: f(J.el) };
    spec['hand.' + side] = { parent: 'foreArm.' + side, pos: f(J.wr) };
    if (!v.noLegs) {
      spec['thigh.' + side] = { parent: 'hips', pos: f(J.hip) };
      spec['shin.' + side] = { parent: 'thigh.' + side, pos: f(J.kn) };
      spec['foot.' + side] = { parent: 'shin.' + side, pos: f(J.an) };
    }
    if (v.ears) spec['ear.' + side] = { parent: 'head', pos: f(v.ears.map(x => x * s)) };
    if (v.wings) spec['wing.' + side] = { parent: 'chest', pos: f(v.wings.map(x => x * s)) };
  }
  for (const [pre, parent] of [['tail', 'hips'], ['cape', 'chest']]) {
    if (!v[pre]) continue;
    let par = parent;
    v[pre].forEach((p, i) => { spec[pre + (i + 1)] = { parent: par, pos: p.map(x => x * s) }; par = pre + (i + 1); });
  }
  return spec;
}

// Mitten hand with claws hanging from the wrist.
function clawHand(wr, side, r, skin, clawPaint, bone, nClaw = 3, clawLen = 1) {
  const c = [wr[0] + 0.008 * side, wr[1] - r * 0.75, wr[2] + r * 0.25];
  const parts = [S.ellipsoid(c, [r * 1.05, r * 0.95, r * 1.0]).paint(skin)];
  parts.push(S.limb([c[0] - r * 0.55 * side, c[1] + r * 0.1, c[2] + r * 0.55], [c[0] - r * 0.75 * side, c[1] - r * 0.45, c[2] + r * 0.9], r * 0.42, r * 0.34).paint(skin));
  for (let i = 0; i < nClaw; i++) {
    const o = (i - (nClaw - 1) / 2) * r * 0.62;
    const b = [c[0] + r * 0.2 * side, c[1] - r * 0.7, c[2] + r * 0.35 + o];
    const tip = [b[0] + 0.004 * side, b[1] - r * 0.85 * clawLen, b[2] + r * 0.5 * clawLen];
    parts.push(tube(b, add(mix3(b, tip, 0.5), [0, 0, -r * 0.18]), tip, r * 0.26, r * 0.05, 2).paint(clawPaint));
  }
  return S.union(r * 0.25, ...parts).bone(bone);
}

// Chunky foot with toe claws.
function clawFoot(an, side, r, skin, clawPaint, bone, nToe = 3) {
  const c = [an[0], r * 0.62, an[2] + r * 0.55];
  const parts = [S.ellipsoid(c, [r * 1.05, r * 0.66, r * 1.45]).paint(skin)];
  for (let i = 0; i < nToe; i++) {
    const o = (i - (nToe - 1) / 2) * r * 0.7;
    const b = [c[0] + o, r * 0.35, c[2] + r * 1.15];
    parts.push(S.limb(b, [b[0] + o * 0.2, r * 0.12, b[2] + r * 0.55], r * 0.3, r * 0.06).paint(clawPaint));
  }
  return S.union(r * 0.2, ...parts).bone(bone);
}

// Bell-shaped cloak for hovering variants, with a tattered hem.
function robe(s, paint, innerPaint, o = {}) {
  const top = (o.top ?? 0.35) * s, bot = (o.bot ?? 0.13) * s, r1 = (o.r1 ?? 0.105) * s, r2 = (o.r2 ?? 0.165) * s;
  const bell = S.union(0.04 * s,
    S.ellipsoid([0, top, 0], [0.12 * s, 0.09 * s, 0.1 * s]).bone('chest'),
    S.limb([0, top, -0.005 * s], [0, bot, -0.012 * s], r1, r2).bone('hips'),
  );
  const hollow = S.carve(0.025 * s, bell, S.ellipsoid([0, bot - 0.12 * s, -0.01 * s], [r2 * 0.86, 0.13 * s, r2 * 0.84]).paint(innerPaint));
  const tat = [];
  const n = o.tatters ?? 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.2;
    const cx = Math.sin(a), cz = Math.cos(a);
    const base = [cx * r2 * 0.92, bot - 0.02 * s, cz * r2 * 0.92 - 0.012 * s];
    const tip = [cx * r2 * 1.08, bot - 0.14 * s - (cz < 0 ? 0.02 * s : 0), cz * r2 * 1.08 - 0.03 * s];
    tat.push(S.limb(base, tip, 0.042 * s, 0.006 * s).bone(cz < -0.4 ? 'cape1' : 'hips'));
  }
  return S.union(0.02 * s, hollow, ...tat).paint(paint);
}

// Hood around the head: shell with a front opening and a drooping tip.
function hood(J, s, paint, innerPaint, tipPaint) {
  const hc = J.headC, hr = J.headR;
  const shell = S.ellipsoid([hc[0], hc[1] + 0.025 * s, hc[2] - 0.02 * s], [hr[0] * 1.16, hr[1] * 1.2, hr[2] * 1.16]);
  const open = S.ellipsoid([hc[0], hc[1] - 0.012 * s, hc[2] + hr[2] * 0.8], [hr[0] * 0.9, hr[1] * 0.9, hr[2] * 0.72]).paint(innerPaint);
  const a = [0, hc[1] + hr[1] * 0.95, hc[2] - hr[2] * 0.4];
  const tipEnd = [0, hc[1] + hr[1] * 0.85, hc[2] - hr[2] * 2.0];
  const tip = tube(a, [0, hc[1] + hr[1] * 1.55, hc[2] - hr[2] * 1.2], tipEnd, 0.075 * s, 0.018 * s, 3);
  const bob = tipPaint ? S.sphere(tipEnd, 0.03 * s).paint(tipPaint) : null;
  return S.union(0.03 * s, S.carve(0.02 * s, shell, open), tip, ...(bob ? [bob] : [])).paint(paint);
}

// Standard cute-monster face on the base head.
function stdFace(C, o = {}) {
  return (J, s) => {
    const hc = J.headC, hr = J.headR;
    const ey = hc[1] + hr[1] * (o.eyeY ?? 0.08);
    const ex = hr[0] * (o.eyeX ?? 0.42);
    const f = [...eyes([ex, ey, hc[2] + hr[2] * 0.9], (o.eyeSize ?? [0.105, 0.125]).map(x => x * s), {
      iris: o.iris ?? C.eye, iris2: o.iris2 ?? C.eye2, sclera: o.sclera, ink: o.ink ?? C.ink, angry: o.angry ?? 0.25, lidRest: o.lidRest ?? 0.12,
      irisSize: o.irisSize ?? 0.6, pupilSize: o.pupilSize ?? 0.26, yaw: o.yaw ?? 0.42, glow: o.glow ?? 0,
    })];
    if (o.brows !== false) f.push(...brows([ex * 1.02, ey + hr[1] * (o.browY ?? 0.42), hc[2] + hr[2] * 0.84], [0.11 * s, 0.06 * s], o.browCol ?? C.ink, { angle: o.browAngle ?? 0.9, thick: 0.3, yaw: 0.42 }));
    if (o.mouth !== false) f.push(mouth([0, hc[1] - hr[1] * (o.mouthY ?? 0.42), hc[2] + hr[2] * 0.93], (o.mouthSize ?? [0.15, 0.08]).map(x => x * s), {
      open: o.open ?? 0.35, smile: o.smile ?? 1.0, width: o.width ?? 0.8, asym: o.asym ?? 0.2, inside: o.inside ?? '#4a0f14', ink: o.ink ?? C.ink, dir: [0, -0.35, 1],
    }));
    if (o.extra) f.push(...o.extra(J, s));
    return f;
  };
}

export function sculptImp(ctx) {
  const { variant, pal: C } = ctx;
  const v = VARIANTS[variant](C, ctx);
  const s = v.s ?? 1;
  const J = joints(v);
  const spec = skeleton(J, v, s);
  const skin = v.skin;
  const hc = J.headC, hr = J.headR;

  // Head core (also the face projection target)
  let headCore;
  if (v.headCore) headCore = v.headCore(J, s);
  else {
    const parts = [S.ellipsoid(hc, hr)];
    if (v.cheeks !== false) parts.push(S.mirror(S.ellipsoid([hr[0] * 0.45, hc[1] - hr[1] * 0.38, hc[2] + hr[2] * 0.42], [hr[0] * 0.5, hr[1] * 0.46, hr[2] * 0.5])));
    if (v.jaw) parts.push(S.ellipsoid([0, hc[1] - hr[1] * 0.55, hc[2] + hr[2] * 0.15], [hr[0] * 0.85, hr[1] * 0.5, hr[2] * 0.8]));
    headCore = S.union(0.045 * s, ...parts);
  }
  headCore.paint(v.headSkin ?? skin);
  const head = S.union(0.02 * s, headCore, ...(v.headExtras ? v.headExtras(J, s) : [])).bone('head');

  const torso = v.torso ? v.torso(J, s) : S.union(0.06 * s,
    S.ellipsoid([0, 0.255 * s, 0.012 * s], [0.14 * s, 0.125 * s, 0.125 * s]).bone('hips'),
    S.ellipsoid([0, 0.345 * s, 0], [0.12 * s, 0.085 * s, 0.1 * s]).bone('chest'),
  ).paint(skin);
  const bellyPatch = v.belly ? S.ellipsoid([0, 0.26 * s, 0.07 * s], [0.095 * s, 0.1 * s, 0.075 * s]).paint(v.belly).bone('hips') : null;

  // Limbs (authored on the left, mirrored)
  const armR = (v.armR ?? 0.04) * s;
  const arm = v.arm ? v.arm(J, s) : S.union(0.03 * s,
    S.limb(J.sh, J.el, armR * 1.05, armR * 0.9).bone('upperArm.L'),
    S.limb(J.el, J.wr, armR * 0.9, armR * (v.cuff ? 1.3 : 0.85)).bone('foreArm.L'),
  ).paint(v.armSkin ?? skin);
  const handL = v.hand ? v.hand(J, s) : clawHand(J.wr, 1, (v.handR ?? 0.047) * s, v.handSkin ?? skin, v.claw, 'hand.L', v.nClaw ?? 3, v.clawLen ?? 1);
  const limbParts = [arm, handL];
  if (!v.noLegs) {
    const legR = (v.legR ?? 0.05) * s;
    limbParts.push(S.union(0.03 * s,
      S.limb(J.hip, J.kn, legR, legR * 0.85).bone('thigh.L'),
      S.limb(J.kn, J.an, legR * 0.85, legR * 0.72).bone('shin.L'),
      v.foot ? v.foot(J, s) : clawFoot(J.an, 1, (v.footR ?? 0.052) * s, v.footSkin ?? skin, v.claw, 'foot.L', v.nToe ?? 3),
    ).paint(v.legSkin ?? skin));
  }
  const limbs = S.mirror(S.union(0.02 * s, ...limbParts));

  const body = S.union(0.03 * s,
    S.union(0.035 * s, torso, ...(bellyPatch ? [bellyPatch] : [])),
    limbs,
    head,
    ...(v.extras ? v.extras(J, s) : []),
  );

  const face = v.face ? { sdf: headCore, bone: 'head', features: v.face(J, s) } : null;
  return {
    spec, sdf: body, face, props: v.props ? v.props(J, s) : [],
    cell: v.cell ?? 0.019 * Math.min(1.25, s), aoStep: 0.022 * s, tau: 0.024 * s,
    height: v.height ?? 0.75 * s, radius: (v.radius ?? 0.24) * s,
    anim: 'imp', animOpts: v.anim ?? {}, spawn: v.spawn ?? 'rise', ghost: v.ghost ?? 0, glow: v.glow ?? C.glow,
    emissivePulse: v.pulse ?? 0, emissive: v.emissive,
  };
}

const TAIL3 = [[0, 0.2, -0.11], [0, 0.15, -0.22], [0, 0.2, -0.32]];

const VARIANTS = {
  // ── Fire imp: horns, pointy ears, flame hair, bat wings, flame-tipped tail.
  fire: C => {
    const skin = belly(C.body, C.belly, C.dark, 0.05, 0.45, { light: C.light, zFront: 0.05, soft: 0.05, xw: 0.1 });
    const flameP = glowGrad('#ff6a10', '#ffe066', 0.62, 0.86, 1, 0.3);
    return {
      skin, headSkin: tone(C.body, C.dark, C.light, 0.36, 0.66, 0.25, 0.5), claw: P(C.claw, 0.5),
      ears: [0.17, 0.55, 0], wings: [0.05, 0.37, -0.08], tail: TAIL3,
      headExtras: () => [
        S.mirror(horn([0.075, 0.64, 0.0], [0.19, 0.79, -0.07], 0.046, [0.07, -0.03, 0.03], 3)).paint(tone('#e6c3a0', '#2a1618', '#f3dcc0', 0.63, 0.8, 0.45, 0.3)),
        S.union(0.025,
          flame([0, 0.645, 0.01], [0.0, 0.87, -0.07], 0.068, [0, 0, 0.04]),
          S.mirror(flame([0.055, 0.64, 0.03], [0.085, 0.79, -0.02], 0.045, [0.01, 0, 0.03])),
        ).paint(flameP),
      ],
      extras: () => [
        S.mirror(S.union(0.015,
          S.ellipsoid([0.2, 0.555, -0.005], [0.055, 0.03, 0.022]).rot(0, 0, 0.25),
          S.limb([0.22, 0.565, -0.005], [0.3, 0.6, -0.03], 0.024, 0.004),
        )).paint(tone(C.body, C.dark, C.light, 0.5, 0.62)).bone('ear.L'),
        S.union(0.01,
          S.limb(TAIL3[0], [0, 0.16, -0.19], 0.032, 0.026).paint(P(C.body, 0.25)).bone('tail1'),
          tube([0, 0.16, -0.19], [0, 0.12, -0.27], [0, 0.22, -0.33], 0.026, 0.018, 3).paint(tone(C.body, C.dark, C.light, 0.1, 0.3)).bone('tail2'),
          flame([0, 0.25, -0.35], [0, 0.42, -0.38], 0.045, [0, 0, 0.02]).paint(glowGrad('#ff7a1a', '#ffe066', 0.24, 0.4, 1, 0.3)).bone('tail3'),
        ),
        S.mirror(S.union(0.01,
          S.limb([0.05, 0.37, -0.08], [0.16, 0.45, -0.14], 0.016, 0.01),
          S.sub(0.01,
            S.ellipsoid([0.13, 0.4, -0.13], [0.085, 0.055, 0.012]).rot(0.2, 0.55, 0.35),
            S.sphere([0.14, 0.33, -0.13], 0.04),
          ),
        )).paint(P(C.dark, 0.3)).bone('wing.L'),
      ],
      face: stdFace(C, { angry: 0.35, browAngle: 1.0, open: 0.45, asym: 0.3 }),
      pulse: 0.12,
    };
  },

  // ── Shade: hovering hooded wisp with glowing eyes and a tattered hem.
  shadow: C => {
    const cloak = tone(C.body, C.deep, C.light, 0.0, 0.62, 0.15, 0.35);
    return {
      noLegs: true, skin: cloak, headSkin: P(C.deep, 0.2), claw: P(C.claw, 0.5), handSkin: P(C.deep, 0.2),
      J: { headC: [0, 0.53, 0.01], headR: [0.155, 0.15, 0.15], wr: [0.21, 0.23, 0.06] },
      cape: [[0, 0.25, -0.13], [0, 0.12, -0.2]],
      cheeks: false, armR: 0.045, cuff: true, handR: 0.038,
      torso: (J, s) => robe(s, cloak, P(C.deep, 0.1)),
      headExtras: J => [hood(J, 1, tone(C.body, C.dark, C.light, 0.45, 0.8, 0.15, 0.45), P(C.deep, 0.1), G(C.glow, 1))],
      face: stdFace(C, { iris: C.glow, iris2: C.body, sclera: '#f4efff', eyeSize: [0.1, 0.13], eyeY: 0.02, angry: 0.3, glow: 0.7, brows: false, mouthY: 0.45, mouthSize: [0.08, 0.05], open: 0.15, smile: 0.2, width: 0.6, inside: '#2a0a3a', ink: '#0b0418' }),
      anim: { hover: 0.07 }, spawn: 'rise', radius: 0.22,
    };
  },

  // ── Blood thrall: hunched brute with long clawed arms, back spines, tusks, shackles.
  blood: C => {
    const skin = veins(belly(C.body, C.belly, C.dark, 0.05, 0.42, { light: C.light, zFront: 0.06, soft: 0.05, xw: 0.09 }), C.dark, 7, 0.05, 0);
    const bone = tone(C.horn, '#b9a08a', '#ffffff', 0.2, 0.5, 0.45, 0.3);
    const iron = P('#4a4452', 0.75);
    return {
      skin, headSkin: tone(C.body, C.dark, C.light, 0.33, 0.6, 0.25, 0.45), claw: P(C.claw, 0.5),
      J: {
        headC: [0, 0.47, 0.085], headR: [0.155, 0.14, 0.15], head: [0, 0.38, 0.05], chest: [0, 0.33, -0.01],
        sh: [0.15, 0.38, 0.0], el: [0.23, 0.27, 0.06], wr: [0.25, 0.16, 0.1],
        hip: [0.075, 0.17, -0.02], kn: [0.09, 0.1, 0.03], an: [0.09, 0.05, -0.02],
      },
      ears: [0.14, 0.51, 0.06], tail: [[0, 0.18, -0.12], [0, 0.12, -0.2]],
      jaw: true, armR: 0.048, handR: 0.058, clawLen: 1.35, legR: 0.055, footR: 0.055,
      torso: (J, s) => S.union(0.06,
        S.ellipsoid([0, 0.35, -0.03], [0.165, 0.12, 0.13]).rot(0.35, 0, 0).bone('chest'),
        S.ellipsoid([0, 0.24, 0.03], [0.125, 0.1, 0.1]).bone('hips'),
      ).paint(skin),
      belly: null,
      headExtras: J => [
        // heavy brow ridge and underbite tusks
        S.ellipsoid([0, 0.52, 0.16], [0.13, 0.035, 0.05]).rot(-0.2, 0, 0).paint(tone(C.body, C.dark, C.light, 0.48, 0.56, 0.25, 0.6)),
        S.mirror(tube([0.055, 0.41, 0.2], [0.07, 0.45, 0.225], [0.066, 0.49, 0.23], 0.018, 0.004, 2)).paint(bone),
      ],
      extras: () => [
        S.union(0.01,
          spike([0, 0.44, -0.09], [0, 0.55, -0.19], 0.034),
          spike([0, 0.37, -0.14], [0, 0.44, -0.27], 0.032),
          spike([0, 0.29, -0.15], [0, 0.31, -0.27], 0.028),
        ).paint(bone).bone('chest'),
        S.mirror(S.union(0.01,
          S.ellipsoid([0.16, 0.52, 0.05], [0.05, 0.025, 0.02]).rot(0, 0.5, 0.35),
          S.limb([0.18, 0.53, 0.04], [0.24, 0.57, -0.02], 0.02, 0.003),
        )).paint(tone(C.body, C.dark, C.light, 0.48, 0.58)).bone('ear.L'),
        S.mirror(S.cyl([0.245, 0.195, 0.095], 0.056, 0.03, 0.012).rot(0.25, 0, 0.12)).paint(iron).bone('foreArm.L'),
        S.limb([0, 0.18, -0.12], [0, 0.12, -0.22], 0.03, 0.012).paint(skin).bone('tail1'),
      ],
      face: stdFace(C, { iris: C.eye2, iris2: '#6a0018', sclera: '#ffe9ec', angry: 0.7, browAngle: 1.2, eyeY: 0.18, eyeSize: [0.085, 0.1], glow: 0.35, open: 0.3, smile: -0.2, width: 0.85, mouthY: 0.5 }),
      anim: {}, radius: 0.26, height: 0.66,
    };
  },

  // ── Phantasm: floating big-brained psychic imp with a third eye and orbiting shards.
  mind: C => {
    const skin = tone(C.body, C.dark, C.light, 0.08, 0.5, 0.25, 0.5);
    const brain = (x, y, z, l, nx, ny, nz, cell) => {
      const p = tone('#ffc9e6', '#f06aae', '#fff2fa', 0.56, 0.74, 0.4, 0.45)(x, y, z, l, nx, ny, nz, cell);
      return { ...p, emissive: 0.12 };
    };
    const shard = P(C.accent, 0.8, 0.9);
    return {
      noLegs: true, skin, claw: P(C.claw, 0.4), nClaw: 0, handR: 0.036, armR: 0.032,
      J: { headC: [0, 0.48, 0.03], headR: [0.17, 0.14, 0.155], head: [0, 0.4, 0.01], wr: [0.2, 0.22, 0.07] },
      tail: [[0, 0.22, -0.02], [0, 0.14, -0.08], [0, 0.1, -0.17]],
      torso: (J, s) => S.union(0.05,
        S.ellipsoid([0, 0.32, 0], [0.1, 0.085, 0.085]).bone('chest'),
        tube([0, 0.29, -0.005], [0, 0.14, 0.0], [0, 0.1, -0.17], 0.085, 0.012, 4).bone('tail2'),
      ).paint(skin),
      headExtras: J => [
        S.sub(0.014,
          S.ellipsoid([0, 0.635, -0.04], [0.205, 0.145, 0.185]),
          S.ellipsoid([0, 0.77, -0.07], [0.02, 0.075, 0.17]),
          S.mirror(S.ellipsoid([0.105, 0.735, -0.05], [0.12, 0.016, 0.17]).rot(0, 0, 0.45)),
          S.mirror(S.ellipsoid([0.16, 0.66, -0.1], [0.016, 0.07, 0.1]).rot(0.3, 0, 0.2)),
        ).paint(brain),
      ],
      props: () => [0, 1, 2].map(i => {
        const a = (i / 3) * TAU;
        const c = [Math.sin(a) * 0.28, 0.58 + 0.05 * i, Math.cos(a) * 0.28];
        return { sdf: S.union(0.005, S.limb(c, add(c, [0, 0.065, 0]), 0.032, 0.004), S.limb(c, add(c, [0, -0.045, 0]), 0.032, 0.004)).paint(shard), bone: 'head', spin: 1.2, cell: 0.012 };
      }),
      face: stdFace(C, {
        iris: C.accent, iris2: '#5b21b6', angry: 0, browAngle: 0.1, eyeY: -0.12, eyeSize: [0.092, 0.108], glow: 0.35, browY: 0.36, mouthY: 0.55, mouthSize: [0.1, 0.06], open: 0.1, smile: 0.8, asym: 0.5,
        extra: () => [{ kind: 'eye', name: 'eyeC', side: 1, center: [0, 0.575, 0.14], dir: [0, 0.45, 1], size: [0.075, 0.066], iris: '#ffe14d', iris2: '#c026d3', lidRest: 0.25, irisSize: 0.55, pupilSize: 0.22, ink: C.ink, glow: 0.9 }],
      }),
      anim: { hover: 0.13 }, spawn: 'pop', radius: 0.24, height: 0.8,
    };
  },

  // ── Hollow: black body with a porcelain horned mask, a hole through the chest and a tattered cape.
  void: C => {
    const skin = tone(C.body, C.deep, C.dark, 0.05, 0.45, 0.2, 0.3);
    const dark = tone(C.dark, C.deep, C.body, 0.05, 0.5, 0.15, 0.3);
    const mask = tone(C.mask, '#bdb9b0', '#ffffff', 0.44, 0.62, 0.45, 0.3);
    return {
      skin: dark, headSkin: P(C.deep, 0.2), claw: P(C.claw, 0.5), handSkin: dark,
      J: { headC: [0, 0.53, 0.0], headR: [0.15, 0.15, 0.14], hip: [0.06, 0.19, 0], kn: [0.07, 0.115, 0.03], an: [0.07, 0.055, -0.01] },
      cape: [[0, 0.38, -0.08], [0, 0.22, -0.13], [0, 0.08, -0.16]],
      cheeks: false, armR: 0.03, handR: 0.04, clawLen: 1.3, legR: 0.038, footR: 0.042, nToe: 2,
      torso: (J, s) => S.union(0.02,
        S.sub(0.015,
          S.union(0.06,
            S.ellipsoid([0, 0.33, 0], [0.12, 0.1, 0.095]).bone('chest'),
            S.ellipsoid([0, 0.235, 0.0], [0.1, 0.09, 0.085]).bone('hips'),
          ),
          S.cyl([0, 0.3, 0], 0.048, 0.2, 0.01).rot(Math.PI / 2, 0, 0),
        ).paint(dark),
        S.torus([0, 0.3, 0.075], 0.052, 0.011).rot(Math.PI / 2 + 0.25, 0, 0).paint(G(C.glow, 1)).bone('chest'),
      ),
      headCore: J => S.union(0.02,
        S.ellipsoid([0, 0.53, 0.0], [0.15, 0.15, 0.14]).paint(P(C.deep, 0.2)),
        S.ellipsoid([0, 0.525, 0.07], [0.14, 0.155, 0.095]).paint(mask),
      ),
      headExtras: J => [S.mirror(horn([0.07, 0.64, 0.03], [0.14, 0.82, -0.02], 0.035, [0.03, 0, 0.02], 3)).paint(mask)],
      extras: () => [
        S.sub(0.02,
          S.union(0.04,
            S.ellipsoid([0, 0.35, -0.1], [0.17, 0.07, 0.05]).bone('cape1'),
            S.ellipsoid([0, 0.2, -0.14], [0.17, 0.12, 0.035]).rot(-0.25, 0, 0).bone('cape2'),
          ),
          S.mirror(S.sphere([0.09, 0.05, -0.16], 0.055)),
          S.sphere([0, 0.06, -0.17], 0.045),
        ).paint(tone('#3a3a44', '#1a1a20', '#55555f', 0.1, 0.4, 0.12, 0.3)),
      ],
      face: J => {
        const f = eyes([0.06, 0.52, 0.16], [0.07, 0.1], { iris: '#ffffff', iris2: C.glow, sclera: '#08080c', ink: '#08080c', irisSize: 0.34, pupilSize: 0.0, lidRest: 0.05, yaw: 0.3, glow: 0.9 });
        return f;
      },
      anim: {}, radius: 0.22, height: 0.82, noBlink: true,
    };
  },

  // ── Sproutling: round seed body with a leafy sprout, twig arms and root feet.
  life: C => {
    const skin = belly(C.body, C.belly, C.dark, 0.1, 0.45, { light: C.light, zFront: 0.1, soft: 0.06, xw: 0.12 });
    const wood = tone(C.wood, C.woodDark, '#c08a52', 0.0, 0.3, 0.2, 0.4);
    const leaf = tone(C.light, C.dark, '#d9ffc9', 0.56, 0.75, 0.3, 0.5);
    return {
      skin, headSkin: skin, claw: wood, handSkin: wood, armSkin: wood, legSkin: wood, footSkin: wood, s: 0.95,
      J: {
        headC: [0, 0.34, 0.02], headR: [0.2, 0.19, 0.19], head: [0, 0.22, 0.01], chest: [0, 0.2, 0], hips: [0, 0.15, 0],
        sh: [0.17, 0.32, 0.03], el: [0.24, 0.27, 0.06], wr: [0.27, 0.215, 0.08],
        hip: [0.075, 0.14, 0], kn: [0.085, 0.09, 0.02], an: [0.085, 0.05, 0.0],
      },
      cheeks: false, armR: 0.022, handR: 0.028, nClaw: 3, legR: 0.04, footR: 0.05, nToe: 2,
      torso: (J, s) => S.ellipsoid([0, 0.2, 0], [0.12, 0.08, 0.1]).paint(skin).bone('hips'),
      headExtras: J => [
        S.limb([0, 0.52, 0.0], [0.015, 0.63, -0.02], 0.022, 0.014).paint(P(C.dark, 0.25)),
        S.ellipsoid([0.1, 0.66, -0.01], [0.105, 0.022, 0.055]).rot(0.1, 0.2, 0.45).paint(leaf),
        S.ellipsoid([-0.08, 0.645, -0.01], [0.08, 0.02, 0.045]).rot(-0.1, -0.2, -0.5).paint(leaf),
        S.union(0.01, ...[0, 1, 2, 3, 4].map(i => {
          const a = (i / 5) * TAU;
          return S.ellipsoid([0.015 + Math.sin(a) * 0.028, 0.645, -0.02 + Math.cos(a) * 0.028], [0.026, 0.014, 0.026]);
        }), S.sphere([0.015, 0.652, -0.02], 0.02).paint(P('#ffe066', 0.4))).paint(P(C.flower, 0.35)),
        // leafy collar
        S.union(0.01, ...[-2, -1, 0, 1, 2].map(i => S.ellipsoid([Math.sin(i * 0.9) * 0.15, 0.2, Math.cos(i * 0.9) * 0.14], [0.06, 0.02, 0.05]).rot(0.3 * Math.cos(i * 0.9), i * 0.9, -0.35 * Math.sin(i * 0.9)))).paint(P(C.dark, 0.3)),
      ],
      face: stdFace(C, { iris: '#7a4a1c', iris2: '#2a1606', angry: 0, browAngle: -0.3, browCol: '#0f4a24', eyeY: 0.02, eyeSize: [0.1, 0.12], open: 0.35, smile: 1.1, asym: 0, mouthY: 0.4, inside: '#4a1a1a',
        extra: () => [] }),
      anim: {}, radius: 0.22, height: 0.68, spawn: 'rise',
    };
  },

  // ── Skeleton: big skull with glowing sockets, ribcage with a soul flame, teal rag scarf, rusty blade.
  death: C => {
    const bone = tone(C.bone, C.boneDark, '#fffaf0', 0.05, 0.5, 0.35, 0.35);
    const socket = P('#10201e', 0.2);
    const rag = tone(C.cloth, '#0c1f1d', C.dark, 0.2, 0.45, 0.12, 0.3);
    return {
      skin: bone, claw: bone, handSkin: bone, armSkin: bone, legSkin: bone, footSkin: bone,
      J: { headC: [0, 0.54, 0.01], headR: [0.165, 0.155, 0.155], head: [0, 0.42, 0.0] },
      cape: [[0.04, 0.42, -0.06], [0.07, 0.32, -0.14]],
      armR: 0.017, handR: 0.032, clawLen: 1.2, legR: 0.019, footR: 0.04, nToe: 2,
      headCore: (J, s) => S.carve(0.012,
        S.union(0.04,
          S.ellipsoid([0, 0.55, 0.0], [0.165, 0.155, 0.155]),
          S.ellipsoid([0, 0.47, 0.035], [0.12, 0.07, 0.115]),
          S.mirror(S.ellipsoid([0.085, 0.49, 0.08], [0.06, 0.05, 0.06])),
        ),
        S.mirror(S.ellipsoid([0.066, 0.545, 0.15], [0.052, 0.058, 0.05]).rot(0, 0, -0.2)).paint(socket),
        S.ellipsoid([0, 0.495, 0.165], [0.02, 0.026, 0.03]).paint(socket),
      ),
      torso: (J, s) => S.union(0.02,
        S.sub(0.008,
          S.shell(S.ellipsoid([0, 0.315, 0.0], [0.105, 0.095, 0.085]), 0.013),
          S.box([0, 0.3, 0.07], [0.2, 0.011, 0.1], 0.004),
          S.box([0, 0.335, 0.07], [0.2, 0.011, 0.1], 0.004),
          S.box([0, 0.265, 0.07], [0.2, 0.011, 0.1], 0.004),
          S.box([0, 0.3, 0.09], [0.012, 0.2, 0.05], 0.004),
        ).paint(bone).bone('chest'),
        S.limb([0, 0.19, -0.03], [0, 0.42, -0.04], 0.02, 0.018).paint(bone).bone('chest'),
        S.ellipsoid([0, 0.195, 0.0], [0.085, 0.04, 0.055]).paint(bone).bone('hips'),
        S.sphere([0, 0.31, 0.0], 0.052).paint(glowRadial([0, 0.31, 0.02], 0.06, '#e8fffb', C.body, 1)).bone('chest'),
      ),
      arm: (J, s) => S.union(0.012,
        S.limb(J.sh, J.el, 0.018, 0.016).bone('upperArm.L'),
        S.sphere(J.el, 0.024).bone('foreArm.L'),
        S.limb(J.el, J.wr, 0.016, 0.015).bone('foreArm.L'),
        S.sphere(J.sh, 0.03).bone('upperArm.L'),
      ).paint(bone),
      foot: (J, s) => S.union(0.012,
        S.sphere(J.kn, 0.026).bone('shin.L'),
        S.ellipsoid([J.an[0], 0.03, J.an[2] + 0.035], [0.035, 0.025, 0.06]).bone('foot.L'),
      ).paint(bone),
      extras: () => [
        S.union(0.02,
          S.torus([0, 0.415, 0.0], 0.075, 0.03).rot(0.15, 0, 0),
          S.limb([0.05, 0.41, -0.06], [0.08, 0.3, -0.13], 0.035, 0.02).bone('cape1'),
          S.limb([0.08, 0.3, -0.13], [0.1, 0.22, -0.17], 0.02, 0.008).bone('cape2'),
        ).paint(rag).bone('chest'),
        // rusty short blade in the right hand
        S.union(0.004,
          S.box([-0.215, 0.165, 0.2], [0.009, 0.026, 0.1], 0.006).paint(tone('#b8a89a', '#6b4a3a', '#e6dcd2', 0.14, 0.2, 0.7, 0.4)),
          S.box([-0.215, 0.165, 0.09], [0.02, 0.045, 0.012], 0.006).paint(P('#6b4a3a', 0.5)),
          S.limb([-0.215, 0.165, 0.02], [-0.215, 0.165, 0.085], 0.014).paint(P('#3a2a22', 0.3)),
        ).bone('hand.R').rigid(),
      ],
      face: J => [
        ...eyes([0.066, 0.545, 0.14], [0.075, 0.085], { iris: C.eye, iris2: C.body, sclera: '#0b1715', ink: '#0b1715', irisSize: 0.5, pupilSize: 0.12, lidRest: 0.05, yaw: 0.35, glow: 1.0 }),
        mouth([0, 0.455, 0.145], [0.13, 0.06], { open: 0.28, smile: 0.7, width: 0.85, inside: '#10201e', ink: '#2e2a22', dir: [0, -0.4, 1] }),
      ],
      anim: {}, radius: 0.22, height: 0.72, noBlink: true,
    };
  },

  // ── Rock golem: stacked boulders, mossy shoulders, huge fists, glowing cracks and crystals.
  stone: C => {
    const rock = veins(mottle(tone('#cdc5bb', '#7d746c', '#efe9e1', 0.05, 0.5, 0.15, 0.35), '#8f867e', 8, 0.3), '#ffb347', 5, 0.055, 1, 3);
    const mossy = (x, y, z, l, nx, ny, nz, cell) => {
      const p = rock(x, y, z, l, nx, ny, nz, cell);
      const m = smooth((ny - 0.5) / 0.25) * smooth((y - 0.3) / 0.08);
      if (m <= 0) return p;
      const g = hex(C.moss);
      return { ...p, color: [p.color[0] + (g[0] - p.color[0]) * m, p.color[1] + (g[1] - p.color[1]) * m, p.color[2] + (g[2] - p.color[2]) * m], emissive: p.emissive * (1 - m) };
    };
    const crystal = glowGrad('#ff9f3a', '#ffe7a8', 0.45, 0.72, 1, 0.8);
    return {
      skin: mossy, headSkin: rock, claw: P(C.dark, 0.2), handSkin: rock, armSkin: rock, legSkin: rock, footSkin: rock, s: 1.05,
      J: {
        headC: [0, 0.49, 0.075], headR: [0.105, 0.095, 0.095], head: [0, 0.44, 0.04],
        sh: [0.2, 0.43, 0], el: [0.27, 0.31, 0.03], wr: [0.285, 0.2, 0.06],
        hip: [0.085, 0.17, 0], kn: [0.095, 0.1, 0.02], an: [0.095, 0.05, 0.0],
      },
      cheeks: false, armR: 0.052, legR: 0.066, height: 0.72, radius: 0.3,
      torso: (J, s) => S.union(0.03,
        S.displace(S.union(0.05,
          S.ellipsoid([0, 0.35, 0], [0.19, 0.15, 0.15]).bone('chest'),
          S.ellipsoid([0, 0.235, 0.025], [0.14, 0.09, 0.115]).bone('hips'),
        ), 0.012, 14, 2, 2.1).paint(mossy),
        S.mirror(S.displace(S.ellipsoid([0.205, 0.45, -0.01], [0.115, 0.1, 0.11]).rot(0, 0, -0.35), 0.012, 13, 2, 4.2)).paint(mossy).bone('chest'),
      ),
      hand: (J, s) => S.displace(S.union(0.03,
        S.ellipsoid([J.wr[0] + 0.01, J.wr[1] - 0.065, J.wr[2] + 0.02], [0.09, 0.085, 0.09]),
        S.ellipsoid([J.wr[0] - 0.02, J.wr[1] - 0.095, J.wr[2] + 0.085], [0.065, 0.045, 0.04]),
      ), 0.01, 16, 2, 5.3).paint(rock).bone('hand.L'),
      foot: (J, s) => S.box([J.an[0], 0.04, J.an[2] + 0.03], [0.07, 0.04, 0.085], 0.03).paint(rock).bone('foot.L'),
      headExtras: J => [S.ellipsoid([0, 0.535, 0.12], [0.115, 0.032, 0.055]).rot(-0.3, 0, 0).paint(rock)],
      extras: () => [
        S.union(0.01,
          S.taper([0.13, 0.57, -0.1], [0.04, 0.1, 0.04], 0.85, 0.01).rot(-0.45, 0.6, -0.35),
          S.taper([0.04, 0.56, -0.13], [0.034, 0.08, 0.034], 0.85, 0.01).rot(-0.6, 0.2, 0.1),
          S.taper([-0.12, 0.55, -0.09], [0.036, 0.085, 0.036], 0.85, 0.01).rot(-0.5, -0.5, 0.4),
        ).paint(crystal).bone('chest'),
      ],
      face: stdFace(C, { iris: '#ffd08a', iris2: '#c25a00', sclera: '#2a2420', angry: 0.8, eyeY: -0.1, eyeX: 0.44, eyeSize: [0.062, 0.058], irisSize: 0.7, pupilSize: 0.18, glow: 1.0, brows: false, mouth: false }),
      anim: { heavy: 1 }, spawn: 'rise', noBlink: true,
    };
  },

  // ── Past echo: translucent golden hooded ghost with a clock emblem.
  time: C => {
    const cloak = tone(C.cloth, C.body, '#fffaf0', 0.0, 0.6, 0.2, 0.4);
    const clock = (x, y, z) => {
      const dx = x, dy = y - 0.33;
      const r = Math.hypot(dx, dy);
      const hand = (Math.abs(dx) < 0.006 && dy > 0 && dy < 0.03) || (Math.abs(dy) < 0.006 && dx > 0 && dx < 0.022);
      const ring = Math.abs(r - 0.036) < 0.005;
      return hand || ring ? { color: hex('#5a3a08'), gloss: 0.6, emissive: 0 } : { color: hex('#fff2c4'), gloss: 0.6, emissive: 1 };
    };
    return {
      noLegs: true, skin: cloak, headSkin: P(C.dark, 0.2), claw: P(C.claw, 0.4), handSkin: P(C.light, 0.3), nClaw: 0, handR: 0.036,
      J: { headC: [0, 0.53, 0.01], headR: [0.15, 0.145, 0.145], wr: [0.21, 0.23, 0.06] },
      cape: [[0, 0.25, -0.13], [0, 0.12, -0.2]],
      cheeks: false, armR: 0.042, cuff: true,
      torso: (J, s) => S.union(0.01,
        robe(1, cloak, P(C.body, 0.2), { tatters: 7 }),
        S.cyl([0, 0.33, 0.098], 0.045, 0.012, 0.006).rot(Math.PI / 2 - 0.15, 0, 0).paint(clock).bone('chest'),
      ),
      headExtras: J => [hood(J, 1, tone(C.cloth, C.body, '#ffffff', 0.45, 0.8, 0.2, 0.5), P(C.dark, 0.1), G(C.accent, 1))],
      face: stdFace(C, { iris: C.accent, iris2: '#1b6f9a', sclera: '#fffbe8', eyeSize: [0.095, 0.12], eyeY: 0.02, angry: 0, glow: 0.6, brows: false, mouthY: 0.45, mouthSize: [0.08, 0.05], open: 0.12, smile: 0.7, width: 0.6, ink: '#3f2a08' }),
      anim: { hover: 0.08 }, spawn: 'pop', radius: 0.22, ghost: 0.45, glow: C.glow,
    };
  },
};

export const IMP_VARIANTS = Object.keys(VARIANTS);

// ── Animation ────────────────────────────────────────────────────────────
export function poseImp(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const o = c.def.animOpts;
  const hs = c.def.height / 0.75;
  const idle = 1 - smooth(sp * 2.2);
  const w = smooth(sp * 1.6);
  const run = smooth((sp - 0.5) * 2.5);
  const heavy = o.heavy ?? 0;
  const br = Math.sin(t * (3.4 - heavy));
  const sn = Math.sin(ph), cs = Math.cos(ph);
  const A = lerp(0.55, 0.95, run) * w * (1 - heavy * 0.3);
  let mood = 'idle';

  P.hips = [0.02 * br * idle, sn * 0.18 * w, cs * (0.06 + heavy * 0.06) * w];
  P.chest = [0.05 * br * idle + 0.12 * w + 0.15 * run, -sn * 0.14 * w, cs * heavy * 0.05 * w];
  P.head = [-0.05 * br * idle - 0.1 * w, 0.12 * Math.sin(t * 0.8) * idle + sn * 0.08 * w, 0.07 * Math.sin(t * 1.3) * idle];
  P['upperArm.L'] = [0.08 * br * idle + sn * A * 0.9, 0, 0.28 + 0.05 * br * idle + 0.1 * run];
  P['upperArm.R'] = [0.08 * br * idle - sn * A * 0.9, 0, -0.28 - 0.05 * br * idle - 0.1 * run];
  P['foreArm.L'] = [-0.45 - 0.5 * w, 0, 0];
  P['foreArm.R'] = [-0.45 - 0.5 * w, 0, 0];
  P['thigh.L'] = [-sn * A, 0, 0.04];
  P['thigh.R'] = [sn * A, 0, -0.04];
  P['shin.L'] = [(0.15 + 0.9 * Math.max(0, cs)) * A, 0, 0];
  P['shin.R'] = [(0.15 + 0.9 * Math.max(0, -cs)) * A, 0, 0];
  P['foot.L'] = [sn * 0.35 * A, 0, 0];
  P['foot.R'] = [-sn * 0.35 * A, 0, 0];
  R.y += (Math.abs(cs) * 0.035 - 0.01) * w * hs + 0.004 * br * idle;
  R.rz += cs * (0.05 + heavy * 0.05) * w;
  for (let i = 1; i <= 4; i++) P['tail' + i] = [0.12 * Math.sin(t * 2.2 - i * 0.7) + 0.1 * w, 0.35 * Math.sin(t * 2.6 - i * 0.8) * (1 - 0.5 * w) + sn * 0.3 * w, 0];
  for (let i = 1; i <= 3; i++) P['cape' + i] = [-0.15 * w - 0.35 * run + 0.08 * Math.sin(t * 3 - i), 0.1 * Math.sin(t * 2.1 - i), 0];
  const twitch = Math.max(0, Math.sin(t * 1.7) - 0.85) * 3;
  P['ear.L'] = [0, 0, 0.12 * Math.sin(t * 2.1) + twitch * 0.3];
  P['ear.R'] = [0, 0, -0.12 * Math.sin(t * 2.1 + 0.5) - twitch * 0.3];
  const flap = Math.sin(t * (o.flapRate ?? 9)) * (0.25 + 0.3 * w);
  P['wing.L'] = [0, -0.2 - flap * 0.6, 0.1 + flap];
  P['wing.R'] = [0, 0.2 + flap * 0.6, -0.1 - flap];
  if (o.hover) {
    R.y += o.hover * hs + Math.sin(t * 2.4) * 0.025 * hs;
    P.chest[0] += 0.12 * w;
    R.rx += 0.12 * w;
    P['upperArm.L'][0] = 0.08 * br + 0.35 * w; P['upperArm.R'][0] = 0.08 * br + 0.35 * w;
  }

  if (kind === 'attack') {
    // claw swipe with the right hand, lunging in
    const wind = smooth(k / 0.35), hit = smooth((k - 0.35) / 0.15), back = smooth((k - 0.62) / 0.38);
    const hold = 1 - back;
    const up = wind * (1 - hit);
    P['upperArm.R'] = [(-2.2 * up - 0.4 * hit) * hold, (0.3 * up - 0.7 * hit) * hold, (-0.5 * up + 0.5 * hit) * hold - 0.28 * back];
    P['foreArm.R'] = [(-0.9 * up - 0.2 * hit) * hold - 0.45, 0, 0];
    P['upperArm.L'] = [(-0.6 * up + 0.6 * hit) * hold, 0, 0.5 * up * hold + 0.28];
    P.chest[0] += (-0.2 * up + 0.35 * hit) * hold;
    P.chest[1] += (-0.45 * up + 0.5 * hit) * hold;
    P.head[0] += (-0.1 * up - 0.15 * hit) * hold;
    R.z += 0.07 * hit * hold * hs;
    R.y += 0.03 * Math.sin(Math.PI * clamp01((k - 0.25) / 0.3)) * hs;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    const up = smooth((k - 0.55) / 0.15) * (1 - smooth((k - 0.85) / 0.15));
    P['upperArm.L'] = [-2.4 * up, 0, 0.5 * up + 0.28];
    P['upperArm.R'] = [-2.4 * up, 0, -0.5 * up - 0.28];
    mood = k > 0.5 ? 'happy' : 'idle';
  } else if (kind === 'hit') {
    P['upperArm.L'][2] += 0.8 * (1 - k); P['upperArm.R'][2] -= 0.8 * (1 - k);
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.45);
    R.rx -= 1.35 * f;
    R.y += 0.04 * Math.sin(Math.PI * clamp01(k / 0.3)) * hs - (o.hover ?? 0) * hs * f;
    P['thigh.L'] = [-0.9 * f, 0, 0.2]; P['thigh.R'] = [-0.6 * f, 0, -0.2];
    P['upperArm.L'] = [-2.0 * f, 0, 0.8 * f]; P['upperArm.R'] = [-1.7 * f, 0, -0.9 * f];
    P.head[0] -= 0.4 * f;
    mood = 'ko';
  }
  return mood;
}
