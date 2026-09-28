// Shared sculpting kit for the creature library: essence palettes, paint
// functions (tones, bellies, scales, veins, stars, bark, rock), and part
// builders (horns, claws, spikes, flames, bat wings, feathers, tentacles).
// Creatures face +Z, their left is +X, 1 unit = 1 m.

import { S, P, hex, mixc, vnoise } from '../engine/sdf.js';

export { S, P, hex, mixc };
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const fx = p => [-p[0], p[1], p[2]];
export const sc = (p, s) => [p[0] * s, p[1] * s, p[2] * s];

// Quadratic bezier point.
export function bez(a, c, b, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]];
}

// Tapered tube along a quadratic bezier, as round-cone segments (joints are
// exact, so a hard union is already smooth).
export function tube(a, c, b, r0, r1, n = 3, pow = 1) {
  const parts = [];
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t0 = (i - 1) / n, t = i / n;
    const p = bez(a, c, b, t);
    parts.push(S.limb(prev, p, lerp(r0, r1, t0 ** pow), lerp(r0, r1, t ** pow)));
    prev = p;
  }
  return S.union(0, ...parts);
}

// Tube through a polyline with per-point radii.
export function chain(pts, radii, k = 0) {
  const parts = [];
  for (let i = 1; i < pts.length; i++) parts.push(S.limb(pts[i - 1], pts[i], radii[i - 1], radii[i]));
  return S.union(k, ...parts);
}

// Curved horn: root → tip, bowing toward `bend` (an offset added at mid).
export const horn = (root, tip, r, bend = [0, 0, 0], n = 3, tipR = 0.12) =>
  tube(root, add(mix3(root, tip, 0.5), bend), tip, r, r * tipR, n, 0.8);

// Cone spike.
export const spike = (base, tip, r) => S.limb(base, tip, r, r * 0.1);

// Teardrop flame (use with an emissive flame paint).
export function flame(base, tip, r, lean = [0, 0, 0]) {
  const mid = add(mix3(base, tip, 0.45), lean);
  return S.union(r * 0.4, S.sphere(base, r), S.limb(base, mid, r * 0.95, r * 0.55), S.limb(mid, tip, r * 0.55, r * 0.06));
}

// ── Palettes ─────────────────────────────────────────────────────────────
// One dominant, one accent, one neutral per essence; `glow` is emissive.
export const PAL = {
  fire: { body: '#ff5a1f', dark: '#b8260d', light: '#ff9340', belly: '#ffd27a', horn: '#3d1f1d', hornTip: '#8c4b33', claw: '#fff0d2', glow: '#ffb547', hot: '#fff1a8', eye: '#ffe45c', eye2: '#ff6a00', ink: '#3a0f08', accent: '#ffd23f', cloth: '#5a1d12' },
  frost: { body: '#a9e4ff', dark: '#3b9ad6', light: '#f2fbff', belly: '#ffffff', horn: '#c9f1ff', hornTip: '#ffffff', claw: '#e8f7ff', glow: '#d6f3ff', hot: '#ffffff', eye: '#6fe6ff', eye2: '#1a6fc2', ink: '#0d3050', accent: '#38bdf8', ice: '#7fe3ff', cloth: '#1d4f86' },
  storm: { body: '#6366f1', dark: '#312a9c', light: '#a5b4fc', belly: '#dfe3ff', horn: '#fde047', hornTip: '#fffbe0', claw: '#eef0ff', glow: '#e0e3ff', hot: '#ffffff', eye: '#c9fbff', eye2: '#3b5bff', ink: '#1a1552', accent: '#fde047', bolt: '#fff38a', cloth: '#2a2470' },
  stone: { body: '#a8a29e', dark: '#625a55', light: '#d8d1c8', belly: '#c4b8aa', horn: '#57504b', hornTip: '#8f8780', claw: '#e7e0d6', glow: '#ffd08a', hot: '#fff4d6', eye: '#ffd08a', eye2: '#c26a12', ink: '#2e2825', accent: '#7fae4a', moss: '#6f9d3c', cloth: '#6b4e36' },
  tide: { body: '#2f6fed', dark: '#1a3a8f', light: '#6fb1ff', belly: '#cfe4ff', horn: '#e8f4ff', hornTip: '#ffffff', claw: '#e8f4ff', glow: '#a9c8ff', hot: '#f2f8ff', eye: '#e6f6ff', eye2: '#2a6fe0', ink: '#0c2260', accent: '#5eead4', foam: '#f2f8ff', cloth: '#12306e' },
  gale: { body: '#84cc16', dark: '#3f6d0c', light: '#c3f36a', belly: '#f4fde2', horn: '#f5c518', hornTip: '#fff2b0', claw: '#3b3222', glow: '#e4fbc8', hot: '#ffffff', eye: '#ffe14d', eye2: '#c77800', ink: '#223a06', accent: '#f5c518', cloth: '#355c0c' },
  light: { body: '#f2c21b', dark: '#b07a06', light: '#fff0a3', belly: '#fffaf0', horn: '#fff6d8', hornTip: '#ffffff', claw: '#fff6d8', glow: '#fff4c2', hot: '#ffffff', eye: '#fff6c9', eye2: '#e0a100', ink: '#5a3a00', accent: '#ffffff', cloth: '#fffaf0', white: '#fffdf6' },
  shadow: { body: '#7c3aed', dark: '#2e1463', light: '#a98bfa', belly: '#4b2596', horn: '#1c0f33', hornTip: '#5b3b9a', claw: '#e6dcff', glow: '#d9c8ff', hot: '#ffffff', eye: '#e7dcff', eye2: '#9b6bff', ink: '#12082a', accent: '#c4b5fd', deep: '#1a0d36', cloth: '#26124f' },
  life: { body: '#22c55e', dark: '#137a39', light: '#8bf0ae', belly: '#d9f7c8', horn: '#8a5a2b', hornTip: '#c08a52', claw: '#6a4424', glow: '#c4f5c9', hot: '#f4fff0', eye: '#fffbe0', eye2: '#5a3a14', ink: '#123a1e', accent: '#ff7eb6', wood: '#8b5a2b', woodDark: '#4f3119', flower: '#ff7eb6', cloth: '#5b3a1e' },
  death: { body: '#14b8a6', dark: '#0b5f58', light: '#5eead4', belly: '#bdf5ec', horn: '#e9e1cf', hornTip: '#fffaf0', claw: '#efe8d8', glow: '#99f6e4', hot: '#f0fffb', eye: '#8ff7e6', eye2: '#0f9d8c', ink: '#0a2a28', accent: '#99f6e4', bone: '#ece4d2', boneDark: '#a99f88', cloth: '#1f3d3a' },
  blood: { body: '#e11d48', dark: '#7a0f2a', light: '#fb6f8c', belly: '#ffb3c2', horn: '#f3e2d2', hornTip: '#ffffff', claw: '#f5e6d8', glow: '#ffc1cc', hot: '#ffffff', eye: '#ffe0e6', eye2: '#ff2a55', ink: '#3a0512', accent: '#ff4d6d', vein: '#ff3d63', cloth: '#3b0a18' },
  mind: { body: '#ec4899', dark: '#9d174d', light: '#f9a8d4', belly: '#ffd6ec', horn: '#fbe7f3', hornTip: '#ffffff', claw: '#fff0f8', glow: '#ffd6ec', hot: '#ffffff', eye: '#ffffff', eye2: '#c026d3', ink: '#4a0a2c', accent: '#a78bfa', brain: '#ffb3dc', cloth: '#6d1244' },
  time: { body: '#c8963e', dark: '#7c5419', light: '#f1d08b', belly: '#fbecc8', horn: '#f6e3b4', hornTip: '#ffffff', claw: '#fbf1d6', glow: '#f6e3b4', hot: '#fffbe8', eye: '#fff4cf', eye2: '#c8963e', ink: '#3f2a08', accent: '#5fd4ff', brass: '#e2aa3c', cloth: '#f6e3b4' },
  space: { body: '#c026d3', dark: '#3b0f6e', light: '#f0abfc', belly: '#f5c2ff', horn: '#fdf4ff', hornTip: '#ffffff', claw: '#fdf4ff', glow: '#f5c2ff', hot: '#ffffff', eye: '#ffffff', eye2: '#c026d3', ink: '#1f0638', accent: '#7dd3fc', deep: '#1c0b44', star: '#ffffff', cloth: '#2a0f5c' },
  beast: { body: '#c46a1c', dark: '#6e3510', light: '#f2a24a', belly: '#fde6c6', horn: '#f3e6cf', hornTip: '#fffaf0', claw: '#f6ecd8', glow: '#fdd7a8', hot: '#fff5e6', eye: '#ffd76a', eye2: '#b45309', ink: '#2e1406', accent: '#e8412c', stripe: '#4a2208', cloth: '#6b3a16' },
  void: { body: '#71717a', dark: '#2b2b31', light: '#b4b4bc', belly: '#9d9da6', horn: '#1a1a1f', hornTip: '#52525b', claw: '#e4e4e7', glow: '#e4e4ff', hot: '#ffffff', eye: '#f4f4ff', eye2: '#8a8aa0', ink: '#0e0e12', accent: '#c7c7ff', deep: '#141418', mask: '#f1f0ec', cloth: '#232329' },
};

// ── Paints ───────────────────────────────────────────────────────────────
// Three-tone body: dark underside → base → light on top-facing surfaces.
export function tone(base, dark, light, y0, y1, gloss = 0.25, top = 0.45) {
  const a = hex(dark), b = hex(base), c = hex(light);
  return (x, y, z, l, nx, ny) => {
    let col = mixc(a, b, smooth((y - y0) / (y1 - y0)));
    if (ny > 0) col = mixc(col, c, ny * ny * top);
    return { color: col, gloss, emissive: 0 };
  };
}

// Along an arbitrary axis (dir, from s0 to s1) with a top highlight.
export function toneAxis(base, dark, light, origin, dir, s0, s1, gloss = 0.25, top = 0.4) {
  const a = hex(dark), b = hex(base), c = hex(light);
  const d = norm(dir);
  return (x, y, z, l, nx, ny) => {
    const s = (x - origin[0]) * d[0] + (y - origin[1]) * d[1] + (z - origin[2]) * d[2];
    let col = mixc(a, b, smooth((s - s0) / (s1 - s0)));
    if (ny > 0) col = mixc(col, c, ny * ny * top);
    return { color: col, gloss, emissive: 0 };
  };
}

// Countershading: lighter belly on the front/underside region.
export function belly(base, bellyCol, dark, y0, y1, opts = {}) {
  const a = hex(dark), b = hex(base), c = hex(bellyCol), lt = opts.light ? hex(opts.light) : null;
  const zf = opts.zFront ?? 0.02, soft = opts.soft ?? 0.04, xw = opts.xw ?? 1e9, gloss = opts.gloss ?? 0.25;
  const under = opts.under ?? 0;
  return (x, y, z, l, nx, ny, nz) => {
    let col = mixc(a, b, smooth((y - y0) / (y1 - y0)));
    if (lt && ny > 0) col = mixc(col, lt, ny * ny * 0.4);
    const f = smooth((z - zf) / soft) * smooth((nz + 0.1) / 0.5) * smooth((xw - Math.abs(x)) / soft);
    const u = under ? smooth((-ny - 0.2) / 0.4) * under : 0;
    return { color: mixc(col, c, Math.max(f, u)), gloss, emissive: 0 };
  };
}

// Emissive gradient for flames, cores and energy (base → hot tip).
export function glowGrad(base, hot, y0, y1, emi = 1, gloss = 0.5) {
  const a = hex(base), b = hex(hot);
  return (x, y) => ({ color: mixc(a, b, smooth((y - y0) / (y1 - y0))), gloss, emissive: emi });
}

// Radial glow: bright core fading to a rim color (orbs, wisps, eyes of fire).
export function glowRadial(center, r, core, rim, emi = 1, gloss = 0.5) {
  const a = hex(core), b = hex(rim);
  return (x, y, z) => {
    const d = Math.hypot(x - center[0], y - center[1], z - center[2]) / r;
    return { color: mixc(a, b, smooth(d)), gloss, emissive: emi };
  };
}

// Hash for cellular patterns.
function h3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// Distance to nearest / second nearest cell point (3D voronoi).
function voro(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let d1 = 9, d2 = 9;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, cz = zi + k;
    const px = cx + h3(cx, cy, cz), py = cy + h3(cy, cz, cx), pz = cz + h3(cz, cx, cy);
    const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [Math.sqrt(d1), Math.sqrt(d2)];
}

// Wraps a paint: cell edges (scales, rock plates) darkened toward `edge`.
export function scaled(paint, edgeCol, freq, amount = 0.6, width = 0.12) {
  const e = hex(edgeCol);
  return (x, y, z, l, nx, ny, nz, cell) => {
    const p = typeof paint === 'function' ? paint(x, y, z, l, nx, ny, nz, cell) : paint;
    const [d1, d2] = voro(x * freq, y * freq, z * freq);
    const t = 1 - smooth((d2 - d1) / width);
    return { ...p, color: mixc(p.color, e, t * amount) };
  };
}

// Wraps a paint: emissive veins/cracks from ridged noise.
export function veins(paint, glowCol, freq, width = 0.08, emi = 1, seed = 0) {
  const g = hex(glowCol);
  return (x, y, z, l, nx, ny, nz, cell) => {
    const p = typeof paint === 'function' ? paint(x, y, z, l, nx, ny, nz, cell) : paint;
    const n = Math.abs(vnoise(x * freq + seed, y * freq * 0.8 - seed, z * freq + 3.1)) + Math.abs(vnoise(x * freq * 2.1, y * freq * 2.1 + seed, z * freq * 2.1)) * 0.3;
    const t = 1 - smooth(n / width);
    if (t < 0.02) return p;
    return { color: mixc(p.color, g, t), gloss: p.gloss, emissive: t * emi };
  };
}

// Wraps a paint: sparse emissive star specks (cosmic creatures).
export function starry(paint, starCol, freq, thresh = 0.86, emi = 1) {
  const s = hex(starCol);
  return (x, y, z, l, nx, ny, nz, cell) => {
    const p = typeof paint === 'function' ? paint(x, y, z, l, nx, ny, nz, cell) : paint;
    const [d1] = voro(x * freq, y * freq, z * freq);
    const t = 1 - smooth((d1 - 0.08) / 0.12);
    const pick = h3(Math.floor(x * freq), Math.floor(y * freq), Math.floor(z * freq)) > thresh ? 0 : 1;
    const w = t * pick;
    if (w < 0.02) return p;
    return { color: mixc(p.color, s, w), gloss: p.gloss, emissive: w * emi };
  };
}

// Wraps a paint: soft mottling toward a second tone.
export function mottle(paint, alt, freq, amount = 0.35) {
  const b = hex(alt);
  return (x, y, z, l, nx, ny, nz, cell) => {
    const p = typeof paint === 'function' ? paint(x, y, z, l, nx, ny, nz, cell) : paint;
    const n = vnoise(x * freq, y * freq, z * freq) * 0.7 + vnoise(x * freq * 2.3, y * freq * 2.3, z * freq * 2.3) * 0.3;
    return { ...p, color: mixc(p.color, b, clamp01(n * 0.5 + 0.5) ** 2 * amount * 1.6) };
  };
}

// Bark: vertical streaks of a darker tone.
export function bark(base, dark, light, freq = 14, gloss = 0.15) {
  const a = hex(dark), b = hex(base), c = hex(light);
  return (x, y, z, l, nx, ny) => {
    const n = vnoise(x * freq, y * freq * 0.18, z * freq) * 0.8 + vnoise(x * freq * 2.2, y * freq * 0.4, z * freq * 2.2) * 0.35;
    let col = mixc(b, a, smooth(n * 1.4 + 0.1));
    if (ny > 0.2) col = mixc(col, c, (ny - 0.2) * 0.5);
    return { color: col, gloss, emissive: 0 };
  };
}

// Bands along an axis (belly plates, stripes, tentacle rings).
export function bands(base, band, origin, dir, period, duty = 0.5, gloss = 0.3, soft = 0.2) {
  const a = hex(base), b = hex(band);
  const d = norm(dir);
  return (x, y, z) => {
    const s = ((x - origin[0]) * d[0] + (y - origin[1]) * d[1] + (z - origin[2]) * d[2]) / period;
    const f = s - Math.floor(s);
    const t = smooth((duty - Math.abs(f - 0.5) * 2) / soft + 0.5);
    return { color: mixc(a, b, t), gloss, emissive: 0 };
  };
}

// Solid emissive paint shortcut.
export const G = (color, emi = 1, gloss = 0.5) => P(color, gloss, emi);

// ── Parts ────────────────────────────────────────────────────────────────
// Row of claws: `base` knuckle position, pointing along `dir` then curling down.
export function claws(base, dir, side, n, spread, len, r, paint) {
  const d = norm(dir);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * spread;
    const b0 = [base[0] + o * side * (d[2] !== 0 ? 1 : 0) + (d[2] === 0 ? 0 : 0), base[1], base[2]];
    // spread across the axis perpendicular to dir in the horizontal plane
    const px = -d[2], pz = d[0];
    const b = [base[0] + px * o, base[1], base[2] + pz * o];
    const tip = [b[0] + d[0] * len, b[1] + d[1] * len - len * 0.35, b[2] + d[2] * len];
    const mid = [b[0] + d[0] * len * 0.6, b[1] + d[1] * len * 0.6 + len * 0.1, b[2] + d[2] * len * 0.6];
    out.push(tube(b, mid, tip, r, r * 0.15, 2));
    void b0;
  }
  return S.union(0, ...out).paint(paint);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export { cross, dot };

// Wing plane frame: u = arm direction (outward), t = trailing direction, n = normal.
function wingFrame(opts) {
  const lift = opts.lift ?? 0.25, sweep = opts.sweep ?? 0.1;
  const u = norm([Math.cos(lift), Math.sin(lift), -sweep]);
  let t = norm(opts.trail ?? [0, -0.15, -1]);
  t = norm(sub(t, mul(u, dot(t, u))));
  return { u, t, n: cross(u, t) };
}
// Flattened ellipsoid with local x along `dir`, thin along the wing normal.
function blade(center, dir, n, len, width, thick) {
  const d = norm(dir);
  const z = norm(cross(d, n));
  const y = cross(z, d);
  const e = S.ellipsoid(center, [len * 0.5, thick, width * 0.5]);
  e.R = [d[0], y[0], z[0], d[1], y[1], z[1], d[2], y[2], z[2]];
  return e;
}

// Bat/dragon membrane wing authored on the +X side from `root`: arm and
// finger spars over a leaf-shaped membrane with a scalloped trailing edge.
// Bones `${pre}.L` (shoulder) and `${pre}Tip.L` (wrist).
// paints: { bone, membrane, claw }. opts: { lift, sweep, trail, fingers }.
export function batWing(pre, parent, root, span, chord, thick, spar, paints, opts = {}) {
  const { u, t, n } = wingFrame({ lift: 0.35, sweep: 0.25, trail: [0, -0.45, -1], ...opts });
  const fingers = opts.fingers ?? 3;
  const at = (a, b) => add(add(root, mul(u, a * span)), mul(t, b * chord));
  const elbow = at(0.3, -0.04), wrist = at(0.52, -0.08);
  const tips = [];
  for (let i = 0; i < fingers; i++) {
    const f = fingers === 1 ? 0 : i / (fingers - 1);
    const ang = lerp(0.12, 1.05, f);
    const len = lerp(span * 0.5, chord * 0.95, f);
    tips.push(add(wrist, add(mul(u, Math.cos(ang) * len), mul(t, Math.sin(ang) * len))));
  }
  const bodyPt = at(0.04, 0.9);
  const bones = { [pre + '.L']: { parent, pos: root }, [pre + 'Tip.L']: { parent: pre + '.L', pos: wrist } };
  const bn = pre + '.L', bt = pre + 'Tip.L';
  const arm = S.union(spar * 0.4,
    S.limb(root, elbow, spar * 1.3, spar * 1.05).bone(bn),
    S.limb(elbow, wrist, spar * 1.05, spar * 0.9).bone(bt),
    S.sphere(wrist, spar * 1.15).bone(bt),
    ...tips.map(tp => S.limb(wrist, tp, spar * 0.75, spar * 0.3).bone(bt)),
  ).paint(paints.bone);
  const thumb = S.limb(wrist, add(add(wrist, mul(u, span * 0.05)), mul(n, span * 0.02)).map((x, i) => x - t[i] * chord * 0.12), spar * 0.8, spar * 0.1).paint(paints.claw ?? paints.bone).bone(bt);
  const inner = blade(at(0.3, 0.42), u, n, span * 0.62, chord * 0.98, thick).bone(bn);
  const outer = blade(mix3(wrist, mix3(tips[0], tips[fingers - 1], 0.5), 0.55), mix3(tips[0], tips[fingers - 1], 0.5).map((x, i) => x - wrist[i]), n, span * 0.6, chord * 0.95, thick).bone(bt);
  const cuts = [];
  const trail = [...tips.slice(1), bodyPt];
  for (let i = 0; i < trail.length - 1; i++) {
    const m = mix3(trail[i], trail[i + 1], 0.5);
    const gap = Math.hypot(...sub(trail[i], trail[i + 1]));
    const away = norm(sub(m, i === trail.length - 2 ? at(0.3, 0.2) : wrist));
    cuts.push(S.sphere(add(m, mul(away, gap * 0.28)), gap * 0.52));
  }
  // clip anything past the leading edge / outer tip
  const membrane = S.sub(thick, S.union(thick * 2, inner, outer), ...cuts).paint(paints.membrane);
  const sdf = S.union(spar * 0.3, membrane, arm, thumb).group(pre);
  return { bones, sdf, tips, wrist, elbow, at };
}

// Feathered wing authored on the +X side: arm, coverts, secondaries and a
// fan of primaries in the wing plane. Bones `${pre}.L` (shoulder), `${pre}Tip.L` (elbow).
// paints: { feather, feather2, coverts }. opts: { lift, sweep, trail, chord, primaries, secondaries, featherW, thick, armR }.
export function featherWing(pre, parent, root, span, paints, opts = {}) {
  const { u, t, n } = wingFrame(opts);
  const chord = opts.chord ?? span * 0.55;
  const fth = opts.thick ?? span * 0.032;
  const fw = opts.featherW ?? 1;
  const nP = opts.primaries ?? 5, nS = opts.secondaries ?? 4;
  const elbow = add(root, mul(u, span * 0.36));
  const wrist = add(root, mul(u, span * 0.66));
  const bn = pre + '.L', bt = pre + 'Tip.L';
  const bones = { [bn]: { parent, pos: root }, [bt]: { parent: bn, pos: elbow } };
  const armR = opts.armR ?? span * 0.06;
  const f1 = paints.feather, f2 = paints.feather2 ?? paints.feather, cv = paints.coverts ?? paints.feather;
  const parts = [
    S.limb(root, elbow, armR * 1.2, armR).bone(bn).paint(cv),
    S.limb(elbow, wrist, armR, armR * 0.75).bone(bt).paint(cv),
  ];
  for (let i = 0; i < nP; i++) {
    const f = nP === 1 ? 0 : i / (nP - 1);
    const ang = lerp(0.06, 1.2, f);
    const dir = add(mul(u, Math.cos(ang)), mul(t, Math.sin(ang)));
    const len = lerp(span * 0.44, chord * 0.9, f) * (opts.primaryLen ?? 1);
    parts.push(blade(add(wrist, mul(dir, len * 0.45)), dir, n, len, span * 0.085 * fw, fth).bone(bt).paint(i % 2 ? f2 : f1));
  }
  for (let i = 0; i < nS; i++) {
    const f = (i + 0.5) / nS;
    const b = mix3(root, wrist, lerp(0.92, 0.1, f));
    const dir = norm(add(t, mul(u, 0.12)));
    const len = chord * lerp(0.82, 0.6, f) * (opts.secondaryLen ?? 1);
    parts.push(blade(add(b, mul(dir, len * 0.45)), dir, n, len, span * 0.12 * fw, fth * 0.95).bone(f < 0.5 ? bt : bn).paint(i % 2 ? f1 : f2));
  }
  for (let i = 0; i < 3; i++) {
    const b = add(mix3(root, wrist, 0.18 + i * 0.3), mul(n, fth * 1.2));
    parts.push(blade(add(b, mul(t, chord * 0.14)), t, n, chord * 0.36, span * 0.19 * fw, fth * 1.1).bone(i === 0 ? bn : bt).paint(cv));
  }
  const sdf = S.union(fth * 1.2, ...parts).group(pre);
  return { bones, sdf, wrist, elbow };
}

// Tentacle along a bezier with bones `${name}0..n-1` chained from `parent`.
export function tentacle(name, parent, a, c, b, r0, r1, nBones, paint, suckers = null) {
  const bones = {};
  const pts = [];
  for (let i = 0; i <= nBones; i++) pts.push(bez(a, c, b, i / nBones));
  let par = parent;
  for (let i = 0; i < nBones; i++) {
    bones[name + i] = { parent: par, pos: pts[i] };
    par = name + i;
  }
  const segs = [];
  for (let i = 0; i < nBones; i++) {
    const ra = lerp(r0, r1, i / nBones), rb = lerp(r0, r1, (i + 1) / nBones);
    segs.push(S.limb(pts[i], pts[i + 1], ra, rb).bone(name + i));
  }
  let sdf = S.union(0, ...segs).paint(paint);
  if (suckers) {
    const s = [];
    for (let i = 1; i < nBones * 2; i++) {
      const t = i / (nBones * 2);
      const p = bez(a, c, b, t);
      const r = lerp(r0, r1, t);
      const q = bez(a, c, b, Math.min(1, t + 0.02));
      const dir = norm(sub(q, p));
      // suckers on the inner (toward -dir cross) side: use suckers.side vector
      const off = norm(suckers.side);
      s.push(S.sphere(add(p, mul(off, r * 0.82)), r * 0.32).bone(name + Math.min(nBones - 1, Math.floor(t * nBones))));
      void dir;
    }
    sdf = S.union(r1 * 0.3, sdf, S.union(0, ...s).paint(suckers.paint));
  }
  return { bones, sdf, pts };
}

// ── Face decal helpers ───────────────────────────────────────────────────
// Pair of eyes placed symmetric about x=0.
export function eyes(c, size, opts = {}) {
  const spread = opts.yaw ?? 0.35;
  const mk = side => ({
    kind: 'eye', name: side > 0 ? 'eyeL' : 'eyeR', side,
    center: [c[0] * side, c[1], c[2]], dir: opts.dir ? [opts.dir[0] * side, opts.dir[1], opts.dir[2]] : [spread * side, opts.pitch ?? 0.05, 1],
    size, iris: opts.iris, iris2: opts.iris2, sclera: opts.sclera, ink: opts.ink, lidRest: opts.lidRest ?? 0.1,
    irisSize: opts.irisSize ?? 0.62, pupilSize: opts.pupilSize ?? 0.3, angry: opts.angry ?? 0, glow: opts.glow ?? 0,
  });
  return [mk(1), mk(-1)];
}
export function brows(c, size, color, opts = {}) {
  const spread = opts.yaw ?? 0.35;
  const mk = side => ({
    kind: 'brow', name: side > 0 ? 'browL' : 'browR', side, center: [c[0] * side, c[1], c[2]],
    dir: [spread * side, opts.pitch ?? 0.1, 1], size, color, angle: opts.angle ?? 0.6, raise: opts.raise ?? -0.1, thick: opts.thick ?? 0.32, arch: opts.arch ?? 0.3,
  });
  return [mk(1), mk(-1)];
}
export function mouth(c, size, opts = {}) {
  return { kind: 'mouth', name: 'mouth', center: c, dir: opts.dir ?? [0, -0.25, 1], size, open: opts.open ?? 0.3, smile: opts.smile ?? 0.9, width: opts.width ?? 0.8, asym: opts.asym ?? 0, inside: opts.inside, ink: opts.ink };
}
