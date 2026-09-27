// Deterministic randomness. Generation only uses integer ops and + - * /,
// so the same seed builds the same power on every device (Math.random,
// Math.pow and Math.log are not guaranteed to match across platforms).

export function hashString(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

export function makeRng(seedStr) {
  const label = String(seedStr);
  let state = hashString(label) || 0x9e3779b9;

  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    float: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: p => next() < p,
    pick: arr => arr[Math.floor(next() * arr.length)],
    // entries: [[item, weight], ...]; returns undefined when nothing has weight
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) if (w > 0) total += w;
      if (total <= 0) return undefined;
      let r = next() * total;
      let last;
      for (const [item, w] of entries) {
        if (w <= 0) continue;
        last = item;
        r -= w;
        if (r < 0) return item;
      }
      return last;
    },
    fork: sub => makeRng(label + '/' + sub),
  };
}

// New seeds are the only place real randomness enters. Everything after is
// a pure function of the seed, so a seed is enough to share a power.
const SEED_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function randomSeed(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return s;
}
