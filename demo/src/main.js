// Skill Forge Arena: boot, match flow (draft → fight → level up → draft...)
// and the frame loop.
//   ?code=KV.G.time,K5.G.death   start with these powers (skips the first draft)
//   ?lab=1                        fixed-timestep driver for the screenshot harness
//   ?auto=1                       the player is a bot too (attract mode / QA)

import * as THREE from 'three';
import { Stage } from './engine/stage.js';
import { buildArena } from './game/arena.js';
import { Game } from './game/game.js';
import { HUD, HUD_CSS, iconCanvas } from './game/hud.js';
import { PlayerInput } from './game/input.js';
import { BotBrain } from './game/bot.js';
import { draftPowers, draftStats, rollStats, splash, DRAFT_CSS } from './game/draft.js';
import { HEROES } from './art/heroes.js';
import { SFX, attachSfx } from './game/sfx.js';
import { Lobby } from './game/lobby.js';
import { forge, fromCode, evolveCode, fuseCode } from '../../prototypes/skill-forge/forge.js';
import { present } from '../../prototypes/skill-forge/describe.js';

const params = new URLSearchParams(location.search);
const LAB = params.has('lab');
const css = document.createElement('style');
css.textContent = HUD_CSS + DRAFT_CSS;
document.head.appendChild(css);

const canvas = document.getElementById('c');
const boot = document.getElementById('boot');
const bar = boot?.querySelector('.fill');
const tip = boot?.querySelector('.tip');
const setProgress = (k, text) => { if (bar) bar.style.width = (k * 100).toFixed(0) + '%'; if (tip && text) tip.textContent = text; };
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

const stage = new Stage(canvas, { capture: LAB, maxPixelRatio: LAB ? 1 : Math.min(devicePixelRatio, innerWidth * innerHeight > 1.4e6 ? 1.25 : 1.75) });
stage.resize(innerWidth, innerHeight);
addEventListener('resize', () => stage.resize(innerWidth, innerHeight));

const BOT_NAMES = ['Blaze', 'Nova', 'Rook', 'Jinx', 'Moss', 'Vex', 'Pip', 'Sable', 'Kestrel', 'Onyx'];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Tier odds shift upward each round: early rounds are fireballs, later ones break reality.
function rollTier(round, luck = 0) {
  const w = [
    ['common', Math.max(4, 34 - round * 9)], ['rare', Math.max(8, 32 - round * 5)], ['epic', 24 + round * 2],
    ['legendary', 8 + round * 5 + luck], ['godly', 2 + round * 4 + luck],
  ];
  let r = Math.random() * w.reduce((a, b) => a + b[1], 0);
  for (const [t, x] of w) { r -= x; if (r <= 0) return t; }
  return 'epic';
}
const withInfo = s => { s.info = present(s); return s; };
const forgeFor = (round, luck) => withInfo(forge({ tier: rollTier(round, luck) }));

async function main() {
  setProgress(0.05, 'Sculpting the arena…');
  await frame();
  const arena = await buildArena(stage.scene, k => setProgress(0.05 + k * 0.45));
  setProgress(0.5, 'Waking the creatures…');
  await frame();
  await Game.preload();
  const game = new Game(stage, arena);
  const hudRoot = document.getElementById('hud');
  // roster: the player plus two allies against three rivals
  const heroIds = Object.keys(HEROES);
  const others = heroIds.filter(h => h !== 'kai');
  const pickHero = i => (others.length ? others[i % others.length] : 'kai');
  const names = shuffle(BOT_NAMES.slice());
  const roster = [{ hero: 'kai', team: 0, isPlayer: true, name: 'You' }];
  for (let i = 0; i < 2; i++) roster.push({ hero: pickHero(i + 1), team: 0, name: names.pop() });
  for (let i = 0; i < 3; i++) roster.push({ hero: pickHero(i), team: 1, name: names.pop() });
  for (let i = 0; i < roster.length; i++) {
    setProgress(0.55 + (i / roster.length) * 0.4, `Sculpting ${roster[i].name === 'You' ? 'your brawler' : roster[i].name}…`);
    await frame();
    const f = game.addBrawler(roster[i]);
    if (!f.isPlayer || params.has('auto')) f.controller = new BotBrain(game, f, { skill: f.team === 0 ? 0.55 : 0.5 + Math.random() * 0.25 });
  }
  const player = game.brawlers[0];
  game.player = player;
  game.world.focus = player;
  game.world.snapCamera();
  const hud = new HUD(game, hudRoot);
  const sfx = new SFX();
  game.sfx = sfx;
  attachSfx(sfx, game);
  const unlock = () => sfx.unlock();
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  hud.muteBtn.classList.toggle('off', sfx.muted);
  hud.muteBtn.addEventListener('click', e => { e.stopPropagation(); sfx.unlock(); sfx.setMuted(!sfx.muted); hud.muteBtn.classList.toggle('off', sfx.muted); });
  const input = new PlayerInput(game, player, hud.controls);
  if (!params.has('auto')) player.controller = input;
  game.teamRings = addTeamRings(game);
  const lobby = game.lobby = new Lobby(stage, game);
  addEventListener('resize', () => lobby.resize());
  setProgress(1, 'Ready!');
  await frame();
  boot?.classList.add('done');
  setTimeout(() => boot?.remove(), 600);

  // ── frame loop ──
  let last = performance.now();
  const tick = dt => {
    if (!game.paused) {
      game.update(dt);
      if (game.fighting) game.timeLeft -= dt;
    } else {
      if (lobby.active) lobby.update(dt); else game.world.updateCamera(dt);
      game.world.fx.update(dt);
      input.indicator.visible = false;
    }
    updateRings(game);
    hud.update(dt, input);
  };
  if (!LAB) {
    // quality governor: step down resolution, shadows, MSAA and bloom while frames run slow
    const gov = { t: 0, frames: 0, level: 0 };
    if (matchMedia('(pointer: coarse)').matches && devicePixelRatio > 2) { gov.level = 1; stage.setQuality(1); }
    const loop = now => {
      requestAnimationFrame(loop);
      if (window.__minFrame && now - last < window.__minFrame) return; // test hook: software renderers
      const real = (now - last) / 1000;
      const dt = Math.min(0.05, real); last = now;
      tick(dt);
      stage.render(dt);
      if (!game.paused && !document.hidden && real < 0.5) {
        gov.t += real; gov.frames++;
        if (gov.t > 2.5) {
          const fps = gov.frames / gov.t;
          gov.t = 0; gov.frames = 0;
          if (fps < 42 && gov.level < 3 && !window.__minFrame) { gov.level++; stage.setQuality(gov.level); }
        }
      }
    };
    requestAnimationFrame(loop);
  }

  // ── match flow ──
  const ui = document.body;
  game.paused = true;
  game.round = 1;
  const give = (f, s) => { const slot = game.givePower(f, s); if (f.cdMul) slot.cdMax *= f.cdMul; return slot; };
  const botsDraft = round => {
    for (const f of game.brawlers) {
      if (f.isPlayer && !params.has('auto')) continue;
      const s = forgeFor(round, 0);
      replaceOrAdd(game, f, s, null);
    }
  };

  const codes = params.get('code');
  if (codes) codes.split(',').forEach(c => give(player, withInfo(fromCode(c.trim()))));

  const UI = params.get('ui');   // lab: show a menu screen for screenshots (title | draft | stats)
  const flow = async () => {
    if (!LAB || UI) lobby.enter();
    if (LAB && UI) {
      game.paused = true;
      if (UI === 'title') await splash(ui, TITLE_HTML, 'PLAY', 'title', TITLE_BELOW);
      if (UI === 'draft') {
        const tiers = (params.get('tiers') || 'epic,legendary,godly').split(',');
        const opts = tiers.map(t => withInfo(forge({ tier: t, seed: params.get('seed') ? params.get('seed') + t : undefined })));
        await draftPowers(ui, 'FORGE YOUR FIRST POWER', 'Pick one. Nobody has ever had these exact powers.', opts.map(s => ({ skill: s })), drawIcon);
      }
      if (UI === 'stats') await draftStats(ui, 'LEVEL 2!', rollStats(3));
      return;
    }
    if (!LAB && !codes) {
      await splash(ui, TITLE_HTML, 'PLAY', 'title', TITLE_BELOW);
    }
    if (!codes) {
      const opts = [forgeFor(1, 6), forgeFor(1, 6), forgeFor(1, 6)];
      if (!opts.some(s => ['epic', 'legendary', 'godly'].includes(s.tier))) opts[2] = withInfo(forge({ tier: 'epic' }));
      if (!LAB) {
        const i = await draftPowers(ui, 'FORGE YOUR FIRST POWER', 'Pick one. Nobody has ever had these exact powers.', opts.map(s => withReveal({ skill: s }, sfx)), drawIcon);
        sfx.ui('click');
        give(player, opts[i]);
      } else give(player, opts[0]);
    }
    botsDraft(1);
    for (;;) {
      await fight(game, hud, ui);
      if (LAB) return;
      game.round++;
      for (const s2 of game.summons.slice()) if (s2.alive) s2.die(null);
      for (const f of game.brawlers) f.clearStatuses();
      lobby.enter();
      const stats = rollStats(3);
      sfx.ui('legend');
      const si = await draftStats(ui, `LEVEL ${game.round}!`, stats);
      sfx.ui('click');
      stats[si].apply(player);
      player.level = game.round;
      const opts = [{ skill: forgeFor(game.round, 4) }, { skill: forgeFor(game.round, 4) }];
      const mine = player.powers.slice();
      if (game.round >= 3 && mine.length >= 2 && Math.random() < 0.65) {
        const [a, b] = shuffle(mine).slice(0, 2);
        opts.push({ skill: withInfo(fromCode(fuseCode(a.dna, b.dna))), kind: `FUSE ${a.dna.name} + ${b.dna.name}`, replaces: [a, b] });
      } else if (mine.length) {
        const a = mine[Math.floor(Math.random() * mine.length)];
        opts.push({ skill: withInfo(fromCode(evolveCode(a.dna))), kind: `EVOLVE ${a.dna.name}`, replaces: [a] });
      } else opts.push({ skill: forgeFor(game.round, 4) });
      const castable = player.powers.filter(p => !p.passive);
      for (const o of opts) if (!o.kind && castable.length >= 3 && o.skill.trigger === 'cast') o.kind = `REPLACES ${castable[0].dna.name}`;
      const i = await draftPowers(ui, 'FORGE A NEW POWER', 'New, evolved or fused. Your kit keeps up to 3 active powers.', opts.map(o => withReveal(o, sfx)), drawIcon);
      sfx.ui('click');
      replaceOrAdd(game, player, opts[i].skill, opts[i].replaces);
      for (const f of game.brawlers) if (f !== player || params.has('auto')) {
        const st = rollStats(1)[0]; st.apply(f);
      }
      botsDraft(game.round);
    }
  };

  flow();

  if (LAB) {
    window.__lab = {
      ready: true, stage, game,
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
      info: () => `calls ${stage.renderer.info.render.calls} tris ${stage.renderer.info.render.triangles} fx ${game.world.fx.effects.length} puffs ${game.world.fx.cloud.n} parts ${game.world.fx.add.n}+${game.world.fx.alpha.n} | score ${game.score.join(':')} t=${game.world.time.toFixed(1)} ` + game.brawlers.map(f => `${f.name}:${Math.round(f.hp)}${f.alive ? '' : '(dead)'} [${f.powers.map(p => p.dna.code).join(',')}]`).join(' '),
    };
  }
}

const TITLE_HTML = `<h1 class="ol" style="font-size:clamp(30px,min(8vw,11vh),76px);line-height:.95">SKILL FORGE <span style="color:#ffc02e">ARENA</span></h1><div class="vs ol">VS</div>`;
const TITLE_BELOW = `<h2>Every round you forge a brand new power. No presets: each one is born from the same rules that can make a fireball or stop time.</h2>`;

const withReveal = (o, sfx) => ({ ...o, onReveal: () => sfx.ui(['legendary', 'godly'].includes(o.skill.tier) ? 'legend' : 'reveal') });

function drawIcon(canvas, s) { iconCanvas(canvas, { ess: s.essences[0], dna: s }); }

// Adds a power, or evolves/replaces when the kit is full (max 3 castable).
export function replaceOrAdd(game, f, s, replaces) {
  if (replaces) {
    for (const r of [].concat(replaces)) f.powers = f.powers.filter(p => p !== r);
  } else {
    const castable = f.powers.filter(p => !p.passive);
    if (!s.trigger || s.trigger === 'cast') { if (castable.length >= 3) f.powers = f.powers.filter(p => p !== castable[0]); }
    else { const passives = f.powers.filter(p => p.passive); if (passives.length >= 2) f.powers = f.powers.filter(p => p !== passives[0]); }
  }
  const slot = game.givePower(f, s);
  if (f.cdMul) slot.cdMax *= f.cdMul;
  return slot;
}

async function fight(game, hud, ui) {
  game.lobby?.exit();
  // creatures for the powers in play are baked before the round, behind a short overlay
  let veil = null;
  await game.prebakeCreatures((i, n, job) => {
    if (!veil) { veil = document.createElement('div'); veil.className = 'draft'; veil.innerHTML = '<h1 class="ol">SUMMONING…</h1><h2 class="sub"></h2>'; ui.appendChild(veil); }
    veil.querySelector('.sub').textContent = `${job[1]} ${job[0]} (${i + 1}/${n})`;
  });
  veil?.remove();
  // everyone back to their spawn, full health
  game.score = [0, 0];
  for (const f of game.brawlers) {
    if (!f.alive) f.respawnT = 0;
    game.respawn(f);
    f.powers.forEach(p => { p.cd = Math.min(p.cdMax, 2); p.usedDeath = false; });
  }
  for (const s of game.summons.slice()) if (s.alive) s.die(null);
  game.world.snapCamera();
  hud.roundEl.textContent = `ROUND ${game.round}`;
  game.timeLeft = 90;
  game.paused = false;
  game.fighting = true;
  hud.banner(`ROUND ${game.round}`, 'FIGHT!', 'First team to 5 knockouts', '');
  game.sfx?.ui('fight');
  await new Promise(resolve => {
    const check = () => {
      if (game.score[0] >= 5 || game.score[1] >= 5 || game.timeLeft <= 0) return resolve();
      setTimeout(check, 200);
    };
    check();
  });
  game.fighting = false;
  const won = game.score[game.world.playerTeam] > game.score[1 - game.world.playerTeam];
  const draw = game.score[0] === game.score[1];
  game.sfx?.ui(won ? 'win' : 'lose');
  hud.banner(draw ? 'TIME!' : won ? 'VICTORY' : 'DEFEAT', draw ? 'DRAW' : won ? 'Round won!' : 'Round lost', 'Level up and forge another power', draw ? '' : won ? '' : '');
  await new Promise(r => setTimeout(r, 2200));
  game.paused = true;
}

// Team rings under brawlers (blue = your team, red = rivals).
function addTeamRings(game) {
  const rings = new Map();
  for (const f of game.brawlers) {
    const mine = f === game.player;
    const geo = new THREE.RingGeometry(mine ? 0.46 : 0.48, mine ? 0.6 : 0.56, 40);
    geo.rotateX(-Math.PI / 2);
    const col = f.team === game.world.playerTeam ? (mine ? '#6fd4ff' : '#3fa9ff') : '#ff4a5a';
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: mine ? 0.95 : 0.75, depthWrite: false }));
    m.renderOrder = 11;
    game.world.scene.add(m);
    rings.set(f, m);
  }
  return rings;
}
function updateRings(game) {
  for (const [f, m] of game.teamRings || []) {
    m.visible = f.alive && f.group.visible && f.model.group.visible !== false;
    m.position.set(f.pos.x, 0.03, f.pos.z);
  }
}

main().catch(e => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.querySelector('.tip').textContent = 'Something went wrong: ' + e.message;
});
