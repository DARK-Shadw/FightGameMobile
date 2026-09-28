// Heads-up display: scoreboard and match clock, your level and XP, overhead
// health bars with level badges, damage and XP numbers, kill feed, spell
// buttons (locked until their level, cooldowns, ultimate charge), banners.
// Plain DOM over the canvas.

import * as THREE from 'three';
import { STYLE } from '../vfx/styles.js';
import { getAtlas, spriteIndex, ATLAS_GRID } from '../vfx/atlas.js';
import { ESSENCES } from '../../../prototypes/skill-forge/data-essences.js';
import { LEVEL_XP, MAX_LEVEL, SLOTS_AT, levelProgress, nextUnlock } from './progression.js';
import { icon } from './text.js';

export const TIER_COLORS = { common: '#b8c7d9', rare: '#3fd06a', epic: '#b44bff', legendary: '#ffb020', godly: '#ff3d6e' };
export const TIER_NAMES = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', godly: 'Godly' };
// the level each spell button unlocks at
export const SLOT_LEVEL = [0, 1, 2].map(i => SLOTS_AT.findIndex(n => n > i));

const v = new THREE.Vector3();
const LOCK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="9" width="12" height="8" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';

export const HUD_CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: var(--fd); color: #fff; user-select: none; -webkit-user-select: none; overflow: hidden; z-index: 5; }
#hud .score { position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; }
#hud .score .s { min-width: 52px; padding: 2px 12px 5px; border-radius: 13px; font-size: 27px; text-align: center; border: 3px solid var(--ink); box-shadow: inset 0 -5px 0 rgba(0,0,0,.22), inset 0 3px 0 rgba(255,255,255,.25), 0 4px 0 rgba(0,0,0,.3); font-variant-numeric: tabular-nums; }
#hud .score .s.b { background: linear-gradient(#6cc8ff, #2a86e8); }
#hud .score .s.r { background: linear-gradient(#ff7a86, #e0304a); }
#hud .score .mid { display: flex; flex-direction: column; align-items: center; line-height: 1; min-width: 74px; }
#hud .score .t { font-size: 25px; font-variant-numeric: tabular-nums; }
#hud .score .rd { font-size: 10.5px; margin-top: 3px; color: var(--gold2); -webkit-text-stroke: 0; text-shadow: 0 1px 0 var(--ink), 0 0 6px rgba(0,0,0,.6); }
#hud .score.ot .t { color: #ff6a7a; }
/* your level and xp, top left */
#hud .me { position: absolute; left: calc(max(12px, env(safe-area-inset-left)) + 50px); top: max(8px, env(safe-area-inset-top)); display: flex; align-items: center; gap: 8px; }
#hud .me .ring { position: relative; width: 44px; height: 44px; flex: none; }
#hud .me .ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
#hud .me .ring .lvn { position: absolute; inset: 0; display: grid; place-items: center; font-size: 21px; }
#hud .me .info { display: flex; flex-direction: column; gap: 3px; }
#hud .me .row1 { display: flex; align-items: baseline; gap: 6px; font-size: 14px; }
#hud .me .bar { width: 150px; height: 9px; border-radius: 6px; background: var(--ink); border: 2px solid var(--ink); overflow: hidden; }
#hud .me .bar i { display: block; height: 100%; width: 0; border-radius: 4px; background: linear-gradient(#ffe68a, #ffb020); box-shadow: inset 0 -2px 0 rgba(0,0,0,.15); transition: width .25s ease-out; }
#hud .me .next { font: 800 11px/1.1 var(--fb); color: var(--text); text-shadow: 0 1px 0 var(--ink), 0 0 4px var(--ink); white-space: nowrap; }
#hud .me .next b { color: var(--gold2); font-weight: 900; }
#hud .me.maxed .bar i { background: var(--rainbow); }
/* overhead */
#hud .ov { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; will-change: transform; }
#hud .ov .nm { font-size: 13.5px; line-height: 1; margin-bottom: 2px; white-space: nowrap; display: flex; align-items: center; gap: 3px; }
#hud .ov .nm .lv { display: inline-grid; place-items: center; min-width: 17px; height: 17px; border-radius: 50%; background: var(--gold); color: var(--ink); -webkit-text-stroke: 0; text-shadow: none; font-size: 11px; border: 2px solid var(--ink); padding: 0 1px; }
#hud .ov.enemy .nm { color: #ffd6da; } #hud .ov.ally .nm { color: #d6efff; }
#hud .ov .bar { position: relative; width: 74px; height: 12px; background: var(--ink); border-radius: 7px; border: 2px solid var(--ink); overflow: hidden; box-shadow: 0 2px 0 rgba(0,0,0,.35); }
#hud .ov .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; transition: width .08s linear; }
#hud .ov .bar .lag { background: #fff; opacity: .85; transition: width .5s ease-out .15s; }
#hud .ov .bar .hp { background: linear-gradient(#8dff6a, #33c43a); box-shadow: inset 0 -3px 0 rgba(0,0,0,.2), inset 0 2px 0 rgba(255,255,255,.35); }
#hud .ov.enemy .bar .hp { background: linear-gradient(#ff7a7a, #e0243a); }
#hud .ov.ally .bar .hp { background: linear-gradient(#7ad0ff, #2a8ae8); }
#hud .ov .bar .sh { background: linear-gradient(#ffffff, #cfe6ff); opacity: .9; left: auto; right: 0; }
#hud .ov .num { position: absolute; top: 15px; font-size: 11.5px; line-height: 1; --sw: .2em; font-variant-numeric: tabular-nums; }
#hud .ov .ammo { display: flex; gap: 2px; margin-top: 3px; }
#hud .ov .ammo i { width: 22px; height: 6px; border-radius: 3px; background: var(--ink); border: 1.5px solid var(--ink); overflow: hidden; position: relative; }
#hud .ov .ammo i b { position: absolute; inset: 0; background: linear-gradient(#ffb347, #ff7a1a); transform-origin: 0 50%; }
#hud .ov.small .bar { width: 44px; height: 8px; border-width: 1.5px; }
#hud .ov.small .nm { display: none; }
#hud .ov.titan .bar { width: 110px; height: 12px; }
/* floating numbers */
#hud .dn { position: absolute; left: 0; top: 0; font-size: 23px; line-height: 1; white-space: nowrap; will-change: transform, opacity; font-variant-numeric: tabular-nums; }
#hud .dn.crit { font-size: 34px; color: var(--gold2); }
#hud .dn.heal { color: #7dff7a; }
#hud .dn.dot { font-size: 16px; opacity: .92; }
#hud .dn.stored { color: #ffd27a; font-size: 18px; }
#hud .dn.me { color: #ff6a78; }
#hud .dn.ko { font-size: 44px; color: var(--gold2); }
#hud .dn.xp { font-size: 17px; color: #ffe68a; }
#hud .dn.lvl { font-size: 18px; color: var(--gold2); }
#hud .feed { position: absolute; right: max(10px, env(safe-area-inset-right)); top: 62px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
#hud .feed div { background: var(--panel); border-radius: 9px; padding: 3px 10px 4px; font-size: 14px; border: 2px solid rgba(255,255,255,.07); animation: feedIn .25s ease-out; }
#hud .feed .b { color: #8fd6ff; } #hud .feed .r { color: #ff8a98; } #hud .feed .x { font: 900 12px var(--fb); color: var(--muted); padding: 0 3px; }
@keyframes feedIn { from { transform: translateX(30px); opacity: 0; } }
#hud .banner { position: absolute; left: 0; right: 0; top: 20%; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
#hud .banner .tag { font: 900 14px var(--fb); letter-spacing: .12em; text-transform: uppercase; padding: 4px 14px 5px; border-radius: 9px; border: 3px solid var(--ink); background: var(--gold); color: var(--ink); box-shadow: 0 4px 0 rgba(0,0,0,.3); }
#hud .banner .big { font-size: clamp(36px, 7.2vw, 70px); line-height: 1.02; margin-top: 8px; text-align: center; }
#hud .banner .sub { font: 800 clamp(13px, 2.2vw, 18px) var(--fb); margin-top: 6px; text-shadow: 0 2px 0 var(--ink), 0 0 8px var(--ink); }
#hud .banner.godly .tag { background: var(--rainbow); background-size: 200% 100%; animation: rainbow 1.2s linear infinite; color: #fff; text-shadow: 0 1px 0 var(--ink); }
#hud .banner.lose .tag { background: #ff5a6a; color: #fff; }
@keyframes rainbow { to { background-position: 200% 0; } }
#hud .respawn { position: absolute; inset: 0; display: none; place-items: center; background: radial-gradient(transparent 40%, rgba(40,0,20,.55)); }
#hud .respawn.on { display: grid; }
#hud .respawn div { font-size: 30px; text-align: center; line-height: 1.1; }
#hud .respawn small { display: block; font: 800 13px var(--fb); -webkit-text-stroke: 0; text-shadow: 0 1px 0 var(--ink); margin-top: 6px; }
#hud .lowhp { position: absolute; inset: 0; box-shadow: inset 0 0 90px 30px rgba(255,20,50,.55); opacity: 0; transition: opacity .3s; }
#hud.menu .ovs, #hud.menu .nums, #hud.menu .score, #hud.menu .controls, #hud.menu .feed, #hud.menu .rotate, #hud.menu .me, #hud.menu .pickwrap { display: none; }
#hud .mute { position: absolute; left: max(12px, env(safe-area-inset-left)); top: max(10px, env(safe-area-inset-top)); width: 40px; height: 40px; border-radius: 12px; border: 3px solid var(--ink); background: linear-gradient(#5a4a9a, #342868); box-shadow: 0 4px 0 rgba(0,0,0,.35); pointer-events: auto; cursor: pointer; display: grid; place-items: center; padding: 0; }
#hud .mute svg { width: 22px; height: 22px; }
#hud .mute:focus-visible { outline: 3px solid var(--gold2); outline-offset: 2px; }
#hud .mute .x { display: none; } #hud .mute.off .x { display: inline; } #hud .mute.off .w { display: none; }
#hud .rotate { position: absolute; left: 50%; top: calc(max(10px, env(safe-area-inset-top)) + 58px); transform: translateX(-50%); display: none; background: var(--panel); border-radius: 10px; padding: 5px 12px; font: 800 13px var(--fb); white-space: nowrap; }
@media (orientation: portrait) and (pointer: coarse) { #hud .rotate { display: block; } #hud .btns { transform: scale(.82); transform-origin: 100% 100%; } }
#hud .toast { position: absolute; left: 50%; bottom: 30%; transform: translateX(-50%); font-size: 21px; opacity: 0; white-space: nowrap; }
/* controls */
#hud .controls { position: absolute; inset: 0; }
#hud .stick-zone { position: absolute; left: 0; top: 60px; bottom: 0; width: 46%; pointer-events: auto; touch-action: none; }
#hud .stick { position: absolute; width: 118px; height: 118px; margin: -59px 0 0 -59px; border-radius: 50%; background: rgba(26,15,46,.32); border: 3px solid rgba(255,255,255,.55); display: none; pointer-events: none; }
#hud .stick.on { display: block; }
#hud .stick .knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #fff, #cfd8ff); box-shadow: 0 3px 0 rgba(0,0,0,.35); }
#hud .btns { position: absolute; right: max(18px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom)); width: 250px; height: 240px; }
#hud .abtn, #hud .pbtn { position: absolute; border-radius: 50%; pointer-events: auto; touch-action: none; cursor: pointer; }
#hud .abtn { right: 0; bottom: 0; width: 112px; height: 112px; background: radial-gradient(circle at 40% 30%, #ffd07a, #ff8a1a 60%, #d8580a); border: 4px solid var(--ink); box-shadow: inset 0 -8px 0 rgba(0,0,0,.2), 0 6px 0 rgba(0,0,0,.35); }
#hud .abtn::after { content: ''; position: absolute; inset: 26px; background: no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M8 56 L40 24 M34 18 L46 18 L46 30 M40 24 L50 14' stroke='%231a0f2e' stroke-width='7' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='50' cy='14' r='7' fill='%23fff' stroke='%231a0f2e' stroke-width='4'/%3E%3C/svg%3E"); }
#hud .abtn .ammo { position: absolute; left: 50%; bottom: -14px; transform: translateX(-50%); display: flex; gap: 3px; }
#hud .abtn .ammo i { width: 18px; height: 7px; border-radius: 4px; background: #ffb347; border: 2px solid var(--ink); }
#hud .abtn .ammo i.off { background: #3a2a4a; }
#hud .pbtn { width: 78px; height: 78px; background: var(--ink); border: 4px solid var(--tier, #b8c7d9); box-shadow: 0 5px 0 rgba(0,0,0,.35), 0 0 0 2px var(--ink); overflow: hidden; }
#hud .pbtn[data-slot="0"] { right: 124px; bottom: 6px; }
#hud .pbtn[data-slot="1"] { right: 104px; bottom: 96px; }
#hud .pbtn[data-slot="2"] { right: 18px; bottom: 132px; }
#hud .pbtn[data-slot="3"] { right: 196px; bottom: 96px; width: 62px; height: 62px; display: none; }
#hud .pbtn[data-slot="3"].has { display: block; border-style: dashed; }
#hud .pbtn canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#hud .pbtn .cd { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(10,5,20,.74) calc(var(--p, 0) * 1%), transparent 0); display: grid; place-items: center; font-size: 22px; font-variant-numeric: tabular-nums; }
#hud .pbtn .lock { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 1px; background: radial-gradient(circle at 50% 35%, #3a2d6a, #1d1238); color: #9f92c8; }
#hud .pbtn .lock svg { width: 26px; height: 26px; }
#hud .pbtn .lock span { font: 900 11px var(--fb); letter-spacing: .06em; color: #cfc4f0; }
#hud .pbtn.locked { border-color: #4a3d78; cursor: default; }
#hud .pbtn.locked .lock { display: flex; }
#hud .pbtn.empty .lock { display: flex; }
#hud .pbtn.empty { border-color: var(--gold); animation: readyPulse 1.2s ease-in-out infinite; --glow: #ffe14a; }
#hud .pbtn.ready { animation: readyPulse 1.6s ease-in-out infinite; }
#hud .pbtn.godly { border-color: transparent; background: conic-gradient(from var(--a, 0deg), #ff3d6e, #ffc02e, #3fd06a, #3fa9ff, #b44bff, #ff3d6e) border-box; }
#hud .pbtn .ult { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(transparent calc(var(--c, 0) * 1%), rgba(10,5,20,.74) 0); display: none; place-items: center; }
#hud .pbtn.isult .ult { display: grid; }
#hud .pbtn.isult .ult b { font: 900 11px var(--fb); letter-spacing: .08em; background: var(--ink); border-radius: 6px; padding: 1px 5px 2px; margin-top: 36px; }
#hud .pbtn.isult.ready .ult b { background: var(--rainbow); }
@keyframes readyPulse { 50% { box-shadow: 0 5px 0 rgba(0,0,0,.35), 0 0 0 2px var(--ink), 0 0 18px 4px var(--glow, #fff); } }
#hud .held { transform: scale(.93); }
#hud .passive { position: absolute; width: 50px; height: 50px; border-radius: 50%; border: 3px solid var(--tier, #b8c7d9); background: var(--ink); box-shadow: 0 4px 0 rgba(0,0,0,.35), 0 0 0 2px var(--ink); overflow: hidden; pointer-events: auto; }
#hud .passive canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#hud .passive .cd { position: absolute; inset: 0; background: conic-gradient(rgba(10,5,20,.74) calc(var(--p, 0) * 1%), transparent 0); }
#hud .passive b { position: absolute; left: 50%; bottom: -1px; transform: translateX(-50%); font: 900 9px var(--fb); letter-spacing: .08em; background: var(--ink); border-radius: 6px; padding: 1px 5px; color: var(--gold2); }
#hud .passive.flash { animation: pflash .5s ease-out; }
@keyframes pflash { 30% { transform: scale(1.25); box-shadow: 0 0 22px 6px var(--glow, #fff); } }
#hud .key { position: absolute; left: 50%; bottom: -2px; transform: translateX(-50%); font: 900 11px var(--fb); color: #fff; text-shadow: 0 1px 0 #000; opacity: .85; display: none; }
@media (pointer: fine) { #hud .key { display: block; } #hud .abtn .key { bottom: 8px; } }
@media (max-height: 480px) { #hud .btns { transform: scale(.8); transform-origin: 100% 100%; } #hud .me .bar { width: 120px; } }
`;

export function iconCanvas(canvas, slot) {
  const st = STYLE[slot.ess] || STYLE.fire;
  const W = 128;
  canvas.width = canvas.height = W;
  const g = canvas.getContext('2d');
  const grd = g.createRadialGradient(W * 0.45, W * 0.35, 4, W / 2, W / 2, W * 0.7);
  grd.addColorStop(0, st.glow); grd.addColorStop(0.45, st.color); grd.addColorStop(1, st.edge);
  g.fillStyle = grd; g.fillRect(0, 0, W, W);
  // the essence's motif sprite in white, with the shape's glyph in ink at the corner
  const atlas = getAtlas().image, cell = atlas.width / ATLAS_GRID;
  const glyph = { bolt: 'streak', lob: 'dot', strike: 'bolt', nova: 'ring', cone: 'wave', zone: 'rune2', aura: 'halo', beam: 'streak', dash: 'feather', leap: 'claw', trap: 'rune3', orbitals: 'sparkle', wall: 'hex', tether: 'swirl', self: 'plus', imbue: 'claw', global: 'star5' }[slot.dna.root.carrier.id] || 'star4';
  const tint = (name, x, y, s, color) => {
    const c = document.createElement('canvas'); c.width = c.height = W;
    const t = c.getContext('2d');
    const i = spriteIndex(name);
    t.drawImage(atlas, (i % ATLAS_GRID) * cell, Math.floor(i / ATLAS_GRID) * cell, cell, cell, x, y, s, s);
    t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, W, W);
    return c;
  };
  g.shadowColor = 'rgba(26,15,46,.9)'; g.shadowOffsetY = 4;
  g.drawImage(tint(st.spark, W * 0.12, W * 0.12, W * 0.76, '#ffffff'), 0, 0);
  g.shadowOffsetY = 0;
  g.drawImage(tint(glyph, W * 0.52, W * 0.52, W * 0.42, '#1a0f2e'), 0, 0);
  const shine = g.createLinearGradient(0, 0, 0, W);
  shine.addColorStop(0, 'rgba(255,255,255,.35)'); shine.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.fillStyle = shine; g.fillRect(0, 0, W, W);
}

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    root.innerHTML = `
      <div class="lowhp"></div>
      <div class="score"><div class="s b ol">0</div><div class="mid"><div class="t ol">4:30</div><div class="rd lbl">FIRST TO 20</div></div><div class="s r ol">0</div></div>
      <div class="me"><div class="ring"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="#2a1d58" stroke="#1a0f2e" stroke-width="7"/><circle class="arc" cx="22" cy="22" r="18" fill="none" stroke="#ffc02e" stroke-width="4" stroke-linecap="round" stroke-dasharray="113.1" stroke-dashoffset="113.1"/></svg><div class="lvn ol">1</div></div>
        <div class="info"><div class="bar"><i></i></div><div class="next"></div></div></div>
      <div class="ovs"></div><div class="nums"></div>
      <div class="feed"></div>
      <div class="banner"></div>
      <div class="toast ol"></div>
      <div class="rotate">Turn your phone sideways for the full arena</div>
      <button class="mute" type="button" aria-label="Sound on or off" title="Sound"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M17 9l5 6M22 9l-5 6"/></svg></button>
      <div class="respawn"><div class="ol">KNOCKED OUT<br><span class="rs">3</span><small>Your level and powers stay with you</small></div></div>
      <div class="controls"></div>
      <div class="pickwrap"></div>`;
    const q = s => root.querySelector(s);
    this.ovLayer = q('.ovs');
    this.numLayer = q('.nums');
    this.feed = q('.feed');
    this.bannerEl = q('.banner');
    this.scoreEl = q('.score');
    this.scoreB = q('.s.b');
    this.scoreR = q('.s.r');
    this.timeEl = q('.t');
    this.roundEl = q('.rd');
    this.respawnEl = q('.respawn');
    this.respawnNum = q('.rs');
    this.lowEl = q('.lowhp');
    this.toastEl = q('.toast');
    this.controls = q('.controls');
    this.muteBtn = q('.mute');
    this.pickRoot = q('.pickwrap');
    this.meEl = q('.me');
    this.meArc = q('.me .arc');
    this.meLv = q('.me .lvn');
    this.meBar = q('.me .bar i');
    this.meNext = q('.me .next');
    this.ovs = new Map();
    this.nums = [];
    this.iconKey = [];
    this.lastCast = new Map();
    this.bind(game.world.events);
  }

  bind(ev) {
    const me = f => f === this.game.player;
    ev.on('damage', e => this.number(e.target, e.amount, e.crit ? 'crit' : e.dot ? 'dot' : '', e));
    ev.on('heal', e => { if (e.amount >= 20) this.number(e.target, e.amount, 'heal'); });
    ev.on('stored', e => this.number(e.target, e.amount, 'stored'));
    ev.on('death', e => this.killFeed(e));
    ev.on('ko', e => this.number(e.target, 'KO!', 'ko'));
    ev.on('xp', e => { if (me(e.f) && e.why) this.number(e.f, `+${e.amount} XP`, 'xp'); });
    ev.on('levelup', e => {
      if (me(e.f)) {
        const u = e.level >= 2 ? `${['', '', 'First spell unlocked', 'Second spell slot', 'Epic evolutions', 'Third spell slot', 'Legendary evolutions', 'Godly powers unlocked'][e.level]}` : '';
        this.banner(`Level ${e.level}`, e.level === 7 ? 'MAX LEVEL!' : 'LEVEL UP!', u, e.level === 7 ? 'godly' : '');
      } else this.number(e.f, `LV ${e.level}`, 'lvl');
    });
    ev.on('cast', e => this.lastCast.set(e.caster, e.dna));
    ev.on('godly', e => { const d = this.lastCast.get(e.caster); this.banner(me(e.caster) ? 'You broke reality' : `${e.caster.name} broke reality`, d?.name ?? 'Godly Power', d?.info?.epithet ?? '', 'godly', e.ess); });
    ev.on('transform', e => { if (e.who.kind === 'brawler') this.toast(`${e.who.name} became a ${e.name}!`); });
    ev.on('titan', e => this.toast(`${e.caster.name} called ${e.name}!`));
    ev.on('resurrect', e => this.toast(`${e.target.name} refused to fall!`));
    ev.on('overtime', () => { this.banner('Tied', 'OVERTIME', 'Next knockout wins', 'lose'); this.scoreEl.classList.add('ot'); });
    ev.on('matchstart', () => { this.scoreEl.classList.remove('ot'); this.iconKey = []; });
  }

  overlay(f) {
    let o = this.ovs.get(f);
    if (o) return o;
    const el = document.createElement('div');
    const me = f === this.game.player;
    const side = me ? 'me' : f.team === this.game.world.playerTeam ? 'ally' : 'enemy';
    el.className = `ov ${side} ${f.kind === 'brawler' ? '' : f.kind === 'titan' ? 'titan' : 'small'}`;
    const brawler = f.kind === 'brawler';
    el.innerHTML = `<div class="nm ol">${brawler ? '<span class="lv">1</span>' : ''}<span class="name"></span></div><div class="bar"><i class="lag"></i><i class="hp"></i><i class="sh"></i></div>${brawler ? `<div class="num ol"></div>` : ''}${me ? '<div class="ammo"><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i></div>' : ''}`;
    el.querySelector('.name').textContent = f.name;
    this.ovLayer.appendChild(el);
    o = { el, hp: el.querySelector('.hp'), lag: el.querySelector('.lag'), sh: el.querySelector('.sh'), num: el.querySelector('.num'), lv: el.querySelector('.lv'), ammo: [...el.querySelectorAll('.ammo i')], last: -1, level: 0 };
    this.ovs.set(f, o);
    return o;
  }

  project(x, y, z) {
    v.set(x, y, z).project(this.game.world.camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z];
  }

  number(target, amount, kind, e = {}) {
    if (!target || !amount || (typeof amount === 'number' && amount < 1)) return;
    const el = document.createElement('div');
    const me = target === this.game.player && !['heal', 'xp', 'lvl'].includes(kind);
    el.className = `dn ol ${kind} ${me ? 'me' : ''}`;
    el.textContent = kind === 'heal' ? '+' + amount : amount;
    this.numLayer.appendChild(el);
    const life = { ko: 1.6, crit: 1.3, dot: 0.7, xp: 1.1, lvl: 1.4 }[kind] ?? 0.95;
    this.nums.push({ el, target, t: 0, x: ['ko', 'xp', 'lvl'].includes(kind) ? 0 : (Math.random() - 0.5) * 0.7, y0: target.height + (kind === 'xp' ? 0.55 : 0.2), life, kind });
    if (this.nums.length > 40) { const n = this.nums.shift(); n.el.remove(); }
  }

  killFeed({ target, src }) {
    if (target.kind !== 'brawler') return;
    const killer = src?.owner || src;
    const d = document.createElement('div');
    d.className = 'ol';
    const cls = f => (f?.team === this.game.world.playerTeam ? 'b' : 'r');
    const nm = f => { const s = document.createElement('span'); s.className = cls(f); s.textContent = f.name; return s; };
    if (killer && killer !== target) { d.append(nm(killer)); const x = document.createElement('span'); x.className = 'x'; x.textContent = 'KO'; d.append(x, nm(target)); }
    else { d.append(nm(target)); const x = document.createElement('span'); x.className = 'x'; x.textContent = 'fell'; d.append(x); }
    this.feed.prepend(d);
    setTimeout(() => d.remove(), 4000);
    while (this.feed.children.length > 4) this.feed.lastChild.remove();
  }

  banner(tag, big, sub, cls = '', ess = null) {
    const st = ess ? STYLE[ess] : null;
    this.bannerEl.className = 'banner ' + cls;
    this.bannerEl.innerHTML = '';
    const t = document.createElement('div'); t.className = 'tag'; t.textContent = tag;
    const b = document.createElement('div'); b.className = 'big ol'; b.textContent = big; if (st) b.style.color = st.glow;
    this.bannerEl.append(t, b);
    if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub; this.bannerEl.append(s); }
    this.bannerEl.animate([{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(.96)', offset: 0.18 }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: 'scale(1.05)' }], { duration: 2400, easing: 'ease-out', fill: 'forwards' });
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.animate([{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200, fill: 'forwards' });
  }

  slotFor(p, i) { return i === 3 ? p.powers.find(s => s.borrowed) : p.powers.find(s => !s.passive && s.index === i); }

  setPowerIcons(input) {
    const p = this.game.player;
    input.btnEls.forEach(b => {
      const i = Number(b.dataset.slot);
      if (i < 0) return;
      const slot = this.slotFor(p, i);
      const unlockAt = SLOT_LEVEL[i] ?? 99;
      const unlocked = i === 3 || (p.level || 1) >= unlockAt;
      b.classList.toggle('has', !!slot);
      b.classList.toggle('locked', !slot && !unlocked);
      b.classList.toggle('empty', !slot && unlocked && i < 3);
      if (!slot) {
        if (this.iconKey[i] !== 'lock' + unlocked) {
          this.iconKey[i] = 'lock' + unlocked;
          const c = b.querySelector('canvas'); c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
          b.querySelector('.lock').innerHTML = unlocked ? `${icon('ult')}<span>PICK</span>` : `${LOCK}<span>LV ${unlockAt}</span>`;
          b.style.removeProperty('--tier');
          b.classList.remove('godly', 'isult', 'ready');
          b.title = unlocked ? 'Pick a power from your level-up' : `Unlocks at level ${unlockAt}`;
        }
        return;
      }
      if (this.iconKey[i] !== slot) {
        this.iconKey[i] = slot;
        iconCanvas(b.querySelector('canvas'), slot);
        b.style.setProperty('--tier', TIER_COLORS[slot.dna.tier]);
        b.style.setProperty('--glow', STYLE[slot.ess]?.glow ?? '#fff');
        b.classList.toggle('godly', slot.dna.tier === 'godly');
        b.classList.toggle('isult', !!slot.ult);
        b.title = slot.dna.name;
      }
    });
  }

  // Passive powers: small badges beside the buttons with their cooldown.
  updatePassives(p, input) {
    const box = input.root.querySelector('.btns');
    const pas = p.powers.filter(s => s.passive);
    this.pasEls ||= [];
    while (this.pasEls.length > pas.length) this.pasEls.pop().el.remove();
    pas.forEach((slot, i) => {
      let e = this.pasEls[i];
      if (!e) { const el = document.createElement('div'); el.className = 'passive'; el.innerHTML = '<canvas></canvas><div class="cd"></div><b>AUTO</b>'; box.appendChild(el); e = this.pasEls[i] = { el, slot: null, cd: 0 }; }
      if (e.slot !== slot) {
        e.slot = slot;
        iconCanvas(e.el.querySelector('canvas'), slot);
        e.el.style.setProperty('--tier', TIER_COLORS[slot.dna.tier]);
        e.el.style.setProperty('--glow', STYLE[slot.ess]?.glow ?? '#fff');
        e.el.title = `${slot.dna.name}: ${slot.dna.info?.text?.[0] ?? 'triggers by itself'}`;
      }
      e.el.style.right = (206 + i * 58) + 'px';
      e.el.style.bottom = '8px';
      const k = slot.cdMax > 0 ? slot.cd / slot.cdMax : 0;
      e.el.querySelector('.cd').style.setProperty('--p', (k * 100).toFixed(1));
      if (e.cd <= 0 && slot.cd > 0) { e.el.classList.remove('flash'); void e.el.offsetWidth; e.el.classList.add('flash'); }
      e.cd = slot.cd;
    });
  }

  updateMe(p) {
    const lv = p.level || 1, xp = p.xp || 0;
    const k = Math.max(0, Math.min(1, levelProgress(xp, lv)));
    if (this.meLvShown !== lv) { this.meLvShown = lv; this.meLv.textContent = lv; this.meEl.classList.toggle('maxed', lv >= MAX_LEVEL); }
    this.meArc.style.strokeDashoffset = (113.1 * (1 - k)).toFixed(1);
    this.meBar.style.width = (k * 100).toFixed(1) + '%';
    const n = nextUnlock(lv);
    const text = n ? `Next <b>LV ${n.level}</b>: ${n.text}` : '<b>Max level</b>: godly powers unlocked';
    if (this.meNextShown !== text) { this.meNextShown = text; this.meNext.innerHTML = text; }
    void LEVEL_XP;
  }

  update(dt, input) {
    const g = this.game, w = g.world, p = g.player;
    this.root.classList.toggle('menu', !!g.lobby?.active);
    if (g.lobby?.active) return;
    // overhead bars
    for (const f of w.fighters) {
      const o = this.overlay(f);
      const vis = f.alive && f.group.visible && !(f.statuses.invis && f.team !== w.playerTeam) && !(f.inBush && f.team !== w.playerTeam && !f.statuses.revealed && p && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) > 2.5);
      if (!vis) { if (o.el.style.display !== 'none') o.el.style.display = 'none'; continue; }
      o.el.style.display = '';
      const [x, y] = this.project(f.pos.x, (f.y || 0) + f.height * (f.model.group.scale.y || 1) + 0.28, f.pos.z);
      o.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      const hp = Math.max(0, f.hp) / f.maxHp;
      if (o.last !== hp) {
        o.hp.style.width = (hp * 100).toFixed(1) + '%';
        o.lag.style.width = (hp * 100).toFixed(1) + '%';
        if (o.num) o.num.textContent = Math.ceil(Math.max(0, f.hp));
        o.last = hp;
      }
      if (o.lv && o.level !== f.level) { o.level = f.level; o.lv.textContent = f.level || 1; }
      o.sh.style.width = f.shieldHp > 0 ? Math.min(100, f.shieldHp / f.maxHp * 100) + '%' : '0';
      if (o.ammo.length) o.ammo.forEach((el, i) => {
        el.style.display = i < f.ammoMax ? '' : 'none';
        const k = i < f.ammo ? 1 : i === f.ammo ? f.reloadT / f.reloadTime : 0;
        el.firstChild.style.transform = `scaleX(${k})`;
      });
    }
    for (const [f, o] of this.ovs) if (!w.fighters.includes(f)) { o.el.remove(); this.ovs.delete(f); }
    // floating numbers
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      const k = n.t / n.life;
      if (k >= 1) { n.el.remove(); this.nums.splice(i, 1); continue; }
      const f = n.target;
      const [x, y] = this.project(f.pos.x + n.x, (f.y || 0) + n.y0 + k * 0.9, f.pos.z);
      const pop = n.t < 0.12 ? 0.6 + n.t / 0.12 * 0.8 : Math.max(1, 1.4 - (n.t - 0.12) * 3);
      n.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop * (n.kind === 'crit' || n.kind === 'ko' ? 1.15 : 1)}) rotate(${n.kind === 'ko' ? -8 : 0}deg)`;
      n.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
    // scoreboard and clock
    this.scoreB.textContent = g.score[w.playerTeam];
    this.scoreR.textContent = g.score[1 - w.playerTeam];
    const m = g.match;
    const tl = Math.max(0, Math.ceil(m?.time ?? 0));
    this.timeEl.textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    const rd = m?.phase === 'overtime' ? 'NEXT KO WINS' : `FIRST TO ${m?.koTarget ?? 15}`;
    if (this.roundEl.textContent !== rd) this.roundEl.textContent = rd;
    // respawn, low hp, your level
    if (p) {
      this.respawnEl.classList.toggle('on', !p.alive && p.respawnT > 0);
      if (!p.alive && p.respawnT > 0) this.respawnNum.textContent = Math.ceil(p.respawnT);
      this.lowEl.style.opacity = p.alive && p.hpPct < 0.3 ? (0.55 + 0.45 * Math.sin(w.time * 6)) : 0;
      this.updateMe(p);
    }
    // spell buttons
    if (input && p) {
      this.setPowerIcons(input);
      this.updatePassives(p, input);
      input.btnEls.forEach(b => {
        const i = Number(b.dataset.slot);
        if (i < 0) {
          b.querySelectorAll('.ammo i').forEach((a, k) => { a.classList.toggle('off', k >= p.ammo); a.style.display = k < p.ammoMax ? '' : 'none'; });
          return;
        }
        const slot = this.slotFor(p, i);
        if (!slot) return;
        const cd = b.querySelector('.cd');
        if (slot.ult) {
          b.querySelector('.ult').style.setProperty('--c', (slot.charge * 100).toFixed(1));
          cd.style.setProperty('--p', 0);
          cd.textContent = '';
          b.querySelector('.ult b').textContent = slot.charge >= 1 ? 'ULT' : `${Math.floor(slot.charge * 100)}%`;
        } else {
          const k = slot.cdMax > 0 ? slot.cd / slot.cdMax : 0;
          cd.style.setProperty('--p', (k * 100).toFixed(1));
          cd.textContent = slot.cd > 0.05 ? Math.ceil(slot.cd) : slot.uses !== Infinity ? '×' + slot.uses : '';
        }
        b.classList.toggle('ready', slot.ready);
        if (slot.dna.tier === 'godly') b.style.setProperty('--a', ((w.time * 120) % 360) + 'deg');
      });
    }
  }
}

export function essenceName(ess) { return ESSENCES[ess]?.name ?? ess; }
