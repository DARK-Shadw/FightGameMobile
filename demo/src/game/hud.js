// Heads-up display: scoreboard, overhead health bars, damage numbers, kill
// feed, power buttons with cooldowns, announcements. Plain DOM over the
// canvas, styled like a mobile brawler.

import * as THREE from 'three';
import { STYLE } from '../vfx/styles.js';
import { getAtlas, spriteIndex, ATLAS_GRID } from '../vfx/atlas.js';
import { ESSENCES } from '../../../prototypes/skill-forge/data-essences.js';

export const TIER_COLORS = { common: '#a9bccf', rare: '#3fd06a', epic: '#b44bff', legendary: '#ffc02e', godly: '#ff3d6e' };
export const TIER_NAMES = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', godly: 'Godly' };

const v = new THREE.Vector3();

export const HUD_CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Lilita One', system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; overflow: hidden; z-index: 5; }
#hud .ol { -webkit-text-stroke: 0; text-shadow: 0 2px 0 #1a0f2e, 2px 0 0 #1a0f2e, -2px 0 0 #1a0f2e, 0 -2px 0 #1a0f2e, 2px 2px 0 #1a0f2e, -2px 2px 0 #1a0f2e, 2px -2px 0 #1a0f2e, -2px -2px 0 #1a0f2e, 0 4px 0 rgba(0,0,0,.35); }
#hud .score { position: absolute; top: max(10px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; }
#hud .score .s { min-width: 54px; padding: 4px 12px 6px; border-radius: 12px; font-size: 26px; text-align: center; border: 3px solid #1a0f2e; box-shadow: inset 0 -5px 0 rgba(0,0,0,.25), 0 4px 0 rgba(0,0,0,.3); }
#hud .score .s.b { background: linear-gradient(#5cc0ff, #2a86e8); }
#hud .score .s.r { background: linear-gradient(#ff6a78, #e0304a); }
#hud .score .mid { display: flex; flex-direction: column; align-items: center; line-height: 1; }
#hud .score .t { font-size: 24px; }
#hud .score .rd { font-size: 13px; opacity: .9; margin-top: 3px; letter-spacing: .5px; }
#hud .ov { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; transform-origin: 50% 100%; will-change: transform; }
#hud .ov .nm { font-size: 14px; line-height: 1; margin-bottom: 2px; white-space: nowrap; }
#hud .ov .bar { position: relative; width: 74px; height: 12px; background: #1a0f2e; border-radius: 7px; border: 2px solid #1a0f2e; overflow: hidden; box-shadow: 0 2px 0 rgba(0,0,0,.35); }
#hud .ov .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; transition: width .08s linear; }
#hud .ov .bar .lag { background: #fff; opacity: .85; transition: width .5s ease-out .15s; }
#hud .ov .bar .hp { background: linear-gradient(#8dff6a, #33c43a); box-shadow: inset 0 -3px 0 rgba(0,0,0,.2), inset 0 2px 0 rgba(255,255,255,.35); }
#hud .ov.enemy .bar .hp { background: linear-gradient(#ff7a7a, #e0243a); }
#hud .ov.ally .bar .hp { background: linear-gradient(#7ad0ff, #2a8ae8); }
#hud .ov .bar .sh { background: linear-gradient(#ffffff, #cfe6ff); opacity: .9; left: auto; right: 0; }
#hud .ov .num { position: absolute; top: 13px; font-size: 12px; line-height: 1; }
#hud .ov .ammo { display: flex; gap: 2px; margin-top: 3px; }
#hud .ov .ammo i { width: 22px; height: 6px; border-radius: 3px; background: #1a0f2e; border: 1.5px solid #1a0f2e; overflow: hidden; position: relative; }
#hud .ov .ammo i b { position: absolute; inset: 0; background: linear-gradient(#ffb347, #ff7a1a); transform-origin: 0 50%; }
#hud .ov.small .bar { width: 44px; height: 8px; border-width: 1.5px; }
#hud .ov.small .nm { display: none; }
#hud .ov.titan .bar { width: 110px; height: 12px; }
#hud .ov .lv { position: absolute; left: -22px; top: 9px; width: 20px; height: 20px; border-radius: 50%; background: #ffc02e; border: 2px solid #1a0f2e; font-size: 12px; display: grid; place-items: center; color: #1a0f2e; text-shadow: none; }
#hud .dn { position: absolute; left: 0; top: 0; font-size: 22px; line-height: 1; white-space: nowrap; will-change: transform, opacity; }
#hud .dn.crit { font-size: 34px; color: #ffe14a; }
#hud .dn.heal { color: #7dff7a; }
#hud .dn.dot { font-size: 16px; opacity: .9; }
#hud .dn.stored { color: #ffd27a; font-size: 18px; }
#hud .dn.me { color: #ff5a6a; }
#hud .dn.ko { font-size: 44px; color: #ffe14a; letter-spacing: 1px; }
#hud .feed { position: absolute; right: max(10px, env(safe-area-inset-right)); top: 64px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
#hud .feed div { background: rgba(26,15,46,.72); border-radius: 8px; padding: 3px 9px; font-size: 14px; animation: feedIn .25s ease-out; }
#hud .feed .b { color: #7ad0ff; } #hud .feed .r { color: #ff7a8a; }
@keyframes feedIn { from { transform: translateX(30px); opacity: 0; } }
#hud .banner { position: absolute; left: 0; right: 0; top: 22%; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
#hud .banner .tag { font-size: 18px; padding: 3px 14px; border-radius: 8px; border: 3px solid #1a0f2e; box-shadow: 0 4px 0 rgba(0,0,0,.3); }
#hud .banner .big { font-size: clamp(34px, 7vw, 64px); line-height: 1.05; margin-top: 6px; text-align: center; }
#hud .banner .sub { font-size: clamp(14px, 2.4vw, 20px); opacity: .95; margin-top: 2px; }
#hud .banner.godly .tag { background: linear-gradient(90deg, #ff3d6e, #ffc02e, #3fd06a, #3fa9ff, #b44bff, #ff3d6e); background-size: 200% 100%; animation: rainbow 1.2s linear infinite; }
@keyframes rainbow { to { background-position: 200% 0; } }
#hud .respawn { position: absolute; inset: 0; display: none; place-items: center; background: radial-gradient(transparent 40%, rgba(40,0,20,.55)); }
#hud .respawn.on { display: grid; }
#hud .respawn div { font-size: 30px; text-align: center; }
#hud .lowhp { position: absolute; inset: 0; box-shadow: inset 0 0 90px 30px rgba(255,20,50,.55); opacity: 0; transition: opacity .3s; }
#hud.menu .ovs, #hud.menu .nums, #hud.menu .score, #hud.menu .controls, #hud.menu .feed, #hud.menu .rotate { display: none; }
#hud .mute { position: absolute; left: max(12px, env(safe-area-inset-left)); top: max(10px, env(safe-area-inset-top)); width: 40px; height: 40px; border-radius: 12px; border: 3px solid #1a0f2e; background: linear-gradient(#5a4a9a, #342868); box-shadow: 0 4px 0 rgba(0,0,0,.35); pointer-events: auto; cursor: pointer; display: grid; place-items: center; padding: 0; }
#hud .mute svg { width: 22px; height: 22px; }
#hud .mute:focus-visible { outline: 3px solid #ffe14a; outline-offset: 2px; }
#hud .mute .x { display: none; }
#hud .mute.off .x { display: inline; }
#hud .mute.off .w { display: none; }
#hud .rotate { position: absolute; left: 50%; top: calc(max(10px, env(safe-area-inset-top)) + 58px); transform: translateX(-50%); display: none; background: rgba(26,15,46,.78); border-radius: 10px; padding: 5px 12px; font-size: 13px; white-space: nowrap; }
@media (orientation: portrait) and (pointer: coarse) { #hud .rotate { display: block; } #hud .btns { transform: scale(.82); transform-origin: 100% 100%; } }
#hud .toast { position: absolute; left: 50%; bottom: 26%; transform: translateX(-50%); font-size: 20px; opacity: 0; transition: opacity .2s; white-space: nowrap; }

/* controls */
#hud .controls { position: absolute; inset: 0; }
#hud .stick-zone { position: absolute; left: 0; top: 60px; bottom: 0; width: 48%; pointer-events: auto; touch-action: none; }
#hud .stick { position: absolute; width: 118px; height: 118px; margin: -59px 0 0 -59px; border-radius: 50%; background: rgba(26,15,46,.32); border: 3px solid rgba(255,255,255,.55); display: none; pointer-events: none; }
#hud .stick.on { display: block; }
#hud .stick .knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #fff, #cfd8ff); box-shadow: 0 3px 0 rgba(0,0,0,.35); }
#hud .btns { position: absolute; right: max(18px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom)); width: 250px; height: 240px; }
#hud .abtn, #hud .pbtn { position: absolute; border-radius: 50%; pointer-events: auto; touch-action: none; cursor: pointer; }
#hud .abtn { right: 0; bottom: 0; width: 112px; height: 112px; background: radial-gradient(circle at 40% 30%, #ffd07a, #ff8a1a 60%, #d8580a); border: 4px solid #1a0f2e; box-shadow: inset 0 -8px 0 rgba(0,0,0,.2), 0 6px 0 rgba(0,0,0,.35); }
#hud .abtn::after { content: ''; position: absolute; inset: 26px; background: no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M8 56 L40 24 M34 18 L46 18 L46 30 M40 24 L50 14' stroke='%231a0f2e' stroke-width='7' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='50' cy='14' r='7' fill='%23fff' stroke='%231a0f2e' stroke-width='4'/%3E%3C/svg%3E"); }
#hud .abtn .ammo { position: absolute; left: 50%; bottom: -14px; transform: translateX(-50%); display: flex; gap: 3px; }
#hud .abtn .ammo i { width: 18px; height: 7px; border-radius: 4px; background: #ffb347; border: 2px solid #1a0f2e; }
#hud .abtn .ammo i.off { background: #3a2a4a; }
#hud .pbtn { width: 78px; height: 78px; background: #1a0f2e; border: 4px solid var(--tier, #a9bccf); box-shadow: 0 5px 0 rgba(0,0,0,.35), 0 0 0 2px #1a0f2e; display: none; overflow: hidden; }
#hud .pbtn.has { display: block; }
#hud .pbtn[data-slot="0"] { right: 124px; bottom: 6px; }
#hud .pbtn[data-slot="1"] { right: 104px; bottom: 96px; }
#hud .pbtn[data-slot="2"] { right: 18px; bottom: 132px; }
#hud .pbtn canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#hud .pbtn .cd { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(10,5,20,.72) calc(var(--p, 0) * 1%), transparent 0); display: grid; place-items: center; font-size: 22px; }
#hud .pbtn.ready { animation: readyPulse 1.6s ease-in-out infinite; }
#hud .pbtn.godly { border-color: transparent; background: conic-gradient(from var(--a, 0deg), #ff3d6e, #ffc02e, #3fd06a, #3fa9ff, #b44bff, #ff3d6e) border-box; }
@keyframes readyPulse { 50% { box-shadow: 0 5px 0 rgba(0,0,0,.35), 0 0 0 2px #1a0f2e, 0 0 18px 4px var(--glow, #fff); } }
#hud .held { transform: scale(.93); }
#hud .passive { position: absolute; width: 50px; height: 50px; border-radius: 50%; border: 3px solid var(--tier, #a9bccf); background: #1a0f2e; box-shadow: 0 4px 0 rgba(0,0,0,.35), 0 0 0 2px #1a0f2e; overflow: hidden; pointer-events: auto; }
#hud .passive canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#hud .passive .cd { position: absolute; inset: 0; background: conic-gradient(rgba(10,5,20,.72) calc(var(--p, 0) * 1%), transparent 0); }
#hud .passive b { position: absolute; left: 50%; bottom: -1px; transform: translateX(-50%); font-size: 10px; letter-spacing: .5px; font-weight: 400; background: #1a0f2e; border-radius: 6px; padding: 0 5px; color: #ffe14a; }
#hud .passive.flash { animation: pflash .5s ease-out; }
@keyframes pflash { 30% { transform: scale(1.25); box-shadow: 0 0 22px 6px var(--glow, #fff); } }
#hud .key { position: absolute; left: 50%; bottom: -3px; transform: translateX(-50%); font-size: 12px; color: #fff; text-shadow: 0 1px 0 #000; opacity: .8; display: none; }
@media (pointer: fine) { #hud .key { display: block; } #hud .abtn .key { bottom: 6px; } }
@media (max-height: 480px) { #hud .btns { transform: scale(.8); transform-origin: 100% 100%; } }
`;

export function iconCanvas(canvas, slot) {
  const st = STYLE[slot.ess] || STYLE.fire;
  const W = 128;
  canvas.width = canvas.height = W;
  const g = canvas.getContext('2d');
  const grd = g.createRadialGradient(W * 0.45, W * 0.35, 4, W / 2, W / 2, W * 0.7);
  grd.addColorStop(0, st.glow); grd.addColorStop(0.45, st.color); grd.addColorStop(1, st.edge);
  g.fillStyle = grd; g.fillRect(0, 0, W, W);
  // carrier glyph from the VFX atlas, tinted dark, plus the essence motif
  const atlas = getAtlas().image, cell = atlas.width / ATLAS_GRID;
  const draw = (name, s, a, x = W / 2, y = W / 2) => {
    const i = spriteIndex(name);
    g.globalAlpha = a;
    g.drawImage(atlas, (i % ATLAS_GRID) * cell, Math.floor(i / ATLAS_GRID) * cell, cell, cell, x - s / 2, y - s / 2, s, s);
    g.globalAlpha = 1;
  };
  const glyph = { bolt: 'streak', lob: 'dot', strike: 'bolt', nova: 'ring', cone: 'wave', zone: 'rune2', aura: 'halo', beam: 'streak', dash: 'feather', leap: 'claw', trap: 'rune3', orbitals: 'sparkle', wall: 'hex', tether: 'swirl', self: 'plus', imbue: 'claw', global: 'star5' }[slot.dna.root.carrier.id] || 'star4';
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = W;
  const t = tmp.getContext('2d');
  const i = spriteIndex(st.spark);
  t.drawImage(atlas, (i % ATLAS_GRID) * cell, Math.floor(i / ATLAS_GRID) * cell, cell, cell, W * 0.12, W * 0.12, W * 0.76, W * 0.76);
  t.globalCompositeOperation = 'source-in'; t.fillStyle = '#ffffff'; t.fillRect(0, 0, W, W);
  const s2 = document.createElement('canvas'); s2.width = s2.height = W;
  const t2 = s2.getContext('2d');
  const j = spriteIndex(glyph);
  t2.drawImage(atlas, (j % ATLAS_GRID) * cell, Math.floor(j / ATLAS_GRID) * cell, cell, cell, W * 0.52, W * 0.52, W * 0.42, W * 0.42);
  t2.globalCompositeOperation = 'source-in'; t2.fillStyle = '#1a0f2e'; t2.fillRect(0, 0, W, W);
  g.shadowColor = 'rgba(26,15,46,.9)'; g.shadowBlur = 0; g.shadowOffsetY = 4;
  g.drawImage(tmp, 0, 0);
  g.shadowOffsetY = 0;
  g.drawImage(s2, 0, 0);
  const shine = g.createLinearGradient(0, 0, 0, W);
  shine.addColorStop(0, 'rgba(255,255,255,.35)'); shine.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.fillStyle = shine; g.fillRect(0, 0, W, W);
  void draw;
}

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    root.innerHTML = `
      <div class="lowhp"></div>
      <div class="score"><div class="s b ol">0</div><div class="mid"><div class="t ol">1:30</div><div class="rd ol">ROUND 1</div></div><div class="s r ol">0</div></div>
      <div class="ovs"></div><div class="nums"></div>
      <div class="feed"></div>
      <div class="banner"></div>
      <div class="toast ol"></div>
      <div class="rotate ol">Turn your phone sideways for the full arena</div>
      <button class="mute" type="button" aria-label="Sound on or off" title="Sound"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M17 9l5 6M22 9l-5 6"/></svg></button>
      <div class="respawn"><div class="ol">KNOCKED OUT<br><span class="rs">3</span></div></div>
      <div class="controls"></div>`;
    this.ovLayer = root.querySelector('.ovs');
    this.numLayer = root.querySelector('.nums');
    this.feed = root.querySelector('.feed');
    this.bannerEl = root.querySelector('.banner');
    this.scoreB = root.querySelector('.s.b');
    this.scoreR = root.querySelector('.s.r');
    this.timeEl = root.querySelector('.t');
    this.roundEl = root.querySelector('.rd');
    this.respawnEl = root.querySelector('.respawn');
    this.respawnNum = root.querySelector('.rs');
    this.lowEl = root.querySelector('.lowhp');
    this.toastEl = root.querySelector('.toast');
    this.controls = root.querySelector('.controls');
    this.muteBtn = root.querySelector('.mute');
    this.ovs = new Map();
    this.nums = [];
    this.iconKey = [];
    const ev = game.world.events;
    ev.on('damage', e => this.number(e.target, e.amount, e.crit ? 'crit' : e.dot ? 'dot' : '', e));
    ev.on('heal', e => { if (e.amount >= 20) this.number(e.target, e.amount, 'heal'); });
    ev.on('stored', e => this.number(e.target, e.amount, 'stored'));
    ev.on('death', e => this.killFeed(e));
    ev.on('ko', e => this.number(e.target, 'KO!', 'ko'));
    this.lastCast = new Map();
    ev.on('cast', e => this.lastCast.set(e.caster, e.dna));
    ev.on('godly', e => { const d = this.lastCast.get(e.caster); this.banner(e.caster.isPlayer ? 'YOU BROKE REALITY' : `${e.caster.name.toUpperCase()} BROKE REALITY`, d?.name ?? 'Godly Power', d?.info?.epithet ?? '', 'godly', e.ess); });
    ev.on('transform', e => { if (e.who.isPlayer || e.who.kind === 'brawler') this.toast(`${e.who.name} became a ${e.name}!`); });
    ev.on('titan', e => this.toast(`${e.caster.name} called ${e.name}!`));
    ev.on('resurrect', e => this.toast(`${e.target.name} refused to fall!`));
  }

  overlay(f) {
    let o = this.ovs.get(f);
    if (o) return o;
    const el = document.createElement('div');
    const me = f === this.game.player;
    const side = me ? 'me' : f.team === this.game.world.playerTeam ? 'ally' : 'enemy';
    el.className = `ov ${side} ${f.kind === 'brawler' ? '' : f.kind === 'titan' ? 'titan' : 'small'}`;
    el.innerHTML = `<div class="nm ol">${f.name}</div><div class="bar"><i class="lag"></i><i class="hp"></i><i class="sh"></i></div>${f.kind === 'brawler' ? `<div class="num ol"></div>` : ''}${me ? '<div class="ammo"><i><b></b></i><i><b></b></i><i><b></b></i></div>' : ''}`;
    this.ovLayer.appendChild(el);
    o = { el, hp: el.querySelector('.hp'), lag: el.querySelector('.lag'), sh: el.querySelector('.sh'), num: el.querySelector('.num'), ammo: [...el.querySelectorAll('.ammo b')], last: -1 };
    this.ovs.set(f, o);
    return o;
  }

  project(x, y, z) {
    v.set(x, y, z).project(this.game.world.camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z];
  }

  number(target, amount, kind, e = {}) {
    if (!amount || (typeof amount === 'number' && amount < 1)) return;
    const el = document.createElement('div');
    const me = target === this.game.player && kind !== 'heal';
    el.className = `dn ol ${kind} ${me ? 'me' : ''}`;
    el.textContent = kind === 'heal' ? '+' + amount : amount;
    this.numLayer.appendChild(el);
    this.nums.push({ el, target, t: 0, x: kind === 'ko' ? 0 : (Math.random() - 0.5) * 0.7, y0: target.height + 0.2, life: kind === 'ko' ? 1.6 : kind === 'crit' ? 1.3 : kind === 'dot' ? 0.7 : 0.95, kind });
    if (this.nums.length > 40) { const n = this.nums.shift(); n.el.remove(); }
  }

  killFeed({ target, src }) {
    if (target.kind !== 'brawler') return;
    const killer = src?.owner || src;
    const d = document.createElement('div');
    d.className = 'ol';
    const cls = f => (f?.team === this.game.world.playerTeam ? 'b' : 'r');
    d.innerHTML = killer && killer !== target ? `<span class="${cls(killer)}">${killer.name}</span> ⚔ <span class="${cls(target)}">${target.name}</span>` : `<span class="${cls(target)}">${target.name}</span> fell`;
    this.feed.prepend(d);
    setTimeout(() => d.remove(), 4000);
    while (this.feed.children.length > 4) this.feed.lastChild.remove();
  }

  banner(tag, big, sub, cls = '', ess = null) {
    const st = ess ? STYLE[ess] : null;
    this.bannerEl.className = 'banner ' + cls;
    this.bannerEl.innerHTML = `<div class="tag ol">${tag}</div><div class="big ol" style="color:${st ? st.glow : '#fff'}">${big}</div>${sub ? `<div class="sub ol">${sub}</div>` : ''}`;
    this.bannerEl.animate([{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(.96)', offset: 0.18 }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: 'scale(1.05)' }], { duration: 2400, easing: 'ease-out', fill: 'forwards' });
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.animate([{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200, fill: 'forwards' });
  }

  setPowerIcons(input) {
    const pw = this.game.player.powers.filter(s => !s.passive);
    input.btnEls.forEach(b => {
      const i = Number(b.dataset.slot);
      if (i < 0) return;
      const slot = pw[i];
      b.classList.toggle('has', !!slot);
      if (!slot) return;
      if (this.iconKey[i] !== slot) {
        this.iconKey[i] = slot;
        iconCanvas(b.querySelector('canvas'), slot);
        b.style.setProperty('--tier', TIER_COLORS[slot.dna.tier]);
        b.style.setProperty('--glow', STYLE[slot.ess]?.glow ?? '#fff');
        b.classList.toggle('godly', slot.dna.tier === 'godly');
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
      if (!e) { const el = document.createElement('div'); el.className = 'passive'; el.innerHTML = '<canvas></canvas><div class="cd"></div><b class="ol">AUTO</b>'; box.appendChild(el); e = this.pasEls[i] = { el, slot: null, cd: 0 }; }
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
      o.sh.style.width = f.shieldHp > 0 ? Math.min(100, f.shieldHp / f.maxHp * 100) + '%' : '0';
      if (o.ammo.length) o.ammo.forEach((b, i) => { const k = i < f.ammo ? 1 : i === f.ammo ? f.reloadT / f.reloadTime : 0; b.style.transform = `scaleX(${k})`; });
    }
    for (const [f, o] of this.ovs) if (!w.fighters.includes(f)) { o.el.remove(); this.ovs.delete(f); }
    // damage numbers
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
    // scoreboard
    this.scoreB.textContent = g.score[w.playerTeam];
    this.scoreR.textContent = g.score[1 - w.playerTeam];
    const tl = Math.max(0, Math.ceil(g.timeLeft ?? 0));
    this.timeEl.textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    // respawn + low hp
    if (p) {
      this.respawnEl.classList.toggle('on', !p.alive && p.respawnT > 0);
      if (!p.alive && p.respawnT > 0) this.respawnNum.textContent = Math.ceil(p.respawnT);
      this.lowEl.style.opacity = p.alive && p.hpPct < 0.3 ? (0.55 + 0.45 * Math.sin(w.time * 6)) : 0;
    }
    // power buttons
    if (input && p) {
      this.setPowerIcons(input);
      this.updatePassives(p, input);
      const pw = p.powers.filter(s => !s.passive);
      input.btnEls.forEach(b => {
        const i = Number(b.dataset.slot);
        if (i < 0) {
          b.querySelectorAll('.ammo i').forEach((a, k) => a.classList.toggle('off', k >= p.ammo));
          return;
        }
        const slot = pw[i];
        if (!slot) return;
        const cd = b.querySelector('.cd');
        const k = slot.cdMax > 0 ? slot.cd / slot.cdMax : 0;
        cd.style.setProperty('--p', (k * 100).toFixed(1));
        cd.textContent = slot.cd > 0.05 ? Math.ceil(slot.cd) : slot.uses !== Infinity ? '×' + slot.uses : '';
        b.classList.toggle('ready', slot.ready);
        if (slot.dna.tier === 'godly') b.style.setProperty('--a', ((w.time * 120) % 360) + 'deg');
      });
    }
  }
}

export function essenceName(ess) { return ESSENCES[ess]?.name ?? ess; }
