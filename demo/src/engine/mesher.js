// Turns an SDF model into a game mesh.
//
// Sparse surface nets: a coarse pass finds the blocks that contain surface,
// only those get the fine grid. Each vertex is projected back onto the true
// surface, so shapes stay smooth. Normals come from the field's gradient,
// ambient occlusion is read straight from the field (cheap, soft and
// correct in creases), and skin weights come from each part's distance.
//
// Output is plain typed arrays so this can run in a worker or in Node.

import { compile, vnoise } from './sdf.js';

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function markMirrored(node, under = false, cutter = false) {
  if (node.t === 'prim') { node._mirror = under; node._cutter = cutter; return; }
  if (node.t === 'deform') { markMirrored(node.child, under || node.kind === 'mirror', cutter); return; }
  node.children.forEach((c, i) => markMirrored(c, under, cutter || (node.op === 'sub' && i > 0)));
}

export function meshSDF(root, opts = {}) {
  const {
    cell = 0.02,
    aoStep = 0.03, aoStrength = 1.0, aoMin = 0.35,
    tau = 0.035, // skin weight falloff (meters)
    bones = null, // array of bone names; enables skinning attributes
    colorNoise = 0.02,
    noiseScale = 9,
    refine = 2,
  } = opts;

  markMirrored(root);
  const model = compile(root);
  const D = model.d;
  const { lo, hi } = model.bounds;
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 2;
  const ny = Math.ceil((hi[1] - lo[1]) / cell) + 2;
  const nz = Math.ceil((hi[2] - lo[2]) / cell) + 2;
  const ox = lo[0], oy = lo[1], oz = lo[2];
  const sx = 1, sy = nx, sz = nx * ny;
  const grid = new Float32Array(nx * ny * nz).fill(NaN);

  // ── Coarse pass: which blocks can contain surface? ──
  const B = 4;
  const bnx = Math.ceil((nx - 1) / B), bny = Math.ceil((ny - 1) / B), bnz = Math.ceil((nz - 1) / B);
  const halfDiag = (B * cell * Math.sqrt(3)) / 2;
  const blocks = [];
  for (let bk = 0; bk < bnz; bk++) for (let bj = 0; bj < bny; bj++) for (let bi = 0; bi < bnx; bi++) {
    const cxw = ox + (bi * B + B / 2) * cell, cyw = oy + (bj * B + B / 2) * cell, czw = oz + (bk * B + B / 2) * cell;
    if (Math.abs(D(cxw, cyw, czw)) < halfDiag * 1.5 + cell) blocks.push([bi, bj, bk]);
  }

  // ── Fine pass over flagged blocks ──
  const at = (i, j, k) => i * sx + j * sy + k * sz;
  for (const [bi, bj, bk] of blocks) {
    const i1 = Math.min(bi * B + B, nx - 1), j1 = Math.min(bj * B + B, ny - 1), k1 = Math.min(bk * B + B, nz - 1);
    for (let k = bk * B; k <= k1; k++) for (let j = bj * B; j <= j1; j++) for (let i = bi * B; i <= i1; i++) {
      const idx = at(i, j, k);
      if (Number.isNaN(grid[idx])) grid[idx] = D(ox + i * cell, oy + j * cell, oz + k * cell);
    }
  }

  // ── Surface nets vertices ──
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const cornerOff = [];
  for (let c = 0; c < 8; c++) cornerOff.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cellsWithVerts = [];
  const vals = new Float32Array(8);
  for (const [bi, bj, bk] of blocks) {
    const i1 = Math.min(bi * B + B, nx - 1), j1 = Math.min(bj * B + B, ny - 1), k1 = Math.min(bk * B + B, nz - 1);
    for (let k = bk * B; k < k1; k++) for (let j = bj * B; j < j1; j++) for (let i = bi * B; i < i1; i++) {
      const base = at(i, j, k);
      if (cellVert[base] !== -1) continue;
      let mask = 0, ok = true;
      for (let c = 0; c < 8; c++) {
        const o = cornerOff[c];
        const v = grid[at(i + o[0], j + o[1], k + o[2])];
        if (Number.isNaN(v)) { ok = false; break; }
        vals[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (!ok || mask === 0 || mask === 255) continue;
      let px = 0, py = 0, pz = 0, n = 0;
      for (const [a, b] of edges) {
        const va = vals[a], vb = vals[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        const oa = cornerOff[a], ob = cornerOff[b];
        px += oa[0] + (ob[0] - oa[0]) * t;
        py += oa[1] + (ob[1] - oa[1]) * t;
        pz += oa[2] + (ob[2] - oa[2]) * t;
        n++;
      }
      cellVert[base] = pos.length / 3;
      pos.push(ox + (i + px / n) * cell, oy + (j + py / n) * cell, oz + (k + pz / n) * cell);
      cellsWithVerts.push(i, j, k);
    }
  }

  // ── Faces ──
  const idx = [];
  const V = (i, j, k) => (i < 0 || j < 0 || k < 0 ? -1 : cellVert[at(i, j, k)]);
  for (let c = 0; c < cellsWithVerts.length; c += 3) {
    const i = cellsWithVerts[c], j = cellsWithVerts[c + 1], k = cellsWithVerts[c + 2];
    const g0 = grid[at(i, j, k)];
    const inside = g0 < 0;
    // edge along x from (i,j,k): cells (i,j,k),(i,j-1,k),(i,j-1,k-1),(i,j,k-1)
    const tests = [
      [grid[at(i + 1, j, k)], [V(i, j, k), V(i, j - 1, k), V(i, j - 1, k - 1), V(i, j, k - 1)]],
      [grid[at(i, j + 1, k)], [V(i, j, k), V(i, j, k - 1), V(i - 1, j, k - 1), V(i - 1, j, k)]],
      [grid[at(i, j, k + 1)], [V(i, j, k), V(i - 1, j, k), V(i - 1, j - 1, k), V(i, j - 1, k)]],
    ];
    for (const [g1, q] of tests) {
      if (Number.isNaN(g1) || (g1 < 0) === inside) continue;
      if (q[0] < 0 || q[1] < 0 || q[2] < 0 || q[3] < 0) continue;
      const [a, b, cc, d] = inside ? q : [q[0], q[3], q[2], q[1]];
      // split along the shorter diagonal
      const dac = dist2(pos, a, cc), dbd = dist2(pos, b, d);
      if (dac <= dbd) idx.push(a, b, cc, a, cc, d);
      else idx.push(a, b, d, b, cc, d);
    }
  }

  const nv = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(nv * 3);

  // ── Project vertices onto the surface, then take gradient normals ──
  const e = cell * 0.35;
  const grad = (x, y, z, out) => {
    const a = D(x + e, y - e, z - e), b = D(x - e, y - e, z + e), c = D(x - e, y + e, z - e), d = D(x + e, y + e, z + e);
    let gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
    const l = Math.hypot(gx, gy, gz) || 1;
    out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
  };
  const g = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const x0 = x, y0 = y, z0 = z;
    for (let r = 0; r < refine; r++) {
      const d = D(x, y, z);
      grad(x, y, z, g);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    // never wander more than a cell (thin parts, sharp creases)
    const dx = x - x0, dy = y - y0, dz = z - z0, m = Math.hypot(dx, dy, dz);
    if (m > cell) { const s = cell / m; x = x0 + dx * s; y = y0 + dy * s; z = z0 + dz * s; }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    grad(x, y, z, g);
    N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2];
  }

  // Fix any triangle whose winding disagrees with the field normal.
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const nx0 = N[a * 3] + N[b * 3] + N[c * 3], ny0 = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz0 = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * nx0 + fy * ny0 + fz * nz0 < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }

  // ── Paint, AO, surface params ──
  const C = new Float32Array(nv * 3);
  const SURF = new Float32Array(nv * 2); // gloss, emissive
  const AO = new Float32Array(nv);
  const owners = new Array(nv);
  // union leaves that take part in paint blending (cutters with paintCut keep hard edges)
  const blendLeaves = model.leaves.filter(l => l._paint && !l._cutter);
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const nx0 = N[v * 3], ny0 = N[v * 3 + 1], nz0 = N[v * 3 + 2];
    let occ = 0, w = 1;
    for (let s = 1; s <= 5; s++) {
      const h = aoStep * s;
      occ += w * Math.max(0, h - D(x + nx0 * h, y + ny0 * h, z + nz0 * h)) / h;
      w *= 0.6;
    }
    const ao = Math.max(aoMin, 1 - aoStrength * occ * 0.42);
    AO[v] = ao;
    const r = model.full(x, y, z);
    owners[v] = r;
    const paint = resolvePaint(r.leaf, x, y, z, nx0, ny0, nz0, cell);
    // Soften the boundary with the nearest differently-painted part so
    // material edges follow the true surface instead of the triangle grid.
    let col = paint.color, gloss = paint.gloss ?? 0.3, emi = paint.emissive ?? 0;
    if (!r.leaf._hardEdge) {
      const dOwn = r.leaf._f(r.leaf._mirror ? Math.abs(x) : x, y, z);
      let best = null, bestD = 1e9;
      for (const l of blendLeaves) {
        if (l === r.leaf || l._paint === r.leaf._paint) continue;
        const d = l._f(l._mirror ? Math.abs(x) : x, y, z);
        if (d < bestD) { bestD = d; best = l; }
      }
      if (best) {
        const gap = bestD - dOwn;
        const w = 0.5 * (1 - smooth01(gap / (cell * 0.9)));
        if (w > 0.002) {
          const p2 = resolvePaint(best, x, y, z, nx0, ny0, nz0, cell);
          col = [col[0] + (p2.color[0] - col[0]) * w, col[1] + (p2.color[1] - col[1]) * w, col[2] + (p2.color[2] - col[2]) * w];
          gloss += ((p2.gloss ?? 0.3) - gloss) * w;
          emi += ((p2.emissive ?? 0) - emi) * w;
        }
      }
    }
    const jitter = 1 + colorNoise * vnoise(x * noiseScale, y * noiseScale, z * noiseScale);
    const lit = emi > 0.01 ? 0.6 + 0.4 * ao : ao;
    for (let ch = 0; ch < 3; ch++) C[v * 3 + ch] = srgbToLinear(Math.min(1, col[ch] * (emi > 0.01 ? 1 : jitter))) * lit;
    SURF[v * 2] = gloss;
    SURF[v * 2 + 1] = emi;
  }

  const out = { position: P, normal: N, color: C, surf: SURF, ao: AO, index: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), bounds: model.bounds };

  // ── Skin weights ──
  if (bones) {
    const boneIndex = new Map(bones.map((b, i) => [b, i]));
    const swap = name => (name.endsWith('.L') ? name.slice(0, -2) + '.R' : name.endsWith('.R') ? name.slice(0, -2) + '.L' : name);
    const leaves = model.leaves.filter(l => l._bone && l._weight > 0);
    const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
    const acc = new Float64Array(bones.length);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      acc.fill(0);
      const own = owners[v];
      if (own.leaf._rigid && own.leaf._bone) {
        const name = own.mx ? swap(own.leaf._bone) : own.leaf._bone;
        acc[boneIndex.get(name) ?? 0] = 1;
      } else {
        const grp = own.leaf._group || 'body';
        for (const l of leaves) {
          if ((l._group || 'body') !== grp) continue;
          const mirroredSide = l._mirror && x < 0;
          const d = l._f(l._mirror ? Math.abs(x) : x, y, z);
          const wgt = l._weight * Math.exp(-Math.max(d, 0) / tau);
          if (wgt < 1e-4) continue;
          const name = mirroredSide ? swap(l._bone) : l._bone;
          const bi = boneIndex.get(name);
          if (bi === undefined) continue;
          acc[bi] += wgt;
        }
      }
      // top 4
      const top = [];
      for (let b = 0; b < acc.length; b++) if (acc[b] > 0) top.push([acc[b], b]);
      top.sort((p, q) => q[0] - p[0]);
      const pick = top.slice(0, 4);
      let sum = pick.reduce((s, p) => s + p[0], 0) || 1;
      for (let i = 0; i < 4; i++) {
        SI[v * 4 + i] = pick[i] ? pick[i][1] : 0;
        SW[v * 4 + i] = pick[i] ? pick[i][0] / sum : 0;
      }
      if (!pick.length) SW[v * 4] = 1;
    }
    out.skinIndex = SI;
    out.skinWeight = SW;
  }
  out.stats = { verts: nv, tris: idx.length / 3, grid: [nx, ny, nz], blocks: blocks.length };
  return out;
}

const smooth01 = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function resolvePaint(leaf, x, y, z, nx, ny, nz, cell) {
  let p = leaf._paint || { color: [1, 0, 1], gloss: 0, emissive: 0 };
  if (typeof p === 'function') p = p(x, y, z, leaf, nx, ny, nz, cell);
  return p;
}

function dist2(pos, a, b) {
  const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}
