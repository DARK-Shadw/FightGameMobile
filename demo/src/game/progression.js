// In-match progression. Everyone starts with a basic attack only. XP from
// fighting unlocks spell slots and powers, and each level caps how rare a
// power can be, so a match climbs from fireballs to reality-breaking powers
// instead of starting there:
//
//   level  xp    slots  tier cap    what the level-up offers
//     1      0     0    -           (basic attack only)
//     2    100     1    Rare        3 new spells
//     3    320     2    Epic        2 new spells + evolve / stat
//     4    660     2    Epic        evolve, a stat, or trade a spell
//     5   1080     3    Legendary   2 new spells + evolve
//     6   1600     3    Legendary   evolve, fuse two spells, stat
//     7   2200     3    Godly       evolve into godly, or trade for an ultimate
//
// Godly powers are ultimates: they don't have a cooldown but a charge meter
// that fills as you deal damage (and slowly over time).

import { forge, fromCode, evolveCode, fuseCode } from '../../../prototypes/skill-forge/forge.js';
import { present } from '../../../prototypes/skill-forge/describe.js';
import { TIER_ORDER } from '../../../prototypes/skill-forge/data-atoms.js';

export const MAX_LEVEL = 7;
export const LEVEL_XP = [0, 0, 100, 320, 660, 1080, 1600, 2200];
export const TIER_CAP = [null, null, 'rare', 'epic', 'epic', 'legendary', 'legendary', 'godly'];
export const SLOTS_AT = [0, 0, 1, 2, 2, 3, 3, 3];
export const SPELL_SLOTS = 3;
export const MAX_PASSIVES = 2;
const NEW_TIERS = {
  2: [['common', 55], ['rare', 45]],
  3: [['rare', 60], ['epic', 40]],
  4: [['rare', 35], ['epic', 65]],
  5: [['epic', 60], ['legendary', 40]],
  6: [['epic', 35], ['legendary', 65]],
  7: [['legendary', 55], ['godly', 45]],
};

export const XP = {
  damage: 1 / 28,          // per point of damage dealt to an enemy brawler
  damageOther: 1 / 60,     // to minions, clones and titans
  kill: 50, perLevel: 15,  // knockout bounty: 50 + 15 × the victim's level
  assist: 20,              // damaged the victim in the 6 s before it fell
  minion: 8, titan: 40,
  shard: 15,
  trickle: 1.5,            // per second while alive
  underdog: 0.3,           // bonus while your team trails by 2 or more
};

export const tierIndex = t => TIER_ORDER.indexOf(t);
export const levelFor = xp => { let l = 1; while (l < MAX_LEVEL && xp >= LEVEL_XP[l + 1]) l++; return l; };
export const levelProgress = (xp, level) => (level >= MAX_LEVEL ? 1 : (xp - LEVEL_XP[level]) / (LEVEL_XP[level + 1] - LEVEL_XP[level]));

// What the next level brings, for the HUD ("Next: EPIC powers at LV 3").
export function nextUnlock(level) {
  if (level >= MAX_LEVEL) return null;
  const n = level + 1;
  const bits = [];
  if (SLOTS_AT[n] > SLOTS_AT[level]) bits.push(SLOTS_AT[level] === 0 ? 'your first spell' : 'a new spell slot');
  if (TIER_CAP[n] !== TIER_CAP[level]) bits.push(`${TIER_CAP[n]} powers`);
  if (!bits.length) bits.push('an evolution');
  return { level: n, text: bits.join(' + ') };
}

export const STATS = [
  { id: 'hp', icon: 'heart', v: '+18% max HP', d: 'Tougher in every fight', apply: f => { const k = Math.round(f.maxHp * 0.18); f.maxHp += k; f.hp += k; } },
  { id: 'dmg', icon: 'claw', v: '+14% damage', d: 'Attacks and powers hit harder', apply: f => { f.buffs.dmg *= 1.14; f.basicDamage = Math.round(f.basicDamage * 1.1); } },
  { id: 'spd', icon: 'feather', v: '+10% speed', d: 'Outrun and outflank', apply: f => { f.speed *= 1.1; } },
  { id: 'cd', icon: 'clock', v: '−15% cooldowns', d: 'Powers come back sooner', apply: f => { f.cdMul = (f.cdMul ?? 1) * 0.85; f.powers.forEach(s => { s.cdMax *= 0.85; }); } },
  { id: 'ammo', icon: 'bolt', v: '+1 ammo', d: 'One more shot per reload', apply: f => { f.ammoMax += 1; f.ammo = Math.min(f.ammo + 1, f.ammoMax); } },
  { id: 'reload', icon: 'swirl', v: '+25% reload', d: 'Shots come back faster', apply: f => { f.reloadTime *= 0.8; } },
  { id: 'leech', icon: 'drop', v: '+10% lifesteal', d: 'Heal from the damage you deal', apply: f => { f.buffs.lifesteal += 0.1; } },
];
export const statById = id => STATS.find(s => s.id === id);

// Skill Forge DNA with its rules text attached (cached: codes are pure functions).
const DNA = new Map();
export function dnaOf(code) {
  let s = DNA.get(code);
  if (!s) { s = fromCode(code); s.info = present(s); DNA.set(code, s); }
  return s;
}

function pickTier(level, rng) {
  const w = NEW_TIERS[Math.min(MAX_LEVEL, Math.max(2, level))];
  let r = rng() * w.reduce((a, b) => a + b[1], 0);
  for (const [t, x] of w) { r -= x; if (r <= 0) return t; }
  return w[0][0];
}

let SEEDN = 0;
const seedOf = rng => 'M' + Math.floor(rng() * 36 ** 4).toString(36).toUpperCase() + (SEEDN++ % 36).toString(36).toUpperCase();

// A fresh castable power of the level's tiers, often themed on an essence the
// brawler already uses so kits stay coherent.
function newSpell(f, level, rng, o = {}) {
  const tier = o.tier || pickTier(level, rng);
  const mine = f.powers.map(p => p.dna.essences[0]);
  for (let tries = 0; tries < 12; tries++) {
    const lock = mine.length && rng() < 0.45 ? [mine[Math.floor(rng() * mine.length)]] : undefined;
    const s = forge({ seed: seedOf(rng), tier, essences: lock });
    if (s.trigger !== 'cast' && !o.passiveOk) continue;
    if (o.avoid?.has(s.essences[0]) && tries < 8) continue;
    dnaOf(s.code);
    return s.code;
  }
  return forge({ seed: seedOf(rng), tier }).code;
}

const castables = f => f.powers.filter(p => !p.passive).sort((a, b) => a.index - b.index);

// Three options for a brawler who just reached `level`.
export function buildOffer(f, level, rng = Math.random) {
  const cap = TIER_CAP[level];
  const capI = tierIndex(cap);
  const spells = castables(f);
  const free = SLOTS_AT[level] - spells.length;
  const opts = [];
  const avoid = new Set();
  const addNew = (extra = {}) => {
    const code = newSpell(f, level, rng, { avoid, ...extra });
    avoid.add(dnaOf(code).essences[0]);
    opts.push({ type: 'new', code, ...(extra.replaces !== undefined ? { replaces: extra.replaces } : {}) });
  };
  const evolvable = spells.filter(p => tierIndex(p.dna.tier) < capI);
  const addEvolve = p => opts.push({ type: 'evolve', from: p.index, code: evolveCode(p.dna) });
  const addStat = () => {
    const taken = new Set(opts.filter(o => o.type === 'stat').map(o => o.stat));
    const pool = STATS.filter(s => !taken.has(s.id));
    opts.push({ type: 'stat', stat: pool[Math.floor(rng() * pool.length)].id });
  };

  if (free > 0) {
    const n = spells.length === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) addNew();
    if (opts.length < 3) (evolvable.length ? addEvolve(evolvable[Math.floor(rng() * evolvable.length)]) : addStat());
  } else {
    // every slot is full: grow what you have
    const ev = evolvable.slice().sort((a, b) => tierIndex(b.dna.tier) - tierIndex(a.dna.tier) || rng() - 0.5);
    ev.slice(0, 2).forEach(addEvolve);
    if (level >= 6 && spells.length >= 2 && opts.length < 3) {
      const [a, b] = spells.slice().sort((x, y) => tierIndex(x.dna.tier) - tierIndex(y.dna.tier));
      const fusedTier = Math.min(4, Math.max(tierIndex(a.dna.tier), tierIndex(b.dna.tier)) + 1);
      if (fusedTier <= capI) opts.push({ type: 'fuse', from: [a.index, b.index], code: fuseCode(a.dna, b.dna) });
    }
    if (opts.length < 3 && level >= 4) {
      // trade your weakest spell for a new one at the level's tier
      const weakest = spells.slice().sort((x, y) => tierIndex(x.dna.tier) - tierIndex(y.dna.tier))[0];
      if (weakest) addNew({ replaces: weakest.index, tier: level === MAX_LEVEL ? (rng() < 0.6 ? 'godly' : 'legendary') : undefined });
    }
    while (opts.length < 3) addStat();
  }
  // a passive power now and then, instead of a stat
  const si = opts.findIndex(o => o.type === 'stat');
  if (si >= 0 && level >= 3 && rng() < 0.35 && f.powers.filter(p => p.passive).length < MAX_PASSIVES) {
    const code = newSpell(f, level, rng, { passiveOk: true });
    if (dnaOf(code).trigger !== 'cast') opts[si] = { type: 'new', code, passive: true };
  }
  return { level, options: opts.slice(0, 3) };
}

// Bots: a new spell for an empty slot first, then the biggest tier jump, then a stat.
export function botChoice(f, offer) {
  const score = o => {
    if (o.type === 'new') return (o.replaces === undefined ? 100 : 40) + tierIndex(dnaOf(o.code).tier) * 10;
    if (o.type === 'evolve') return 60 + tierIndex(dnaOf(o.code).tier) * 10;
    if (o.type === 'fuse') return 70 + tierIndex(dnaOf(o.code).tier) * 10;
    return 20 + Math.random() * 10;
  };
  let best = 0;
  offer.options.forEach((o, i) => { if (score(o) > score(offer.options[best])) best = i; });
  return best;
}
