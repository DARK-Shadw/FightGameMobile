// Shared UI look: type system (Lilita One for display and numbers, Nunito
// for everything you read), outlined text, stat chips, effect lines and the
// power cards used by the level-up picker, the menus and results.

export const THEME_CSS = `
:root {
  --ink: #1a0f2e; --ink2: #2a1d58; --panel: rgba(22, 12, 42, .88); --line: rgba(255,255,255,.12);
  --gold: #ffc02e; --gold2: #ffe14a; --blue: #3fa9ff; --red: #ff4a5a; --text: #f3eeff; --muted: #b9addb;
  --fd: 'Lilita One', 'Nunito', system-ui, sans-serif;
  --fb: 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --t-common: #b8c7d9; --t-rare: #3fd06a; --t-epic: #b44bff; --t-legendary: #ffb020; --t-godly: #ff3d6e;
  --rainbow: linear-gradient(90deg, #ff3d6e, #ffc02e, #3fd06a, #3fa9ff, #b44bff, #ff3d6e);
}
.ol { font-family: var(--fd); font-weight: 400; -webkit-text-stroke: var(--sw, .15em) var(--ink); paint-order: stroke fill; text-shadow: 0 var(--sd, .08em) 0 var(--ink); letter-spacing: .01em; }
.lbl { font-family: var(--fb); font-weight: 900; text-transform: uppercase; letter-spacing: .09em; }
.gold { color: var(--gold2); }

/* chips: small stat pills */
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 3px 6px; border-radius: 999px; background: rgba(0,0,0,.32); border: 1.5px solid var(--line); font: 900 12px/1.15 var(--fb); color: #fff; white-space: nowrap; font-variant-numeric: tabular-nums; }
.chip .ic { width: 13px; height: 13px; flex: none; opacity: .9; }
.chip.dmg { color: #ffd2b0; } .chip.dmg .ic { color: #ff8a5a; }
.chip.ult { color: #fff; border-color: transparent; background: linear-gradient(var(--ink2), var(--ink2)) padding-box, var(--rainbow) border-box; }
.chip.passive { color: var(--gold2); }

/* effect lines with an icon per kind of effect */
.fx-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; font: 700 12.5px/1.34 var(--fb); color: var(--text); }
.fx-lines li { display: grid; grid-template-columns: 16px 1fr; gap: 7px; align-items: start; }
.fx-lines .ic { width: 15px; height: 15px; margin-top: 1px; }
.fx-lines .dmg .ic { color: #ff8a5a; } .fx-lines .cc .ic { color: #ffd23a; } .fx-lines .help .ic { color: #66f09a; }
.fx-lines .summon .ic { color: #c89bff; } .fx-lines .shape .ic { color: #8fd3ff; } .fx-lines .cost .ic { color: #ff5a78; }
.fx-lines .cost { color: #ffb3c0; }
.fx-lines b.n, .headline b.n { font-weight: 900; color: #fff; }
.fx-lines b.k, .headline b.k { font-weight: 900; color: var(--kc, #ffe14a); }
.headline { font: 800 14px/1.3 var(--fb); color: #fff; }
.flavor { font: 700 11px/1.3 var(--fb); color: var(--muted); letter-spacing: .02em; }
.flavor::before { content: '“'; } .flavor::after { content: '”'; }
.tier-common { --tc: var(--t-common); } .tier-rare { --tc: var(--t-rare); } .tier-epic { --tc: var(--t-epic); } .tier-legendary { --tc: var(--t-legendary); } .tier-godly { --tc: var(--t-godly); }

/* ── mini cards (level-up picker) ── */
.mini { position: relative; width: 168px; min-height: 150px; border-radius: 16px; border: 3px solid var(--ink); background: linear-gradient(170deg, color-mix(in srgb, var(--ec, #6a4aa8) 55%, var(--ink2)) 0%, var(--ink2) 55%, var(--ink) 100%); box-shadow: 0 6px 0 rgba(0,0,0,.4), inset 0 0 0 2px color-mix(in srgb, var(--tc) 70%, transparent); color: #fff; cursor: pointer; padding: 26px 10px 10px; display: flex; flex-direction: column; gap: 6px; transition: transform .12s ease-out, box-shadow .12s; text-align: left; font: inherit; pointer-events: auto; touch-action: manipulation; }
.mini:hover { transform: translateY(-3px); }
.mini:focus-visible { outline: 3px solid var(--gold2); outline-offset: 3px; }
.mini.godly-card { box-shadow: 0 6px 0 rgba(0,0,0,.4), 0 0 18px rgba(255,90,170,.55); border-color: transparent; background: linear-gradient(170deg, color-mix(in srgb, var(--ec, #6a4aa8) 55%, var(--ink2)) 0%, var(--ink2) 55%, var(--ink) 100%) padding-box, var(--rainbow) border-box; }
.mini .rib { position: absolute; left: -3px; right: -3px; top: -3px; height: 24px; border-radius: 16px 16px 0 0; background: var(--tc); border: 3px solid var(--ink); display: flex; align-items: center; justify-content: space-between; padding: 0 9px; font-size: 12px; color: #fff; }
.mini.godly-card .rib { background: var(--rainbow); }
.mini .rib .kind { font: 900 10px/1 var(--fb); letter-spacing: .1em; text-transform: uppercase; color: var(--ink); background: rgba(255,255,255,.8); border-radius: 6px; padding: 3px 5px 2px; }
.mini .top { display: flex; gap: 8px; align-items: center; }
.mini .emb { width: 40px; height: 40px; flex: none; border-radius: 50%; border: 3px solid var(--ink); box-shadow: 0 0 0 2px var(--tc); overflow: hidden; background: var(--ink); }
.mini .emb canvas { width: 100%; height: 100%; display: block; }
.mini .nm { font-size: 16px; line-height: 1.02; --sw: .14em; }
.mini .headline { font-size: 11.5px; line-height: 1.28; font-weight: 800; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.mini .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; }
.mini .chip { font-size: 11px; padding: 1px 7px 2px 5px; }
.mini .arrow { font: 900 11px var(--fb); color: var(--gold2); }
.mini.sel { transform: translateY(-8px) scale(1.04); box-shadow: 0 10px 0 rgba(0,0,0,.4), 0 0 0 3px var(--gold2), 0 0 22px rgba(255,210,80,.55); }
.mini .go { display: none; position: absolute; left: 50%; bottom: -16px; transform: translateX(-50%); padding: 4px 12px 5px; border-radius: 10px; background: linear-gradient(#ffe14a, #ff9a1a); border: 3px solid var(--ink); font-size: 14px; white-space: nowrap; box-shadow: 0 4px 0 rgba(0,0,0,.35); }
.mini.sel .go { display: block; }
.mini.stat .big { font-size: 22px; line-height: 1.05; }
.mini.stat .ic-big { width: 38px; height: 38px; color: var(--gold2); }

/* ── level-up picker tray ── */
.picker { position: absolute; left: 50%; bottom: max(10px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; z-index: 8; }
.picker .head { display: flex; align-items: center; gap: 8px; pointer-events: auto; }
.picker .lvbadge { width: 38px; height: 38px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #fff3b0, var(--gold) 60%, #d98a00); border: 3px solid var(--ink); display: grid; place-items: center; font-size: 19px; box-shadow: 0 4px 0 rgba(0,0,0,.35); }
.picker .title { font-size: 22px; }
.picker .title small { font: 900 11px var(--fb); letter-spacing: .1em; color: var(--gold2); -webkit-text-stroke: 0; text-shadow: none; display: block; margin-top: -2px; }
.picker .more { font: 900 11px var(--fb); color: var(--gold2); background: var(--panel); border-radius: 8px; padding: 3px 7px; }
.picker .hide { pointer-events: auto; border: 3px solid var(--ink); background: var(--ink2); color: #fff; border-radius: 10px; font: 900 12px var(--fb); padding: 4px 9px; cursor: pointer; }
.picker .row { display: flex; gap: 10px; align-items: flex-end; }
.picker .detail { pointer-events: auto; width: min(560px, 92vw); max-height: calc(100vh - 330px); min-height: 60px; overflow-y: auto; background: var(--panel); border: 3px solid var(--ink); border-radius: 16px; padding: 10px 12px 12px; box-shadow: 0 6px 0 rgba(0,0,0,.35); display: none; }
@media (max-height: 460px) { .picker .detail { max-height: calc(100vh - 262px); } }
.picker .detail.on { display: block; }
.picker .detail .dt { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.picker .detail .dt .ol { font-size: 20px; }
.picker.collapsed .row, .picker.collapsed .detail { display: none; }
.picker .pill { display: none; pointer-events: auto; cursor: pointer; border: 3px solid var(--ink); border-radius: 999px; padding: 6px 16px 7px; background: linear-gradient(#ffe14a, #ff9a1a); box-shadow: 0 4px 0 rgba(0,0,0,.35); font-size: 18px; animation: pillPulse 1.1s ease-in-out infinite; }
.picker.collapsed .pill { display: block; }
.picker.collapsed .head { display: none; }
@keyframes pillPulse { 50% { transform: scale(1.07); } }
@media (max-height: 460px) {
  .mini { width: 148px; min-height: 124px; padding-top: 24px; gap: 4px; }
  .mini .emb { width: 32px; height: 32px; } .mini .nm { font-size: 14px; }
  .mini .headline { -webkit-line-clamp: 2; font-size: 11px; }
  .picker .title { font-size: 18px; } .picker .lvbadge { width: 32px; height: 32px; font-size: 16px; }
}
@media (max-width: 560px) { .mini { width: 31vw; } }
`;
