// Presentation: turns a power's DNA into a name, rules text and a tree.
// Everything here is derived from the DNA, so two players holding the same
// code always see the same card.
import { makeRng } from './rng.js';
import { TIERS, ATOMS, CARRIERS, MODS, TRIGGERS, DRAWBACKS, HOOKS, UNITS, paramValues, stepValue } from './data-atoms.js';
import { ESSENCES } from './data-essences.js';
import { allAtoms, controlOf, cooldownDef, label } from './shared.js';

const fmt = n => String(Math.round(n * 100) / 100);
const cap = str => str.charAt(0).toUpperCase() + str.slice(1);
const an = word => (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word;
const strip = str => str.replace(/^(a|an|your) /, '');
const round5 = n => Math.max(5, Math.round(n / 5) * 5);

function listJoin(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return items.join(' and ');
  return items.slice(0, -1).join(', ') + ', and ' + items.at(-1);
}

const P = (holder, defs) => paramValues(holder, defs);
const atomP = a => P(a, ATOMS[a.id].p);

// Each atom takes its flavor from the essence that cares about it most,
// so a Fire/Death power burns with fire but raises the dead as skeletons.
function flavorFor(s, atomId) {
  let best = s.essences[0];
  let bestW = -1;
  s.essences.forEach((e, i) => {
    const w = s.mix[i] * ((ESSENCES[e].atoms[atomId] || 0) + (i === 0 ? 0.5 : 0));
    if (w > bestW) { best = e; bestW = w; }
  });
  return ESSENCES[best];
}

// The atom that headlines the power: its law if it has one, else the keystone.
export function headline(s) {
  const atoms = allAtoms(s);
  const law = [...atoms].sort((x, y) => (ATOMS[y.id].law || 0) - (ATOMS[x.id].law || 0))[0];
  return ATOMS[law.id].law ? law : s.root.atoms[0];
}

// ── Sentences ───────────────────────────────────────────────────────────
function carrierLead(s, holder, E, passive) {
  const c = holder.id;
  const p = P(holder, CARRIERS[c].p);
  const m = E.mat;
  if (passive) {
    switch (c) {
      case 'strike': return `${E.strike} slams into the nearest enemy after ${fmt(p.delay)}s (${fmt(p.radius)}m area)`;
      case 'bolt': return `you fire ${an(m + ' bolt')} at the nearest enemy`;
      case 'nova': return `you release a ${fmt(p.radius)}m ${m} burst around you`;
      case 'aura': return `a ${fmt(p.radius)}m ${m} aura surrounds you for ${fmt(p.dur)}s`;
      case 'orbitals': return `${p.count} ${m} orbs circle you for ${fmt(p.dur)}s`;
      case 'trap': return p.charges > 1 ? `you leave ${p.charges} hidden ${m} runes behind (${fmt(p.radius)}m)` : `you leave a hidden ${m} rune behind (${fmt(p.radius)}m)`;
      case 'zone': return `a ${fmt(p.radius)}m ${m} field opens around you for ${fmt(p.dur)}s`;
      default: return '';
    }
  }
  switch (c) {
    case 'bolt': {
      const size = p.size <= 0.6 ? 'small' : p.size >= 1.3 ? 'huge' : '';
      const speed = p.speed <= 10 ? 'slow' : p.speed >= 17 ? 'fast' : '';
      const adj = [size, speed].filter(Boolean).join(', ');
      return `Hurl ${an((adj ? adj + ' ' : '') + m + ' bolt')} (${fmt(p.range)}m range)`;
    }
    case 'lob': return `Lob ${an(m + ' orb')} up to ${fmt(p.range)}m. It bursts in a ${fmt(p.radius)}m radius`;
    case 'beam': return `Hold to channel a ${fmt(p.length)}m ${m} beam for up to ${fmt(p.dur)}s`;
    case 'cone': return `Unleash a ${fmt(p.length)}m ${m} blast in a ${p.angle}° cone`;
    case 'nova': return `Release a ${fmt(p.radius)}m ${m} burst around you`;
    case 'zone': return `Open a ${fmt(p.radius)}m ${m} field up to 9m away for ${fmt(p.dur)}s`;
    case 'aura': return `Surround yourself with a ${fmt(p.radius)}m ${m} aura for ${fmt(p.dur)}s`;
    case 'dash': return `Dash ${fmt(p.dist)}m in a ${m} streak, hitting everything in your path`;
    case 'leap': return `Leap to a spot up to ${fmt(p.range)}m away and crash down in a ${fmt(p.radius)}m ${m} impact`;
    case 'trap': return p.charges > 1
      ? `Place ${p.charges} hidden ${m} runes (${fmt(p.radius)}m). Each one triggers when an enemy steps on it`
      : `Place a hidden ${m} rune (${fmt(p.radius)}m) that triggers when an enemy steps on it`;
    case 'orbitals': return `Summon ${p.count} ${m} orbs that circle you for ${fmt(p.dur)}s`;
    case 'wall': return `Raise a ${fmt(p.length)}m ${m} wall for ${fmt(p.dur)}s. It blocks enemies and their shots`;
    case 'strike': return `Mark a ${fmt(p.radius)}m area up to 10m away. After ${fmt(p.delay)}s, ${E.strike} slams into it`;
    case 'tether': return `Throw a ${m} chain that latches onto the first enemy within ${fmt(p.range)}m for ${fmt(p.dur)}s`;
    case 'imbue': return `Charge your next ${p.hits} basic attacks with ${m} power`;
    case 'global': return `${E.sky} for ${fmt(p.dur)}s across the entire arena`;
    default: return '';
  }
}

// Opening clause of a chained shape: when it goes off, and where.
function chainIntro(ch, parentId, E) {
  const c = ch.carrier.id;
  const p = P(ch.carrier, CARRIERS[c].p);
  const m = E.mat;
  const size = c === 'wall' ? `${fmt(p.length)}m` : `${fmt(p.radius)}m`;
  const runes = p.charges > 1 ? `${p.charges} hidden ${m} runes` : `a hidden ${m} rune`;
  const perEnemy = ch.on === 'hit' && !['bolt', 'lob', 'strike'].includes(parentId);
  if (c === 'self') {
    if (perEnemy) return 'For each enemy hit';
    if (ch.on === 'hit') return 'On impact';
    if (ch.on === 'kill') return 'If it defeats an enemy';
    if (ch.on === 'end') return parentId === 'dash' ? 'At the end of the dash' : 'When you land';
    return 'When it ends';
  }
  if (perEnemy) {
    switch (c) {
      case 'nova': return `Each enemy hit erupts in a ${size} ${m} burst`;
      case 'zone': return `Each enemy hit leaves a ${size} ${m} field behind for ${fmt(p.dur)}s`;
      case 'strike': return `${cap(E.strike)} slams into each enemy hit ${fmt(p.delay)}s later (${size})`;
      case 'wall': return `A ${size} ${m} wall rises behind each enemy hit for ${fmt(p.dur)}s`;
      case 'trap': return `Each enemy hit drops ${runes}`;
      default: return '';
    }
  }
  if (ch.on === 'kill') {
    switch (c) {
      case 'nova': return `If it defeats an enemy, the body erupts in a ${size} ${m} burst`;
      case 'zone': return `If it defeats an enemy, the body leaves a ${size} ${m} field for ${fmt(p.dur)}s`;
      case 'strike': return `If it defeats an enemy, ${E.strike} slams into the body ${fmt(p.delay)}s later (${size})`;
      default: return '';
    }
  }
  const when = ch.on === 'hit' ? 'On impact' : ch.on === 'expire' ? 'When it ends'
    : parentId === 'dash' ? 'At the end of the dash' : 'Where you land';
  const who = ch.on === 'end' ? 'you' : 'it';
  const verb = (pl, sg) => (who === 'you' ? pl : sg);
  switch (c) {
    case 'nova': return `${when}, ${who} ${verb('erupt', ch.on === 'expire' ? 'collapses' : 'erupts')} in a ${size} ${m} burst`;
    case 'zone': return `${when}, ${who} ${verb('leave', 'leaves')} a ${size} ${m} field for ${fmt(p.dur)}s`;
    case 'strike': return `${when}, ${E.strike} slams into the spot ${fmt(p.delay)}s later (${size})`;
    case 'wall': return `${when}, a ${size} ${m} wall rises there for ${fmt(p.dur)}s`;
    case 'trap': return `${when}, ${who} ${verb('leave', 'leaves')} ${runes}`;
    default: return '';
  }
}

const CHILD_SUBJECT = { nova: 'enemies caught in it', strike: 'enemies caught in it', zone: 'enemies inside', wall: 'enemies touching it', trap: 'enemies caught' };

function tickLike(c) {
  return CARRIERS[c].tick || c === 'tether';
}

function durationOf(holder) {
  const p = P(holder, CARRIERS[holder.id].p);
  return p.dur || 3;
}

function enemySubject(c, passive) {
  if (c === 'global') return ['every enemy', true];
  if (c === 'tether') return ['while latched, the target', true];
  if (c === 'zone' || c === 'aura') return ['enemies inside', false];
  if (c === 'beam') return ['enemies in the beam', false];
  if (c === 'wall') return ['enemies touching it', false];
  if (c === 'orbitals') return ['enemies touched by an orb', false];
  if (c === 'imbue') return ['enemies you hit', false];
  if (c === 'trap') return ['enemies caught', false];
  if (passive && c === 'bolt') return ['the enemy hit', true];
  return ['enemies hit', false];
}

// Reading order for effects on enemies: damage first, then movement, then control.
const ENEMY_ORDER = ['damage', 'dot', 'execute', 'mark', 'push', 'pull', 'launch', 'slow', 'root', 'stun', 'fear',
  'silence', 'blind', 'confuse', 'hex', 'clockSlow', 'clockStop', 'control', 'swap', 'exchange', 'steal', 'link', 'negate'];
// On a lingering shape these land once per enemy rather than every tick.
const ONCE_ON_TICK = ['mark', 'push', 'launch', 'root', 'stun', 'fear', 'silence', 'blind', 'confuse', 'hex', 'clockStop'];

// Returns { main, note }: main joins the effect list, note is an extra
// sentence for effects that need explaining.
function enemyPhrase(a, s, carrierHolder, sg) {
  const c = carrierHolder.id;
  const p = atomP(a);
  const E = flavorFor(s, a.id);
  const tick = tickLike(c) && c !== 'global';
  const v = (pl, one) => (sg ? one : pl);
  const out = (main, note = '') => ({ main, note });
  switch (a.id) {
    case 'damage':
      if (tickLike(c)) return out(`${v('take', 'takes')} ${round5((p.amount / durationOf(carrierHolder)) * 1.3)} damage per second`);
      if (c === 'orbitals') return out(`${v('take', 'takes')} ${round5(p.amount * 0.5)} damage per orb`);
      return out(`${v('take', 'takes')} ${p.amount} damage`);
    case 'dot': return out(`${v('suffer', 'suffers')} ${E.status} (${p.dps}/s for ${fmt(p.dur)}s)`);
    case 'mark': return out(`${v('are', 'is')} branded with ${an(E.mat)} mark that detonates for ${p.amount} damage after ${fmt(p.delay)}s`);
    case 'execute': return out(`${v('are', 'is')} instantly defeated if below ${p.threshold}% HP`);
    case 'push': return out(`${v('are', 'is')} knocked back ${fmt(p.dist)}m`);
    case 'pull': {
      const toYou = ['bolt', 'tether', 'dash', 'cone', 'imbue', 'nova', 'aura', 'leap', 'global', 'beam', 'orbitals'].includes(c);
      const target = c === 'wall' ? 'it' : toYou ? 'you' : 'the center';
      return out(tickLike(c) && c !== 'tether' ? `${v('are', 'is')} dragged toward ${target}` : `${v('are', 'is')} pulled ${fmt(p.dist)}m toward ${target}`);
    }
    case 'launch': return out(`${v('are', 'is')} launched into the air for ${fmt(p.dur)}s`);
    case 'slow': return out(tick
      ? `${v('are', 'is')} slowed by ${p.pct}%`
      : `${v('are', 'is')} slowed by ${p.pct}% for ${fmt(p.dur)}s`);
    case 'root': return out(`${v('are', 'is')} rooted for ${fmt(p.dur)}s`);
    case 'stun': return out(`${v('are', 'is')} stunned for ${fmt(p.dur)}s`);
    case 'silence': return out(`${v('are', 'is')} silenced for ${fmt(p.dur)}s (no powers)`);
    case 'blind': return out(`${v('are', 'is')} blinded for ${fmt(p.dur)}s (vision shrinks and half their attacks miss)`);
    case 'confuse': return out(`${v('have', 'has')} their controls inverted for ${fmt(p.dur)}s`);
    case 'fear': return out(`${v('flee', 'flees')} in terror for ${fmt(p.dur)}s`);
    case 'hex': return out(`${v('are', 'is')} turned into ${E.critter} for ${fmt(p.dur)}s (no attacks, no powers)`);
    case 'swap': return out(`${v('swap', 'swaps')} places with you`);
    case 'steal': return out(`${v('lose', 'loses')} a random power to you for ${fmt(p.dur)}s`);
    case 'link': return out(`${v('are', 'is')} soul-linked to you for ${fmt(p.dur)}s`,
      `While linked, ${p.pct}% of the damage you take is dealt to them instead.`);
    case 'negate': return out(tick
      ? `can't cast powers and ${v('lose', 'loses')} all buffs`
      : `can't cast powers for ${fmt(p.dur)}s and ${v('lose', 'loses')} all buffs`);
    case 'clockSlow': return out(tick
      ? `${v('are', 'is')} time-slowed by ${p.pct}% (movement, attacks and cooldowns)`
      : `${v('are', 'is')} time-slowed by ${p.pct}% for ${fmt(p.dur)}s (movement, attacks and cooldowns)`);
    case 'clockStop': return out(`${v('are', 'is')} frozen in time for ${fmt(p.dur)}s`,
      'Damage you deal to frozen enemies is stored and lands all at once when time resumes.');
    case 'control': return out(`${v('are', 'is')} dominated for ${fmt(p.dur)}s`,
      'While dominated, you steer them and their attacks hit their own team.');
    case 'exchange': return out(`${v('swap', 'swaps')} HP percentages with you`);
    default: return out('');
  }
}

function allyPhrase(a, s, carrierHolder) {
  const c = carrierHolder.id;
  const p = atomP(a);
  const E = flavorFor(s, a.id);
  const tick = tickLike(c) && c !== 'tether';
  const out = (main, note = '') => ({ main, note });
  switch (a.id) {
    case 'heal': return out(tick ? `regenerate ${round5((p.amount / durationOf(carrierHolder)) * 1.3)} HP per second` : `heal ${p.amount} HP`);
    case 'shield': return out(`gain a ${p.amount} HP shield for ${fmt(p.dur)}s`);
    case 'lifesteal': return out(`heal for ${p.pct}% of the damage dealt`);
    case 'cleanse': return out('are cleansed of all negative effects');
    case 'haste': return out(`move ${p.pct}% faster for ${fmt(p.dur)}s`);
    case 'empower': return out(`deal ${p.pct}% more damage with the next ${p.hits} attacks`);
    case 'invis': return out(`turn invisible for ${fmt(p.dur)}s`);
    case 'blink': return out(['bolt', 'lob', 'strike'].includes(c) ? 'teleport to where it lands' : `teleport ${fmt(p.dist)}m in the direction you are moving`);
    case 'reflect': return out(`reflect enemy projectiles back at their owners for ${fmt(p.dur)}s`);
    case 'clockHaste': return out(`speed up your personal time by ${p.pct}% for ${fmt(p.dur)}s (move, attack and recharge faster)`);
    case 'rewind': return out(`rewind ${fmt(p.secs)}s into the past`,
      'Your position, HP and cooldowns snap back to where they were.');
    case 'transform': return out(`transform into a ${E.form} for ${fmt(p.dur)}s`,
      `As a ${E.form} you are ${p.bonus}% bigger with ${p.bonus}% more max HP, your basic attacks become ${E.formAttack}, and ${E.formPerk}.`);
    case 'resurrect': return out(`revive on the spot with ${p.hpPct}% HP`);
    default: return out('');
  }
}

function summonSentence(a, s, carrierHolder, child) {
  const c = carrierHolder.id;
  const p = atomP(a);
  const E = flavorFor(s, a.id);
  const where = child && c !== 'self' ? 'there' : c === 'self' ? 'beside you' : c === 'nova' ? 'around you' : c === 'trap' ? 'when it triggers'
    : c === 'leap' ? 'where you land' : c === 'dash' ? 'where you started' : c === 'global' ? 'all over the arena' : 'where it lands';
  if (a.id === 'summon') {
    const who = p.count === 1 ? an(E.minion[0]) : `${p.count} ${E.minion[1]}`;
    return `${cap(who)} ${p.count === 1 ? 'appears' : 'appear'} ${where} and ${p.count === 1 ? 'fights' : 'fight'} for you for ${fmt(p.dur)}s with ${p.pow}% of your strength.`;
  }
  if (a.id === 'titan') {
    const arrive = c === 'strike' ? 'crashes down from the sky' : `rises ${where}`;
    return `${cap(E.titan)} (${p.hp} HP) ${arrive} and fights for you for ${fmt(p.dur)}s.`;
  }
  if (a.id === 'clone') {
    const who = p.count === 1 ? an(E.clones[0]) : `${p.count} ${E.clones[1]}`;
    return `${cap(who)} ${p.count === 1 ? 'appears' : 'appear'} ${where} for ${fmt(p.dur)}s, copying your attacks at ${p.dmg}% damage.`;
  }
  return '';
}

function groundSentence(a, s, carrierHolder) {
  const c = carrierHolder.id;
  const p = atomP(a);
  const E = flavorFor(s, a.id);
  const where = c === 'nova' ? 'around you' : c === 'leap' ? 'where you land' : c === 'dash' ? 'along your path'
    : c === 'cone' ? 'in front of you' : 'where it lands';
  return `The ground ${where} becomes ${E.terrain} for ${fmt(p.dur)}s (${fmt(p.size)}m).`;
}

function raiseSentence(a, s, carrierHolder) {
  const c = carrierHolder.id;
  const p = atomP(a);
  const E = flavorFor(s, a.id);
  const thralls = E === ESSENCES.death || !E.atoms.raise ? 'undead' : `${E.mat} thralls`;
  const tail = `for ${fmt(p.dur)}s (up to ${p.count}, with ${p.hpPct}% of their HP)`;
  if (c === 'self') return `The defeated enemy rises as your ${thralls} servant ${tail}.`;
  if (c === 'global') return `Any fighter who falls during it rises as your ${thralls} ${tail}.`;
  if (tickLike(c)) return `Fighters and minions that fall inside it rise as your ${thralls} ${tail}.`;
  return `Enemies hit that fall within 6s, and any fallen fighters in the area, rise as your ${thralls} ${tail}.`;
}

// Renders one payload (the atoms riding one shape) as sentences.
function payloadSentences(s, atoms, carrierHolder, { passive = false, subject = null, child = false } = {}) {
  const c = carrierHolder.id;
  const out = [];
  const enemies = atoms.filter(a => ATOMS[a.id].who === 'enemies')
    .sort((x, y) => ENEMY_ORDER.indexOf(x.id) - ENEMY_ORDER.indexOf(y.id));
  const helps = atoms.filter(a => ['allies', 'self'].includes(ATOMS[a.id].who));
  if (enemies.length) {
    const [subj, sg] = subject ? [subject, false] : enemySubject(c, passive);
    const lingering = CARRIERS[c].tick && c !== 'global';
    const now = lingering ? enemies.filter(a => !ONCE_ON_TICK.includes(a.id)) : enemies;
    const once = lingering ? enemies.filter(a => ONCE_ON_TICK.includes(a.id)) : [];
    const parts = now.map(a => enemyPhrase(a, s, carrierHolder, sg));
    if (parts.length) out.push(`${cap(subj)} ${listJoin(parts.map(x => x.main))}.`);
    if (once.length) {
      const firstTime = { beam: 'The first time the beam touches an enemy', wall: 'The first time an enemy touches it' }[c] || 'The first time an enemy enters';
      const onceParts = once.map(a => enemyPhrase(a, s, carrierHolder, false));
      out.push(`${firstTime}, they ${listJoin(onceParts.map(x => x.main))}.`);
      parts.push(...onceParts);
    }
    for (const x of parts) if (x.note) out.push(x.note);
  }
  if (helps.length) {
    const area = ['nova', 'aura', 'zone', 'global'].includes(c);
    const groups = { you: [], team: [] };
    for (const a of helps) (area && ATOMS[a.id].who === 'allies' ? groups.team : groups.you).push(a);
    const teamSubject = c === 'zone' ? 'you and allies inside' : c === 'global' ? 'you and every ally' : 'you and nearby allies';
    for (const [key, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const parts = list.map(a => allyPhrase(a, s, carrierHolder));
      out.push(`${cap(key === 'team' ? teamSubject : 'you')} ${listJoin(parts.map(x => x.main))}.`);
      for (const x of parts) if (x.note) out.push(x.note);
    }
  }
  for (const a of atoms) {
    const who = ATOMS[a.id].who;
    if (who === 'summon') out.push(summonSentence(a, s, carrierHolder, child));
    if (who === 'ground') out.push(groundSentence(a, s, carrierHolder));
    if (who === 'corpse') out.push(raiseSentence(a, s, carrierHolder));
  }
  return out;
}

function modPhrase(m, carrierId, E) {
  const p = P(m, MODS[m.id].p);
  switch (m.id) {
    case 'lingering': return ['bolt', 'dash'].includes(carrierId)
      ? `leaves ${an(E.mat)} trail for ${fmt(p.dur)}s that re-applies its effects at 30% strength`
      : `leaves ${an(E.mat)} afterglow on the ground for ${fmt(p.dur)}s that re-applies its effects at 30% strength`;
    case 'pierce': return 'pierces through enemies';
    case 'split': return `splits into ${p.count} shards on impact`;
    case 'bounce': return `chains to ${p.count} more ${p.count === 1 ? 'enemy' : 'enemies'}`;
    case 'homing': return 'homes in on the nearest enemy';
    case 'boomerang': return 'flies back to you, hitting again on the return';
    case 'growing': return ['zone', 'aura'].includes(carrierId) ? 'grows larger over its lifetime' : 'grows larger the farther it travels';
    case 'volley': return carrierId === 'strike' ? `strikes ${p.count} times in a row` : carrierId === 'lob' ? `lobs ${p.count} at once` : `fires ${p.count} at once in a spread`;
    case 'delayed': return `detonates after a ${fmt(p.delay)}s delay`;
    case 'charge': return `can be held to charge up to ${p.bonus}% more size and power`;
    case 'echo': return `repeats itself ${fmt(p.delay)}s later${p.count > 1 ? `, ${p.count} times` : ''}`;
    case 'mirror': return 'fires a mirrored copy in the opposite direction';
    case 'ghost': return 'passes through walls';
    default: return '';
  }
}

function drawbackSentence(d, passive) {
  const cast = passive ? 'Each trigger' : 'Casting it';
  switch (d.id) {
    case 'hpCost': return `${passive ? 'Each trigger costs' : 'Costs'} ${stepValue(DRAWBACKS.hpCost.p.pct, d.s.pct || 0)}% of your current HP.`;
    case 'windup': return 'Long windup: you are rooted for 0.7s while casting.';
    case 'exhaust': return 'Afterwards you are slowed by 40% for 2s.';
    case 'fragile': return `You take 30% more damage for 3s after ${passive ? 'it triggers' : 'casting'}.`;
    case 'friendly': return 'Unstable: it also hits you if you are caught in it.';
    case 'wobble': return 'Wild aim: it veers up to 25° off course.';
    case 'lockout': return `${cast} puts your other powers on a 3s cooldown.`;
    case 'reveal': return `${cast} reveals your position to every enemy for 4s.`;
    case 'bloodDebt': return 'Blood debt: if no enemy falls within 6s, you lose 25% of your max HP.';
    case 'limited': return 'Can only be cast twice per match.';
    default: return '';
  }
}

// ── Names ───────────────────────────────────────────────────────────────
const ATOM_NOUNS = {
  damage: ['Strike', 'Blast', 'Ruin'], dot: ['Scourge', 'Blight', 'Affliction'], mark: ['Doom', 'Brand', 'Omen', 'Countdown'],
  execute: ['Verdict', 'Guillotine', 'Final Word'], push: ['Repulse', 'Rebuke', 'Shove'], pull: ['Undertow', 'Snare', 'Gravity'],
  launch: ['Uplift', 'Geyser', 'Toss'], slow: ['Mire', 'Drag', 'Lull'], root: ['Binding', 'Shackle', 'Anchor'],
  stun: ['Daze', 'Crash', 'Shock'], silence: ['Hush', 'Muting', 'Gag'], blind: ['Glare', 'Veil', 'Blindside'],
  confuse: ['Madness', 'Vertigo', 'Delirium'], fear: ['Terror', 'Dread', 'Panic'], heal: ['Mercy', 'Renewal', 'Mending'],
  shield: ['Aegis', 'Bulwark', 'Ward'], lifesteal: ['Hunger', 'Thirst', 'Feast'], cleanse: ['Purge', 'Absolution'],
  haste: ['Rush', 'Tailwind', 'Quickstep'], empower: ['Fury', 'Wrath', 'Might'], invis: ['Vanish', 'Fade', 'Cloak'],
  blink: ['Flicker', 'Jaunt', 'Shift'], reflect: ['Mirror', 'Retort', 'Riposte'], terrain: ['Ground', 'Expanse', 'Field'],
  summon: ['Brood', 'Pack', 'Host', 'Swarm'], clone: ['Echoes', 'Twins', 'Doppelganger'], hex: ['Hex', 'Curse', 'Mockery'],
  swap: ['Switch', 'Transposition'], steal: ['Heist', 'Theft', 'Pilfer'], link: ['Bond', 'Covenant'],
  negate: ['Null', 'Unmaking', 'Silence'], clockSlow: ['Lull', 'Languor', 'Slowtime'], clockHaste: ['Overclock', 'Quickening', 'Accelerando'],
  transform: ['Aspect', 'Avatar', 'Incarnation', 'Ascension'], clockStop: ['Halt', 'Stillness', 'Stasis', 'Standstill'],
  rewind: ['Rewind', 'Reversal', 'Undoing'], raise: ['Legion', 'Harvest', 'Uprising', 'Wake'], titan: ['Colossus', 'Titan', 'Behemoth'],
  control: ['Dominion', 'Puppetry', 'Possession'], exchange: ['Exchange', 'Soul Trade', 'Barter'], resurrect: ['Rebirth', 'Undying', 'Return'],
};

// Abstract nouns for "Lance of ___" style names.
const OF_NOUNS = {
  damage: ['Ruin', 'Havoc', 'Wrath'], dot: ['Blight', 'Agony'], mark: ['Doom', 'Omens'], execute: ['Judgment', 'Endings'],
  push: ['Repulsion', 'Rebuke'], pull: ['Gravity', 'the Undertow'], launch: ['Ascent', 'Upheaval'], slow: ['Lethargy', 'the Mire'],
  root: ['Binding', 'Chains'], stun: ['Stupor', 'Thunder'], silence: ['Silence', 'Hush'], blind: ['Glare', 'Blindness'],
  confuse: ['Madness', 'Vertigo'], fear: ['Dread', 'Terror'], heal: ['Mercy', 'Renewal'], shield: ['Warding', 'the Bulwark'],
  lifesteal: ['Hunger', 'Thirst'], cleanse: ['Purity', 'Absolution'], haste: ['Swiftness', 'the Wind'], empower: ['Fury', 'Might'],
  invis: ['Vanishing', 'Veils'], blink: ['Flickering', 'Passage'], reflect: ['Mirrors', 'Retort'], terrain: ['the Wilds', 'Shaping'],
  summon: ['the Pack', 'the Brood', 'the Host'], clone: ['Mirrors', 'Echoes'], hex: ['Mockery', 'Curses'], swap: ['Transposition'],
  steal: ['Thieves', 'Pilfering'], link: ['Bonds', 'the Covenant'], negate: ['Nullity', 'Unmaking'], clockSlow: ['Languor', 'Slow Hours'],
  clockHaste: ['Quickening', 'Swift Hours'], transform: ['Ascension', 'Becoming'], clockStop: ['Stillness', 'Stasis'],
  rewind: ['Reversal', 'Undoing'], raise: ['the Legion', 'the Risen'], titan: ['Titans', 'the Colossus'], control: ['Dominion', 'Puppetry'],
  exchange: ['Exchange', 'Trade'], resurrect: ['Rebirth', 'Return'],
};

const EPITHETS = {
  clockStop: ['The Stillness Between Seconds', 'When the Clocks Hold Their Breath', 'The Hour That Refused to Pass'],
  rewind: ['What Was Undone', 'Yesterday, Again', 'The Second Chance'],
  raise: ['Where the Fallen Answer', "The Grave's Reply", 'An Army of Yesterday'],
  control: ['The Strings Beneath the Skin', 'The Borrowed Will', 'Kneel'],
  exchange: ['A Fair Trade', 'Your Life for Mine'],
  resurrect: ['Death Declined', 'The Ember That Would Not Die', 'Not Yet'],
  transform: ['Blood of the {form}', 'The {form} Awakens', "Wearing the {form}'s Skin"],
  titan: ['{titan} Unchained', 'The Call of the {titan}'],
};

function makeName(s) {
  const rng = makeRng('name:' + s.code);
  const E = ESSENCES[s.essences[0]];
  const E2 = s.essences[1] ? ESSENCES[s.essences[1]] : null;
  const head = headline(s);
  const law = ATOMS[head.id].law || 0;
  for (let tries = 0; tries < 8; tries++) {
    const cn = rng.pick(CARRIERS[s.root.carrier.id].nouns);
    const atomNoun = rng.pick(ATOM_NOUNS[head.id] || ['Power']);
    const ofNoun = rng.pick(OF_NOUNS[head.id] || ['Power']);
    const adj = rng.pick(E.adj);
    const noun = rng.pick(E.noun);
    const options = [
      [`${adj} ${cn}`, law ? 1 : 3],
      [`${noun} ${cn}`, law ? 0.5 : 2],
      [`${cn} of ${ofNoun}`, 1.2],
      [`${adj} ${atomNoun}`, law ? 4 : 1.5],
      [`${noun} ${atomNoun}`, law ? 2.5 : 1],
    ];
    if (E2) {
      options.push([`${adj} ${rng.pick(E2.noun)}`, 2]);
      options.push([`${rng.pick(E2.adj)} ${noun} ${cn}`, 1]);
    }
    const name = rng.weighted(options);
    const words = name.toLowerCase().split(/[\s-]+/);
    if (new Set(words).size === words.length) return name;
  }
  return `${E.adj[0]} ${CARRIERS[s.root.carrier.id].nouns[0]}`;
}

function makeEpithet(s) {
  if (s.tier !== 'godly') return '';
  const rng = makeRng('epithet:' + s.code);
  const head = headline(s);
  const E = flavorFor(s, head.id);
  const pool = s.root.carrier.id === 'global' ? [ESSENCES[s.essences[0]].epithet] : EPITHETS[head.id] || [E.epithet];
  return rng.pick(pool).replace('{form}', E.form).replace('{titan}', cap(strip(E.titan)));
}

// ── Assembly ────────────────────────────────────────────────────────────
function rulesText(s) {
  const passive = s.trigger !== 'cast';
  const rootC = s.root.carrier;
  const E = ESSENCES[s.essences[0]];
  const lines = [];
  const cd = cooldownDef(s);
  const cdVal = cd ? stepValue(cd, s.timing.s.cd || 0) : null;
  const trig = TRIGGERS[s.trigger];

  let lead = carrierLead(s, rootC, E, passive);
  if (passive) {
    const when = trig.text.replace('{n}', fmt(cdVal));
    const limit = cd && s.trigger !== 'every' ? ` (at most once every ${fmt(cdVal)}s)` : '';
    lines.push(lead ? `${when}${limit}, ${lead}.` : `${when}${limit}:`);
  } else if (lead) {
    lines.push(lead + '.');
  }
  const mods = s.root.mods.map(m => modPhrase(m, rootC.id, E)).filter(Boolean);
  if (mods.length) lines.push(`It ${listJoin(mods)}.`);
  const payload = payloadSentences(s, s.root.atoms, rootC, { passive });
  if (passive && !lead && payload.length) {
    // "When you drop below 30% HP: you rewind 3s..." reads better lower-cased
    payload[0] = payload[0].charAt(0).toLowerCase() + payload[0].slice(1);
    lines[lines.length - 1] += ' ' + payload.shift();
  }
  lines.push(...payload);

  if (s.root.chain) {
    const ch = s.root.chain;
    const E2 = ESSENCES[s.essences[1] || s.essences[0]];
    const intro = chainIntro(ch, rootC.id, E2);
    const sentences = payloadSentences(s, ch.atoms, ch.carrier, { subject: CHILD_SUBJECT[ch.carrier.id], child: true });
    if (ch.carrier.id === 'self') {
      if (sentences.length) sentences[0] = `${intro}, ${sentences[0].charAt(0).toLowerCase()}${sentences[0].slice(1)}`;
    } else {
      lines.push(intro + '.');
    }
    lines.push(...sentences);
  }
  for (const d of s.drawbacks) lines.push(drawbackSentence(d, passive));
  return lines.filter(Boolean);
}

function windupOf(s) {
  let w = CARRIERS[s.root.carrier.id].cast;
  const law = Math.max(0, ...allAtoms(s).map(a => ATOMS[a.id].law || 0), ...s.root.mods.map(m => MODS[m.id].law || 0));
  if (law === 1) w = Math.max(w, 0.35);
  if (law === 2) w = Math.max(w, 0.6);
  if (s.drawbacks.some(d => d.id === 'windup')) w += 0.7;
  return Math.round(w * 100) / 100;
}

// The intent label describes what was actually grown. If the tree drifted
// away from its starting intent, relabel it by its atoms and shape.
const INTENT_TEST = {
  cascade: s => !!s.root.chain,
  sacrifice: s => s.drawbacks.length > 0,
  guardian: s => s.trigger !== 'cast',
  domain: s => ['aura', 'zone', 'global'].includes(s.root.carrier.id),
  barrage: s => s.root.mods.some(m => ['volley', 'echo', 'homing'].includes(m.id)) || ['orbitals', 'strike'].includes(s.root.carrier.id),
};

function intentOf(s) {
  const H = HOOKS[s.hook];
  const test = INTENT_TEST[s.hook];
  const key = s.root.atoms[0].id;
  const fits = test ? test(s) : (H.atoms?.[key] || 0) >= 2 || allAtoms(s).some(a => ATOMS[a.id].law && (H.atoms?.[a.id] || 0) >= 2);
  if (fits) return H.name;
  let best = s.hook;
  let bestScore = -1;
  for (const [h, D] of Object.entries(HOOKS)) {
    if (!D.atoms || (D.reactive && s.trigger === 'cast')) continue;
    const score = allAtoms(s).reduce((t, a) => t + (D.atoms[a.id] || 0) * (a.key ? 2 : 1), 0) + (D.carriers?.[s.root.carrier.id] || 0);
    if (score > bestScore) { best = h; bestScore = score; }
  }
  return HOOKS[best].name;
}

export function present(s) {
  const cd = cooldownDef(s);
  const head = headline(s);
  const law = ATOMS[head.id].law || 0;
  s.name = makeName(s);
  s.epithet = makeEpithet(s);
  s.text = rulesText(s);
  s.stats = {
    tier: TIERS[s.tier].name,
    control: controlOf(s),
    cooldown: cd ? stepValue(cd, s.timing.s.cd || 0) : null,
    windup: s.trigger === 'cast' ? windupOf(s) : null,
    telegraph: law > 0 && s.trigger === 'cast',
    law,
    keystone: head.id,
    hook: intentOf(s),
    trigger: s.trigger,
  };
  return s;
}

// A flat, indented view of the DNA for cards and the CLI.
export function dnaTree(s) {
  const rows = [];
  const params = (holder, defs) => Object.entries(P(holder, defs))
    .map(([k, v]) => `${k} ${fmt(v)}${UNITS[k] ?? ''}`).join(' · ');
  const cd = cooldownDef(s);
  rows.push({ depth: 0, kind: 'trigger', id: s.trigger, label: label(s.trigger), detail: [controlOf(s), cd ? `cd ${fmt(stepValue(cd, s.timing.s.cd || 0))}s` : ''].filter(Boolean).join(' · ') });
  rows.push({ depth: 0, kind: 'carrier', id: s.root.carrier.id, label: label(s.root.carrier.id), detail: params(s.root.carrier, CARRIERS[s.root.carrier.id].p) });
  for (const m of s.root.mods) rows.push({ depth: 1, kind: 'mod', id: m.id, law: MODS[m.id].law || 0, label: label(m.id), detail: params(m, MODS[m.id].p) });
  for (const a of s.root.atoms) rows.push({ depth: 1, kind: 'atom', id: a.id, key: !!a.key, law: ATOMS[a.id].law || 0, label: label(a.id), detail: params(a, ATOMS[a.id].p) });
  if (s.root.chain) {
    const ch = s.root.chain;
    rows.push({ depth: 1, kind: 'chain', id: ch.on, label: label(ch.on), detail: '' });
    rows.push({ depth: 2, kind: 'carrier', id: ch.carrier.id, label: label(ch.carrier.id), detail: params(ch.carrier, CARRIERS[ch.carrier.id].p) });
    for (const a of ch.atoms) rows.push({ depth: 3, kind: 'atom', id: a.id, law: ATOMS[a.id].law || 0, label: label(a.id), detail: params(a, ATOMS[a.id].p) });
  }
  for (const d of s.drawbacks) rows.push({ depth: 0, kind: 'drawback', id: d.id, label: label(d.id), detail: params(d, DRAWBACKS[d.id].p) });
  return rows;
}

// Structural fingerprint, used to measure how varied the output really is.
export function shapeOf(s) {
  const r = s.root;
  const atoms = r.atoms.map(a => a.id).sort().join('+');
  const mods = r.mods.map(m => m.id).sort().join('+');
  const chain = r.chain ? `${r.chain.on}>${r.chain.carrier.id}(${r.chain.atoms.map(a => a.id).sort().join('+')})` : '';
  return `${s.trigger}|${r.carrier.id}|${mods}|${atoms}|${chain}`;
}
