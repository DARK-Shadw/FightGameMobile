// The forge: grows a power from a seed.
//
//   seed -> tier -> essences -> intent (hook) -> trigger -> keystone atom
//        -> carrier -> extra atoms -> modifiers -> chain -> drawbacks
//        -> fit to budget -> spend leftover PP on numbers -> name and text
//
// Every step is a weighted choice. Nothing is picked from a list of skills.
import { makeRng, hashString, randomSeed } from './rng.js';
import {
  TIERS, TIER_ORDER, ATOMS, CARRIERS, CHILD_CARRIERS, FUSE_CHILD, MODS, MOD_CONFLICTS, ATOM_CONFLICTS,
  HOOKS, TRIGGERS, DRAWBACKS, UPGRADES, maxSteps, stepValue,
} from './data-atoms.js';
import { ESSENCES, ESSENCE_IDS } from './data-essences.js';
import { allAtoms, lawUsed, nodeCount, controlOf, cooldownDef, LASTING } from './shared.js';
import { present } from './describe.js';

const ATOM_IDS = Object.keys(ATOMS);
const MOD_IDS = Object.keys(MODS);
const DRAWBACK_IDS = Object.keys(DRAWBACKS);
const HARD_CC_CAP = 2.5;
const DRAWBACK_CHANCE = { common: 0.05, rare: 0.1, epic: 0.15, legendary: 0.3, godly: 0.5 };
const ESSENCE_COUNT = {
  common: [[1, 90], [2, 10]],
  rare: [[1, 65], [2, 35]],
  epic: [[1, 45], [2, 50], [3, 5]],
  legendary: [[1, 35], [2, 55], [3, 10]],
  godly: [[1, 30], [2, 50], [3, 20]],
};
const SUPPORT_HOOKS = ['sustain', 'trickster', 'summoner', 'shapeshift', 'guardian'];

const tierIndex = t => TIER_ORDER.indexOf(t);
const atLeast = (tier, min) => !min || tierIndex(tier) >= tierIndex(min);
const round2 = n => Math.round(n * 100) / 100;
const hookOf = s => HOOKS[s.hook];

// Essence tables are summed with the blend weights, so a Fire/Time power
// leans toward what both of them like.
function blend(s, key, ids, floor) {
  const out = {};
  for (const id of ids) {
    let w = 0;
    s.essences.forEach((e, i) => { w += s.mix[i] * (ESSENCES[e][key][id] || 0); });
    out[id] = w + (typeof floor === 'function' ? floor(id) : floor);
  }
  return out;
}

function rollFlavor(holder, defs, rng) {
  for (const [name, def] of Object.entries(defs || {})) {
    if (def[3] === 0 && holder.s[name] === undefined) holder.s[name] = rng.int(0, maxSteps(def));
  }
  return holder;
}

function rollAllFlavor(s, rng) {
  rollFlavor(s.root.carrier, CARRIERS[s.root.carrier.id].p, rng);
  s.root.mods.forEach(m => rollFlavor(m, MODS[m.id].p, rng));
  s.root.atoms.forEach(a => rollFlavor(a, ATOMS[a.id].p, rng));
  if (s.root.chain) {
    rollFlavor(s.root.chain.carrier, CARRIERS[s.root.chain.carrier.id].p, rng);
    s.root.chain.atoms.forEach(a => rollFlavor(a, ATOMS[a.id].p, rng));
  }
  s.drawbacks.forEach(d => rollFlavor(d, DRAWBACKS[d.id].p, rng));
}

// ── Type rules: which atom may ride on which shape ──────────────────────
function atomAllowed(s, a, carrierId, payload, { keystone = false, child = false, allowLaw = false, perEnemy = false } = {}) {
  const A = ATOMS[a];
  if (perEnemy && ['summon', 'corpse'].includes(A.who)) return false;
  // a chained shape should add something new, not repeat its parent
  if (child && !allowLaw && !['damage', 'dot'].includes(a) && s.root.atoms.some(x => x.id === a)) return false;
  const C = CARRIERS[carrierId];
  const law = A.law || 0;
  if (law > s.lawCap) return false;
  if (law && !keystone && !allowLaw && (lawUsed(s) || child)) return false;
  if (A.only && !A.only.includes(carrierId)) return false;
  if (A.trig && !A.trig.includes(s.trigger)) return false;
  if (A.noTick && C.tick) return false;
  if (A.single && !C.single) return false;
  if (carrierId === 'global' && !A.global) return false;
  if (payload.some(x => x.id === a)) return false;
  if (ATOM_CONFLICTS.some(([x, y]) => (x === a && payload.some(o => o.id === y)) || (y === a && payload.some(o => o.id === x)))) return false;
  if (A.hard && payload.some(x => ATOMS[x.id].hard)) return false;
  if (A.needsDamage && !payload.some(x => x.id === 'damage' || x.id === 'dot')) return false;
  if (A.who === 'enemies' && !C.hits) return false;
  if (A.who === 'corpse' && carrierId === 'self' && (child || s.trigger !== 'onKill')) return false;
  return true;
}

// ── Intent, trigger, keystone, carrier ──────────────────────────────────
function rollTier(rng) {
  return rng.weighted(TIER_ORDER.map(t => [t, TIERS[t].weight]));
}

function rollEssences(rng, tier) {
  const n = rng.weighted(ESSENCE_COUNT[tier]);
  const pool = [...ESSENCE_IDS];
  const out = [];
  while (out.length < n) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}

function pickHook(s, rng) {
  const entries = Object.entries(HOOKS)
    .filter(([, H]) => atLeast(s.tier, H.minTier))
    .map(([h, H]) => {
      let boost = 1;
      s.essences.forEach((e, i) => { boost += s.mix[i] * (ESSENCES[e].hooks[h] || 0); });
      return [h, H.w * boost];
    });
  return rng.weighted(entries);
}

function pickTrigger(s, rng) {
  const reactive = hookOf(s).reactive || rng.chance(0.07);
  if (!reactive) return 'cast';
  return rng.weighted(Object.entries(TRIGGERS)
    .filter(([t, D]) => t !== 'cast' && atLeast(s.tier, D.minTier))
    .map(([t, D]) => [t, D.w]));
}

function carrierOptions(s, keystone) {
  const trig = TRIGGERS[s.trigger];
  return Object.keys(CARRIERS).filter(c => {
    if ((CARRIERS[c].law || 0) > s.lawCap) return false;
    if (s.forceCarrier) return c === s.forceCarrier && atomAllowed(s, keystone, c, [], { keystone: true });
    if (c === 'global') return false;
    if (trig.carriers && !trig.carriers.includes(c)) return false;
    return atomAllowed(s, keystone, c, [], { keystone: true });
  });
}

function pickKeystone(s, rng) {
  const T = TIERS[s.tier];
  const trig = TRIGGERS[s.trigger];
  let need = 0;
  if (s.tier === 'godly') need = 2;
  else if (s.lawCap && rng.chance(T.keyLaw)) need = 1;
  // A godly power may reshape the whole arena instead of breaking a law directly.
  if (s.tier === 'godly' && s.trigger === 'cast' && rng.chance(s.hook === 'domain' ? 0.6 : 0.12)) {
    s.forceCarrier = 'global';
    need = 0;
  }
  const H = hookOf(s);
  const mixA = blend(s, 'atoms', ATOM_IDS, id => (ATOMS[id].law ? (need ? 0.25 : 0.05) : 0.3));
  const entries = [];
  for (const a of ATOM_IDS) {
    const A = ATOMS[a];
    if ((A.law || 0) > s.lawCap) continue;
    if (need === 2 && !(A.law === 2 || A.godlyKey)) continue;
    if (need === 1 && !A.law) continue;
    if (!carrierOptions(s, a).length) continue;
    let w = mixA[a];
    if (H.atoms) w *= H.atoms[a] || 0.15;
    if (trig.atoms) w *= trig.atoms[a] || 0.3;
    if (A.law && H.lawBoost) w *= H.lawBoost;
    entries.push([a, w]);
  }
  return rng.weighted(entries);
}

function pickCarrier(s, rng, keystone) {
  const opts = carrierOptions(s, keystone);
  const H = hookOf(s);
  const mixC = blend(s, 'carriers', opts, 0.5);
  return rng.weighted(opts.map(c => [c, mixC[c] * (H.carriers ? H.carriers[c] || 0.4 : 1)]));
}

// ── Growing the tree ────────────────────────────────────────────────────
function secondaryOptions(s, carrierId = s.root.carrier.id, payload = s.root.atoms, opts = {}) {
  return ATOM_IDS.filter(a => atomAllowed(s, a, carrierId, payload, opts));
}

function addSecondary(s, rng, carrierId, payload, opts = {}) {
  const C = CARRIERS[carrierId];
  const H = hookOf(s);
  const trig = TRIGGERS[s.trigger];
  const mixA = blend(s, 'atoms', ATOM_IDS, id => (ATOMS[id].law ? 0 : 0.3));
  const hasHarm = payload.some(x => ATOMS[x.id].who === 'enemies');
  const entries = secondaryOptions(s, carrierId, payload, opts).map(a => {
    const A = ATOMS[a];
    let w = mixA[a];
    if (H.atoms?.[a]) w *= 1 + H.atoms[a] * 0.3;
    if (trig.atoms?.[a]) w *= 1.5;
    if (C.hits && !hasHarm && A.who === 'enemies') w *= 3;
    if (C.hits && A.who === 'allies') w *= 0.5;
    if (a === 'lifesteal') w *= 1.5;
    return [a, w];
  });
  const pick = rng.weighted(entries);
  if (pick) payload.push(rollFlavor({ id: pick, s: {} }, ATOMS[pick].p, rng));
  return pick;
}

// An enemy-hitting shape should do something to enemies, unless the
// intent is support.
function ensureHarm(s) {
  const C = CARRIERS[s.root.carrier.id];
  if (!C.hits || SUPPORT_HOOKS.includes(s.hook)) return;
  if (s.root.atoms.some(a => ['enemies', 'corpse'].includes(ATOMS[a.id].who))) return;
  if (atomAllowed(s, 'damage', s.root.carrier.id, s.root.atoms)) s.root.atoms.push({ id: 'damage', s: {} });
}

function modOptions(s, carrierId, mods) {
  return MOD_IDS.filter(m => {
    const M = MODS[m];
    if (!M.c.includes(carrierId)) return false;
    if (mods.some(x => x.id === m)) return false;
    if ((M.law || 0) > s.lawCap) return false;
    if (M.law && lawUsed(s)) return false;
    if (m === 'charge' && s.trigger !== 'cast') return false;
    return !MOD_CONFLICTS.some(([x, y]) =>
      (x === m && mods.some(o => o.id === y)) || (y === m && mods.some(o => o.id === x)));
  });
}

function addMod(s, rng) {
  const opts = modOptions(s, s.root.carrier.id, s.root.mods);
  const H = hookOf(s);
  const mixM = blend(s, 'mods', opts, 0.4);
  const pick = rng.weighted(opts.map(m => [m, mixM[m] * (H.mods ? H.mods[m] || 0.5 : 1)]));
  if (pick) s.root.mods.push(rollFlavor({ id: pick, s: {} }, MODS[pick].p, rng));
  return pick;
}

function chainEvents(s) {
  const C = CARRIERS[s.root.carrier.id];
  const harms = s.root.atoms.some(a => ['damage', 'dot', 'execute', 'mark'].includes(a.id));
  return C.on.filter(e => e !== 'kill' || harms);
}

// A "hit" chain on a shape that hits many enemies fires once per enemy.
const perEnemyChain = (s, on) => on === 'hit' && !['bolt', 'lob', 'strike'].includes(s.root.carrier.id);

function addChain(s, rng, n) {
  const events = chainEvents(s);
  if (!events.length) return false;
  const mixC = blend(s, 'carriers', Object.keys(CHILD_CARRIERS), 0.5);
  for (let attempt = 0; attempt < 4; attempt++) {
    const on = rng.pick(events);
    const cc = rng.weighted(Object.entries(CHILD_CARRIERS).map(([c, ev]) => [c, (ev[on] || 0) * mixC[c]]));
    if (!cc) continue;
    const chain = { on, carrier: rollFlavor({ id: cc, s: {} }, CARRIERS[cc].p, rng), atoms: [] };
    s.root.chain = chain;
    for (let i = 0; i < n; i++) addSecondary(s, rng, cc, chain.atoms, { child: true, perEnemy: perEnemyChain(s, on) });
    if (chain.atoms.length) return true;
    s.root.chain = null;
  }
  return false;
}

function drawbackOptions(s) {
  const C = CARRIERS[s.root.carrier.id];
  const passive = s.trigger !== 'cast';
  return DRAWBACK_IDS.filter(d => {
    const D = DRAWBACKS[d];
    if (!atLeast(s.tier, D.minTier)) return false;
    if (s.drawbacks.some(x => x.id === d)) return false;
    if (D.active && passive) return false;
    if (D.needs === 'aim' && controlOf(s) !== 'aim') return false;
    if (D.needs === 'areaDamage' && !(C.area && s.root.atoms.some(a => a.id === 'damage' || a.id === 'dot'))) return false;
    return true;
  });
}

function addDrawback(s, rng) {
  const opts = drawbackOptions(s);
  const mixD = blend(s, 'drawbacks', opts, 0);
  const pick = rng.weighted(opts.map(d => [d, DRAWBACKS[d].w * (1 + mixD[d])]));
  if (pick) s.drawbacks.push(rollFlavor({ id: pick, s: {} }, DRAWBACKS[pick].p, rng));
  return pick;
}

// ── Power budget ────────────────────────────────────────────────────────
export const budgetOf = s => TIERS[s.tier].budget * (hookOf(s).budget || 1) + (s.bonus || 0);

function structureCost(s) {
  let c = CARRIERS[s.root.carrier.id].base + (TRIGGERS[s.trigger].cost || 0);
  for (const m of s.root.mods) c += MODS[m.id].base;
  for (const a of s.root.atoms) c += ATOMS[a.id].base;
  if (s.root.chain) {
    c += 0.5 + CARRIERS[s.root.chain.carrier.id].base;
    for (const a of s.root.chain.atoms) c += ATOMS[a.id].base;
  }
  return c;
}

function refundOf(s) {
  return s.drawbacks.reduce((r, d) => r + (d.id === 'hpCost'
    ? 1 + stepValue(DRAWBACKS.hpCost.p.pct, d.s.pct || 0) / 10
    : DRAWBACKS[d.id].refund), 0);
}

// The last extra atom that can go without leaving an enemy-hitting shape toothless.
function removableAtom(s) {
  for (let i = s.root.atoms.length - 1; i > 0; i--) {
    const rest = s.root.atoms.filter((_, j) => j !== i);
    const needsHarm = CARRIERS[s.root.carrier.id].hits && !SUPPORT_HOOKS.includes(s.hook);
    if (!needsHarm || rest.some(a => ['enemies', 'corpse'].includes(ATOMS[a.id].who))) return i;
  }
  return -1;
}

// Structure must leave at least 2 PP for numbers. High tiers pay with a
// drawback first ("forbidden" powers); low tiers drop extras.
function fitBudget(s, rng) {
  for (let guard = 0; guard < 12; guard++) {
    if (structureCost(s) - refundOf(s) - budgetOf(s) + 2 <= 0) return;
    if (tierIndex(s.tier) >= 3 && s.drawbacks.length < 2 && addDrawback(s, rng)) continue;
    if (s.root.chain) { s.root.chain = null; continue; }
    if (s.root.mods.length) { s.root.mods.pop(); continue; }
    const i = removableAtom(s);
    if (i > 0) { s.root.atoms.splice(i, 1); continue; }
    if (s.drawbacks.length < 2 && addDrawback(s, rng)) continue;
    return;
  }
}

function tunables(s) {
  const list = [];
  const add = (key, kind, holder, defs) => {
    for (const [name, def] of Object.entries(defs || {})) {
      if (def[3] > 0) list.push({ key: key + '.' + name, kind, holder, name, def });
    }
  };
  add('c', 'carrier', s.root.carrier, CARRIERS[s.root.carrier.id].p);
  s.root.mods.forEach((m, i) => add('m' + i, 'mod', m, MODS[m.id].p));
  s.root.atoms.forEach((a, i) => add('a' + i, 'atom', a, ATOMS[a.id].p));
  if (s.root.chain) {
    add('cc', 'carrier', s.root.chain.carrier, CARRIERS[s.root.chain.carrier.id].p);
    s.root.chain.atoms.forEach((a, i) => add('ca' + i, 'atom', a, ATOMS[a.id].p));
  }
  const cd = cooldownDef(s);
  if (cd) list.push({ key: 'cd', kind: 'timing', holder: s.timing, name: 'cd', def: cd });
  return list;
}

// Personality: each power leans on a few of its numbers. One fire bolt
// becomes a slow sun, another a rapid-fire ember.
function persona(s, key) {
  const x = hashString(s.persona + '|' + key) / 4294967296;
  return 0.15 + x * x * 3;
}

function hardTotal(s) {
  return allAtoms(s)
    .filter(a => ATOMS[a.id].hard)
    .reduce((sum, a) => sum + stepValue(ATOMS[a.id].p.dur, a.s.dur || 0), 0);
}

const ccRoom = (s, t) =>
  t.kind !== 'atom' || t.name !== 'dur' || !ATOMS[t.holder.id].hard || hardTotal(s) + t.def[2] <= HARD_CC_CAP + 1e-9;

// A lasting effect must end at least 2s before the power is ready again.
function lastingRoom(s, t) {
  const cd = cooldownDef(s);
  if (!cd) return true;
  const lasting = allAtoms(s).filter(a => LASTING.includes(a.id));
  if (!lasting.length) return true;
  const cdNow = stepValue(cd, s.timing.s.cd || 0);
  const longest = Math.max(...lasting.map(a => stepValue(ATOMS[a.id].p.dur, a.s.dur || 0)));
  if (t.key === 'cd') return cdNow - cd[2] >= longest + 2;
  if (t.kind === 'atom' && t.name === 'dur' && LASTING.includes(t.holder.id)) return stepValue(t.def, t.holder.s.dur + 1) + 2 <= cdNow;
  return true;
}

function solve(s, rng, keep = false) {
  const tun = tunables(s);
  for (const t of tun) t.holder.s[t.name] = keep ? Math.min(t.holder.s[t.name] || 0, maxSteps(t.def)) : 0;
  const structure = structureCost(s);
  const refund = refundOf(s);
  const base = budgetOf(s);
  const stepsCost = () => tun.reduce((sum, t) => sum + t.holder.s[t.name] * t.def[3], 0);
  let left = base + refund - structure - stepsCost();
  while (left < -1e-9) {
    const owned = tun.filter(t => t.holder.s[t.name] > 0);
    if (!owned.length) break;
    const t = rng.pick(owned);
    t.holder.s[t.name]--;
    left += t.def[3];
  }
  for (let guard = 0; guard < 4000; guard++) {
    const opts = tun.filter(t => t.holder.s[t.name] < maxSteps(t.def) && t.def[3] <= left + 1e-9 && ccRoom(s, t) && lastingRoom(s, t));
    if (!opts.length) break;
    const t = rng.weighted(opts.map(o => [o, persona(s, o.key)]));
    t.holder.s[t.name]++;
    left -= t.def[3];
  }
  const cdT = tun.find(t => t.key === 'cd');
  const cdCost = cdT ? cdT.holder.s.cd * cdT.def[3] : 0;
  s.budget = {
    total: round2(base + refund), base: round2(base), refund: round2(refund), structure: round2(structure),
    magnitude: round2(stepsCost() - cdCost), cooldown: round2(cdCost), left: round2(Math.max(0, left)),
  };
}

// Leftover budget buys more structure, so a power spends what its tier gives it.
function topUp(s, rng) {
  for (let i = 0; i < 3 && s.budget.left > 3 && nodeCount(s) < TIERS[s.tier].nodes; i++) {
    const before = nodeCount(s);
    if (rng.chance(0.5)) addMod(s, rng) || addSecondary(s, rng, s.root.carrier.id, s.root.atoms);
    else addSecondary(s, rng, s.root.carrier.id, s.root.atoms) || addMod(s, rng);
    if (nodeCount(s) === before) break;
    fitBudget(s, rng);
    solve(s, rng);
  }
}

function finish(s, rng, keep = false) {
  rollAllFlavor(s, rng);
  fitBudget(s, rng);
  solve(s, rng, keep);
  present(s);
  return s;
}

// ── Public API ──────────────────────────────────────────────────────────
export function forge(opts = {}) {
  const seed = String(opts.seed || randomSeed()).toUpperCase();
  const root = makeRng('forge:' + seed);
  const tier = TIERS[opts.tier] ? opts.tier : rollTier(root.fork('tier'));
  const T = TIERS[tier];
  const locked = (opts.essences || []).filter(e => ESSENCES[e]).slice(0, 3);
  const essRng = root.fork('essence');
  const essences = locked.length ? locked : rollEssences(essRng, tier);
  const mix = essences.map((_, i) => (i === 0 ? 1 : round2(essRng.float(0.35, 0.8))));
  const rng = root.fork('build');

  const s = {
    code: seed + '.' + T.letter + (locked.length ? '.' + locked.join('+') : ''),
    seed, persona: seed, tier, essences, mix,
    lawCap: T.law && rng.chance(T.lawChance) ? T.law : 0,
    hook: null, trigger: 'cast',
    root: { carrier: null, mods: [], atoms: [], chain: null },
    drawbacks: [], timing: { s: {} }, lineage: [], bonus: 0,
  };
  s.hook = pickHook(s, rng);
  s.trigger = pickTrigger(s, rng);

  const key = pickKeystone(s, rng) || 'damage';
  const carrier = pickCarrier(s, rng, key) || 'nova';
  delete s.forceCarrier;
  s.root.carrier = rollFlavor({ id: carrier, s: {} }, CARRIERS[carrier].p, rng);
  s.root.atoms.push(rollFlavor({ id: key, s: {}, key: true }, ATOMS[key].p, rng));

  const extraAtoms = tier === 'common' ? rng.int(0, 1) : tier === 'rare' ? 1 : rng.int(1, 2);
  for (let i = 0; i < extraAtoms && nodeCount(s) < T.nodes - 1; i++) addSecondary(s, rng, carrier, s.root.atoms);
  ensureHarm(s);

  // A chain-reaction intent grows its chain before modifiers take the room.
  const growChain = () => {
    const wantChain = T.chain > 0 && (hookOf(s).forceChain || rng.chance(T.chain));
    if (wantChain && nodeCount(s) <= T.nodes - 2) {
      addChain(s, rng, tierIndex(tier) >= 3 && nodeCount(s) <= T.nodes - 3 ? 2 : 1);
    }
  };
  if (hookOf(s).forceChain) growChain();
  let mods = tier === 'common' ? (rng.chance(0.4) ? 1 : 0)
    : tier === 'rare' ? (rng.chance(0.6) ? 1 : 0)
    : 1 + (rng.chance(tier === 'epic' ? 0.25 : tier === 'legendary' ? 0.4 : 0.5) ? 1 : 0);
  if (carrier === 'global') mods = 0;
  for (let i = 0; i < mods && nodeCount(s) < T.nodes; i++) addMod(s, rng);
  if (!hookOf(s).forceChain) growChain();
  if (hookOf(s).forceDrawback) addDrawback(s, rng);
  if (rng.chance(DRAWBACK_CHANCE[tier])) addDrawback(s, rng);

  rollAllFlavor(s, rng);
  fitBudget(s, rng);
  solve(s, rng);
  topUp(s, rng);
  present(s);
  return s;
}

function strip(p) {
  const { code, seed, persona: ps, tier, essences, mix, lawCap, hook, trigger, root, drawbacks, timing, lineage, bonus } = p;
  return JSON.parse(JSON.stringify({ code, seed, persona: ps, tier, essences, mix, lawCap, hook, trigger, root, drawbacks, timing, lineage, bonus }));
}

function upgradeOptions(s) {
  const key = s.root.atoms[0];
  return (UPGRADES[key.id] || []).filter(u => {
    const law = ATOMS[u].law || 0;
    if (law > s.lawCap) return false;
    const otherLaw = allAtoms(s).some(a => a !== key && ATOMS[a.id].law) || s.root.mods.some(m => MODS[m.id].law);
    if (law && otherLaw) return false;
    return atomAllowed(s, u, s.root.carrier.id, s.root.atoms.slice(1), { keystone: true });
  });
}

// One mutation per evolution, and one tier up. The power keeps its old
// numbers and spends the new budget on top, so it grows instead of rerolling.
export function evolve(parent, code) {
  const rng = makeRng('evolve:' + code);
  const s = strip(parent);
  s.code = code;
  if (tierIndex(s.tier) < 4) s.tier = TIER_ORDER[tierIndex(s.tier) + 1];
  else s.bonus = (s.bonus || 0) + 5; // already godly: overcharge instead
  const T = TIERS[s.tier];
  s.lawCap = Math.max(s.lawCap, T.law);

  const room = nodeCount(s) < T.nodes;
  const menu = [];
  if (room && modOptions(s, s.root.carrier.id, s.root.mods).length) menu.push(['mod', 3]);
  if (room && secondaryOptions(s).length) menu.push(['atom', 2.5]);
  if (T.chain > 0 && !s.root.chain && nodeCount(s) <= T.nodes - 2 && chainEvents(s).length) menu.push(['chain', 3]);
  if (room && s.root.chain && s.root.chain.atoms.length < 2 &&
      secondaryOptions(s, s.root.chain.carrier.id, s.root.chain.atoms, { child: true, perEnemy: perEnemyChain(s, s.root.chain.on) }).length) menu.push(['chainAtom', 1.5]);
  if (s.essences.length < 3) menu.push(['infuse', 1.5]);
  const ups = upgradeOptions(s);
  if (ups.length) menu.push(['ascend', tierIndex(s.tier) >= 2 ? 4 : 1]);

  const kind = rng.weighted(menu) || 'overcharge';
  let change = { kind };
  if (kind === 'mod') change.id = addMod(s, rng);
  else if (kind === 'atom') change.id = addSecondary(s, rng, s.root.carrier.id, s.root.atoms);
  else if (kind === 'chain') {
    addChain(s, rng, 1);
    change.id = s.root.chain?.carrier.id;
    change.on = s.root.chain?.on;
  } else if (kind === 'chainAtom') change.id = addSecondary(s, rng, s.root.chain.carrier.id, s.root.chain.atoms, { child: true, perEnemy: perEnemyChain(s, s.root.chain.on) });
  else if (kind === 'infuse') {
    const e = rng.pick(ESSENCE_IDS.filter(x => !s.essences.includes(x)));
    s.essences.push(e);
    s.mix.push(0.6);
    change.id = e;
    if (room) change.brought = rng.chance(0.5) ? addSecondary(s, rng, s.root.carrier.id, s.root.atoms) || addMod(s, rng)
      : addMod(s, rng) || addSecondary(s, rng, s.root.carrier.id, s.root.atoms);
  } else if (kind === 'ascend') {
    const u = rng.pick(ups);
    const old = s.root.atoms[0];
    change.from = old.id;
    change.id = u;
    s.root.atoms[0] = { id: u, s: {}, key: true };
    // the old keystone stays on as a regular effect when it still fits
    delete old.key;
    if (nodeCount(s) < T.nodes && atomAllowed(s, old.id, s.root.carrier.id, s.root.atoms)) s.root.atoms.splice(1, 0, old);
  }
  s.lineage = [...(parent.lineage || []), { from: parent.name, tier: s.tier, change }];
  return finish(s, rng, true);
}

// Fusion folds the second power into the first: A's shape, and on impact
// (or when it ends, or on a kill) B's shape goes off too.
export function fuse(a, b, code) {
  const rng = makeRng('fuse:' + code);
  const tier = TIER_ORDER[Math.min(4, Math.max(tierIndex(a.tier), tierIndex(b.tier)) + 1)];
  const T = TIERS[tier];
  const s = strip(a);
  const essences = [...new Set([...a.essences, ...b.essences])].slice(0, 3);
  Object.assign(s, {
    code, persona: code, tier, essences,
    mix: essences.map((_, i) => (i === 0 ? 1 : 0.6)),
    lawCap: Math.max(a.lawCap, b.lawCap, T.law),
    timing: { s: {} }, bonus: 0,
    lineage: [{ fused: [a.name, b.name], tier }],
  });
  s.drawbacks = [...s.drawbacks, ...JSON.parse(JSON.stringify(b.drawbacks)).filter(d => !s.drawbacks.some(x => x.id === d.id))].slice(0, 2);

  let how = 'blend';
  const child = FUSE_CHILD[b.root.carrier.id];
  if (!s.root.chain && child) {
    const events = chainEvents(s).filter(e => (CHILD_CARRIERS[child][e] || 0) > 0);
    if (events.length) {
      const on = rng.weighted(events.map(e => [e, CHILD_CARRIERS[child][e]]));
      const chain = { on, carrier: { id: child, s: {} }, atoms: [] };
      s.root.chain = chain;
      for (const x of b.root.atoms) {
        if (chain.atoms.length >= 2) break;
        const allowLaw = !!ATOMS[x.id].law && !lawUsed(s);
        if (atomAllowed(s, x.id, child, chain.atoms, { child: true, allowLaw, perEnemy: perEnemyChain(s, on) })) chain.atoms.push({ id: x.id, s: {} });
      }
      if (chain.atoms.length) how = 'chain';
      else s.root.chain = null;
    }
  }
  if (how !== 'chain') {
    // Merge instead: B's effects (laws first) join A's payload, or A's
    // existing chain when A's own shape can't carry them.
    const targets = [[s.root.carrier.id, s.root.atoms, {}]];
    if (s.root.chain) targets.push([s.root.chain.carrier.id, s.root.chain.atoms, { child: true, perEnemy: perEnemyChain(s, s.root.chain.on) }]);
    const incoming = [...b.root.atoms].sort((x, y) => (ATOMS[y.id].law || 0) - (ATOMS[x.id].law || 0));
    let added = 0;
    for (const x of incoming) {
      if (added >= 2) break;
      const allowLaw = !!ATOMS[x.id].law && !lawUsed(s);
      const spot = targets.find(([cid, payload, opts]) => atomAllowed(s, x.id, cid, payload, { ...opts, allowLaw }));
      if (spot) {
        spot[1].push({ id: x.id, s: {} });
        added++;
      }
    }
    const mod = b.root.mods.find(m => modOptions(s, s.root.carrier.id, s.root.mods).includes(m.id));
    if (mod) s.root.mods.push({ id: mod.id, s: {} });
    if (added || mod) how = 'merge';
  }
  s.fusion = how;
  return finish(s, rng);
}

// Codes make any power reproducible and shareable:
//   SEED.T[.essence+essence]   a forged power (T = C/R/E/L/G)
//   CODE>                      that power evolved once more
//   (CODE)x(CODE)              two powers fused
export function fromCode(input) {
  const code = String(input).trim();
  if (!code) throw new Error('Enter a power code.');
  if (code.endsWith('>')) return evolve(fromCode(code.slice(0, -1)), code);
  if (code.startsWith('(')) {
    let depth = 0;
    let i = 0;
    for (; i < code.length; i++) {
      if (code[i] === '(') depth++;
      if (code[i] === ')' && --depth === 0) break;
    }
    const rest = code.slice(i + 1);
    if (!rest.startsWith('x(') || !rest.endsWith(')')) throw new Error(`"${code}" is not a valid fusion code.`);
    return fuse(fromCode(code.slice(1, i)), fromCode(rest.slice(2, -1)), code);
  }
  const [seed, letter, ess] = code.split('.');
  const tier = TIER_ORDER.find(t => TIERS[t].letter === String(letter || '').toUpperCase());
  if (!seed || !/^[0-9A-Za-z]{1,12}$/.test(seed) || !tier) {
    throw new Error(`"${code}" is not a power code. Codes look like 7K2F9Q.E or 7K2F9Q.G.time+death.`);
  }
  const essences = ess ? ess.split('+').map(e => e.toLowerCase()).filter(e => ESSENCES[e]) : undefined;
  return forge({ seed, tier, essences });
}

export const evolveCode = s => s.code + '>';
export const fuseCode = (a, b) => `(${a.code})x(${b.code})`;
