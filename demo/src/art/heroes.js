// Brawler sculpts. Each hero is a function of its skeleton joints, so parts
// line up with the bones that will drive them.

import * as THREE from 'three';
import { S, P } from '../engine/sdf.js';
import { buildSkeleton, skinnedModel, skinnedFromGeometry } from '../engine/rig.js';
import { buildFace } from '../engine/face.js';
import { HEROES2 } from './heroes2.js';
import { humanoid, hand, sneaker, hairClump, gradientPaint, hairPaint, skinPaint, bandPaint, lerp3, flipX } from './kit.js';

// ── Kai: the player's brawler ────────────────────────────────────────────
// Scrappy kid spellslinger: spiky blue hair, goggles, orange hoodie, red
// scarf, one brass rune gauntlet that glows with the current power.
function kai() {
  const { spec, J } = humanoid({
    extra: {
      'scarf1': { parent: 'chest', pos: [0.08, 0.76, -0.12], cloth: -1 },
      'scarf2': { parent: 'scarf1', pos: [0.15, 0.64, -0.26], cloth: -1 },
    },
  });
  const skin = skinPaint('#f7c6a0', '#ff8f86', [[0.18, 0.965, 0.22]], 0.08, 0.22);
  const hoodie = P('#ff7a2f', 0.12), hoodieDark = P('#dd4f1a', 0.1), hoodieLight = P('#ff9a4f', 0.12);
  const hair = hairPaint('#18215a', '#4a86f0', '#9cc4ff', 1.02, 1.5, 0.2);
  const brow = P('#1b2560', 0.2);
  const shorts = P('#28356a', 0.1);
  const white = P('#fbf8f2', 0.25);
  const brass = P('#f2b94d', 0.9), brassDark = P('#b77a2b', 0.8), leather = P('#5b3524', 0.25);
  const glow = P('#5cf2ff', 0.9, 1.0);

  // Head: round skull, chubby cheeks, small nose, D-shaped grin
  const face = S.union(0.07,
    S.ellipsoid([0, 1.06, 0.01], [0.31, 0.29, 0.28]),
    S.ellipsoid([0, 0.96, 0.05], [0.265, 0.2, 0.235]),
    S.mirror(S.ellipsoid([0.292, 1.03, -0.01], [0.045, 0.07, 0.04]).rot(0, 0, -0.15)),
  ).paint(skin);
  const nose = S.ellipsoid([0, 0.995, 0.3], [0.04, 0.032, 0.03]).paint(skin);
  const faceProj = S.union(0.03, face, nose);
  const head = faceProj.bone('head');

  // Hair: cap plus chunky clumps
  const clumps = [
    // crown spikes, swept up and back
    [[0.0, 1.28, 0.04], [0.04, 1.52, -0.1], 0.1, [0, 0.02, 0.03]],
    [[0.15, 1.26, -0.02], [0.31, 1.45, -0.13], 0.088, [0, 0.03, 0]],
    [[-0.15, 1.26, -0.02], [-0.29, 1.47, -0.1], 0.088, [0, 0.03, 0]],
    [[0.09, 1.23, -0.16], [0.15, 1.38, -0.37], 0.085, [0, 0.04, 0]],
    [[-0.09, 1.23, -0.16], [-0.17, 1.36, -0.37], 0.085, [0, 0.04, 0]],
    [[0.25, 1.14, -0.07], [0.41, 1.2, -0.17], 0.072, [0, 0.03, 0]],
    [[-0.25, 1.14, -0.07], [-0.41, 1.18, -0.15], 0.072, [0, 0.03, 0]],
    [[0.0, 1.14, -0.26], [0.03, 0.99, -0.38], 0.08, [0, 0, -0.02]],
    // fringe: three swoops over the forehead, clear of the brows
    [[0.0, 1.31, 0.14], [0.08, 1.26, 0.33], 0.068, [0, 0.03, 0.02]],
    [[0.14, 1.29, 0.13], [0.25, 1.245, 0.27], 0.062, [0, 0.03, 0.01]],
    [[-0.13, 1.29, 0.14], [-0.23, 1.24, 0.28], 0.062, [0, 0.03, 0.01]],
  ].map(([a, b, r, bend]) => hairClump(a, b, r, 0.016, bend));
  const hairMass = S.union(0.028,
    S.ellipsoid([0, 1.215, -0.055], [0.325, 0.175, 0.3]),
    S.ellipsoid([0, 1.06, -0.13], [0.3, 0.23, 0.2]),
    ...clumps,
  ).paint(hair).bone('head').group('hair');

  // Neck and scarf
  const neck = S.limb([0, 0.74, 0], [0, 0.9, 0.01], 0.075).paint(skin).bone('neck');
  const scarfPaint = bandPaint('#e8384f', '#fff1e6', [[0.48, 0.52], [0.56, 0.585]], 0.15);
  const scarf = S.union(0.04,
    S.torus([0, 0.8, 0.0], 0.145, 0.066).rot(0.12, 0, 0).bone('chest'),
    S.sphere([0.085, 0.765, 0.145], 0.058).bone('chest'),
    S.limb([0.09, 0.75, 0.17], [0.13, 0.62, 0.2], 0.04, 0.032).bone('chest'),
    S.limb([0.08, 0.79, -0.1], [0.15, 0.65, -0.26], 0.055, 0.045).bone('scarf1'),
    S.limb([0.15, 0.65, -0.26], [0.2, 0.5, -0.36], 0.045, 0.036).bone('scarf2'),
  ).paint(scarfPaint).group('scarf');

  // Hoodie torso
  const torso = S.union(0.07,
    S.ellipsoid([0, 0.62, 0], [0.25, 0.2, 0.19]).bone('chest'),
    S.ellipsoid([0, 0.49, 0.02], [0.25, 0.17, 0.2]).bone('spine'),
  ).paint(hoodie);
  const hem = S.torus([0, 0.375, 0.012], 0.212, 0.045).paint(hoodieDark).bone('hips');
  const pocket = S.ellipsoid([0, 0.46, 0.19], [0.15, 0.075, 0.035]).paint(hoodieLight).bone('spine');
  const hood = S.carve(0.02,
    S.ellipsoid([0, 0.77, -0.14], [0.2, 0.12, 0.13]).rot(-0.45, 0, 0),
    S.ellipsoid([0, 0.81, -0.1], [0.14, 0.08, 0.1]).rot(-0.45, 0, 0).paint(hoodieDark),
  ).paint(hoodie).bone('chest');
  const strings = S.mirror(S.union(0.01,
    S.limb([0.055, 0.72, 0.17], [0.065, 0.6, 0.205], 0.011),
    S.sphere([0.066, 0.59, 0.207], 0.018),
  )).paint(white).bone('chest');
  const badge = S.union(0.008,
    S.cyl([-0.12, 0.63, 0.178], 0.05, 0.012, 0.008).rot(1.45, 0, 0).paint(P('#ffd23f', 0.4)),
    S.cyl([-0.12, 0.632, 0.19], 0.024, 0.008, 0.006).rot(1.45, 0, 0).paint(P('#ff5a3c', 0.4)),
  ).bone('chest');

  // Left arm: sleeve with a white stripe, cuff, bare mitten hand
  const sleeve = bandPaint('#ff7a2f', '#fff4e8', [[0.462, 0.482]], 0.12);
  const armL = S.union(0.05,
    S.limb(J.sh, J.el, 0.088, 0.078).bone('upperArm.L'),
    S.limb(J.el, J.wr, 0.078, 0.07).bone('foreArm.L'),
  ).paint(sleeve);
  const cuffL = S.limb(lerp3(J.el, J.wr, 0.85), lerp3(J.el, J.wr, 1.08), 0.08).paint(hoodieDark).bone('foreArm.L');
  const handL = hand(J.wr, 1, 0.074, skin, 'hand.L');

  // Right arm: sleeve into a leather bracer and an oversized brass power fist
  const shR = flipX(J.sh), elR = flipX(J.el), wrR = flipX(J.wr);
  const armR = S.union(0.05,
    S.limb(shR, elR, 0.088, 0.078).bone('upperArm.R'),
    S.limb(elR, lerp3(elR, wrR, 0.4), 0.078, 0.076).bone('foreArm.R'),
  ).paint(hoodie);
  const bracer = S.union(0.02,
    S.limb(lerp3(elR, wrR, 0.25), lerp3(elR, wrR, 0.98), 0.086, 0.094).paint(leather),
    S.limb(lerp3(elR, wrR, 0.2), lerp3(elR, wrR, 0.32), 0.096).paint(brassDark),
    S.limb(lerp3(elR, wrR, 0.9), lerp3(elR, wrR, 1.02), 0.103).paint(brassDark),
  ).bone('foreArm.R');
  const fc = [wrR[0] - 0.02, wrR[1] - 0.09, wrR[2] + 0.018];
  const fist = S.union(0.024,
    S.box(fc, [0.078, 0.08, 0.08], 0.05).paint(brass),
    ...[-1, 0, 1].map(i => S.ellipsoid([fc[0] + 0.012, fc[1] - 0.075, fc[2] + i * 0.045], [0.052, 0.03, 0.024]).paint(brass)),
    S.limb([fc[0] + 0.04, fc[1] + 0.02, fc[2] + 0.06], [fc[0] + 0.045, fc[1] - 0.035, fc[2] + 0.09], 0.032, 0.028).paint(brass),
    S.ellipsoid([fc[0] - 0.07, fc[1] + 0.005, fc[2]], [0.03, 0.062, 0.05]).paint(brassDark),
  ).bone('hand.R');
  const runes = S.union(0.004,
    S.ellipsoid([fc[0] - 0.093, fc[1] + 0.005, fc[2]], [0.018, 0.04, 0.028]).paint(glow),
    S.limb(lerp3(elR, wrR, 0.55), lerp3(elR, wrR, 0.62), 0.098).paint(glow).bone('foreArm.R'),
  ).bone('hand.R');

  // Legs: shorts, socks, sneakers
  const pelvis = S.ellipsoid([0, 0.355, 0], [0.215, 0.1, 0.17]).paint(shorts).bone('hips');
  const leg = side => {
    const f = side > 0 ? p => p : flipX;
    const s = side > 0 ? 'L' : 'R';
    return S.union(0.035,
      S.limb(f(J.hip), f([0.112, 0.25, 0.012]), 0.094, 0.09).paint(shorts).bone('thigh.' + s),
      S.limb(f([0.112, 0.25, 0.012]), f(J.an), 0.062, 0.058).paint(bandPaint('#f7c6a0', '#ffffff', [[0.08, 0.17]], 0.2)).bone('shin.' + s),
    );
  };
  const shoes = side => sneaker(side > 0 ? J.an : flipX(J.an), side, { sole: '#fbf8f2', upper: '#23b5a8', toe: '#fbf8f2', stripe: '#ff7a2f', lace: '#fbf8f2' }, side > 0 ? 'foot.L' : 'foot.R');

  const body = S.union(0.03,
    S.union(0.05, torso, hem, pocket, hood, neck),
    scarf, strings, badge,
    armL, cuffL, handL, armR, bracer, fist, runes,
    pelvis, leg(1), leg(-1), shoes(1), shoes(-1),
    head, hairMass,
  );

  const eyeDir = side => [0.36 * side, 0.02, 1];
  return {
    spec, J, sdf: body,
    face: {
      sdf: faceProj,
      features: [
        { kind: 'eye', name: 'eyeL', side: 1, center: [0.115, 1.062, 0.262], dir: eyeDir(1), size: [0.15, 0.19], iris: '#9a6234', iris2: '#2b160a', lidRest: 0.1, irisSize: 0.7, pupilSize: 0.38 },
        { kind: 'eye', name: 'eyeR', side: -1, center: [-0.115, 1.062, 0.262], dir: eyeDir(-1), size: [0.15, 0.19], iris: '#9a6234', iris2: '#2b160a', lidRest: 0.1, irisSize: 0.7, pupilSize: 0.38 },
        { kind: 'brow', name: 'browL', side: 1, center: [0.122, 1.19, 0.25], dir: eyeDir(1), size: [0.17, 0.09], color: '#18215a', angle: 0.4, raise: -0.1, thick: 0.3 },
        { kind: 'brow', name: 'browR', side: -1, center: [-0.122, 1.19, 0.25], dir: eyeDir(-1), size: [0.17, 0.09], color: '#18215a', angle: 0.4, raise: -0.1, thick: 0.3 },
        { kind: 'mouth', name: 'mouth', center: [0.012, 0.905, 0.28], dir: [0, -0.3, 1], size: [0.21, 0.13], open: 0.4, smile: 0.9, width: 0.78, asym: 0.25 },
      ],
    },
    height: 1.5,
  };
}

export const HEROES = { kai, ...HEROES2 };

// Builds a rigged, outlined, eyed hero ready to animate.
// Meshing is the expensive part, so geometry (body + face patches) is cached
// per hero; every instance gets its own skeleton and materials.
const CACHE = {};
export function buildHero(id, opts = {}) {
  const key = id + '@' + (opts.cell ?? '');
  let c = opts.fresh ? null : CACHE[key];
  const def = c ? c.def : HEROES[id]();
  const cell = opts.cell ?? def.cell ?? 0.014;
  const rig = buildSkeleton(def.spec);
  const mopts = { mesh: { cell, aoStep: 0.028, tau: 0.03 }, outlineOpts: { width: 0.0024 } };
  let model;
  if (c) model = { ...skinnedFromGeometry(c.geometry, rig, mopts), stats: c.stats };
  else {
    model = skinnedModel(def.sdf, rig, mopts);
    c = CACHE[key] = { def, geometry: model.geometry, stats: model.stats, faceGeos: {} };
    c.geometry.userData.shared = true;
  }
  const face = buildFace(def.face.sdf, rig.bones.head, def.spec.head.pos, def.face.features, c.faceGeos);
  return { ...model, rig, face, def };
}
