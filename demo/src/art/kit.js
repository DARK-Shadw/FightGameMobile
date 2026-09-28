// Reusable sculpting parts: skeleton layout, hands, sneakers, hair clumps,
// faces. Characters face +Z; their left side is +X.

import { S, P, hex, mixc, vnoise } from '../engine/sdf.js';

export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const flipX = p => [-p[0], p[1], p[2]];

// ── Humanoid skeleton ────────────────────────────────────────────────────
// Returns a bone spec plus the joint positions the sculpt is built around.
export function humanoid(pr = {}) {
  const hipY = pr.hipY ?? 0.4;
  const chestY = pr.chestY ?? 0.64;
  const neckY = pr.neckY ?? 0.78;
  const headY = pr.headY ?? 0.86; // head pivot (base of skull)
  const sh = pr.shoulder ?? [0.2, 0.7, 0];
  const el = pr.elbow ?? [0.29, 0.54, 0.02];
  const wr = pr.wrist ?? [0.34, 0.41, 0.04];
  const hip = pr.hip ?? [0.1, 0.38, 0];
  const kn = pr.knee ?? [0.11, 0.22, 0.01];
  const an = pr.ankle ?? [0.11, 0.09, 0];
  const J = { hipY, chestY, neckY, headY, sh, el, wr, hip, kn, an };
  const spec = {
    root: { pos: [0, 0, 0] },
    hips: { parent: 'root', pos: [0, hipY, 0] },
    spine: { parent: 'hips', pos: [0, (hipY + chestY) / 2, 0] },
    chest: { parent: 'spine', pos: [0, chestY, 0] },
    neck: { parent: 'chest', pos: [0, neckY, 0] },
    head: { parent: 'neck', pos: [0, headY, 0] },
  };
  for (const [s, f] of [['L', p => p], ['R', flipX]]) {
    spec['upperArm.' + s] = { parent: 'chest', pos: f(sh) };
    spec['foreArm.' + s] = { parent: 'upperArm.' + s, pos: f(el) };
    spec['hand.' + s] = { parent: 'foreArm.' + s, pos: f(wr) };
    spec['thigh.' + s] = { parent: 'hips', pos: f(hip) };
    spec['shin.' + s] = { parent: 'thigh.' + s, pos: f(kn) };
    spec['foot.' + s] = { parent: 'shin.' + s, pos: f(an) };
  }
  for (const [name, b] of Object.entries(pr.extra || {})) spec[name] = b;
  return { spec, J };
}

// ── Paint helpers ────────────────────────────────────────────────────────
// Vertical gradient paint (e.g. hair darker at the roots).
export function gradientPaint(bottom, top, y0, y1, gloss = 0.4, extra = {}) {
  const a = hex(bottom), b = hex(top);
  return (x, y) => ({ color: mixc(a, b, Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))), gloss, emissive: 0, ...extra });
}

// Hair: dark roots to bright tips, plus a painted sheen on top-facing
// surfaces (the "angel ring" of stylized hair) instead of a wet specular.
export function hairPaint(root, tip, sheen, y0, y1, gloss = 0.22) {
  const a = hex(root), b = hex(tip), c = hex(sheen);
  return (x, y, z, leaf, nx, ny, nz) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    let col = mixc(a, b, t * t * 0.9 + t * 0.1);
    const band = Math.max(0, ny) * Math.max(0, 1 - Math.abs(y - (y0 + (y1 - y0) * 0.62)) / ((y1 - y0) * 0.22));
    col = mixc(col, c, Math.min(1, band * 1.6) * 0.55);
    return { color: col, gloss, emissive: 0 };
  };
}

// Skin with soft blush on the cheeks.
export function skinPaint(base, blush, cheeks, radius = 0.07, gloss = 0.28) {
  const a = hex(base), b = hex(blush);
  return (x, y, z) => {
    let t = 0;
    for (const c of cheeks) {
      const d = Math.hypot(Math.abs(x) - c[0], y - c[1], z - c[2]);
      t = Math.max(t, 1 - Math.min(1, d / radius));
    }
    return { color: mixc(a, b, t * t * 0.75), gloss, emissive: 0 };
  };
}

// Horizontal bands (sleeve stripes, socks).
export function bandPaint(base, band, bands, gloss = 0.25) {
  const a = hex(base), b = hex(band);
  return (x, y, z, leaf, nx, ny, nz, cell) => {
    let t = 0;
    for (const [y0, y1] of bands) {
      const e = cell * 0.7;
      t = Math.max(t, Math.min(smooth((y - y0) / e + 0.5), smooth((y1 - y) / e + 0.5)));
    }
    return { color: mixc(a, b, t), gloss, emissive: 0 };
  };
}
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Painterly variation: blotches of a second tone (fabric wear, skin tone).
export function mottled(base, alt, scale = 7, amount = 0.35, gloss = 0.25) {
  const a = hex(base), b = hex(alt);
  return (x, y, z) => ({ color: mixc(a, b, Math.max(0, vnoise(x * scale, y * scale, z * scale)) * amount), gloss, emissive: 0 });
}

// ── Parts ────────────────────────────────────────────────────────────────
// Chunky cartoon mitten: palm, finger block split at the tips, thumb.
// side = +1 (left, +X) or -1 (right). `curl` bends the fingers into a fist.
export function hand(wrist, side, size, paint, bone, curl = 0.35) {
  const k = size / 0.07;
  const sx = side;
  const palm = [wrist[0] + 0.012 * sx * k, wrist[1] - 0.052 * k, wrist[2] + 0.008 * k];
  const tipY = palm[1] - 0.058 * k;
  const tipZ = palm[2] + 0.02 * k + curl * 0.03 * k;
  const mitt = S.union(0.022 * k,
    S.ellipsoid(palm, [0.05 * k, 0.056 * k, 0.052 * k]),
    S.ellipsoid([palm[0] + 0.006 * sx * k, tipY, tipZ], [0.047 * k, 0.04 * k, 0.054 * k]),
    S.limb([palm[0] - 0.012 * sx * k, palm[1] + 0.012 * k, palm[2] + 0.04 * k],
      [palm[0] - 0.006 * sx * k, palm[1] - 0.03 * k, palm[2] + 0.068 * k], 0.025 * k, 0.023 * k),
  );
  const grooves = [-1, 1].map(i => S.ellipsoid([palm[0] + 0.006 * sx * k, tipY - 0.02 * k, tipZ + i * 0.018 * k], [0.07 * k, 0.032 * k, 0.0042 * k]));
  return S.sub(0.007 * k, mitt, ...grooves).paint(paint).bone(bone);
}

// Big sneaker. heel at ankle, toe forward.
export function sneaker(ankle, side, colors, bone, scale = 1) {
  const [ax, , az] = ankle;
  const k = scale;
  const c = [ax, 0.0, az + 0.03 * k];
  const sole = S.box([c[0], 0.03 * k, c[2] + 0.01 * k], [0.078 * k, 0.03 * k, 0.135 * k], 0.028 * k).paint(P(colors.sole, 0.35));
  const upper = S.union(0.04 * k,
    S.ellipsoid([c[0], 0.085 * k, c[2] - 0.01 * k], [0.078 * k, 0.07 * k, 0.12 * k]),
    S.ellipsoid([c[0], 0.07 * k, c[2] + 0.07 * k], [0.07 * k, 0.05 * k, 0.07 * k]),
    S.limb([ax, 0.1 * k, az - 0.02 * k], [ax, 0.16 * k, az - 0.01 * k], 0.07 * k, 0.062 * k),
  ).paint(P(colors.upper, 0.4));
  const toe = S.ellipsoid([c[0], 0.06 * k, c[2] + 0.1 * k], [0.066 * k, 0.045 * k, 0.05 * k]).paint(P(colors.toe ?? colors.sole, 0.45));
  const laces = [];
  for (let i = 0; i < 3; i++) {
    const z = c[2] + 0.055 * k - i * 0.035 * k;
    laces.push(S.limb([c[0] - 0.035 * k, 0.135 * k - i * 0.012 * k, z], [c[0] + 0.035 * k, 0.135 * k - i * 0.012 * k, z], 0.011 * k).paint(P(colors.lace ?? '#ffffff', 0.3)));
  }
  const stripe = S.ellipsoid([c[0] + 0.07 * side * k, 0.075 * k, c[2]], [0.012 * k, 0.03 * k, 0.07 * k]).rot(0.3, 0, 0).paint(P(colors.stripe ?? colors.toe ?? '#ffffff', 0.4));
  return S.union(0.012 * k, sole, upper, toe, stripe, ...laces).bone(bone);
}

// A clump of stylized hair: fat at the root, rounded tip, slight curve.
export function hairClump(root, tip, r1, r2 = r1 * 0.35, bend = [0, 0, 0]) {
  const mid = lerp3(root, tip, 0.5);
  const midB = add3(mid, bend);
  return S.union(r1 * 0.5,
    S.limb(root, midB, r1, (r1 + r2) * 0.6),
    S.limb(midB, tip, (r1 + r2) * 0.6, r2),
  );
}

// Eye placements are returned with the sculpt so the rig can attach meshes.
export function eyeSpots(center, spacing, y, z, yaw = 0.32, size = [0.07, 0.085, 0.04]) {
  return [
    { side: 'L', pos: [center + spacing, y, z], rot: [0, yaw, 0], scale: size },
    { side: 'R', pos: [center - spacing, y, z], rot: [0, -yaw, 0], scale: size },
  ];
}
