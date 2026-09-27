// The "periodic table" of powers. Nothing in here is a finished skill:
// these are the atoms, shapes and rules that skills are grown from.
//
// Params are [min, max, step, costPerStep, 'inv'?]. A param starts at min
// (or at max when 'inv', where smaller is stronger) and the solver buys
// steps with Power Points (PP). costPerStep 0 marks a flavor param that is
// rolled once instead of bought.

export const TIER_ORDER = ['common', 'rare', 'epic', 'legendary', 'godly'];

export const TIERS = {
  common:    { name: 'Common',    letter: 'C', weight: 44, budget: 10, nodes: 3, law: 0, lawChance: 0,   keyLaw: 0,   chain: 0,    cd: [5, 8] },
  rare:      { name: 'Rare',      letter: 'R', weight: 28, budget: 15, nodes: 4, law: 0, lawChance: 0,   keyLaw: 0,   chain: 0.15, cd: [7, 11] },
  epic:      { name: 'Epic',      letter: 'E', weight: 16, budget: 22, nodes: 5, law: 1, lawChance: 0.3, keyLaw: 0.3, chain: 0.45, cd: [9, 14] },
  legendary: { name: 'Legendary', letter: 'L', weight: 9,  budget: 32, nodes: 6, law: 1, lawChance: 1,   keyLaw: 0.7, chain: 0.55, cd: [12, 20] },
  godly:     { name: 'Godly',     letter: 'G', weight: 3,  budget: 46, nodes: 7, law: 2, lawChance: 1,   keyLaw: 1,   chain: 0.6,  cd: [18, 30] },
};

// who: enemies | allies (you + allies in the area) | self | summon | corpse | ground
// law: 1 = minor law (bends a rule), 2 = major law (breaks one). One law per power.
// hard: hard crowd control (max one per payload). single: needs a single-target carrier.
// only: carriers it may ride on. noTick: can't live on a lingering carrier.
// global: allowed on the arena-wide carrier.
export const ATOMS = {
  // Harm
  damage:    { fam: 'harm', who: 'enemies', base: 2, global: true, p: { amount: [120, 800, 20, 0.5] } },
  dot:       { fam: 'harm', who: 'enemies', base: 2, global: true, p: { dps: [25, 120, 5, 0.35], dur: [2, 6, 0.5, 0.6] } },
  mark:      { fam: 'harm', who: 'enemies', base: 3, global: true, p: { delay: [2, 4, 0.25, 0.4, 'inv'], amount: [150, 900, 25, 0.45] } },
  execute:   { fam: 'harm', who: 'enemies', base: 4, global: true, p: { threshold: [8, 25, 1, 0.6] } },
  // Force
  push:      { fam: 'force', who: 'enemies', base: 1.5, p: { dist: [2, 8, 0.5, 0.35] } },
  pull:      { fam: 'force', who: 'enemies', base: 2, global: true, p: { dist: [2, 7, 0.5, 0.45] } },
  launch:    { fam: 'force', who: 'enemies', base: 2, global: true, p: { dur: [0.4, 1.2, 0.1, 0.6] } },
  // Control
  slow:      { fam: 'control', who: 'enemies', base: 1.5, global: true, p: { pct: [20, 70, 5, 0.5], dur: [1.5, 4, 0.5, 0.5] } },
  root:      { fam: 'control', who: 'enemies', base: 3, hard: true, p: { dur: [0.6, 2, 0.1, 0.6] } },
  stun:      { fam: 'control', who: 'enemies', base: 4, hard: true, p: { dur: [0.5, 1.6, 0.1, 0.8] } },
  silence:   { fam: 'control', who: 'enemies', base: 3, global: true, p: { dur: [1.5, 4, 0.25, 0.5] } },
  blind:     { fam: 'control', who: 'enemies', base: 2, global: true, p: { dur: [1.5, 4, 0.25, 0.4] } },
  confuse:   { fam: 'control', who: 'enemies', base: 3.5, global: true, p: { dur: [1, 3, 0.25, 0.7] } },
  fear:      { fam: 'control', who: 'enemies', base: 3.5, hard: true, global: true, p: { dur: [0.8, 2, 0.1, 0.8] } },
  // Sustain and buffs
  heal:      { fam: 'sustain', who: 'allies', base: 2, global: true, only: ['self', 'nova', 'aura', 'zone', 'lob', 'bolt', 'orbitals', 'global'], p: { amount: [100, 500, 20, 0.5] } },
  shield:    { fam: 'sustain', who: 'allies', base: 2, only: ['self', 'nova', 'aura', 'dash', 'leap', 'zone'], p: { amount: [120, 600, 20, 0.4], dur: [2, 5, 0.5, 0.3] } },
  lifesteal: { fam: 'sustain', who: 'self', base: 2.5, needsDamage: true, p: { pct: [20, 100, 10, 0.7] } },
  cleanse:   { fam: 'sustain', who: 'allies', base: 1.5, only: ['self', 'nova', 'aura', 'zone'], p: {} },
  haste:     { fam: 'buff', who: 'allies', base: 1.5, global: true, p: { pct: [20, 60, 5, 0.4], dur: [2, 5, 0.5, 0.4] } },
  empower:   { fam: 'buff', who: 'self', base: 2, global: true, only: ['self', 'nova', 'aura', 'dash', 'leap', 'global'], p: { pct: [20, 80, 5, 0.4], hits: [2, 5, 1, 1] } },
  invis:     { fam: 'buff', who: 'self', base: 3, noTick: true, only: ['self', 'dash', 'nova', 'leap'], p: { dur: [1.5, 5, 0.5, 0.7] } },
  blink:     { fam: 'buff', who: 'self', base: 2.5, noTick: true, only: ['self', 'bolt', 'lob', 'strike'], p: { dist: [3, 9, 0.5, 0.3] } },
  reflect:   { fam: 'buff', who: 'self', base: 4, only: ['self', 'aura', 'nova'], p: { dur: [1, 3, 0.25, 0.8] } },
  // Creation
  terrain:   { fam: 'create', who: 'ground', base: 2.5, only: ['lob', 'strike', 'nova', 'leap', 'bolt', 'dash', 'cone'], p: { size: [2, 4.5, 0.25, 0.4], dur: [3, 8, 0.5, 0.35] } },
  summon:    { fam: 'create', who: 'summon', base: 4, global: true, only: ['self', 'lob', 'zone', 'strike', 'nova', 'trap', 'bolt', 'leap', 'global'], p: { count: [1, 4, 1, 2], dur: [5, 14, 1, 0.4], pow: [20, 60, 5, 0.4] } },
  // Laws: the rule-benders (1) and rule-breakers (2)
  clone:     { fam: 'law', who: 'summon', law: 1, base: 6, noTick: true, only: ['self', 'dash', 'nova', 'leap'], p: { count: [1, 3, 1, 2.5], dur: [4, 10, 1, 0.5], dmg: [20, 70, 5, 0.4] } },
  hex:       { fam: 'law', who: 'enemies', law: 1, base: 7, hard: true, only: ['bolt', 'tether', 'cone', 'nova', 'lob', 'trap', 'dash'], p: { dur: [1, 2.5, 0.1, 0.8] } },
  swap:      { fam: 'law', who: 'enemies', law: 1, base: 4, single: true, noTick: true, only: ['bolt', 'tether'], p: {} },
  steal:     { fam: 'law', who: 'enemies', law: 1, base: 6, single: true, noTick: true, only: ['bolt', 'tether', 'dash'], p: { dur: [4, 10, 1, 0.5] } },
  link:      { fam: 'law', who: 'enemies', law: 1, base: 5, single: true, only: ['bolt', 'tether'], p: { pct: [30, 80, 5, 0.5], dur: [3, 6, 0.5, 0.5] } },
  negate:    { fam: 'law', who: 'enemies', law: 1, base: 5, global: true, only: ['zone', 'nova', 'aura', 'lob', 'global', 'strike', 'bolt'], p: { dur: [1.5, 4, 0.25, 0.7] } },
  clockSlow: { fam: 'law', who: 'enemies', law: 1, base: 5, global: true, only: ['zone', 'nova', 'aura', 'lob', 'cone', 'bolt', 'global', 'strike', 'trap', 'beam'], p: { pct: [30, 75, 5, 0.6], dur: [2, 5, 0.5, 0.6] } },
  clockHaste:{ fam: 'law', who: 'allies', law: 1, base: 5, global: true, only: ['self', 'aura', 'nova', 'global'], p: { pct: [25, 80, 5, 0.5], dur: [3, 7, 0.5, 0.5] } },
  transform: { fam: 'law', who: 'self', law: 1, godlyKey: true, base: 8, noTick: true, only: ['self', 'nova', 'leap'], p: { dur: [5, 14, 1, 0.8], bonus: [20, 100, 10, 0.6] } },
  clockStop: { fam: 'law', who: 'enemies', law: 2, base: 12, hard: true, global: true, only: ['zone', 'nova', 'lob', 'cone', 'bolt', 'global', 'trap', 'aura'], p: { dur: [1, 2.5, 0.1, 1.2] } },
  rewind:    { fam: 'law', who: 'self', law: 2, base: 10, noTick: true, only: ['self'], p: { secs: [2, 5, 0.5, 0.8] } },
  raise:     { fam: 'law', who: 'corpse', law: 2, base: 9, global: true, only: ['nova', 'zone', 'lob', 'cone', 'global', 'self'], p: { count: [1, 5, 1, 2], dur: [8, 20, 1, 0.4], hpPct: [30, 80, 5, 0.3] } },
  titan:     { fam: 'law', who: 'summon', law: 2, base: 10, noTick: true, only: ['self', 'strike', 'lob', 'zone'], p: { hp: [800, 3000, 100, 0.5], dur: [6, 14, 1, 0.8] } },
  control:   { fam: 'law', who: 'enemies', law: 2, base: 12, hard: true, single: true, noTick: true, only: ['bolt', 'tether', 'dash'], p: { dur: [1, 2.2, 0.1, 1.2] } },
  exchange:  { fam: 'law', who: 'enemies', law: 2, base: 10, single: true, noTick: true, only: ['bolt', 'tether'], p: {} },
  resurrect: { fam: 'law', who: 'self', law: 2, base: 9, noTick: true, only: ['self', 'nova'], trig: ['onDeath'], p: { hpPct: [25, 70, 5, 0.4] } },
};

// ctl: how the player casts it. on: events a chain can hang from.
export const CARRIERS = {
  bolt:     { ctl: 'aim',    base: 1,   cast: 0.15, hits: true, single: true, on: ['hit', 'kill'],    p: { range: [6, 12, 0.5, 0.2], size: [0.4, 1.6, 0.1, 0.25], speed: [8, 20, 1, 0.15] }, nouns: ['Bolt', 'Orb', 'Lance', 'Shard', 'Spear', 'Comet', 'Dart'] },
  lob:      { ctl: 'target', base: 1.5, cast: 0.3,  hits: true, area: true,   on: ['hit', 'kill'],    p: { range: [7, 11, 0.5, 0.2], radius: [1.5, 3.5, 0.25, 0.4] }, nouns: ['Orb', 'Seed', 'Sphere', 'Bomb', 'Heart', 'Star'] },
  beam:     { ctl: 'hold',   base: 2,   cast: 0.2,  hits: true, tick: true,   on: ['expire', 'kill'], p: { length: [6, 12, 0.5, 0.2], dur: [1, 3, 0.25, 0.5] }, nouns: ['Ray', 'Beam', 'Gaze', 'Line'] },
  cone:     { ctl: 'aim',    base: 1,   cast: 0.2,  hits: true, area: true,   on: ['hit', 'kill'],    p: { length: [3, 7, 0.5, 0.3], angle: [40, 110, 10, 0.3] }, nouns: ['Breath', 'Wave', 'Fan', 'Roar', 'Blast'] },
  nova:     { ctl: 'tap',    base: 1,   cast: 0.25, hits: true, area: true, around: true, on: ['hit', 'kill'], p: { radius: [2, 5, 0.25, 0.45] }, nouns: ['Nova', 'Burst', 'Pulse', 'Shockwave', 'Bloom'] },
  zone:     { ctl: 'target', base: 2,   cast: 0.3,  hits: true, area: true, tick: true, on: ['expire', 'kill'], p: { radius: [2, 4.5, 0.25, 0.45], dur: [3, 8, 0.5, 0.35] }, nouns: ['Field', 'Circle', 'Garden', 'Pit', 'Mire', 'Domain', 'Well'] },
  aura:     { ctl: 'tap',    base: 2.5, cast: 0.1,  hits: true, area: true, tick: true, around: true, on: ['expire'], p: { radius: [2, 4, 0.25, 0.45], dur: [4, 9, 0.5, 0.35] }, nouns: ['Mantle', 'Aura', 'Cloak', 'Halo', 'Veil'] },
  dash:     { ctl: 'aim',    base: 1.5, cast: 0.1,  hits: true, single: true, moves: true, on: ['end', 'hit'], p: { dist: [4, 9, 0.5, 0.3] }, nouns: ['Rush', 'Step', 'Charge', 'Stride', 'Flash'] },
  leap:     { ctl: 'target', base: 2,   cast: 0.25, hits: true, area: true, moves: true, around: true, on: ['end', 'kill'], p: { range: [5, 10, 0.5, 0.25], radius: [2, 3.5, 0.25, 0.45] }, nouns: ['Leap', 'Descent', 'Crash', 'Pounce', 'Fall'] },
  trap:     { ctl: 'target', base: 1.5, cast: 0.2,  hits: true, area: true,   on: ['hit'],           p: { radius: [1.5, 3, 0.25, 0.35], charges: [1, 3, 1, 1.5] }, nouns: ['Rune', 'Snare', 'Sigil', 'Mine', 'Glyph'] },
  orbitals: { ctl: 'tap',    base: 2,   cast: 0.2,  hits: true,               on: ['hit', 'expire'], p: { count: [2, 5, 1, 1], dur: [4, 9, 0.5, 0.35] }, nouns: ['Satellites', 'Wisps', 'Moons', 'Motes', 'Halo'] },
  wall:     { ctl: 'aim',    base: 2,   cast: 0.25, hits: true, tick: true,   on: ['expire'],        p: { length: [4, 9, 0.5, 0.25], dur: [3, 6, 0.5, 0.3] }, nouns: ['Wall', 'Rampart', 'Barrier', 'Palisade', 'Curtain'] },
  strike:   { ctl: 'target', base: 1.5, cast: 0.2,  hits: true, area: true,   on: ['hit', 'kill'],   p: { radius: [1.5, 4, 0.25, 0.4], delay: [0.6, 1.4, 0.1, 0.4, 'inv'] }, nouns: ['Fall', 'Judgment', 'Rain', 'Hammer', 'Smite'] },
  tether:   { ctl: 'aim',    base: 2,   cast: 0.15, hits: true, single: true, on: ['expire'],        p: { range: [5, 9, 0.5, 0.2], dur: [2, 4, 0.25, 0.4] }, nouns: ['Chain', 'Leash', 'Thread', 'Bond', 'Hook'] },
  self:     { ctl: 'tap',    base: 0.5, cast: 0.1,                            on: [],                p: {}, nouns: ['Heart', 'Pact', 'Blessing', 'Oath', 'Soul'] },
  imbue:    { ctl: 'tap',    base: 1.5, cast: 0.05, hits: true,               on: ['hit', 'kill'],   p: { hits: [2, 5, 1, 1.2] }, nouns: ['Edge', 'Touch', 'Fist', 'Brand', 'Grip'] },
  global:   { ctl: 'tap',    base: 6,   cast: 0.8,  hits: true, area: true, tick: true, law: 2, on: [], p: { dur: [3, 8, 0.5, 0.8] }, nouns: ['Eclipse', 'Cataclysm', 'Apocalypse', 'Epoch', 'Reckoning'] },
};

// Shapes that can hang off another shape's event, with a weight per event.
export const CHILD_CARRIERS = {
  nova:   { hit: 3, expire: 3, kill: 3, end: 3 },
  zone:   { hit: 3, expire: 1.5, kill: 1.5, end: 2.5 },
  strike: { hit: 1, expire: 2, kill: 1 },
  wall:   { hit: 1, expire: 0.5, end: 2 },
  trap:   { hit: 1, expire: 1, end: 1.5 },
  self:   { hit: 1.5, kill: 3, end: 1 },
};

// When fusing, the second power's shape is folded into a child shape.
export const FUSE_CHILD = {
  bolt: 'nova', lob: 'nova', beam: 'nova', cone: 'nova', nova: 'nova', zone: 'zone', aura: 'zone',
  dash: 'nova', leap: 'nova', trap: 'trap', orbitals: 'nova', wall: 'wall', strike: 'strike',
  tether: 'nova', self: 'self', imbue: 'self', global: 'zone',
};

export const MODS = {
  pierce:    { base: 1.5, c: ['bolt', 'beam', 'dash'], p: {} },
  split:     { base: 2,   c: ['bolt', 'lob'], p: { count: [2, 5, 1, 1] } },
  bounce:    { base: 2,   c: ['bolt', 'beam'], p: { count: [1, 4, 1, 1] } },
  homing:    { base: 1.5, c: ['bolt', 'orbitals'], p: {} },
  boomerang: { base: 1.5, c: ['bolt'], p: {} },
  growing:   { base: 1.5, c: ['bolt', 'zone', 'aura', 'beam'], p: {} },
  lingering: { base: 2,   c: ['bolt', 'lob', 'strike', 'leap', 'cone', 'nova', 'dash'], p: { dur: [2, 5, 0.5, 0.4] } },
  volley:    { base: 2,   c: ['bolt', 'strike', 'lob'], p: { count: [2, 5, 1, 1.2] } },
  delayed:   { base: -1,  c: ['nova', 'lob', 'zone', 'strike'], p: { delay: [1, 2, 0.25, 0] } },
  charge:    { base: 0.5, c: ['bolt', 'beam', 'cone', 'nova', 'dash', 'leap'], ctl: 'hold', p: { bonus: [50, 150, 10, 0.3] } },
  echo:      { base: 4,   c: ['bolt', 'lob', 'cone', 'nova', 'strike', 'dash', 'leap', 'zone', 'beam'], law: 1, p: { delay: [0.8, 2, 0.2, 0], count: [1, 2, 1, 3] } },
  mirror:    { base: 2,   c: ['bolt', 'cone', 'beam', 'dash'], p: {} },
  ghost:     { base: 1,   c: ['bolt', 'dash', 'beam'], p: {} },
};

// Atoms that contradict each other in one payload.
export const ATOM_CONFLICTS = [['push', 'pull'], ['swap', 'push'], ['swap', 'pull'], ['swap', 'blink'], ['launch', 'pull']];

export const MOD_CONFLICTS = [['pierce', 'bounce'], ['homing', 'boomerang'], ['delayed', 'charge'], ['split', 'bounce'], ['volley', 'mirror']];

// Intent comes first: a hook is the one-line fantasy the power is grown around.
export const HOOKS = {
  blast:      { name: 'Blast',          w: 3,   atoms: { damage: 3, dot: 1.5, push: 1.5, launch: 1.2, mark: 1.5, execute: 1 }, carriers: { bolt: 2, lob: 1.5, beam: 1.5, strike: 2, cone: 1.5, nova: 1.2 } },
  control:    { name: 'Control',        w: 2.5, atoms: { slow: 3, root: 3, stun: 3, silence: 2, pull: 2, confuse: 2, fear: 2, clockSlow: 2.5, hex: 2, clockStop: 2, control: 1.5, negate: 1.5 }, carriers: { cone: 1.5, zone: 1.5, tether: 2, trap: 2, bolt: 1.2, wall: 1.2 } },
  zone:       { name: 'Zone',           w: 2,   atoms: { dot: 2, slow: 2, terrain: 3, pull: 1.5, negate: 2, clockSlow: 2 }, carriers: { zone: 4, trap: 2, wall: 2.5, aura: 1.5, lob: 1.5 } },
  summoner:   { name: 'Summoner',       w: 1.5, atoms: { summon: 6, clone: 3, raise: 4, titan: 5 }, carriers: { self: 2, lob: 2, zone: 1.5, nova: 1.5, strike: 1.2 } },
  shapeshift: { name: 'Shapeshift',     w: 1,   atoms: { transform: 7, hex: 4 }, carriers: { self: 4, bolt: 1.5, leap: 1.5, nova: 1 } },
  trickster:  { name: 'Trickster',      w: 1.5, atoms: { clone: 4, swap: 4, invis: 4, blink: 3, confuse: 2, steal: 3, reflect: 2 }, carriers: { self: 2, bolt: 1.5, dash: 2, trap: 1.5 } },
  sustain:    { name: 'Sustain',        w: 1.5, atoms: { heal: 4, shield: 4, lifesteal: 3, cleanse: 2, haste: 1.5, resurrect: 2, clockHaste: 1.5 }, carriers: { self: 2, aura: 2.5, nova: 2, zone: 1.5, bolt: 1 } },
  assassin:   { name: 'Assassin',       w: 1.5, atoms: { mark: 3, execute: 4, damage: 2, invis: 2, blink: 2, haste: 1.5 }, carriers: { dash: 3, leap: 2.5, bolt: 1.5, tether: 1.5 } },
  chrono:     { name: 'Chrono',         w: 0.6, atoms: { clockSlow: 5, clockStop: 5, clockHaste: 4, rewind: 5, mark: 2, slow: 1.5, haste: 1.5 }, carriers: { zone: 2, nova: 2, self: 2, global: 2, bolt: 1 }, mods: { echo: 4, delayed: 3 } },
  reaper:     { name: 'Reaper',         w: 0.7, atoms: { raise: 5, lifesteal: 3, execute: 3, dot: 2, link: 2, summon: 1.5, fear: 1.5 }, carriers: { nova: 2, zone: 1.5, cone: 1.5, tether: 1.5, dash: 1 } },
  cascade:    { name: 'Chain Reaction', w: 1.5, minTier: 'epic', forceChain: true, mods: { split: 3, bounce: 3, echo: 1.5 }, carriers: { bolt: 2, lob: 1.5, strike: 1.5 } },
  sacrifice:  { name: 'Sacrifice',      w: 0.8, minTier: 'rare', forceDrawback: true, budget: 1.35, lawBoost: 1.5 },
  guardian:   { name: 'Guardian',       w: 1.2, reactive: true, atoms: { shield: 3, reflect: 3, heal: 2, rewind: 3, resurrect: 4, damage: 1.5, push: 2, clockStop: 1.5 }, carriers: { nova: 2, self: 3, aura: 1.5 } },
  domain:     { name: 'Domain',         w: 0.8, minTier: 'epic', atoms: { clockSlow: 2, clockStop: 2, negate: 2, dot: 1.5, raise: 1.5 }, carriers: { aura: 4, zone: 3, global: 4 }, mods: { growing: 2 } },
  barrage:    { name: 'Barrage',        w: 1.5, mods: { volley: 4, echo: 2, homing: 2 }, carriers: { bolt: 3, strike: 3, orbitals: 2 } },
};

// cast = pressed by the player. The rest are passives that fire on their own.
export const TRIGGERS = {
  cast:    { w: 0 },
  lowHp:   { w: 3, text: 'When you drop below 30% HP', icd: [30, 50], cost: 0, carriers: ['self', 'nova', 'aura'], atoms: { shield: 3, heal: 3, rewind: 4, clockHaste: 2, transform: 3, invis: 2, blink: 2, push: 2, haste: 2, reflect: 2, clockStop: 2 } },
  whenHit: { w: 3, text: 'When you take a hit', icd: [4, 9], cost: 0.5, carriers: ['nova', 'self', 'aura'], atoms: { shield: 3, reflect: 3, damage: 2, push: 3, blink: 1.5, slow: 1.5, stun: 1 } },
  onDodge: { w: 2, text: 'When you dodge', icd: [3, 7], cost: 0, carriers: ['nova', 'trap', 'self'], atoms: { clone: 3, damage: 2, invis: 2, haste: 2, slow: 1.5, summon: 1 } },
  onKill:  { w: 2, text: 'When you defeat an enemy', icd: null, cost: 0, carriers: ['nova', 'self', 'zone'], atoms: { raise: 5, heal: 2, haste: 2, damage: 2, empower: 2, clockHaste: 2, summon: 1.5 } },
  onDeath: { w: 1.5, text: 'When you would be defeated (once per match)', icd: null, cost: -1, minTier: 'legendary', carriers: ['self', 'nova'], atoms: { resurrect: 6, rewind: 4, damage: 2, summon: 1.5, titan: 2 } },
  every:   { w: 2, text: 'Every {n}s', icd: [5, 10], cost: 1, carriers: ['strike', 'nova', 'orbitals', 'bolt'], atoms: { damage: 3, heal: 1.5, shield: 1.5, summon: 1, slow: 1 } },
};

// Drawbacks refund PP. That is how a power affords more than its tier allows.
export const DRAWBACKS = {
  hpCost:    { w: 2,   refund: 0, p: { pct: [10, 30, 5, 0] } },
  windup:    { w: 2,   refund: 2.5, active: true },
  exhaust:   { w: 1.5, refund: 2 },
  fragile:   { w: 1.5, refund: 2.5 },
  friendly:  { w: 1,   refund: 2.5, needs: 'areaDamage' },
  wobble:    { w: 1,   refund: 1.5, active: true, needs: 'aim' },
  lockout:   { w: 1.5, refund: 2.5 },
  reveal:    { w: 1,   refund: 1 },
  bloodDebt: { w: 0.8, refund: 3.5, minTier: 'rare' },
  limited:   { w: 1,   refund: 6, minTier: 'legendary', active: true },
};

// Evolution paths: a keystone can ascend into a stronger law.
export const UPGRADES = {
  slow: ['clockSlow'], clockSlow: ['clockStop'], stun: ['clockStop', 'hex'], root: ['hex'],
  confuse: ['control'], fear: ['control'], hex: ['control'], summon: ['titan', 'clone'], clone: ['titan'],
  blink: ['swap'], pull: ['swap'], haste: ['clockHaste'], clockHaste: ['rewind'], heal: ['resurrect'],
  shield: ['reflect'], dot: ['execute'], damage: ['execute', 'mark'], mark: ['execute'],
  lifesteal: ['link'], silence: ['negate'], invis: ['clone'], execute: ['raise'],
};

export const UNITS = {
  amount: '', dps: '/s', dur: 's', dist: 'm', pct: '%', radius: 'm', range: 'm', size: 'm', speed: 'm/s',
  length: 'm', angle: '°', count: '×', delay: 's', threshold: '%', hits: ' hits', secs: 's', hp: ' HP',
  hpPct: '%', bonus: '%', charges: '×', pow: '%', dmg: '%', cd: 's',
};

export const maxSteps = def => Math.round((def[1] - def[0]) / def[2]);

export function stepValue(def, k = 0) {
  const [min, max, step, , inv] = def;
  const v = inv ? max - k * step : min + k * step;
  return Math.round(v * 100) / 100;
}

export function paramValues(holder, defs) {
  const out = {};
  for (const [name, def] of Object.entries(defs || {})) out[name] = stepValue(def, holder?.s?.[name] || 0);
  return out;
}
