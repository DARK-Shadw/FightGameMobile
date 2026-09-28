// Sculpting with signed distance fields.
//
// A model is a tree: leaves are primitives (with a transform, a paint and a
// bone), inner nodes are smooth boolean ops. Smooth unions melt parts into
// each other the way clay does, which is what gives the characters their
// soft, toy-like silhouettes instead of looking like stitched primitives.
//
// Pure math, no three.js: this runs in workers and in Node for baking.

const { sqrt, abs, max, min, cos, sin, floor } = Math;

// ── Tiny vector helpers ──────────────────────────────────────────────────
const len3 = (x, y, z) => sqrt(x * x + y * y + z * z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function rotMatrix(rx = 0, ry = 0, rz = 0) {
  // R = Rz * Ry * Rx (row-major 3x3)
  const cx = cos(rx), sx = sin(rx), cy = cos(ry), sy = sin(ry), cz = cos(rz), sz = sin(rz);
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

// Rotation that takes +Y onto direction d (used for oriented primitives).
function alignY(dx, dy, dz) {
  const l = len3(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  // axis = y × d, angle = acos(dy)
  let ax = dz, ay = 0, az = -dx;
  const s = sqrt(ax * ax + az * az);
  if (s < 1e-6) return dy > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, -1, 0, 0, 0, -1];
  ax /= s; az /= s;
  const c = dy, t = 1 - c, sn = s;
  return [
    t * ax * ax + c, t * ax * ay - sn * az, t * ax * az + sn * ay,
    t * ax * ay + sn * az, t * ay * ay + c, t * ay * az - sn * ax,
    t * ax * az - sn * ay, t * ay * az + sn * ax, t * az * az + c,
  ];
}

function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return o;
}

// ── Noise (for rocks, bark, lumpy clay) ──────────────────────────────────
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y, z) {
  const xi = floor(x), yi = floor(y), zi = floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const n000 = hash3(xi, yi, zi), n100 = hash3(xi + 1, yi, zi), n010 = hash3(xi, yi + 1, zi), n110 = hash3(xi + 1, yi + 1, zi);
  const n001 = hash3(xi, yi, zi + 1), n101 = hash3(xi + 1, yi, zi + 1), n011 = hash3(xi, yi + 1, zi + 1), n111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = n000 + (n100 - n000) * u, x10 = n010 + (n110 - n010) * u, x01 = n001 + (n101 - n001) * u, x11 = n011 + (n111 - n011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return (y0 + (y1 - y0) * w) * 2 - 1;
}
export function fbm(x, y, z, oct = 3) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

// ── Primitive distance functions (local space) ───────────────────────────
function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = len3(x / rx, y / ry, z / rz);
  const k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = abs(x) - bx + r, qy = abs(y) - by + r, qz = abs(z) - bz + r;
  return len3(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r;
}
// Round cone along +Y from (0,0,0) radius r1 to (0,h,0) radius r2.
function sdRoundCone(x, y, z, r1, r2, h) {
  const qx = sqrt(x * x + z * z), qy = y;
  const b = (r1 - r2) / h, a = sqrt(max(1 - b * b, 0));
  const k = qx * -b + qy * a; // dot(q, vec2(-b,a))
  if (k < 0) return len3(qx, qy, 0) - r1;
  if (k > a * h) return len3(qx, qy - h, 0) - r2;
  return qx * a + qy * b - r1;
}
function sdTorus(x, y, z, R, r) {
  const qx = sqrt(x * x + z * z) - R;
  return sqrt(qx * qx + y * y) - r;
}
function sdCyl(x, y, z, r, h, rr) {
  const dx = sqrt(x * x + z * z) - r + rr, dy = abs(y) - h + rr;
  return min(max(dx, dy), 0) + sqrt(max(dx, 0) ** 2 + max(dy, 0) ** 2) - rr;
}
// Wedge/prism-ish: a box whose top is pinched by `taper` (0 = box, 1 = ridge).
function sdTaperBox(x, y, z, bx, by, bz, taper, r) {
  const t = clamp((y + by) / (2 * by), 0, 1);
  const s = 1 - taper * t;
  return sdRoundBox(x / s, y, z, bx, by, bz, r) * min(1, s);
}

export const smin = (a, b, k) => {
  if (k <= 0) return min(a, b);
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

// ── Node construction ────────────────────────────────────────────────────
let NEXT_ID = 0;

class Node {
  constructor() { this.id = NEXT_ID++; }
  // Chainable metadata; applies to every leaf underneath.
  paint(p) { this.leaves().forEach(l => { if (l._paint === undefined || l._paintSoft) l._paint = p; }); return this; }
  over(p) { this.leaves().forEach(l => { l._paint = p; }); return this; }
  bone(b) { this.leaves().forEach(l => { if (!l._bone) l._bone = b; }); return this; }
  // rigid: this part is skinned 100% to its bone (no blending across joints)
  rigid() { this.leaves().forEach(l => { l._rigid = true; }); return this; }
  // weight: how strongly this leaf pulls skin weights (0 = ignored)
  weight(w) { this.leaves().forEach(l => { l._weight = w; }); return this; }
  // skin group: vertices only blend weights from leaves in their own group
  group(g) { this.leaves().forEach(l => { l._group = g; }); return this; }
  leaves() { return []; }
}

class Prim extends Node {
  constructor(kind, center, rot, params) {
    super();
    this.t = 'prim';
    this.kind = kind;
    this.c = center;
    this.R = rot || [1, 0, 0, 0, 1, 0, 0, 0, 1]; // local→world rotation
    this.p = params;
    this._weight = 1;
  }
  leaves() { return [this]; }
  rot(rx, ry, rz) { this.R = mul3(rotMatrix(rx, ry, rz), this.R); return this; }
  // conservative bounding radius around center
  get radius() {
    const p = this.p;
    switch (this.kind) {
      case 'sphere': return p.r;
      case 'ellipsoid': return max(p.rx, p.ry, p.rz);
      case 'box': case 'taper': return len3(p.bx, p.by, p.bz);
      case 'cone': return max(p.h, 0) + max(p.r1, p.r2);
      case 'torus': return p.R + p.r;
      case 'cyl': return len3(p.r, p.h, p.r);
      default: return 1;
    }
  }
}

class Op extends Node {
  constructor(op, k, children, opts = {}) {
    super();
    this.t = 'op';
    this.op = op; // union | sub | inter
    this.k = k;
    this.children = children.filter(Boolean);
    this.paintCut = !!opts.paintCut;
  }
  leaves() { return this.children.flatMap(c => c.leaves()); }
}

class Deform extends Node {
  constructor(kind, child, params) {
    super();
    this.t = 'deform';
    this.kind = kind; // mirror | twist | bend | displace | round | shell
    this.child = child;
    this.p = params;
  }
  leaves() { return this.child.leaves(); }
}

// Primitive builders take world-space positions (meters). Rotations are in
// radians about the primitive's own center.
export const S = {
  sphere: (c, r) => new Prim('sphere', c, null, { r }),
  ellipsoid: (c, rad) => new Prim('ellipsoid', c, null, { rx: rad[0], ry: rad[1], rz: rad[2] }),
  box: (c, half, r = 0.02) => new Prim('box', c, null, { bx: half[0], by: half[1], bz: half[2], r }),
  taper: (c, half, taper = 0.5, r = 0.02) => new Prim('taper', c, null, { bx: half[0], by: half[1], bz: half[2], taper, r }),
  // Capsule / tapered limb between two points.
  limb(a, b, r1, r2 = r1) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const h = len3(dx, dy, dz);
    return new Prim('cone', a, alignY(dx, dy, dz), { r1, r2, h: max(h, 1e-4) });
  },
  torus: (c, R, r) => new Prim('torus', c, null, { R, r }),
  cyl: (c, r, h, rr = 0.02) => new Prim('cyl', c, null, { r, h, rr }),
  union: (k, ...children) => new Op('union', k, children.flat()),
  sub: (k, base, ...cutters) => new Op('sub', k, [base, ...cutters.flat()]),
  carve: (k, base, ...cutters) => new Op('sub', k, [base, ...cutters.flat()], { paintCut: true }),
  inter: (k, ...children) => new Op('inter', k, children.flat()),
  mirror: child => new Deform('mirror', child, {}),
  twist: (child, rate, center = [0, 0, 0]) => new Deform('twist', child, { rate, center }),
  bend: (child, rate, center = [0, 0, 0]) => new Deform('bend', child, { rate, center }),
  displace: (child, amp, freq, oct = 3, seed = 0) => new Deform('displace', child, { amp, freq, oct, seed }),
  round: (child, r) => new Deform('round', child, { r }),
  shell: (child, t) => new Deform('shell', child, { t }),
};

// ── Compilation to fast closures ─────────────────────────────────────────
// compile(node) → { d(x,y,z), full(x,y,z) → {d, leaf}, leaves, bounds }

function primDist(prim) {
  const { kind, p } = prim;
  const [cx, cy, cz] = prim.c;
  const R = prim.R;
  // world→local = R^T (p - c)
  const r00 = R[0], r01 = R[1], r02 = R[2], r10 = R[3], r11 = R[4], r12 = R[5], r20 = R[6], r21 = R[7], r22 = R[8];
  const local = (x, y, z, fn) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    return fn(r00 * px + r10 * py + r20 * pz, r01 * px + r11 * py + r21 * pz, r02 * px + r12 * py + r22 * pz);
  };
  switch (kind) {
    case 'sphere': return (x, y, z) => len3(x - cx, y - cy, z - cz) - p.r;
    case 'ellipsoid': return (x, y, z) => local(x, y, z, (a, b, c) => sdEllipsoid(a, b, c, p.rx, p.ry, p.rz));
    case 'box': return (x, y, z) => local(x, y, z, (a, b, c) => sdRoundBox(a, b, c, p.bx, p.by, p.bz, p.r));
    case 'taper': return (x, y, z) => local(x, y, z, (a, b, c) => sdTaperBox(a, b, c, p.bx, p.by, p.bz, p.taper, p.r));
    case 'cone': return (x, y, z) => local(x, y, z, (a, b, c) => sdRoundCone(a, b, c, p.r1, p.r2, p.h));
    case 'torus': return (x, y, z) => local(x, y, z, (a, b, c) => sdTorus(a, b, c, p.R, p.r));
    case 'cyl': return (x, y, z) => local(x, y, z, (a, b, c) => sdCyl(a, b, c, p.r, p.h, p.rr));
    default: throw new Error('unknown primitive ' + kind);
  }
}

function primBounds(prim) {
  // center of the bounding sphere (cones are anchored at one end)
  if (prim.kind === 'cone') {
    const R = prim.R, h = prim.p.h / 2;
    return { c: [prim.c[0] + R[1] * h, prim.c[1] + R[4] * h, prim.c[2] + R[7] * h], r: prim.p.h / 2 + max(prim.p.r1, prim.p.r2) };
  }
  return { c: prim.c, r: prim.radius };
}

// Evaluates to distance only (hot path).
function compileD(node) {
  if (node.t === 'prim') {
    const f = primDist(node);
    node._f = f;
    return f;
  }
  if (node.t === 'deform') return compileDeform(node, compileD(node.child));
  const fs = node.children.map(compileD);
  const k = node.k;
  if (node.op === 'union') {
    // bounding-sphere culling: skip children that can't affect the result
    const bs = node.children.map(nodeBounds);
    const n = fs.length;
    return (x, y, z) => {
      let d = 1e9;
      for (let i = 0; i < n; i++) {
        const b = bs[i];
        const lb = len3(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r;
        if (lb > d + k) continue;
        d = smin(d, fs[i](x, y, z), k);
      }
      return d;
    };
  }
  if (node.op === 'sub') {
    const [base, ...cut] = fs;
    return (x, y, z) => {
      let d = base(x, y, z);
      for (const c of cut) d = smax(d, -c(x, y, z), k);
      return d;
    };
  }
  return (x, y, z) => {
    let d = -1e9;
    for (const f of fs) d = smax(d, f(x, y, z), k);
    return d;
  };
}

function compileDeform(node, f) {
  const p = node.p;
  switch (node.kind) {
    case 'mirror': return (x, y, z) => f(abs(x), y, z);
    case 'round': return (x, y, z) => f(x, y, z) - p.r;
    case 'shell': return (x, y, z) => abs(f(x, y, z)) - p.t;
    case 'twist': {
      const [cx, , cz] = p.center;
      return (x, y, z) => {
        const a = p.rate * y, c = cos(a), s = sin(a);
        const px = x - cx, pz = z - cz;
        return f(c * px - s * pz + cx, y, s * px + c * pz + cz);
      };
    }
    case 'bend': {
      const [cx, cy] = p.center;
      return (x, y, z) => {
        const a = p.rate * (x - cx), c = cos(a), s = sin(a);
        const px = x - cx, py = y - cy;
        return f(c * px - s * py + cx, s * px + c * py + cy, z);
      };
    }
    case 'displace': {
      const { amp, freq, oct, seed } = p;
      // displacement breaks the Lipschitz bound; scale down to stay safe
      const safe = 1 / (1 + amp * freq * 1.5);
      return (x, y, z) => (f(x, y, z) + amp * fbm(x * freq + seed, y * freq + seed * 1.7, z * freq - seed, oct)) * safe;
    }
    default: throw new Error('unknown deform ' + node.kind);
  }
}

function nodeBounds(node) {
  if (node._b) return node._b;
  let b;
  if (node.t === 'prim') b = primBounds(node);
  else if (node.t === 'deform') {
    const cb = nodeBounds(node.child);
    if (node.kind === 'mirror') {
      const c = cb.c;
      b = { c: [0, c[1], c[2]], r: len3(abs(c[0]), 0, 0) + cb.r };
    } else {
      const extra = node.kind === 'displace' ? node.p.amp * 1.5 : node.kind === 'round' ? node.p.r : node.kind === 'shell' ? node.p.t : 0;
      // twist/bend: rotate around their center, so widen generously
      const widen = node.kind === 'twist' || node.kind === 'bend' ? cb.r * 0.6 : 0;
      b = { c: cb.c, r: cb.r + extra + widen };
    }
  } else {
    // op: sphere around children's spheres (loose but cheap)
    const bs = node.children.map(nodeBounds);
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const s of bs) for (let i = 0; i < 3; i++) { lo[i] = min(lo[i], s.c[i] - s.r); hi[i] = max(hi[i], s.c[i] + s.r); }
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    let r = 0;
    for (const s of bs) r = max(r, len3(s.c[0] - c[0], s.c[1] - c[1], s.c[2] - c[2]) + s.r);
    if (node.op === 'sub') r = nodeBounds(node.children[0]).r + len3(nodeBounds(node.children[0]).c[0] - c[0], nodeBounds(node.children[0]).c[1] - c[1], nodeBounds(node.children[0]).c[2] - c[2]);
    b = { c, r: r + node.k };
  }
  node._b = b;
  return b;
}

// Full evaluation: distance plus which leaf owns the surface there (for
// paint). Slower; only used at mesh vertices.
function compileFull(node, mirrored = false) {
  if (node.t === 'prim') {
    const f = node._f || primDist(node);
    return (x, y, z) => ({ d: f(x, y, z), leaf: node, mx: mirrored });
  }
  if (node.t === 'deform') {
    const inner = compileFull(node.child, mirrored || node.kind === 'mirror');
    const df = compileD(node);
    if (node.kind === 'mirror') return (x, y, z) => { const r = inner(abs(x), y, z); return { d: r.d, leaf: r.leaf, mx: x < 0 }; };
    if (node.kind === 'twist' || node.kind === 'bend' || node.kind === 'displace') {
      return (x, y, z) => { const r = inner(x, y, z); return { d: df(x, y, z), leaf: r.leaf, mx: r.mx }; };
    }
    return (x, y, z) => { const r = inner(x, y, z); return { d: df(x, y, z), leaf: r.leaf, mx: r.mx }; };
  }
  const fs = node.children.map(c => compileFull(c, mirrored));
  const k = node.k;
  if (node.op === 'union') {
    return (x, y, z) => {
      let best = null, d = 1e9;
      for (const f of fs) {
        const r = f(x, y, z);
        if (!best || r.d < best.d) best = r;
        d = smin(d, r.d, k);
      }
      return { d, leaf: best.leaf, mx: best.mx };
    };
  }
  if (node.op === 'sub') {
    const [base, ...cut] = fs;
    const paintCut = node.paintCut;
    return (x, y, z) => {
      const r = base(x, y, z);
      let d = r.d, leaf = r.leaf, mx = r.mx;
      for (const c of cut) {
        const rc = c(x, y, z);
        if (paintCut && -rc.d > d - k * 0.25) { leaf = rc.leaf; mx = rc.mx; }
        d = smax(d, -rc.d, k);
      }
      return { d, leaf, mx };
    };
  }
  return (x, y, z) => {
    let d = -1e9, first = null;
    for (const f of fs) { const r = f(x, y, z); if (!first) first = r; d = smax(d, r.d, k); }
    return { d, leaf: first.leaf, mx: first.mx };
  };
}

export function compile(root) {
  const d = compileD(root);
  const full = compileFull(root);
  const leaves = root.leaves();
  leaves.forEach(l => { if (!l._f) l._f = primDist(l); });
  // world AABB from leaf bounds under mirror
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const hasMirror = (function walk(n) { return n.t === 'deform' ? (n.kind === 'mirror' || walk(n.child)) : n.t === 'op' ? n.children.some(walk) : false; })(root);
  const pad = (function kmax(n) { return n.t === 'op' ? max(n.k, ...n.children.map(kmax)) : n.t === 'deform' ? kmax(n.child) + (n.kind === 'displace' ? n.p.amp * 2 : n.kind === 'round' ? n.p.r : 0) : 0; })(root);
  for (const l of leaves) {
    const b = primBounds(l);
    for (let i = 0; i < 3; i++) { lo[i] = min(lo[i], b.c[i] - b.r); hi[i] = max(hi[i], b.c[i] + b.r); }
    if (hasMirror) { lo[0] = min(lo[0], -b.c[0] - b.r); hi[0] = max(hi[0], -b.c[0] + b.r); }
  }
  for (let i = 0; i < 3; i++) { lo[i] -= pad + 0.02; hi[i] += pad + 0.02; }
  return { d, full, leaves, bounds: { lo, hi } };
}

// Paint helpers ───────────────────────────────────────────────────────────
// A paint is { color:[r,g,b] (sRGB 0-1), gloss, emissive } or a function
// (x,y,z, leaf) → such an object, for stripes, spots and gradients.
export const hex = h => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const P = (color, gloss = 0.3, emissive = 0, extra = {}) => ({ color: typeof color === 'string' ? hex(color) : color, gloss, emissive, ...extra });

export { rotMatrix, alignY, len3, clamp };
