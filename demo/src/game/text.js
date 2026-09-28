// Turns a power's rules text into game copy: a headline, effect lines tagged
// by what they do (with icons), numbers and status words emphasized, costs
// set apart, and a few stat chips (damage, area, cooldown).

import { CARRIERS, paramValues } from '../../../prototypes/skill-forge/data-atoms.js';
import { atomParams } from './atoms.js';
import { STYLE } from '../vfx/styles.js';

// 20×20 line icons (stroke = currentColor)
const P = {
  dmg: '<path d="M4 16l9-9M11 4h5v5M13 7l3-3"/><path d="M3 13l4 4"/>',
  area: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2.5"/>',
  range: '<path d="M3 10h13M12 6l4 4-4 4"/><circle cx="4" cy="10" r="1.2"/>',
  time: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>',
  cc: '<path d="M10 3l1.8 4.2L16 8l-3.3 2.8.9 4.4L10 13l-3.6 2.2.9-4.4L4 8l4.2-.8z"/>',
  help: '<path d="M10 16s-6-3.6-6-8a3.2 3.2 0 0 1 6-1.6A3.2 3.2 0 0 1 16 8c0 4.4-6 8-6 8z"/>',
  summon: '<path d="M6 9a4 4 0 1 1 8 0v5l-2-1-2 1-2-1-2 1z"/><circle cx="8.5" cy="9" r=".6"/><circle cx="11.5" cy="9" r=".6"/>',
  shape: '<path d="M4 14c3-8 9-8 12 0"/><path d="M13 6l3 1-1 3"/>',
  cost: '<path d="M10 3l8 14H2z"/><path d="M10 8v4M10 14.5v.5"/>',
  ult: '<path d="M10 2l2.4 5 5.6.8-4 3.9.9 5.5L10 14.6 5.1 17.2 6 11.7 2 7.8 7.6 7z"/>',
  dot: '<path d="M10 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z"/>',
  passive: '<path d="M4 10a6 6 0 0 1 10.4-4M16 10a6 6 0 0 1-10.4 4"/><path d="M14 3v3h-3M6 17v-3h3"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.shape}</svg>`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// status words and outcomes worth a glance
const KEY = [
  'frozen in time', 'time-slowed', 'stunned', 'rooted', 'silenced', 'blinded', 'launched into the air', 'launched', 'knocked back', 'pulled',
  'dragged toward', 'flee in terror', 'controls inverted', 'turned into [a-z ]+?(?= for)', 'dominated', 'swap places', 'swaps HP percentages',
  'instantly defeated', 'invisible', 'shield', 'heal', 'regenerate', 'cleansed', 'reflect', 'teleport', 'transform into [A-Z][A-Za-z ]+?(?= for)',
  'rewind', 'rise as your undead', 'lose a random power', 'soul-linked', 'stored', 'faster', 'more damage', 'branded',
  'Burn|Frostbite|Shock|Tremor|Drown|Poison|Sear|Gloom|Wither|Bleed|Unravel|Rend|Dread|Chill|Static',
];
const KEY_RE = new RegExp(`\\b(${KEY.join('|')})\\b`, 'g');
const NUM_RE = /(\b\d+(?:\.\d+)?)(\s?(?:m\b|s\b|%|HP\b|\/s\b))?/g;

function emphasize(text) {
  let h = esc(text);
  h = h.replace(KEY_RE, '<b class="k">$1</b>');
  h = h.replace(NUM_RE, (m, n, u) => `<b class="n">${n}${u ? u.trim() : ''}</b>`);
  return h;
}

function kindOf(line) {
  if (/^(Costs|Afterwards you|Casting it|You take \d|Long windup|Wild aim|Blood debt|Each trigger puts|You can only)/.test(line)) return 'cost';
  if (/appear|rise as your undead|crashes down|hollow shells|copying your attacks|fight for you/.test(line)) return 'summon';
  if (/stunned|rooted|silenced|frozen|launched|pulled|dragged|knocked|flee|inverted|blinded|slowed|turned into|dominated|swap|defeated|branded|lose a random/.test(line)) return 'cc';
  if (/^You |You and|heal|shield|faster|invisible|cleansed|reflect|teleport|transform|rewind|regenerate/.test(line)) return 'help';
  if (/damage|suffer/.test(line)) return 'dmg';
  return 'shape';
}

export function carrierStats(dna) {
  const c = dna.root.carrier;
  const p = paramValues(c, CARRIERS[c.id].p);
  switch (c.id) {
    case 'bolt': return { icon: 'range', v: `${p.range}m` };
    case 'lob': return { icon: 'area', v: `${p.radius}m` };
    case 'beam': return { icon: 'range', v: `${p.length}m` };
    case 'cone': return { icon: 'range', v: `${p.length}m` };
    case 'nova': case 'zone': case 'aura': case 'strike': case 'leap': case 'trap': return { icon: 'area', v: `${p.radius}m` };
    case 'dash': return { icon: 'range', v: `${p.dist}m` };
    case 'wall': return { icon: 'range', v: `${p.length}m` };
    case 'tether': return { icon: 'range', v: `${p.range}m` };
    case 'global': return { icon: 'area', v: 'Arena' };
    default: return null;
  }
}

// { headline, lines:[{kind, html}], costs:[html], chips:[{icon, v, cls}], flavor }
export function describePower(dna) {
  const info = dna.info;
  const text = info.text.slice();
  const passive = dna.trigger !== 'cast';
  let headline = text.shift() || '';
  // the first line of a passive already says when it fires
  const lines = [], costs = [];
  for (const t of text) (kindOf(t) === 'cost' ? costs : lines).push({ kind: kindOf(t), html: emphasize(t) });
  const chips = [];
  const dmg = dna.root.atoms.find(a => a.id === 'damage');
  const dot = dna.root.atoms.find(a => a.id === 'dot');
  if (dmg) chips.push({ icon: 'dmg', v: String(atomParams(dmg).amount), cls: 'dmg' });
  else if (dot) { const q = atomParams(dot); chips.push({ icon: 'dot', v: `${q.dps}/s`, cls: 'dmg' }); }
  const cs = carrierStats(dna);
  if (cs) chips.push(cs);
  if (passive) chips.push({ icon: 'passive', v: 'Auto', cls: 'passive' });
  else if (dna.tier === 'godly') chips.push({ icon: 'ult', v: 'Ultimate', cls: 'ult' });
  else chips.push({ icon: 'time', v: `${info.stats.cooldown}s` });
  headline = emphasize(headline.replace(/\s*\((\d+(?:\.\d+)?m)(?: range)?\)/, ''));
  return { headline, lines, costs: costs.map(c => c.html), chips, flavor: info.epithet || '', passive };
}

export const chipsHTML = chips => chips.map(c => `<span class="chip ${c.cls || ''}">${icon(c.icon)}${esc(c.v)}</span>`).join('');

export function linesHTML(d, max = 99) {
  const rows = d.lines.slice(0, max).map(l => `<li class="${l.kind}">${icon(l.kind)}<span>${l.html}</span></li>`);
  const cost = d.costs.map(c => `<li class="cost">${icon('cost')}<span>${c}</span></li>`);
  return `<ul class="fx-lines">${rows.join('')}${cost.join('')}</ul>`;
}

export const essColor = ess => STYLE[ess]?.glow ?? '#ffffff';
