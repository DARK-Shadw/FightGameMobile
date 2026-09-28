// Fast drop-in for engine/mesher.js meshSDF(), used by the creature library.
//
// Same algorithm and output format (sparse surface nets, projected vertices,
// gradient normals, field AO, per-leaf paint with soft material borders,
// distance-based skin weights), but much cheaper to run at summon time:
//  - the field is evaluated with a threshold that is pushed down the tree,
//    so nested unions skip every part that cannot change the result
//    (callers only need exact distances near the surface);
//  - mirrored parts are culled against their real side, not a sphere
//    straddling x = 0;
//  - surface ownership, paint borders and skin weights only visit leaves
//    whose bounds can matter;
//  - no per-cell allocations.
// Candidate to upstream into engine/mesher.js.

import { compile, fbm, vnoise } from '../engine/sdf.js';

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const smooth01 = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const { sqrt, abs, max, min } = Math;

function markMirrored(node, under = false, cutter = false) {
  if (node.t === 'prim') { node._mirror = under; node._cutter = cutter; return; }
  if (node.t === 'deform') { markMirrored(node.child, under || node.kind === 'mirror', cutter); return; }
  node.children.forEach((c, i) => markMirrored(c, under, cutter || (node.op === 'sub' && i > 0)));
}

// ── Bounds ──
function primBounds(p) {
  const q = p.p;
  if (p.kind === 'cone') {
    const R = p.R, h = q.h / 2;
    return { c: [p.c[0] + R[1] * h, p.c[1] + R[4] * h, p.c[2] + R[7] * h], r: q.h / 2 + max(q.r1, q.r2) };
  }
  let r;
  switch (p.kind) {
    case 'sphere': r = q.r; break;
    case 'ellipsoid': r = max(q.rx, q.ry, q.rz); break;
    case 'box': case 'taper': r = Math.hypot(q.bx, q.by, q.bz); break;
    case 'torus': r = q.R + q.r; break;
    case 'cyl': r = Math.hypot(q.r, q.h, q.r); break;
    default: r = 1;
  }
  return { c: p.c, r };
}

// Bound of a node in its own input space. `m` marks bounds that should be
// tested at |x| (the node sits under a mirror boundary).
function bounds(node) {
  if (node._fb) return node._fb;
  let b;
  if (node.t === 'prim') b = primBounds(node);
  else if (node.t === 'deform') {
    const cb = bounds(node.child);
    if (node.kind === 'mirror') b = { c: cb.c, r: cb.r, m: true };
    else {
      const p = node.p;
      const extra = node.kind === 'displace' ? p.amp * 1.5 : node.kind === 'round' ? p.r : node.kind === 'shell' ? p.t : 0;
      const widen = node.kind === 'twist' || node.kind === 'bend' ? cb.r * 0.6 : 0;
      b = { c: cb.c, r: cb.r + extra + widen, m: cb.m };
    }
  } else {
    const bs = node.children.map(bounds);
    if (node.op === 'sub' || node.op === 'inter') {
      const b0 = bs[0];
      b = { c: b0.c, r: b0.r + node.k, m: b0.m };
    } else if (bs.every(q => q.m) || bs.every(q => !q.m)) {
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const s of bs) for (let i = 0; i < 3; i++) { lo[i] = min(lo[i], s.c[i] - s.r); hi[i] = max(hi[i], s.c[i] + s.r); }
      const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      let r = 0;
      for (const s of bs) r = max(r, Math.hypot(s.c[0] - c[0], s.c[1] - c[1], s.c[2] - c[2]) + s.r);
      b = { c, r: r + node.k, m: bs[0].m };
    } else {
      // mixed mirrored / unmirrored children: widen to a sphere around x=0
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const s of bs) {
        const xs = s.m ? [-s.c[0] - s.r, s.c[0] + s.r, s.c[0] - s.r, -s.c[0] + s.r] : [s.c[0] - s.r, s.c[0] + s.r];
        lo[0] = min(lo[0], ...xs); hi[0] = max(hi[0], ...xs);
        for (let i = 1; i < 3; i++) { lo[i] = min(lo[i], s.c[i] - s.r); hi[i] = max(hi[i], s.c[i] + s.r); }
      }
      const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      const r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
      b = { c, r: r + node.k, m: false };
    }
  }
  node._fb = b;
  return b;
}

// ── Primitive distances (same math as engine/sdf.js, flattened closures) ──
function primFn(prim) {
  const q = prim.p;
  const cx = prim.c[0], cy = prim.c[1], cz = prim.c[2];
  const R = prim.R;
  const r00 = R[0], r01 = R[1], r02 = R[2], r10 = R[3], r11 = R[4], r12 = R[5], r20 = R[6], r21 = R[7], r22 = R[8];
  switch (prim.kind) {
    case 'sphere': {
      const r = q.r;
      return (x, y, z) => { const dx = x - cx, dy = y - cy, dz = z - cz; return sqrt(dx * dx + dy * dy + dz * dz) - r; };
    }
    case 'ellipsoid': {
      const rx = q.rx, ry = q.ry, rz = q.rz, rm = min(rx, ry, rz);
      const ax = 1 / rx, ay = 1 / ry, az = 1 / rz, bx = ax * ax, by = ay * ay, bz = az * az;
      return (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        const a = r00 * px + r10 * py + r20 * pz, b = r01 * px + r11 * py + r21 * pz, c = r02 * px + r12 * py + r22 * pz;
        const u = a * ax, v = b * ay, w = c * az;
        const k0 = sqrt(u * u + v * v + w * w);
        const u1 = a * bx, v1 = b * by, w1 = c * bz;
        const k1 = sqrt(u1 * u1 + v1 * v1 + w1 * w1);
        return k1 < 1e-9 ? -rm : (k0 * (k0 - 1)) / k1;
      };
    }
    case 'box': {
      const bx = q.bx, by = q.by, bz = q.bz, r = q.r;
      return (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        const a = r00 * px + r10 * py + r20 * pz, b = r01 * px + r11 * py + r21 * pz, c = r02 * px + r12 * py + r22 * pz;
        const qx = abs(a) - bx + r, qy = abs(b) - by + r, qz = abs(c) - bz + r;
        const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
        const m = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz);
        return sqrt(mx * mx + my * my + mz * mz) + (m < 0 ? m : 0) - r;
      };
    }
    case 'taper': {
      const bx = q.bx, by = q.by, bz = q.bz, r = q.r, tp = q.taper;
      return (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        const a = r00 * px + r10 * py + r20 * pz, b = r01 * px + r11 * py + r21 * pz, c = r02 * px + r12 * py + r22 * pz;
        let t = (b + by) / (2 * by); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const s = 1 - tp * t;
        const qx = abs(a / s) - bx + r, qy = abs(b) - by + r, qz = abs(c) - bz + r;
        const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
        const m = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz);
        return (sqrt(mx * mx + my * my + mz * mz) + (m < 0 ? m : 0) - r) * (s < 1 ? s : 1);
      };
    }
    case 'cone': {
      const r1 = q.r1, r2 = q.r2, h = q.h;
      const bb = (r1 - r2) / h, aa = sqrt(max(1 - bb * bb, 0)), ah = aa * h;
      return (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        const a = r00 * px + r10 * py + r20 * pz, b = r01 * px + r11 * py + r21 * pz, c = r02 * px + r12 * py + r22 * pz;
        const qx = sqrt(a * a + c * c);
        const k = qx * -bb + b * aa;
        if (k < 0) return sqrt(qx * qx + b * b) - r1;
        if (k > ah) { const dy = b - h; return sqrt(qx * qx + dy * dy) - r2; }
        return qx * aa + b * bb - r1;
      };
    }
    case 'torus': {
      const RR = q.R, r = q.r;
      return (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        const a = r00 * px + r10 * py + r20 * pz, b = r01 * px + r11 * py + r21 * pz, c = r02 * px + r12 * py + r22 * pz;
        const qx = sqrt(a * a + c * c) - RR;
        return sqrt(qx * qx + b * b) - r;
      };
    }
    case 'cyl': {
      const r = q.r, h = q.h, rr = q.rr;
      return (x, y, z) => {
        const px = x - cx, py = y - cy, pz = z - cz;
        const a = r00 * px + r10 * py + r20 * pz, b = r01 * px + r11 * py + r21 * pz, c = r02 * px + r12 * py + r22 * pz;
        const dx = sqrt(a * a + c * c) - r + rr, dy = abs(b) - h + rr;
        const m = dx > dy ? dx : dy;
        const ex = dx > 0 ? dx : 0, ey = dy > 0 ? dy : 0;
        return (m < 0 ? m : 0) + sqrt(ex * ex + ey * ey) - rr;
      };
    }
    default: return prim._f;
  }
}
const pf = prim => prim._ff || (prim._ff = primFn(prim));

// ── Thresholded field ──
// f(x, y, z, T): exact when the true value is <= T, otherwise any value > T.
function field(node) {
  if (node.t === 'prim') return pf(node);
  if (node.t === 'deform') {
    const cf = field(node.child);
    const p = node.p;
    switch (node.kind) {
      case 'mirror': return (x, y, z, T) => cf(x < 0 ? -x : x, y, z, T);
      case 'round': return (x, y, z, T) => cf(x, y, z, T + p.r) - p.r;
      case 'shell': return (x, y, z, T) => abs(cf(x, y, z, T + p.t)) - p.t;
      case 'displace': {
        const { amp, freq, oct, seed } = p;
        const safe = 1 / (1 + amp * freq * 1.5);
        return (x, y, z, T) => {
          const lim = T / safe + amp;
          const d = cf(x, y, z, lim);
          if (d > lim) return max(d * safe, T + 1e-3);
          return (d + amp * fbm(x * freq + seed, y * freq + seed * 1.7, z * freq - seed, oct)) * safe;
        };
      }
      case 'twist': {
        const [cx, , cz] = p.center;
        return (x, y, z) => {
          const a = p.rate * y, c = Math.cos(a), s = Math.sin(a);
          const px = x - cx, pz = z - cz;
          return cf(c * px - s * pz + cx, y, s * px + c * pz + cz, 1e9);
        };
      }
      case 'bend': {
        const [cx, cy] = p.center;
        return (x, y, z) => {
          const a = p.rate * (x - cx), c = Math.cos(a), s = Math.sin(a);
          const px = x - cx, py = y - cy;
          return cf(c * px - s * py + cx, s * px + c * py + cy, z, 1e9);
        };
      }
      default: throw new Error('unknown deform ' + node.kind);
    }
  }
  const k = node.k;
  const kids = node.children;
  if (node.op === 'union') {
    const n = kids.length;
    const fs = kids.map(field);
    const bs = kids.map(bounds);
    const cx = new Float64Array(bs.map(b => b.c[0])), cy = new Float64Array(bs.map(b => b.c[1])), cz = new Float64Array(bs.map(b => b.c[2]));
    const rr = new Float64Array(bs.map(b => b.r));
    const mm = bs.map(b => !!b.m);
    return (x, y, z, T) => {
      let d = 1e9;
      const ax = x < 0 ? -x : x;
      for (let i = 0; i < n; i++) {
        const dx = (mm[i] ? ax : x) - cx[i], dy = y - cy[i], dz = z - cz[i];
        const lim = (d < T ? d : T) + k;
        if (sqrt(dx * dx + dy * dy + dz * dz) - rr[i] > lim) continue;
        const di = fs[i](x, y, z, lim);
        if (k <= 0) { if (di < d) d = di; } else {
          const h = k - abs(d - di);
          d = (d < di ? d : di) - (h > 0 ? h * h * 0.25 / k : 0);
        }
      }
      return d;
    };
  }
  if (node.op === 'sub') {
    const base = field(kids[0]);
    const cut = kids.slice(1);
    const fs = cut.map(field), bs = cut.map(bounds);
    const n = cut.length;
    return (x, y, z, T) => {
      let d = base(x, y, z, T);
      if (d > T) return d;
      const ax = x < 0 ? -x : x;
      for (let i = 0; i < n; i++) {
        const b = bs[i];
        const dx = (b.m ? ax : x) - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
        const lim = k - d;
        if (sqrt(dx * dx + dy * dy + dz * dz) - b.r > lim) continue;
        const c = -fs[i](x, y, z, lim);
        // smax(d, c, k)
        if (k <= 0) { if (c > d) d = c; } else {
          const h = k - abs(d - c);
          d = (d > c ? d : c) + (h > 0 ? h * h * 0.25 / k : 0);
        }
      }
      return d;
    };
  }
  const fs = kids.map(field);
  return (x, y, z, T) => {
    let d = -1e9;
    for (const f of fs) {
      const c = f(x, y, z, T);
      if (k <= 0) { if (c > d) d = c; } else {
        const h = k - abs(d - c);
        d = (d > c ? d : c) + (h > 0 ? h * h * 0.25 / k : 0);
      }
      if (d > T) return d;
    }
    return d;
  };
}

// ── Owner (which leaf paints the surface here), matching compileFull ──
// Returns the node's exact value; the owning leaf is left in OWN/OWNMX.
// A union child beyond (fold + k) can neither win the argmin nor change the
// smooth fold, so the same culling as the field applies.
let OWN = null, OWNMX = false;
function owner(node) {
  if (node.t === 'prim') {
    const f = pf(node);
    return (x, y, z) => { OWN = node; OWNMX = false; return f(x, y, z); };
  }
  if (node.t === 'deform') {
    const inner = owner(node.child);
    const p = node.p;
    switch (node.kind) {
      case 'mirror': return (x, y, z) => { const d = inner(x < 0 ? -x : x, y, z); OWNMX = x < 0; return d; };
      case 'round': return (x, y, z) => inner(x, y, z) - p.r;
      case 'shell': return (x, y, z) => abs(inner(x, y, z)) - p.t;
      case 'displace': {
        const { amp, freq, oct, seed } = p;
        const safe = 1 / (1 + amp * freq * 1.5);
        return (x, y, z) => (inner(x, y, z) + amp * fbm(x * freq + seed, y * freq + seed * 1.7, z * freq - seed, oct)) * safe;
      }
      default: {
        const df = field(node);
        return (x, y, z) => { inner(x, y, z); return df(x, y, z, 1e9); };
      }
    }
  }
  const kids = node.children;
  const k = node.k;
  if (node.op === 'union') {
    const fs = kids.map(owner);
    const bs = kids.map(bounds);
    const n = kids.length;
    return (x, y, z) => {
      let d = 1e9, best = 1e9, bl = null, bm = false;
      const ax = x < 0 ? -x : x;
      for (let i = 0; i < n; i++) {
        const b = bs[i];
        const dx = (b.m ? ax : x) - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
        if (sqrt(dx * dx + dy * dy + dz * dz) - b.r > d + k) continue;
        const di = fs[i](x, y, z);
        if (di < best) { best = di; bl = OWN; bm = OWNMX; }
        if (k <= 0) { if (di < d) d = di; } else {
          const h = k - abs(d - di);
          d = (d < di ? d : di) - (h > 0 ? h * h * 0.25 / k : 0);
        }
      }
      OWN = bl; OWNMX = bm;
      return d;
    };
  }
  if (node.op === 'sub') {
    const base = owner(kids[0]);
    const cut = kids.slice(1).map(owner);
    const bs = kids.slice(1).map(bounds);
    const paintCut = node.paintCut;
    return (x, y, z) => {
      let d = base(x, y, z);
      let leaf = OWN, lm = OWNMX;
      const ax = x < 0 ? -x : x;
      for (let i = 0; i < cut.length; i++) {
        const b = bs[i];
        const dx = (b.m ? ax : x) - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
        if (sqrt(dx * dx + dy * dy + dz * dz) - b.r > k - d) continue;
        const cd = cut[i](x, y, z);
        if (paintCut && -cd > d - k * 0.25) { leaf = OWN; lm = OWNMX; }
        const c = -cd;
        if (k <= 0) { if (c > d) d = c; } else {
          const h = k - abs(d - c);
          d = (d > c ? d : c) + (h > 0 ? h * h * 0.25 / k : 0);
        }
      }
      OWN = leaf; OWNMX = lm;
      return d;
    };
  }
  const fs = kids.map(owner);
  return (x, y, z) => {
    let d = -1e9, first = null, fm = false;
    for (const f of fs) {
      const c = f(x, y, z);
      if (!first) { first = OWN; fm = OWNMX; }
      if (k <= 0) { if (c > d) d = c; } else {
        const h = k - abs(d - c);
        d = (d > c ? d : c) + (h > 0 ? h * h * 0.25 / k : 0);
      }
    }
    OWN = first; OWNMX = fm;
    return d;
  };
}

export function meshFast(root, opts = {}) {
  const {
    cell = 0.02,
    aoStep = 0.03, aoStrength = 1.0, aoMin = 0.35,
    tau = 0.035,
    bones = null,
    colorNoise = 0.02,
    noiseScale = 9,
    refine = 2,
  } = opts;

  markMirrored(root);
  const model = compile(root); // sets leaf._f and the AABB
  const F = field(root);
  const { lo, hi } = model.bounds;
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 2;
  const ny = Math.ceil((hi[1] - lo[1]) / cell) + 2;
  const nz = Math.ceil((hi[2] - lo[2]) / cell) + 2;
  const ox = lo[0], oy = lo[1], oz = lo[2];
  const sy = nx, sz = nx * ny;
  const grid = new Float32Array(nx * ny * nz).fill(NaN);

  // coarse pass
  const B = 4;
  const bnx = Math.ceil((nx - 1) / B), bny = Math.ceil((ny - 1) / B), bnz = Math.ceil((nz - 1) / B);
  const halfDiag = (B * cell * sqrt(3)) / 2;
  const Tc = halfDiag * 1.5 + cell;
  const blocks = [];
  for (let bk = 0; bk < bnz; bk++) for (let bj = 0; bj < bny; bj++) for (let bi = 0; bi < bnx; bi++) {
    const d = F(ox + (bi * B + B / 2) * cell, oy + (bj * B + B / 2) * cell, oz + (bk * B + B / 2) * cell, Tc);
    if (abs(d) < Tc) blocks.push(bi, bj, bk);
  }
  const nb = blocks.length / 3;

  // fine pass
  const Tg = cell * 2.5;
  for (let q = 0; q < nb; q++) {
    const bi = blocks[q * 3], bj = blocks[q * 3 + 1], bk = blocks[q * 3 + 2];
    const i1 = min(bi * B + B, nx - 1), j1 = min(bj * B + B, ny - 1), k1 = min(bk * B + B, nz - 1);
    for (let k = bk * B; k <= k1; k++) for (let j = bj * B; j <= j1; j++) for (let i = bi * B; i <= i1; i++) {
      const idx = i + j * sy + k * sz;
      if (grid[idx] !== grid[idx]) grid[idx] = F(ox + i * cell, oy + j * cell, oz + k * cell, Tg);
    }
  }

  // surface nets vertices
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  let pos = new Float32Array(4096 * 3);
  let nv = 0;
  let cwv = new Int32Array(4096 * 3);
  const CO = [0, 1, sy, 1 + sy, sz, 1 + sz, sy + sz, 1 + sy + sz];
  const COX = [0, 1, 0, 1, 0, 1, 0, 1], COY = [0, 0, 1, 1, 0, 0, 1, 1], COZ = [0, 0, 0, 0, 1, 1, 1, 1];
  const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
  const vals = new Float64Array(8);
  for (let q = 0; q < nb; q++) {
    const bi = blocks[q * 3], bj = blocks[q * 3 + 1], bk = blocks[q * 3 + 2];
    const i1 = min(bi * B + B, nx - 1), j1 = min(bj * B + B, ny - 1), k1 = min(bk * B + B, nz - 1);
    for (let k = bk * B; k < k1; k++) for (let j = bj * B; j < j1; j++) for (let i = bi * B; i < i1; i++) {
      const base = i + j * sy + k * sz;
      if (cellVert[base] !== -1) continue;
      let mask = 0, ok = true;
      for (let c = 0; c < 8; c++) {
        const v = grid[base + CO[c]];
        if (v !== v) { ok = false; break; }
        vals[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (!ok || mask === 0 || mask === 255) continue;
      let px = 0, py = 0, pz = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const a = EA[e], b = EB[e];
        const va = vals[a], vb = vals[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        px += COX[a] + (COX[b] - COX[a]) * t;
        py += COY[a] + (COY[b] - COY[a]) * t;
        pz += COZ[a] + (COZ[b] - COZ[a]) * t;
        n++;
      }
      if (nv * 3 + 3 > pos.length) { const p2 = new Float32Array(pos.length * 2); p2.set(pos); pos = p2; const c2 = new Int32Array(cwv.length * 2); c2.set(cwv); cwv = c2; }
      cellVert[base] = nv;
      pos[nv * 3] = ox + (i + px / n) * cell; pos[nv * 3 + 1] = oy + (j + py / n) * cell; pos[nv * 3 + 2] = oz + (k + pz / n) * cell;
      cwv[nv * 3] = i; cwv[nv * 3 + 1] = j; cwv[nv * 3 + 2] = k;
      nv++;
    }
  }

  // faces
  let idx = new Uint32Array(nv * 6 + 16);
  let ni = 0;
  const V = (i, j, k) => (i < 0 || j < 0 || k < 0 ? -1 : cellVert[i + j * sy + k * sz]);
  const dist2 = (a, b) => { const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (inside, q0, q1, q2, q3) => {
    if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) return;
    let a = q0, b = q1, c = q2, d = q3;
    if (!inside) { b = q3; d = q1; }
    if (ni + 6 > idx.length) { const i2 = new Uint32Array(idx.length * 2); i2.set(idx); idx = i2; }
    if (dist2(a, c) <= dist2(b, d)) { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = d; idx[ni++] = b; idx[ni++] = c; idx[ni++] = d; }
  };
  for (let v = 0; v < nv; v++) {
    const i = cwv[v * 3], j = cwv[v * 3 + 1], k = cwv[v * 3 + 2];
    const g0 = grid[i + j * sy + k * sz];
    const inside = g0 < 0;
    let g1 = grid[i + 1 + j * sy + k * sz];
    if (g1 === g1 && (g1 < 0) !== inside) quad(inside, V(i, j, k), V(i, j - 1, k), V(i, j - 1, k - 1), V(i, j, k - 1));
    g1 = grid[i + (j + 1) * sy + k * sz];
    if (g1 === g1 && (g1 < 0) !== inside) quad(inside, V(i, j, k), V(i, j, k - 1), V(i - 1, j, k - 1), V(i - 1, j, k));
    g1 = grid[i + j * sy + (k + 1) * sz];
    if (g1 === g1 && (g1 < 0) !== inside) quad(inside, V(i, j, k), V(i - 1, j, k), V(i - 1, j - 1, k), V(i, j - 1, k));
  }

  const P = pos.subarray(0, nv * 3).slice();
  const N = new Float32Array(nv * 3);

  // project onto the surface, gradient normals
  const e = cell * 0.35;
  const Tp = cell * 3;
  const g = [0, 0, 0];
  const grad = (x, y, z) => {
    const a = F(x + e, y - e, z - e, Tp), b = F(x - e, y - e, z + e, Tp), c = F(x - e, y + e, z - e, Tp), d = F(x + e, y + e, z + e, Tp);
    const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
    const l = Math.hypot(gx, gy, gz) || 1;
    g[0] = gx / l; g[1] = gy / l; g[2] = gz / l;
  };
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const x0 = x, y0 = y, z0 = z;
    for (let r = 0; r < refine; r++) {
      const d = F(x, y, z, Tp);
      grad(x, y, z);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    const dx = x - x0, dy = y - y0, dz = z - z0, m = Math.hypot(dx, dy, dz);
    if (m > cell) { const s = cell / m; x = x0 + dx * s; y = y0 + dy * s; z = z0 + dz * s; }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    grad(x, y, z);
    N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2];
  }
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  for (let t = 0; t < ni; t += 3) {
    const a = idx[t]; let b = idx[t + 1], c = idx[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const fxn = uy * wz - uz * wy, fyn = uz * wx - ux * wz, fzn = ux * wy - uy * wx;
    const nx0 = N[a * 3] + N[b * 3] + N[c * 3], ny0 = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz0 = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fxn * nx0 + fyn * ny0 + fzn * nz0 < 0) { const s = b; b = c; c = s; }
    index[t] = a; index[t + 1] = b; index[t + 2] = c;
  }

  // paint, AO, surface params
  const OWNF = owner(root);
  const C = new Float32Array(nv * 3);
  const SURF = new Float32Array(nv * 2);
  const AO = new Float32Array(nv);
  const ownLeaf = new Array(nv), ownMx = new Uint8Array(nv);
  const blend = model.leaves.filter(l => l._paint && !l._cutter);
  const nbl = blend.length;
  const blb = blend.map(l => primBounds(l));
  const blf = blend.map(pf);
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const nx0 = N[v * 3], ny0 = N[v * 3 + 1], nz0 = N[v * 3 + 2];
    let occ = 0, w = 1;
    for (let s = 1; s <= 5; s++) {
      const h = aoStep * s;
      occ += w * max(0, h - F(x + nx0 * h, y + ny0 * h, z + nz0 * h, h)) / h;
      w *= 0.6;
    }
    const ao = max(aoMin, 1 - aoStrength * occ * 0.42);
    AO[v] = ao;
    OWNF(x, y, z);
    const leaf = OWN;
    ownLeaf[v] = leaf; ownMx[v] = OWNMX ? 1 : 0;
    const paint = resolvePaint(leaf, x, y, z, nx0, ny0, nz0, cell);
    let col = paint.color, gloss = paint.gloss ?? 0.3, emi = paint.emissive ?? 0;
    if (!leaf._hardEdge) {
      const ax = abs(x);
      const dOwn = pf(leaf)(leaf._mirror ? ax : x, y, z);
      const reach = dOwn + cell * 0.9;
      let best = null, bestD = 1e9;
      for (let i = 0; i < nbl; i++) {
        const l = blend[i];
        if (l === leaf || l._paint === leaf._paint) continue;
        const b = blb[i];
        const px = l._mirror ? ax : x;
        const dx = px - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
        const lb = sqrt(dx * dx + dy * dy + dz * dz) - b.r;
        if (lb >= bestD || lb > reach) continue;
        const d = blf[i](px, y, z);
        if (d < bestD) { bestD = d; best = l; }
      }
      if (best) {
        const gap = bestD - dOwn;
        const wgt = 0.5 * (1 - smooth01(gap / (cell * 0.9)));
        if (wgt > 0.002) {
          const p2 = resolvePaint(best, x, y, z, nx0, ny0, nz0, cell);
          col = [col[0] + (p2.color[0] - col[0]) * wgt, col[1] + (p2.color[1] - col[1]) * wgt, col[2] + (p2.color[2] - col[2]) * wgt];
          gloss += ((p2.gloss ?? 0.3) - gloss) * wgt;
          emi += ((p2.emissive ?? 0) - emi) * wgt;
        }
      }
    }
    const jitter = 1 + colorNoise * vnoise(x * noiseScale, y * noiseScale, z * noiseScale);
    const lit = emi > 0.01 ? 0.6 + 0.4 * ao : ao;
    for (let ch = 0; ch < 3; ch++) C[v * 3 + ch] = srgbToLinear(min(1, col[ch] * (emi > 0.01 ? 1 : jitter))) * lit;
    SURF[v * 2] = gloss;
    SURF[v * 2 + 1] = emi;
  }

  const out = { position: P, normal: N, color: C, surf: SURF, ao: AO, index, bounds: model.bounds };

  // skin weights
  if (bones) {
    const boneIndex = new Map(bones.map((b, i) => [b, i]));
    const swap = name => (name.endsWith('.L') ? name.slice(0, -2) + '.R' : name.endsWith('.R') ? name.slice(0, -2) + '.L' : name);
    const leaves = model.leaves.filter(l => l._bone && l._weight > 0);
    const nl = leaves.length;
    const lbi = new Int32Array(nl), lbiM = new Int32Array(nl);
    const lgrp = leaves.map(l => l._group || 'body');
    const lb = leaves.map(l => primBounds(l));
    const lf = leaves.map(pf);
    leaves.forEach((l, i) => { lbi[i] = boneIndex.get(l._bone) ?? -1; lbiM[i] = boneIndex.get(swap(l._bone)) ?? -1; });
    const reach = tau * Math.log(1e4 * max(1, ...leaves.map(l => l._weight))) + 1e-6;
    const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
    const acc = new Float64Array(bones.length);
    const touched = new Int32Array(bones.length);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const ax = abs(x);
      const own = ownLeaf[v];
      let nt = 0;
      if (own._rigid && own._bone) {
        const name = ownMx[v] ? swap(own._bone) : own._bone;
        const bi = boneIndex.get(name) ?? 0;
        acc[bi] = 1; touched[nt++] = bi;
      } else {
        const grp = own._group || 'body';
        for (let i = 0; i < nl; i++) {
          if (lgrp[i] !== grp) continue;
          const l = leaves[i];
          const px = l._mirror ? ax : x;
          const b = lb[i];
          const dx = px - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
          if (sqrt(dx * dx + dy * dy + dz * dz) - b.r > reach) continue;
          const d = lf[i](px, y, z);
          const wgt = l._weight * Math.exp(-max(d, 0) / tau);
          if (wgt < 1e-4) continue;
          const bi = l._mirror && x < 0 ? lbiM[i] : lbi[i];
          if (bi < 0) continue;
          if (acc[bi] === 0) touched[nt++] = bi;
          acc[bi] += wgt;
        }
      }
      // top 4
      let sum = 0;
      for (let s = 0; s < 4; s++) {
        let bestB = -1, bestW = 0;
        for (let q = 0; q < nt; q++) { const bi = touched[q]; if (acc[bi] > bestW) { bestW = acc[bi]; bestB = bi; } }
        if (bestB < 0) { SI[v * 4 + s] = 0; SW[v * 4 + s] = 0; continue; }
        SI[v * 4 + s] = bestB; SW[v * 4 + s] = bestW; sum += bestW;
        acc[bestB] = -acc[bestB];
      }
      for (let q = 0; q < nt; q++) acc[touched[q]] = 0;
      if (sum > 0) for (let s = 0; s < 4; s++) SW[v * 4 + s] /= sum;
      else SW[v * 4] = 1;
    }
    out.skinIndex = SI;
    out.skinWeight = SW;
  }
  out.stats = { verts: nv, tris: ni / 3, grid: [nx, ny, nz], blocks: nb };
  return out;
}

function resolvePaint(leaf, x, y, z, nx, ny, nz, cell) {
  let p = leaf._paint || { color: [1, 0, 1], gloss: 0, emissive: 0 };
  if (typeof p === 'function') p = p(x, y, z, leaf, nx, ny, nz, cell);
  return p;
}

// Drop-in alias with engine/mesher.js's signature: meshSDF(root, opts) →
// { position, normal, color, surf, ao, index, bounds, skinIndex?, skinWeight?, stats }.
export { meshFast as meshSDF };
