// Draft screens between rounds: forged power cards with a rarity reveal,
// and level-up stat picks. Resolves with the player's choice.

import { STYLE } from '../vfx/styles.js';
import { TIER_COLORS, TIER_NAMES } from './hud.js';
import { ESSENCES } from '../../../prototypes/skill-forge/data-essences.js';
import { present } from '../../../prototypes/skill-forge/describe.js';

export const DRAFT_CSS = `
.draft { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: max(12px, env(safe-area-inset-top)) 16px max(12px, env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 50% 45%, rgba(40,20,80,.6), rgba(12,6,28,.82)); font-family: 'Lilita One', system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; overflow-y: auto; }
.draft .ol { text-shadow: 0 2px 0 #1a0f2e, 2px 0 0 #1a0f2e, -2px 0 0 #1a0f2e, 0 -2px 0 #1a0f2e, 2px 2px 0 #1a0f2e, -2px 2px 0 #1a0f2e, 2px -2px 0 #1a0f2e, -2px -2px 0 #1a0f2e, 0 4px 0 rgba(0,0,0,.35); }
.draft h1 { margin: 0; font-weight: 400; font-size: clamp(26px, 5vw, 42px); text-align: center; line-height: 1.05; }
.draft h2 { margin: -6px 0 0; font-weight: 400; font-size: clamp(14px, 2.4vw, 18px); opacity: .85; text-align: center; font-family: system-ui, sans-serif; }
.draft .row { display: flex; gap: clamp(8px, 1.6vw, 18px); justify-content: center; align-items: stretch; flex-wrap: nowrap; width: 100%; max-width: 980px; }
.card { position: relative; flex: 1 1 0; max-width: 290px; min-width: 0; aspect-ratio: 0.66; perspective: 900px; cursor: pointer; }
.card .in { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .6s cubic-bezier(.3,1.4,.5,1); transform: rotateY(180deg); }
.card.open .in { transform: rotateY(0); }
.card .face, .card .back { position: absolute; inset: 0; border-radius: 18px; backface-visibility: hidden; -webkit-backface-visibility: hidden; border: 4px solid #1a0f2e; box-shadow: 0 8px 0 rgba(0,0,0,.35); overflow: hidden; }
.card .back { transform: rotateY(180deg); background: radial-gradient(circle at 50% 40%, var(--tc), #1a0f2e 75%); display: grid; place-items: center; }
.card .back::before { content: ''; width: 46%; aspect-ratio: 1; border-radius: 50%; border: 6px solid rgba(255,255,255,.85); box-shadow: 0 0 30px 8px var(--tc), inset 0 0 20px var(--tc); animation: pulse 0.9s ease-in-out infinite; }
.card .back::after { content: '?'; position: absolute; font-size: clamp(40px, 7vw, 70px); color: #fff; text-shadow: 0 3px 0 #1a0f2e; }
@keyframes pulse { 50% { transform: scale(1.08); } }
.card .face { background: linear-gradient(180deg, color-mix(in srgb, var(--ec) 70%, #1a0f2e) 0%, #241640 38%, #1a0f2e 100%); display: flex; flex-direction: column; }
.card.godly .face { border-color: transparent; background: linear-gradient(180deg, color-mix(in srgb, var(--ec) 70%, #1a0f2e) 0%, #241640 38%, #1a0f2e 100%) padding-box, conic-gradient(from var(--spin, 0deg), #ff3d6e, #ffc02e, #3fd06a, #3fa9ff, #b44bff, #ff3d6e) border-box; animation: spin 2.2s linear infinite; box-shadow: 0 8px 0 rgba(0,0,0,.35), 0 0 26px 2px rgba(255,120,200,.45); }
@property --spin { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes spin { to { --spin: 360deg; } }
.card .rib { font-size: clamp(12px, 1.8vw, 16px); text-align: center; padding: 5px 0 6px; background: linear-gradient(var(--tc), color-mix(in srgb, var(--tc) 60%, #000)); border-bottom: 3px solid #1a0f2e; letter-spacing: 1px; }
.card.godly .rib { background: linear-gradient(90deg, #ff3d6e, #ffc02e, #3fd06a, #3fa9ff, #b44bff); }
.card .emb { width: 42%; aspect-ratio: 1; margin: 8% auto 4%; border-radius: 50%; border: 4px solid #1a0f2e; box-shadow: 0 0 0 3px var(--tc), 0 0 26px 4px var(--eg); overflow: hidden; flex: none; }
.card .emb canvas { width: 100%; height: 100%; display: block; }
.card .nm { font-size: clamp(15px, 2.3vw, 22px); text-align: center; line-height: 1.05; padding: 0 8px; }
.card .ep { font-family: Georgia, serif; font-style: italic; font-size: clamp(10px, 1.3vw, 12px); text-align: center; opacity: .8; margin-top: 3px; padding: 0 8px; }
.card .ess { display: flex; justify-content: center; gap: 4px; margin: 6px 0 4px; flex-wrap: wrap; }
.card .ess span { font-size: 11px; padding: 2px 7px 3px; border-radius: 8px; background: var(--c); color: #1a0f2e; border: 2px solid #1a0f2e; }
.card .tx { flex: 1; overflow-y: auto; font-family: system-ui, sans-serif; font-size: clamp(10.5px, 1.3vw, 12.5px); line-height: 1.32; padding: 2px 10px 6px; color: #efe8ff; }
.card .tx p { margin: 0 0 4px; }
.card .ft { display: flex; justify-content: space-between; align-items: center; padding: 5px 10px 7px; font-size: 12px; background: rgba(0,0,0,.25); border-top: 2px solid rgba(255,255,255,.08); }
.card .ft code { font-family: ui-monospace, monospace; font-size: 10px; opacity: .65; }
.card .law { position: absolute; top: 34px; right: -6px; transform: rotate(8deg); background: #ff3d6e; border: 3px solid #1a0f2e; border-radius: 8px; font-size: 11px; padding: 2px 6px; box-shadow: 0 3px 0 rgba(0,0,0,.3); }
.card.pick .in { animation: chosen .5s ease-out forwards; }
@keyframes chosen { 40% { transform: scale(1.08); } 100% { transform: scale(1.04); } }
.card.fade { opacity: .25; transition: opacity .3s; }
.card:hover .in, .card:focus-visible .in { filter: brightness(1.08); }
.draft .kind { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); z-index: 2; font-size: 12px; padding: 2px 10px; border-radius: 8px; border: 2px solid #1a0f2e; background: #ffc02e; color: #1a0f2e; white-space: nowrap; text-shadow: none; }
.draft .stats { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.stat { width: clamp(120px, 26vw, 190px); padding: 14px 10px 12px; border-radius: 16px; border: 4px solid #1a0f2e; background: linear-gradient(#4a3a8a, #2a1d58); box-shadow: 0 7px 0 rgba(0,0,0,.35), inset 0 -5px 0 rgba(0,0,0,.2); text-align: center; cursor: pointer; transition: transform .12s; }
.stat:hover { transform: translateY(-3px); }
.stat .ic { font-size: 34px; line-height: 1; }
.stat .v { font-size: 22px; margin-top: 6px; color: #ffe14a; }
.stat .d { font-family: system-ui, sans-serif; font-size: 12px; opacity: .85; margin-top: 2px; }
.draft.title { justify-content: space-between; background: linear-gradient(to bottom, rgba(26,12,52,.7), rgba(26,12,52,0) 34%, rgba(26,12,52,0) 72%, rgba(26,12,52,.6)); padding-block: max(4vh, 14px); }
.draft.title h2 { max-width: 470px; font-family: system-ui, sans-serif; font-size: clamp(12px, 1.8vh, 15px); margin: 0; background: rgba(26,12,52,.6); border-radius: 12px; padding: 6px 14px; }
.draft .vs { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) rotate(-6deg); font-size: clamp(34px, 7vh, 64px); color: #ffe14a; pointer-events: none; }
.draft.title .top { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.draft .btn { font-family: inherit; font-size: 22px; color: #fff; padding: 10px 34px 13px; border-radius: 14px; border: 4px solid #1a0f2e; background: linear-gradient(#ffd23f, #ff9a1a); box-shadow: 0 6px 0 rgba(0,0,0,.35), inset 0 -6px 0 rgba(0,0,0,.18); cursor: pointer; }
@media (max-height: 520px) {
  .draft { gap: 6px; }
  .draft h1 { font-size: clamp(20px, 7vh, 34px); }
  .draft h2 { font-size: 12px; margin: 0; }
  .card { aspect-ratio: auto; height: calc(100vh - 96px); max-height: 330px; }
  .card .emb { width: 18%; margin: 6px auto 3px; }
  .card .nm { font-size: 16px; }
  .card .ep { display: none; }
  .card .ess { margin: 3px 0 2px; }
  .card .tx { font-size: 10.5px; line-height: 1.28; }
  .card .ft { padding: 3px 10px 5px; }
  .draft.title h2 { display: none; }
}
@media (max-width: 640px) and (orientation: portrait) { .draft .row { flex-direction: column; align-items: center; } .card { width: min(88vw, 340px); max-width: none; flex: none; aspect-ratio: 1.45; } .card .face { display: grid; grid-template-columns: 34% 1fr; grid-template-rows: auto auto auto auto 1fr auto; } .card .rib, .card .ft { grid-column: 1 / -1; } .card .emb { grid-row: 2 / 6; width: 80%; margin: 12px auto; } .card .tx { grid-column: 2; } }
`;

const STAT_UPGRADES = [
  { id: 'hp', ic: '❤️', v: '+18% HP', d: 'More health', apply: f => { const k = Math.round(f.maxHp * 0.18); f.maxHp += k; f.hp += k; } },
  { id: 'dmg', ic: '⚔️', v: '+14% Damage', d: 'Attacks and powers hit harder', apply: f => { f.buffs.dmg *= 1.14; f.basicDamage = Math.round(f.basicDamage * 1.1); } },
  { id: 'spd', ic: '👟', v: '+10% Speed', d: 'Move faster', apply: f => { f.speed *= 1.1; } },
  { id: 'cd', ic: '⏳', v: '-15% Cooldowns', d: 'Powers recharge faster', apply: f => { f.cdMul = (f.cdMul ?? 1) * 0.85; f.powers.forEach(s => { s.cdMax *= 0.85; }); } },
  { id: 'ammo', ic: '🔋', v: '+1 Ammo', d: 'One more shot per reload', apply: f => { f.ammoMax += 1; f.ammo = f.ammoMax; } },
  { id: 'reload', ic: '🔁', v: 'Faster Reload', d: 'Reload 20% faster', apply: f => { f.reloadTime *= 0.8; } },
  { id: 'leech', ic: '🩸', v: '+10% Lifesteal', d: 'Heal from damage you deal', apply: f => { f.buffs.lifesteal += 0.1; } },
];

export function rollStats(n = 3, rng = Math.random) {
  const pool = STAT_UPGRADES.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
export const STATS = STAT_UPGRADES;

export function cardHTML(s, kind = '') {
  const info = present(s);
  const tc = TIER_COLORS[s.tier], st = STYLE[s.essences[0]] || STYLE.fire;
  const ess = s.essences.map(e => `<span style="--c:${ESSENCES[e]?.color ?? '#fff'}">${ESSENCES[e]?.name ?? e}</span>`).join('') + (s.trigger !== 'cast' ? '<span style="--c:#ffe14a">Passive</span>' : '');
  const trig = '';
  return `
    ${kind ? `<div class="kind">${kind}</div>` : ''}
    <div class="in" style="--tc:${tc};--ec:${st.color};--eg:${st.glow}">
      <div class="face">
        <div class="rib ol">${TIER_NAMES[s.tier].toUpperCase()}</div>
        ${info.stats.law > 0 ? `<div class="law ol">${info.stats.law > 1 ? 'BREAKS REALITY' : 'BREAKS A RULE'}</div>` : ''}
        <div class="emb"><canvas></canvas></div>
        <div class="nm ol">${info.name}</div>
        <div class="ep">${info.epithet ?? ''}</div>
        <div class="ess">${ess}</div>
        <div class="tx">${trig}${info.text.map(t => `<p>${t}</p>`).join('')}</div>
        <div class="ft"><span>⏱ ${info.stats.cooldown}s</span><code>${s.code}</code></div>
      </div>
      <div class="back"></div>
    </div>`;
}

// Attract/QA mode: menus pick for themselves after a moment.
export const AUTO = { on: false, delay: 2500 };

// options: [{ skill, kind }] → Promise<index>
export function draftPowers(root, title, subtitle, options, drawIcon) {
  return new Promise(resolve => {
    if (AUTO.on) setTimeout(() => root.querySelector('.draft .card.open')?.click(), AUTO.delay + 2200);
    const el = document.createElement('div');
    el.className = 'draft';
    el.innerHTML = `<h1 class="ol">${title}</h1><h2>${subtitle}</h2><div class="row"></div>`;
    const row = el.querySelector('.row');
    const cards = options.map((o, i) => {
      const c = document.createElement('div');
      c.className = 'card' + (o.skill.tier === 'godly' ? ' godly' : '');
      c.tabIndex = 0;
      c.innerHTML = cardHTML(o.skill, o.kind);
      c.style.setProperty('--tc', TIER_COLORS[o.skill.tier]);
      drawIcon?.(c.querySelector('.emb canvas'), o.skill);
      row.appendChild(c);
      return c;
    });
    root.appendChild(el);
    // reveal one by one; rarer cards take a beat longer
    let delay = 450;
    cards.forEach((c, i) => {
      const tier = options[i].skill.tier;
      const extra = { common: 0, rare: 80, epic: 220, legendary: 420, godly: 700 }[tier];
      delay += 260 + extra;
      setTimeout(() => {
        c.classList.add('open');
        if (tier === 'godly' || tier === 'legendary') c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
        options[i].onReveal?.();
      }, delay);
    });
    let done = false;
    cards.forEach((c, i) => {
      const pick = () => {
        if (done || !c.classList.contains('open')) return;
        done = true;
        c.classList.add('pick');
        cards.forEach(o => { if (o !== c) o.classList.add('fade'); });
        setTimeout(() => { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => { el.remove(); resolve(i); }; }, 520);
      };
      c.addEventListener('click', pick);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pick(); });
    });
  });
}

export function draftStats(root, title, options) {
  return new Promise(resolve => {
    if (AUTO.on) setTimeout(() => root.querySelector('.draft .stat')?.click(), AUTO.delay);
    const el = document.createElement('div');
    el.className = 'draft';
    el.innerHTML = `<h1 class="ol">${title}</h1><h2>Pick an upgrade</h2><div class="stats"></div>`;
    const box = el.querySelector('.stats');
    options.forEach((o, i) => {
      const b = document.createElement('div');
      b.className = 'stat';
      b.innerHTML = `<div class="ic">${o.ic}</div><div class="v ol">${o.v}</div><div class="d">${o.d}</div>`;
      b.addEventListener('click', () => { el.remove(); resolve(i); });
      box.appendChild(b);
    });
    root.appendChild(el);
  });
}

export function splash(root, html, btn = 'PLAY', cls = '', below = '') {
  return new Promise(resolve => {
    if (AUTO.on) setTimeout(() => root.querySelector('.draft .btn')?.click(), AUTO.delay);
    const el = document.createElement('div');
    el.className = 'draft ' + cls;
    el.innerHTML = `<div class="top">${html}</div><div class="top">${below}${btn ? `<button class="btn ol" type="button">${btn}</button>` : ''}</div>`;
    root.appendChild(el);
    const go = () => {
      // on phones, try for fullscreen landscape (optional: some browsers and app views refuse)
      if (matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
      }
      el.remove(); resolve();
    };
    if (btn) el.querySelector('.btn').addEventListener('click', go);
    else setTimeout(go, 1800);
  });
}
