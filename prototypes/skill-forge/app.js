// UI for the Skill Forge page: a level-up draft of generated powers.
import {
  forge, evolve, fuse, fromCode, evolveCode, fuseCode, dnaTree, headline,
  ESSENCES, ESSENCE_IDS, TIERS, TIER_ORDER, HOOKS, ATOMS, label,
} from './skillforge.js';

// Codes the forge produced that show off the top of the range.
const SHOWCASE = [
  { label: 'Time stop', code: 'K2.G.time' },
  { label: 'Stop time everywhere', code: 'KV.G.time' },
  { label: 'Rewind', code: 'K4.G.time' },
  { label: 'Necromancy', code: 'K5.G.death' },
  { label: 'Dragon form', code: 'KD.L.fire' },
  { label: 'Mind control', code: 'K1.G.mind' },
  { label: 'Bone Dragon', code: 'KD.G.death+beast' },
  { label: 'Swap places', code: 'KA.L.space' },
];
const OPENING_DRAFT = ['K15.E', 'KD.L.fire', 'KV.G.time'];

const MAX_KEPT = 6;
const STORE_KEY = 'skill-forge:kept';
const CONTROL_NAMES = { aim: 'Aim', target: 'Target', tap: 'Tap', hold: 'Hold', passive: 'Passive' };

const state = { tier: null, essences: [], draft: [], kept: [], fuseSel: [], traced: null };

const $ = sel => document.querySelector(sel);
const esc = str => String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadKept() {
  try {
    const codes = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    state.kept = codes.slice(0, MAX_KEPT).map(c => { try { return fromCode(c); } catch { return null; } }).filter(Boolean);
  } catch { state.kept = []; }
}
function saveKept() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.kept.map(s => s.code))); } catch { /* storage unavailable */ }
}

// ── Telegraph: what enemies see on the ground ───────────────────────────
function telegraph(s) {
  const W = 240, H = 112, px = 44, py = 56;
  const E = ESSENCES[s.essences[0]];
  const E2 = ESSENCES[s.essences[1] || s.essences[0]];
  const col = E.color, glow = E.glow, col2 = E2.color;
  const c = s.root.carrier.id;
  const mods = s.root.mods.map(m => m.id);
  const parts = [];
  const enemy = (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="var(--enemy)" />`;
  const ring = (x, y, r, dashed, fill = 0.14) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" fill-opacity="${fill}" stroke="${col}" stroke-width="2" ${dashed ? 'stroke-dasharray="5 4"' : ''} />`;
  let impact = [178, 56];
  switch (c) {
    case 'bolt': {
      const spread = mods.includes('volley') ? [-18, 0, 18] : [0];
      for (const dy of spread) {
        const d = mods.includes('homing') ? `M${px} ${py} Q 120 ${py - 40 + dy} 178 ${56 + dy}` : `M${px} ${py} L 178 ${56 + dy}`;
        parts.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="6 5" />`);
        parts.push(`<circle cx="150" cy="${py + dy * 0.8}" r="${4 + 4 * (s.root.carrier.s.size || 0) / 12}" fill="${col}" />`);
      }
      if (mods.includes('mirror')) parts.push(`<path d="M${px} ${py} L 8 ${py}" stroke="${col}" stroke-width="2" stroke-dasharray="6 5" />`);
      if (mods.includes('boomerang')) parts.push(`<path d="M178 56 Q 120 100 ${px + 8} ${py + 8}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="3 4" />`);
      if (mods.includes('split')) for (const a of [-30, 0, 30]) parts.push(`<path d="M178 56 l ${30 * Math.cos(a * Math.PI / 180)} ${30 * Math.sin(a * Math.PI / 180)}" stroke="${col}" stroke-width="2" />`);
      if (mods.includes('bounce')) parts.push(`<path d="M178 56 L 206 30 L 226 70" fill="none" stroke="${col}" stroke-width="2" />`);
      break;
    }
    case 'lob': case 'leap':
      parts.push(`<path d="M${px} ${py} Q 110 -4 170 56" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="6 5" />`);
      parts.push(ring(170, 56, 26, false));
      impact = [170, 56];
      break;
    case 'beam':
      parts.push(`<rect x="${px}" y="${py - 9}" width="176" height="18" rx="9" fill="${col}" fill-opacity="0.28" stroke="${col}" stroke-width="2" />`);
      impact = [214, 56];
      break;
    case 'cone':
      parts.push(`<path d="M${px} ${py} L 190 10 A 150 150 0 0 1 190 102 Z" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="2" />`);
      impact = [150, 56];
      break;
    case 'nova':
      parts.push(ring(px, py, 38, false));
      impact = [px, py];
      break;
    case 'aura':
      parts.push(`<circle cx="${px}" cy="${py}" r="42" fill="${glow}" fill-opacity="0.22" />`);
      parts.push(ring(px, py, 34, true, 0.06));
      impact = [px, py];
      break;
    case 'zone':
      parts.push(ring(165, 56, 38, true, 0.18));
      impact = [165, 56];
      break;
    case 'dash':
      for (const [i, x] of [[0, 70], [1, 98], [2, 126]]) parts.push(`<circle cx="${x}" cy="${py}" r="8" fill="${col}" fill-opacity="${0.15 + i * 0.15}" />`);
      parts.push(`<path d="M${px} ${py} L 182 ${py}" stroke="${col}" stroke-width="3" /><path d="M182 ${py - 9} L 196 ${py} L 182 ${py + 9} Z" fill="${col}" />`);
      impact = [196, 56];
      break;
    case 'trap': {
      const n = Math.min(3, 1 + (s.root.carrier.s.charges || 0));
      [[150, 36], [182, 70], [205, 34]].slice(0, n).forEach(([x, y]) => {
        parts.push(`<circle cx="${x}" cy="${y}" r="14" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="3 3" />`);
        parts.push(`<path d="M${x - 6} ${y} L ${x} ${y - 7} L ${x + 6} ${y} L ${x} ${y + 7} Z" fill="${col}" fill-opacity="0.5" />`);
      });
      impact = [150, 36];
      break;
    }
    case 'orbitals': {
      parts.push(`<circle cx="${px}" cy="${py}" r="30" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="3 5" />`);
      const n = 2 + (s.root.carrier.s.count || 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        parts.push(`<circle cx="${px + 30 * Math.cos(a)}" cy="${py + 30 * Math.sin(a)}" r="5" fill="${col}" />`);
      }
      impact = [px + 30, py];
      break;
    }
    case 'wall':
      parts.push(`<rect x="146" y="10" width="12" height="92" rx="4" fill="${col}" fill-opacity="0.55" stroke="${col}" stroke-width="2" />`);
      impact = [152, 56];
      break;
    case 'strike':
      parts.push(ring(168, 60, 30, true, 0.16));
      for (const x of [150, 168, 186]) parts.push(`<path d="M${x + 16} 0 L ${x} 40" stroke="${col}" stroke-width="2" stroke-opacity="0.7" />`);
      impact = [168, 60];
      break;
    case 'tether':
      parts.push(`<path d="M${px} ${py} L 80 44 L 104 68 L 128 44 L 152 68 L 176 56" fill="none" stroke="${col}" stroke-width="2.5" />`);
      impact = [176, 56];
      break;
    case 'imbue':
      parts.push(`<path d="M${px + 16} ${py - 22} A 26 26 0 0 1 ${px + 16} ${py + 22}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" />`);
      parts.push(`<circle cx="${px}" cy="${py}" r="14" fill="${glow}" fill-opacity="0.35" />`);
      impact = [px + 30, py];
      break;
    case 'global':
      parts.push(`<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="10" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="2" stroke-dasharray="8 6" />`);
      impact = [150, 56];
      break;
    default: // self
      parts.push(`<circle cx="${px}" cy="${py}" r="22" fill="none" stroke="${col}" stroke-width="2" /><circle cx="${px}" cy="${py}" r="30" fill="none" stroke="${glow}" stroke-width="1.5" stroke-dasharray="2 4" />`);
      impact = [px, py];
  }
  if (s.root.chain) {
    const cc = s.root.chain.carrier.id;
    const [ix, iy] = cc === 'self' ? [px, py] : impact;
    const r = cc === 'self' ? 16 : 22;
    parts.push(`<circle cx="${ix}" cy="${iy}" r="${r}" fill="${col2}" fill-opacity="0.14" stroke="${col2}" stroke-width="1.5" stroke-dasharray="2 3" />`);
  }
  const enemies = c === 'global' ? enemy(120, 30) + enemy(200, 86) + enemy(96, 90) : enemy(182, 44) + enemy(204, 76);
  return `<svg class="telegraph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ground telegraph: ${esc(label(c))}">
    <rect width="${W}" height="${H}" rx="10" fill="var(--arena)" />
    <path d="M0 ${H / 2} H ${W} M ${W / 2} 0 V ${H}" stroke="var(--grid)" stroke-width="1" />
    ${enemies}${parts.join('')}
    <circle cx="${px}" cy="${py}" r="8" fill="var(--ink)" stroke="var(--arena)" stroke-width="2" />
  </svg>`;
}

// ── Cards ───────────────────────────────────────────────────────────────
function changeText(l) {
  if (!l) return '';
  if (l.fused) return `Fusion of ${l.fused[0]} + ${l.fused[1]}`;
  const ch = l.change;
  const what = {
    mod: `gained ${label(ch.id)}`, atom: `gained ${label(ch.id)}`, chainAtom: `its chain gained ${label(ch.id)}`,
    chain: `grew a chain: ${label(ch.id)} ${label(ch.on || '')}`, infuse: `infused with ${ESSENCES[ch.id]?.name}`,
    ascend: `${label(ch.from)} ascended into ${label(ch.id)}`, overcharge: 'overcharged (+5 PP)',
  }[ch.kind] || ch.kind;
  return `Evolved from ${l.from}: ${what}`;
}

function budgetBar(s) {
  const b = s.budget;
  const seg = (v, cls, name) => v > 0 ? `<span class="seg ${cls}" style="flex-grow:${v}" title="${name} ${v} PP"></span>` : '';
  return `<div class="budget">
    <div class="budget-bar">${seg(b.structure, 'structure', 'Structure')}${seg(b.magnitude, 'numbers', 'Numbers')}${seg(b.cooldown, 'cooldown', 'Cooldown')}${seg(b.left, 'unspent', 'Unspent')}</div>
    <p class="budget-legend"><span><i class="structure"></i>Structure ${b.structure}</span><span><i class="numbers"></i>Numbers ${b.magnitude}</span><span><i class="cooldown"></i>Cooldown ${b.cooldown}</span><span class="budget-total">${b.total} PP${b.refund ? ` (${b.refund} from drawbacks)` : ''}</span></p>
  </div>`;
}

function dna(s) {
  const rows = dnaTree(s).map(r => `<li class="dna-row" style="--depth:${r.depth}">
      <span class="dna-kind">${esc(r.kind)}</span>
      <span class="dna-label">${r.key ? '<b class="key" title="Keystone">★</b> ' : ''}${esc(r.label)}${r.law ? ` <b class="law">Law ${r.law === 2 ? 'II' : 'I'}</b>` : ''}</span>
      ${r.detail ? `<span class="dna-detail">${esc(r.detail)}</span>` : ''}
    </li>`).join('');
  return `<details class="dna"><summary>DNA</summary><ul>${rows}</ul></details>`;
}

function card(s, where, index) {
  const st = s.stats;
  const ess = s.essences.map(e => `<span class="ess" style="--c:${ESSENCES[e].color}">${esc(ESSENCES[e].name)}</span>`).join('');
  const kept = state.kept.some(k => k.code === s.code);
  const meta = [
    CONTROL_NAMES[st.control],
    st.cooldown != null ? `${st.cooldown}s ${st.control === 'passive' ? 'internal cooldown' : 'cooldown'}` : st.trigger === 'onDeath' ? 'once per match' : 'no cooldown',
    st.windup != null ? `${st.windup}s windup` : '',
  ].filter(Boolean);
  const lineage = s.lineage?.length ? `<p class="lineage">${esc(changeText(s.lineage.at(-1)))}</p>` : '';
  return `<article class="card tier-${s.tier}" style="--ess:${ESSENCES[s.essences[0]].color}">
    <header class="card-head">
      <span class="tier-pill">${esc(st.tier)}</span>
      <span class="ess-row">${ess}</span>
    </header>
    <h3 class="card-name">${esc(s.name)}</h3>
    ${s.epithet ? `<p class="epithet">${esc(s.epithet)}</p>` : ''}
    ${lineage}
    ${telegraph(s)}
    <ul class="meta">${meta.map(m => `<li>${esc(m)}</li>`).join('')}<li class="intent">Intent: ${esc(st.hook)}</li>${st.law ? `<li class="law-chip">Breaks a law: ${esc(label(st.keystone))}</li>` : ''}</ul>
    <div class="rules">${s.text.map(t => `<p>${esc(t)}</p>`).join('')}</div>
    ${dna(s)}
    ${budgetBar(s)}
    <footer class="card-foot">
      <button class="code" type="button" data-copy="${esc(s.code)}" title="Copy code">${esc(s.code)}</button>
      <span class="actions">
        <button type="button" data-act="trace" data-where="${where}" data-i="${index}">Trace</button>
        <button type="button" data-act="evolve" data-where="${where}" data-i="${index}">Evolve</button>
        ${where === 'draft' ? `<button type="button" data-act="keep" data-i="${index}" ${kept ? 'disabled' : ''}>${kept ? 'Kept' : 'Keep'}</button>` : ''}
      </span>
    </footer>
  </article>`;
}

// ── Trace: how this power was grown, step by step ──────────────────────
function trace(s) {
  const b = s.budget;
  const head = headline(s);
  const extras = [
    ...s.root.atoms.filter(a => !a.key).map(a => label(a.id)),
    ...s.root.mods.map(m => label(m.id)),
    ...(s.root.chain ? [`${label(s.root.chain.on)} → ${label(s.root.chain.carrier.id)} (${s.root.chain.atoms.map(a => label(a.id)).join(', ')})`] : []),
    ...s.drawbacks.map(d => `drawback: ${label(d.id)}`),
  ];
  const origin = s.lineage?.[0]?.fused ? 'Fusion of two powers' : s.lineage?.length ? `Seed ${s.seed}, evolved ${s.lineage.length}×` : `Seed ${s.seed}`;
  const steps = [
    ['Seed', origin, 'The only random input. Everything after is a pure function of it.'],
    ['Tier', `${TIERS[s.tier].name} · ${TIERS[s.tier].budget} PP`, 'Sets the budget, the size of the tree and which laws are reachable.'],
    ['Essences', s.essences.map((e, i) => `${ESSENCES[e].name} ×${s.mix[i]}`).join(' + '), 'Flavor vectors. Their weights are blended, not looked up.'],
    ['Intent', s.stats.hook === HOOKS[s.hook].name ? s.stats.hook : `${s.stats.hook} (started as ${HOOKS[s.hook].name})`, 'The one-line fantasy the tree is grown around. It is relabeled if the tree drifts.'],
    ['Trigger', label(s.trigger), 'Pressed, or a passive that fires on its own.'],
    ['Keystone', `${label(s.root.atoms[0].id)}${ATOMS[s.root.atoms[0].id].law ? ` (law ${ATOMS[s.root.atoms[0].id].law === 2 ? 'II' : 'I'})` : ''}`, 'Picked first, so the power has an identity.'],
    ['Shape', `${label(s.root.carrier.id)} · ${CONTROL_NAMES[s.stats.control]}`, 'Must be able to carry the keystone. It also decides the controls.'],
    ['Extras', extras.join(', ') || 'none', 'More atoms, modifiers and chained shapes, while nodes remain.'],
    ['Budget', `structure ${b.structure} · numbers ${b.magnitude} · cooldown ${b.cooldown}`, 'Leftover PP is spent on numbers by this power’s personality.'],
    ['Name', `${s.name}${s.epithet ? ' — ' + s.epithet : ''}`, `Built from the words of ${ESSENCES[s.essences[0]].name} and ${label(head.id)}.`],
  ];
  $('#trace-title').textContent = s.name;
  $('#trace-steps').innerHTML = steps.map(([k, v, why]) =>
    `<li><span class="step-k">${esc(k)}</span><span class="step-v">${esc(v)}</span><span class="step-why">${esc(why)}</span></li>`).join('');
}

// ── Rendering ───────────────────────────────────────────────────────────
function renderDraft() {
  $('#draft').innerHTML = state.draft.map((s, i) => card(s, 'draft', i)).join('');
}

function renderKept() {
  const box = $('#kept');
  $('#kept-count').textContent = `${state.kept.length}/${MAX_KEPT}`;
  if (!state.kept.length) {
    box.innerHTML = '<p class="empty">Keep powers from the draft to collect them here. Pick two to fuse them.</p>';
  } else {
    box.innerHTML = state.kept.map((s, i) => `<li class="kept-row tier-${s.tier}">
      <label class="fuse-pick"><input type="checkbox" id="fuse-${i}" data-i="${i}" ${state.fuseSel.includes(i) ? 'checked' : ''} /><span class="sr">Select for fusion</span></label>
      <span class="kept-main"><b>${esc(s.name)}</b><small>${esc(s.stats.tier)} · ${esc(s.essences.map(e => ESSENCES[e].name).join(' + '))}</small></span>
      <span class="kept-actions">
        <button type="button" data-kept="view" data-i="${i}">View</button>
        <button type="button" data-kept="remove" data-i="${i}">Remove</button>
      </span>
    </li>`).join('');
  }
  $('#fuse-btn').disabled = state.fuseSel.length !== 2;
}

function renderControls() {
  $('#tiers').innerHTML = [['', 'Any tier'], ...TIER_ORDER.map(t => [t, TIERS[t].name])]
    .map(([id, name]) => `<button type="button" class="seg-btn ${id ? 'tier-' + id : ''}" data-tier="${id}" aria-pressed="${(state.tier || '') === id}">${esc(name)}</button>`).join('');
  $('#essences').innerHTML = ESSENCE_IDS.map(e => `<button type="button" class="ess-btn" style="--c:${ESSENCES[e].color}" data-ess="${e}" aria-pressed="${state.essences.includes(e)}">${esc(ESSENCES[e].name)}</button>`).join('');
  $('#ess-note').textContent = state.essences.length ? `Locked: ${state.essences.map(e => ESSENCES[e].name).join(' + ')}` : 'Random essences';
  $('#examples').innerHTML = SHOWCASE.map((x, i) => `<button type="button" class="example" data-ex="${i}">${esc(x.label)}</button>`).join('');
}

function setDraft(list) {
  state.draft = list;
  renderDraft();
  if (list[0]) { state.traced = list[0]; trace(list[0]); }
}

function forgeDraft() {
  setDraft([0, 1, 2].map(() => forge({ tier: state.tier || undefined, essences: state.essences.length ? state.essences : undefined })));
}

function showError(msg) {
  const el = $('#code-error');
  el.textContent = msg;
  el.hidden = !msg;
}

// ── Events ──────────────────────────────────────────────────────────────
function bind() {
  $('#forge-btn').addEventListener('click', forgeDraft);
  $('#tiers').addEventListener('click', e => {
    const b = e.target.closest('[data-tier]');
    if (!b) return;
    state.tier = b.dataset.tier || null;
    renderControls();
  });
  $('#essences').addEventListener('click', e => {
    const b = e.target.closest('[data-ess]');
    if (!b) return;
    const id = b.dataset.ess;
    state.essences = state.essences.includes(id) ? state.essences.filter(x => x !== id) : [...state.essences, id].slice(-3);
    renderControls();
  });
  $('#examples').addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (b) setDraft([fromCode(SHOWCASE[Number(b.dataset.ex)].code)]);
  });
  $('#code-form').addEventListener('submit', e => {
    e.preventDefault();
    try {
      setDraft([fromCode($('#code-input').value)]);
      showError('');
    } catch (err) {
      showError(err.message);
    }
  });
  $('#draft').addEventListener('click', e => {
    const copy = e.target.closest('[data-copy]');
    if (copy) return copyCode(copy);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const s = state.draft[i];
    if (b.dataset.act === 'evolve') {
      state.draft[i] = evolve(s, evolveCode(s));
      renderDraft();
      trace(state.draft[i]);
    } else if (b.dataset.act === 'keep' && state.kept.length < MAX_KEPT) {
      state.kept.push(s);
      saveKept();
      renderKept();
      renderDraft();
    } else if (b.dataset.act === 'trace') {
      trace(s);
      $('#trace').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
  $('#kept').addEventListener('click', e => {
    const b = e.target.closest('[data-kept]');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (b.dataset.kept === 'view') setDraft([state.kept[i]]);
    if (b.dataset.kept === 'remove') {
      state.kept.splice(i, 1);
      state.fuseSel = [];
      saveKept();
      renderKept();
      renderDraft();
    }
  });
  $('#kept').addEventListener('change', e => {
    const i = Number(e.target.dataset.i);
    if (Number.isNaN(i)) return;
    state.fuseSel = e.target.checked ? [...state.fuseSel, i].slice(-2) : state.fuseSel.filter(x => x !== i);
    renderKept();
  });
  $('#fuse-btn').addEventListener('click', () => {
    if (state.fuseSel.length !== 2) return;
    const [a, b] = state.fuseSel.map(i => state.kept[i]);
    setDraft([fuse(a, b, fuseCode(a, b))]);
    $('#draft').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}

async function copyCode(btn) {
  const code = btn.dataset.copy;
  try {
    await navigator.clipboard.writeText(code);
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1200);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(btn);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

loadKept();
renderControls();
renderKept();
bind();
if (OPENING_DRAFT.length) setDraft(OPENING_DRAFT.map(fromCode));
else forgeDraft();
