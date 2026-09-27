// Rules shared by the generator and the text layer.
import { TIERS, ATOMS, CARRIERS, MODS, TRIGGERS } from './data-atoms.js';

export const allAtoms = s => [...s.root.atoms, ...(s.root.chain ? s.root.chain.atoms : [])];

export const lawUsed = s =>
  allAtoms(s).some(a => ATOMS[a.id].law) || s.root.mods.some(m => MODS[m.id].law);

export const nodeCount = s =>
  1 + s.root.atoms.length + s.root.mods.length + (s.root.chain ? 1 + s.root.chain.atoms.length : 0);

export function controlOf(s) {
  if (s.trigger !== 'cast') return 'passive';
  if (s.root.mods.some(m => MODS[m.id].ctl)) return 'hold';
  return CARRIERS[s.root.carrier.id].ctl;
}

// Things that stay on the field. The solver keeps their duration below the
// cooldown, so a form, clone or summon is never permanent.
export const LASTING = ['transform', 'clone', 'summon', 'titan', 'raise'];

// Cooldown for pressed powers, internal cooldown for passives. Powers that
// break a major law never recharge faster than 20s.

export function cooldownDef(s) {
  const T = TIERS[s.tier];
  const atoms = allAtoms(s);
  const law = Math.max(0, ...atoms.map(a => ATOMS[a.id].law || 0));
  let lo;
  let hi;
  if (s.trigger === 'cast') {
    [lo, hi] = T.cd;
  } else {
    const icd = TRIGGERS[s.trigger].icd;
    if (!icd) return null;
    [lo, hi] = icd;
    if (law) { lo = Math.max(lo, T.cd[0]); hi = Math.max(hi, T.cd[1]); }
  }
  if (law === 2) lo = Math.max(lo, 20);
  return [lo, Math.max(hi, lo + 2), 0.5, 0.5, 'inv'];
}

// Display names for every building block.
export const LABELS = {
  damage: 'Damage', dot: 'Damage over time', mark: 'Delayed mark', execute: 'Execute', push: 'Knockback',
  pull: 'Pull', launch: 'Launch', slow: 'Slow', root: 'Root', stun: 'Stun', silence: 'Silence', blind: 'Blind',
  confuse: 'Confuse', fear: 'Fear', heal: 'Heal', shield: 'Shield', lifesteal: 'Lifesteal', cleanse: 'Cleanse',
  haste: 'Haste', empower: 'Empower', invis: 'Invisibility', blink: 'Teleport', reflect: 'Reflect',
  terrain: 'Terrain', summon: 'Summon', clone: 'Clones', hex: 'Polymorph', swap: 'Swap places',
  steal: 'Steal power', link: 'Soul link', negate: 'Null field', clockSlow: 'Time slow', clockHaste: 'Time haste',
  transform: 'Transformation', clockStop: 'Time stop', rewind: 'Rewind', raise: 'Raise dead', titan: 'Titan',
  control: 'Mind control', exchange: 'HP exchange', resurrect: 'Resurrection',
  bolt: 'Bolt', lob: 'Lob', beam: 'Beam', cone: 'Cone', nova: 'Nova', zone: 'Zone', aura: 'Aura', dash: 'Dash',
  leap: 'Leap', trap: 'Trap', orbitals: 'Orbitals', wall: 'Wall', strike: 'Sky strike', tether: 'Tether',
  self: 'Self', imbue: 'Imbue', global: 'Whole arena',
  pierce: 'Pierce', split: 'Split', bounce: 'Chain', homing: 'Homing', boomerang: 'Boomerang', growing: 'Growing',
  lingering: 'Lingering', volley: 'Volley', delayed: 'Delayed', charge: 'Charge-up', echo: 'Echo', mirror: 'Mirror',
  ghost: 'Phasing',
  hpCost: 'HP cost', windup: 'Long windup', exhaust: 'Exhaustion', fragile: 'Fragile', friendly: 'Unstable',
  wobble: 'Wild aim', lockout: 'Lockout', reveal: 'Reveals you', bloodDebt: 'Blood debt', limited: 'Twice per match',
  cast: 'Press', lowHp: 'Below 30% HP', whenHit: 'When hit', onDodge: 'On dodge', onKill: 'On kill',
  onDeath: 'On death', every: 'Every few seconds',
  hit: 'on impact', expire: 'when it ends', kill: 'on kill', end: 'on landing',
};

export const label = id => LABELS[id] || id;
