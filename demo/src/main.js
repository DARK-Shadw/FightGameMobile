// Skill Forge Arena: boot, the menu → match → results loop, and the frame loop.
//   ?code=KV.G.time,K5.G.death   start at max level with these powers (sandbox)
//   ?lab=1                        fixed-timestep driver for the screenshot tools
//                                 (&ui=title|results|picker shows a screen)
//   ?auto=1                       your seat is played by a bot too (attract mode / QA);
//                                 with &rounds=N, menus click themselves for N matches
//   ?time=90                      match length in seconds
//   ?level=4                      you start at that level (the picks queue up)

import * as THREE from 'three';
import { Stage } from './engine/stage.js';
import { buildArena } from './game/arena.js';
import { Game } from './game/game.js';
import { HUD, HUD_CSS } from './game/hud.js';
import { THEME_CSS } from './game/theme.js';
import { MENU_CSS, AUTO, titleScreen, resultsScreen } from './game/menus.js';
import { Picker } from './game/picker.js';
import { PlayerInput } from './game/input.js';
import { BotBrain } from './game/bot.js';
import { Match } from './game/match.js';
import { HEROES } from './art/heroes.js';
import { SFX, attachSfx } from './game/sfx.js';
import { Lobby } from './game/lobby.js';
import { dnaOf, MAX_LEVEL, LEVEL_XP } from './game/progression.js';
import { Net, NET_CSS } from './net/session.js';

const params = new URLSearchParams(location.search);
const LAB = params.has('lab');
AUTO.on = params.has('auto') && params.has('rounds');
const css = document.createElement('style');
css.textContent = THEME_CSS + HUD_CSS + MENU_CSS + NET_CSS;
document.head.appendChild(css);

const canvas = document.getElementById('c');
const boot = document.getElementById('boot');
const bar = boot?.querySelector('.fill');
const tip = boot?.querySelector('.tip');
const setProgress = (k, text) => { if (bar) bar.style.width = (k * 100).toFixed(0) + '%'; if (tip && text) tip.textContent = text; };
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const wait = ms => new Promise(r => setTimeout(r, ms));

// If the browser drops the WebGL context (driver reset, memory pressure), say so instead of showing black.
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  let el = document.getElementById('gl-lost');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gl-lost';
    el.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(20,10,38,.92);color:#fff;font:800 18px Nunito,system-ui,sans-serif;text-align:center;padding:16px';
    el.innerHTML = '<div>The browser reset the graphics.<br><br><button type="button" class="btn">RELOAD</button></div>';
    el.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(el);
  }
  el.hidden = false;
});
canvas.addEventListener('webglcontextrestored', () => { const el = document.getElementById('gl-lost'); if (el) el.hidden = true; });

const stage = new Stage(canvas, { capture: LAB, maxPixelRatio: LAB ? 1 : Math.min(devicePixelRatio, innerWidth * innerHeight > 1.4e6 ? 1.25 : 1.75) });
stage.resize(innerWidth, innerHeight);
addEventListener('resize', () => stage.resize(innerWidth, innerHeight));

export const HERO_IDS = Object.keys(HEROES);
export const HERO_NAMES = { kai: 'Kai', brute: 'Grom', punk: 'Zee', bot: 'Rivet' };
export const BOT_NAMES = ['Blaze', 'Nova', 'Rook', 'Jinx', 'Moss', 'Vex', 'Pip', 'Sable', 'Kestrel', 'Onyx', 'Wren', 'Ash'];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } } };

export function soloRoster(hero) {
  const names = shuffle(BOT_NAMES.slice());
  const pool = HERO_IDS.filter(h => h !== hero);
  const pick = i => pool[i % pool.length] || hero;
  return [
    { hero, team: 0, name: 'You', control: 'local' },
    { hero: pick(0), team: 0, name: names.pop(), control: 'bot' },
    { hero: pick(1), team: 0, name: names.pop(), control: 'bot' },
    { hero: pick(2), team: 1, name: names.pop(), control: 'bot' },
    { hero: pick(0), team: 1, name: names.pop(), control: 'bot' },
    { hero: pick(1), team: 1, name: names.pop(), control: 'bot' },
  ];
}

async function main() {
  setProgress(0.05, 'Sculpting the arena…');
  await frame();
  const arena = await buildArena(stage.scene, k => setProgress(0.05 + k * 0.45));
  setProgress(0.5, 'Waking the creatures…');
  await frame();
  await Game.preload();
  const game = new Game(stage, arena);
  const hudRoot = document.getElementById('hud');
  const hud = new HUD(game, hudRoot);
  const sfx = new SFX();
  game.sfx = sfx;
  attachSfx(sfx, game);
  const unlock = () => sfx.unlock();
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  hud.muteBtn.classList.toggle('off', sfx.muted);
  hud.muteBtn.addEventListener('click', e => { e.stopPropagation(); sfx.unlock(); sfx.setMuted(!sfx.muted); hud.muteBtn.classList.toggle('off', sfx.muted); });
  const lobby = game.lobby = new Lobby(stage, game);
  addEventListener('resize', () => lobby.resize());
  const rings = new TeamRings(game);
  let myHero = HERO_IDS.includes(store.get('sfa-hero')) ? store.get('sfa-hero') : 'kai';

  // the first roster, sculpted behind the loading bar
  const first = soloRoster(myHero);
  for (let i = 0; i < first.length; i++) {
    setProgress(0.55 + (i / first.length) * 0.4, `Sculpting ${first[i].control === 'local' ? 'your brawler' : first[i].name}…`);
    await frame();
    (await import('./art/heroes.js')).buildHero(first[i].hero, { cell: 0.019 });
  }
  const input = new PlayerInput(game, null, hud.controls);
  const app = { game, hud, input, lobby, sfx, rings, params };
  window.__sfa = app;
  // Back (Android's back button, Esc): the newest screen's handler; none on the title (the app closes).
  const backStack = [];
  app.pushBack = fn => backStack.push(fn);
  app.popBack = fn => { const i = backStack.lastIndexOf(fn); if (i >= 0) backStack.splice(i, 1); };
  window.SFBack = () => {
    const fn = backStack[backStack.length - 1];
    if (!fn) return false;
    try { fn(); } catch (e) { console.warn(e); }
    return true;
  };
  addEventListener('keydown', e => { if (e.key === 'Escape' && !e.repeat) window.SFBack(); });

  // level-up picker for the local player
  const picker = new Picker(hud.pickRoot, {
    onChoose: (offerId, i) => { sfx.ui('click'); game.choose(game.player, offerId, i); },
    slotName: i => game.player?.powers.find(p => !p.passive && p.index === i)?.dna.info?.name ?? '',
  });
  input.picker = picker;
  app.picker = picker;
  const ev = game.world.events;
  const showOffer = f => { if (f === game.player) { if (f.offers?.length) picker.show(f.offers[0], f.offers.length); else picker.hide(); } };
  ev.on('offer', e => { showOffer(e.f); if (e.f === game.player) sfx.ui(e.f.level >= 5 ? 'legend' : 'reveal'); });
  ev.on('picked', e => showOffer(e.f));
  ev.on('matchstart', () => picker.hide());
  input.onEmptySlot = () => picker.reopen();
  // a buzz in the Android app when you get hit hard, fall or level up
  if (window.SFNative?.vibrate) {
    const buzz = ms => { try { window.SFNative.vibrate(String(ms)); } catch { /* ignore */ } };
    ev.on('damage', e => { if (e.target === game.player && !e.dot && e.amount >= 120) buzz(e.crit ? 35 : 15); });
    ev.on('death', e => { if (e.target === game.player) buzz(120); });
    ev.on('levelup', e => { if (e.f === game.player) buzz(40); });
  }

  setupRoster(app, first);
  setProgress(1, 'Ready!');
  await frame();
  boot?.classList.add('done');
  setTimeout(() => boot?.remove(), 600);

  // ── frame loop ──
  let last = performance.now();
  const tick = dt => {
    app.net?.before(dt);
    if (!game.paused) game.update(dt);
    else {
      if (lobby.active) lobby.update(dt); else game.world.updateCamera(dt);
      game.world.fx.update(dt);
      input.indicator.visible = false;
    }
    app.net?.after(dt);
    rings.update();
    hud.update(dt, input);
  };
  app.tick = tick;
  if (!LAB) {
    // quality governor: lower resolution, then bloom, while frames run slow
    const gov = { t: 0, frames: 0, level: 0 };
    if (matchMedia('(pointer: coarse)').matches && devicePixelRatio > 2) { gov.level = 1; stage.setQuality(1); }
    const loop = now => {
      requestAnimationFrame(loop);
      if (window.__minFrame && now - last < window.__minFrame) return; // test hook: software renderers
      const real = (now - last) / 1000;
      const dt = Math.min(0.05, real); last = now;
      tick(dt);
      if (!window.__noRender) stage.render(dt);
      if (!game.paused && !document.hidden && real < 0.5) {
        gov.t += real; gov.frames++;
        if (gov.t > 2.5) {
          const fps = gov.frames / gov.t;
          gov.t = 0; gov.frames = 0;
          if (fps < 42 && gov.level < 3 && !window.__minFrame && !window.__noRender) { gov.level++; stage.setQuality(gov.level); }
        }
      }
    };
    requestAnimationFrame(loop);
  }

  // ── menus and matches ──
  const ui = document.body;
  game.paused = true;
  app.net = new Net(app, { setupRoster, playMatch, soloRoster, HERO_IDS, HERO_NAMES, BOT_NAMES });
  const UI = params.get('ui');
  const flow = async () => {
    if (LAB && UI) return labScreen(app, UI);
    if (LAB && !params.has('rounds')) { await playMatch(app, soloRoster(myHero)); return; }
    lobby.enter();
    for (;;) {
      const choice = await titleScreen(ui, {
        lan: app.net.available,
        heroName: () => HERO_NAMES[myHero] || myHero,
        onHero: d => {
          myHero = HERO_IDS[(HERO_IDS.indexOf(myHero) + d + HERO_IDS.length) % HERO_IDS.length];
          store.set('sfa-hero', myHero);
          lobby.exit(); setupRoster(app, soloRoster(myHero)); lobby.enter();
        },
      });
      sfx.ui('click');
      if (choice === 'lan') { await app.net.menu(myHero); continue; }
      let again = 'again';
      while (again === 'again') {
        again = await playMatch(app, soloRoster(myHero), { buttons: [{ id: 'again', label: 'PLAY AGAIN' }, { id: 'menu', label: 'MENU', cls: 'dark' }] });
        if (LAB && !(Number(params.get('rounds')) > (app.matches || 0))) return;
      }
      lobby.exit(); setupRoster(app, soloRoster(myHero)); lobby.enter();
    }
  };
  flow();

  if (LAB) {
    window.__lab = {
      ready: true, stage, game, app,
      step(total, dt = 1 / 30) { for (let t = 0; t < total - 1e-6; t += dt) tick(dt); stage.render(dt); },
      snap() { stage.render(0); return canvas.toDataURL('image/png'); },
      sheet(frames, dt, cols, scale) {
        const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
        const out = document.createElement('canvas');
        out.width = w * cols; out.height = h * Math.ceil(frames / cols);
        const g2 = out.getContext('2d');
        for (let i = 0; i < frames; i++) {
          if (i) { const n = Math.max(1, Math.round(dt * 30)); for (let k = 0; k < n; k++) tick(dt / n); }
          stage.render(1 / 30);
          g2.drawImage(canvas, (i % cols) * w, Math.floor(i / cols) * h, w, h);
          g2.fillStyle = 'rgba(0,0,0,.55)'; g2.fillRect((i % cols) * w, Math.floor(i / cols) * h, 64, 18);
          g2.fillStyle = '#fff'; g2.font = '12px monospace'; g2.fillText(game.world.time.toFixed(1) + 's', (i % cols) * w + 4, Math.floor(i / cols) * h + 13);
        }
        return out.toDataURL('image/png');
      },
      info: () => `calls ${stage.renderer.info.render.calls} tris ${stage.renderer.info.render.triangles} | t=${game.world.time.toFixed(1)} score ${game.score.join(':')} ` + game.brawlers.map(f => `${f.name}:L${f.level}/${Math.round(f.xp)}xp ${Math.round(f.hp)}hp${f.alive ? '' : '(dead)'} [${f.powers.map(p => `${p.index}:${p.dna.code}`).join(',')}]`).join(' '),
    };
  }
}

// Builds the six brawlers for a match (or the lobby) and wires their controls.
export function setupRoster(app, roster) {
  const { game, input } = app;
  game.setRoster(roster);
  for (const f of game.brawlers) {
    if (f.control === 'bot' || (f.control === 'local' && app.params.has('auto'))) {
      f.isBot = true;
      f.controller = new BotBrain(game, f, { skill: f.team === 0 ? 0.55 : 0.5 + Math.random() * 0.25 });
    }
  }
  const me = game.brawlers.find(f => f.control === 'local') || game.brawlers[0];
  game.player = me;
  me.isPlayer = true;
  game.world.playerTeam = me.team;
  if (!me.isBot && me.control === 'local') me.controller = input;
  input.player = me;
  game.world.focus = me;
  game.world.snapCamera();
  app.rings.rebuild();
  app.hud.iconKey = [];
}

// One match from the first whistle to the results screen. → the button pressed.
export async function playMatch(app, roster, o = {}) {
  const { game, lobby, hud, sfx, params } = app;
  const ev = game.world.events;
  lobby.exit();
  if (roster) setupRoster(app, roster);
  const match = game.match = new Match(game, { duration: Number(params.get('time')) || o.duration || 270, koTarget: o.koTarget || 20, replica: !!o.replica });
  match.start();
  // sandbox: ?code= starts you at max level with those powers
  const codes = o.lan ? null : params.get('code');
  if (codes && !o.replica) {
    const me = game.player;
    me.xp = LEVEL_XP[MAX_LEVEL]; me.level = MAX_LEVEL;
    codes.split(',').slice(0, 3).forEach((c, i) => { const s = game.givePower(me, dnaOf(c.trim())); s.index = s.passive ? -1 : i; if (s.ult) s.charge = 1; });
  }
  if (!o.replica) for (const f of game.brawlers) game.respawn(f, true);
  // ?level=N: you start the match at level N with its level-up picks waiting
  const lv = o.lan ? 0 : Math.min(MAX_LEVEL, Number(params.get('level')) || 0);
  if (lv > 1 && !codes && !o.replica && !params.has('ui')) match.addXp(game.player, LEVEL_XP[lv] - game.player.xp);
  game.world.snapCamera();
  game.world.camZoom = 0.42; // open close on your brawler, then pull back to the arena view
  game.paused = false;
  hud.banner('Match start', 'FIGHT!', 'Hit, knock out and grab shards to level up', '');
  sfx.ui('fight');
  // back twice to leave the match
  let backAt = -1e9;
  const onBack = () => {
    if (performance.now() - backAt < 2200) { if (o.onQuit) o.onQuit(); else match.abort(); return; }
    backAt = performance.now();
    hud.toast(o.lan ? 'Press back again to leave the party' : 'Press back again to leave the match');
  };
  app.pushBack?.(onBack);
  const end = await new Promise(resolve => { const off = ev.on('matchend', e => { off(); resolve(e); }); });
  app.popBack?.(onBack);
  if (end.aborted) {
    game.paused = true;
    game.over = false;
    game.world.timeScale = 1;
    app.picker.hide();
    for (const f of game.brawlers) f.clearStatuses();
    lobby.enter();
    match.dispose();
    game.match = null;
    return 'menu';
  }
  app.matches = (app.matches || 0) + 1;
  // the match ends in slow motion; nobody acts while the banner is up
  game.over = true;
  game.world.timeScale = 0.3;
  const mine = game.world.playerTeam;
  const verdict = end.winner === -1 ? 'draw' : end.winner === mine ? 'win' : 'lose';
  sfx.ui(verdict === 'win' ? 'win' : 'lose');
  hud.banner(verdict === 'draw' ? 'Time' : 'Match over', { win: 'VICTORY!', lose: 'DEFEAT', draw: 'DRAW' }[verdict], `${game.score[mine]} – ${game.score[1 - mine]}`, verdict === 'lose' ? 'lose' : verdict === 'win' ? 'godly' : '');
  await wait(2400);
  game.paused = true;
  game.over = false;
  game.world.timeScale = 1;
  app.picker.hide();
  const data = resultsData(game, match, verdict, o.buttons || [{ id: 'menu', label: 'CONTINUE' }]);
  for (const f of game.brawlers) f.clearStatuses();
  lobby.enter();
  let closeResults = null;
  data.bind = go => { closeResults = go; };
  const onResultsBack = () => closeResults?.(data.buttons[data.buttons.length - 1]?.id);
  app.pushBack?.(onResultsBack);
  const choice = o.results ? await o.results(data) : await resultsScreen(document.body, data);
  app.popBack?.(onResultsBack);
  match.dispose();
  game.match = null;
  return choice;
}

export function resultsData(game, match, verdict, buttons) {
  const mine = game.world.playerTeam;
  const rows = f => {
    const s = match.statOf(f);
    return { name: f.name, hero: HERO_NAMES[f.heroId] || f.heroId, level: f.level || 1, kos: s.kos, deaths: s.deaths, damage: Math.round(s.damage), me: f === game.player,
      kit: f.powers.slice().sort((a, b) => (a.passive - b.passive) || a.index - b.index).map(p => ({ ess: p.ess, dna: p.dna })), score: s.kos * 1000 + s.damage };
  };
  const teams = [game.brawlers.filter(f => f.team === mine).map(rows), game.brawlers.filter(f => f.team !== mine).map(rows)];
  const all = teams.flat();
  const best = all.reduce((a, b) => (b.score > a.score ? b : a), all[0]);
  if (best) best.mvp = true;
  return { verdict, score: [game.score[mine], game.score[1 - mine]], teams, buttons };
}

async function labScreen(app, UI) {
  const { game, lobby } = app;
  if (UI === 'title') { lobby.enter(); await titleScreen(document.body, { lan: true, heroName: () => 'Kai', onHero: () => {} }); }
  if (UI === 'picker' || UI === 'results') {
    const p = playMatch(app, soloRoster('kai'), { duration: 999 });
    await wait(50);
    const me = game.player;
    const lv = Number(app.params.get('level') || 3);
    game.match.addXp(me, LEVEL_XP[Math.min(MAX_LEVEL, lv)] - me.xp + 1);
    if (app.params.has('sel')) app.picker.select(Number(app.params.get('sel')));
    app.tick(0.05);
    window.__labReady = true;
    if (UI === 'results') { for (const f of game.brawlers) game.match.addXp(f, LEVEL_XP[Math.floor(Math.random() * 4) + 3]); game.match.end(0); }
    await p;
  }
}

// Team rings under brawlers (blue = your team, red = rivals, bright blue = you).
class TeamRings {
  constructor(game) { this.game = game; this.rings = new Map(); }
  rebuild() {
    for (const m of this.rings.values()) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    this.rings.clear();
    const g = this.game;
    for (const f of g.brawlers) {
      const mine = f === g.player;
      const geo = new THREE.RingGeometry(mine ? 0.46 : 0.48, mine ? 0.6 : 0.56, 40);
      geo.rotateX(-Math.PI / 2);
      const col = f.team === g.world.playerTeam ? (mine ? '#6fd4ff' : '#3fa9ff') : '#ff4a5a';
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: mine ? 0.95 : 0.75, depthWrite: false }));
      m.renderOrder = 11;
      g.world.scene.add(m);
      this.rings.set(f, m);
    }
  }
  update() {
    for (const [f, m] of this.rings) {
      m.visible = f.alive && f.group.visible && f.group.parent === this.game.world.scene && f.model.group.visible !== false;
      m.position.set(f.pos.x, 0.03, f.pos.z);
    }
  }
}

main().catch(e => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.querySelector('.tip').textContent = 'Something went wrong: ' + e.message;
});
