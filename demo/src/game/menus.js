// Full-screen menus over the lobby stage: the title (pick your brawler, play
// solo or start a LAN party) and the end-of-match results.

import { TIER_COLORS, TIER_NAMES, iconCanvas } from './hud.js';
import { icon } from './text.js';

export const MENU_CSS = `
.menu-screen { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 10px; padding: max(12px, env(safe-area-inset-top)) 16px max(14px, env(safe-area-inset-bottom)); color: #fff; font-family: var(--fb); user-select: none; -webkit-user-select: none; background: linear-gradient(to bottom, rgba(26,12,52,.72), rgba(26,12,52,0) 30%, rgba(26,12,52,0) 62%, rgba(20,8,40,.82)); }
.menu-screen .logo { font-size: clamp(30px, min(8vw, 11vh), 78px); line-height: .95; text-align: center; --sw: .13em; }
.menu-screen .logo .accent { color: var(--gold); }
.menu-screen .tagline { font: 800 clamp(12px, 1.8vh + .3vw, 16px)/1.3 var(--fb); color: var(--text); text-align: center; max-width: 620px; text-shadow: 0 2px 0 var(--ink), 0 0 10px var(--ink); margin-top: 6px; }
.menu-screen .vs { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -60%) rotate(-6deg); font-size: clamp(34px, 7vh, 64px); color: var(--gold2); pointer-events: none; }
.menu-screen .bottom { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.menu-screen .steps { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.menu-screen .step { display: flex; align-items: center; gap: 7px; background: var(--panel); border: 2px solid var(--line); border-radius: 12px; padding: 5px 11px 6px 6px; font: 800 12px/1.2 var(--fb); color: var(--text); }
.menu-screen .step .num { width: 22px; height: 22px; border-radius: 50%; background: var(--gold); color: var(--ink); display: grid; place-items: center; font: 400 13px var(--fd); flex: none; }
.menu-screen .step b { color: var(--gold2); font-weight: 900; }
.menu-screen .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center; }
.btn { font-family: var(--fd); font-size: 22px; color: #fff; padding: 9px 30px 12px; border-radius: 15px; border: 4px solid var(--ink); background: linear-gradient(#ffe14a, #ff9a1a); box-shadow: 0 6px 0 rgba(0,0,0,.4), inset 0 -6px 0 rgba(0,0,0,.16), inset 0 3px 0 rgba(255,255,255,.35); cursor: pointer; -webkit-text-stroke: .14em var(--ink); paint-order: stroke fill; text-shadow: 0 .08em 0 var(--ink); letter-spacing: .02em; }
.btn:active { transform: translateY(3px); box-shadow: 0 3px 0 rgba(0,0,0,.4), inset 0 -6px 0 rgba(0,0,0,.16); }
.btn:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
.btn.blue { background: linear-gradient(#7ad2ff, #2a86e8); }
.btn.dark { background: linear-gradient(#5a4a9a, #342868); font-size: 18px; padding: 8px 20px 10px; }
.btn[disabled] { filter: grayscale(.8) brightness(.7); cursor: default; }
.hero-pick { display: flex; align-items: center; gap: 6px; background: var(--panel); border: 3px solid var(--ink); border-radius: 16px; padding: 4px 6px; }
.hero-pick .arrow { width: 38px; height: 38px; border-radius: 11px; border: 3px solid var(--ink); background: linear-gradient(#5a4a9a, #342868); color: #fff; font: 400 20px var(--fd); cursor: pointer; display: grid; place-items: center; padding: 0; }
.hero-pick .name { min-width: 92px; text-align: center; font-size: 20px; line-height: 1; }
.hero-pick .name small { display: block; font: 900 10px var(--fb); letter-spacing: .12em; color: var(--muted); -webkit-text-stroke: 0; text-shadow: none; margin-bottom: 2px; }
@media (max-height: 460px) { .menu-screen .steps { display: none; } .menu-screen .tagline { display: none; } .btn { font-size: 19px; padding: 7px 22px 9px; } }

/* results */
.results { justify-content: center; gap: 12px; background: radial-gradient(ellipse at 50% 40%, rgba(40,20,80,.62), rgba(12,6,28,.9)); }
.results .verdict { font-size: clamp(42px, 9vh, 84px); line-height: 1; --sw: .12em; }
.results .verdict.win { color: var(--gold2); } .results .verdict.lose { color: #ff7a86; } .results .verdict.draw { color: #d6ccff; }
.results .final { display: flex; align-items: center; gap: 10px; font: 400 26px var(--fd); }
.results .final .b { color: #8fd6ff; } .results .final .r { color: #ff8a98; }
.results .teams { display: flex; gap: 12px; width: min(980px, 100%); justify-content: center; flex-wrap: wrap; }
.results .team { flex: 1 1 380px; max-width: 480px; background: var(--panel); border: 3px solid var(--ink); border-radius: 16px; padding: 8px 10px; box-shadow: 0 6px 0 rgba(0,0,0,.35); }
.results .team.blue { border-top: 6px solid var(--blue); } .results .team.red { border-top: 6px solid var(--red); }
.results .prow { display: grid; grid-template-columns: 26px minmax(0, 1fr) 38px 38px 54px auto; gap: 6px; align-items: center; padding: 5px 2px; border-bottom: 1px solid var(--line); font: 800 13px var(--fb); font-variant-numeric: tabular-nums; }
.results .prow:last-child { border-bottom: 0; }
.results .prow.head { font: 900 10px var(--fb); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); padding-top: 0; }
.results .prow .lv { width: 24px; height: 24px; border-radius: 50%; background: var(--gold); color: var(--ink); display: grid; place-items: center; font: 400 13px var(--fd); border: 2px solid var(--ink); }
.results .prow .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; }
.results .prow .who small { color: var(--muted); font-weight: 700; }
.results .prow.me .who { color: var(--gold2); }
.results .prow .mvp { font: 900 9px var(--fb); letter-spacing: .1em; background: var(--gold); color: var(--ink); border-radius: 5px; padding: 1px 4px; margin-left: 4px; vertical-align: 2px; }
.results .kit { display: flex; gap: 3px; }
.results .kit canvas { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--tc, #888); background: var(--ink); }
.results .num { text-align: center; }
@media (max-height: 460px) { .results .team { padding: 4px 8px; } .results .prow { padding: 3px 2px; font-size: 12px; } .results .verdict { font-size: 40px; } }
`;

// Attract/QA mode: menus pick for themselves after a moment.
export const AUTO = { on: false, delay: 2500 };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// → Promise<'solo' | 'lan'>; onHero(dir) cycles the brawler shown on your pedestal.
export function titleScreen(root, o) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'menu-screen title';
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center">
        <div class="logo ol">SKILL FORGE <span class="accent">ARENA</span></div>
        <div class="tagline">Every power is forged on the spot. Start with your fists, level up mid-fight, and climb from fireballs to stopping time.</div>
      </div>
      <div class="vs ol">VS</div>
      <div class="bottom">
        <div class="steps">
          <div class="step"><span class="num">1</span><span>Fight with your <b>basic attack</b></span></div>
          <div class="step"><span class="num">2</span><span>Earn <b>XP</b> from hits, KOs and forge shards</span></div>
          <div class="step"><span class="num">3</span><span>Level up to <b>forge spells</b>, rarer each level</span></div>
          <div class="step"><span class="num">4</span><span>Level 7 unlocks <b>godly ultimates</b></span></div>
        </div>
        <div class="actions">
          <div class="hero-pick"><button type="button" class="arrow" data-d="-1" aria-label="Previous brawler">◀</button><div class="name ol"><small>YOUR BRAWLER</small><span class="hn"></span></div><button type="button" class="arrow" data-d="1" aria-label="Next brawler">▶</button></div>
          <button type="button" class="btn solo">PLAY</button>
          ${o.lan ? '<button type="button" class="btn blue lan">LAN PARTY</button>' : ''}
        </div>
      </div>`;
    root.appendChild(el);
    const hn = el.querySelector('.hn');
    hn.textContent = o.heroName();
    el.querySelectorAll('.arrow').forEach(b => b.addEventListener('click', () => { o.onHero(Number(b.dataset.d)); hn.textContent = o.heroName(); }));
    const go = choice => { el.remove(); resolve(choice); };
    el.querySelector('.solo').addEventListener('click', () => go('solo'));
    el.querySelector('.lan')?.addEventListener('click', () => go('lan'));
    if (AUTO.on) setTimeout(() => go('solo'), AUTO.delay);
  });
}

// data: { verdict: 'win'|'lose'|'draw', score:[mine, theirs], teams:[[row...],[row...]], buttons:[{id,label,cls}] }
// row: { name, hero, level, kos, deaths, damage, me, mvp, kit:[{ess, dna}] }
export function resultsScreen(root, data) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'menu-screen results';
    const verdict = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }[data.verdict];
    const team = (rows, cls, label) => `<div class="team ${cls}">
      <div class="prow head"><span></span><span>${label}</span><span class="num">KO</span><span class="num">Fell</span><span class="num">Dmg</span><span>Kit</span></div>
      ${rows.map((r, i) => `<div class="prow ${r.me ? 'me' : ''}" data-k="${cls}${i}"><span class="lv">${r.level}</span><span class="who">${esc(r.name)} <small>${esc(r.hero)}</small>${r.mvp ? '<span class="mvp">MVP</span>' : ''}</span>
        <span class="num">${r.kos}</span><span class="num">${r.deaths}</span><span class="num">${r.damage >= 1000 ? (r.damage / 1000).toFixed(1) + 'k' : r.damage}</span><span class="kit">${r.kit.map((_, j) => `<canvas data-j="${j}"></canvas>`).join('')}</span></div>`).join('')}
    </div>`;
    el.innerHTML = `
      <div class="verdict ol ${data.verdict}">${verdict}</div>
      <div class="final ol"><span class="b">${data.score[0]}</span><span>–</span><span class="r">${data.score[1]}</span></div>
      <div class="teams">${team(data.teams[0], 'blue', 'Your team')}${team(data.teams[1], 'red', 'Rivals')}</div>
      <div class="actions">${data.buttons.map(b => `<button type="button" class="btn ${b.cls || ''}" data-id="${b.id}">${esc(b.label)}</button>`).join('')}</div>`;
    root.appendChild(el);
    data.teams.forEach((rows, t) => rows.forEach((r, i) => {
      const row = el.querySelector(`[data-k="${t ? 'red' : 'blue'}${i}"]`);
      r.kit.forEach((k, j) => {
        const c = row.querySelector(`canvas[data-j="${j}"]`);
        c.style.setProperty('--tc', TIER_COLORS[k.dna.tier]);
        c.title = `${k.dna.info?.name ?? k.dna.name} (${TIER_NAMES[k.dna.tier]})`;
        iconCanvas(c, k);
      });
    }));
    let done = false;
    const go = id => { if (done) return; done = true; el.remove(); resolve(id); };
    el.querySelectorAll('.btn').forEach(b => b.addEventListener('click', () => go(b.dataset.id)));
    data.bind?.(go); // lets the caller close it (back button, a LAN match starting)
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    if (AUTO.on && data.buttons[0]) setTimeout(() => go(data.buttons[0].id), AUTO.delay);
    void icon;
  });
}
