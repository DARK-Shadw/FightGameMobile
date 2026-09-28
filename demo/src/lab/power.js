// Power sandbox: rebuild powers from Skill Forge codes and cast them at
// dummies in the arena.
//   ?scene=power&code=KV.G.time            one power (comma list: cast in turn, &gap=2.5)
//   &at=0.4 &n=3 &dhero=kai &arena=0        cast time, dummies, dummy hero, flat ground
//   &move=1                                 dummies walk left/right
import * as THREE from 'three';
import { buildArena } from '../game/arena.js';
import { Game } from '../game/game.js';
import { toonMaterial } from '../engine/toon.js';
import { fromCode } from '../../../prototypes/skill-forge/forge.js';
import { present } from '../../../prototypes/skill-forge/describe.js';

function flatArena(scene) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), toonMaterial({ vertexColors: false, color: '#79b85a' }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
  scene.background = new THREE.Color('#5d8f5a');
  return { walls: [], bushes: [], W: 22, H: 22 };
}

export async function setup(stage, params) {
  const t0 = performance.now();
  const arena = params.get('arena') === '0' ? flatArena(stage.scene) : await buildArena(stage.scene);
  await Game.preload();
  const pz = Number(params.get('pz') ?? 3);
  const game = new Game(stage, arena, { spawns: [[[0, 0, pz]], [[0, 0, -1.2], [-2.4, 0, -2.2], [2.4, 0, -2.2], [0, 0, -4]]] });
  const player = game.addBrawler({ hero: params.get('hero') || 'kai', team: 0, isPlayer: true, name: 'You' });
  const n = Number(params.get('n') ?? 3);
  const dummies = [];
  for (let i = 0; i < n; i++) dummies.push(game.addBrawler({ hero: params.get('dhero') || 'kai', team: 1, name: 'Dummy' }));
  const codes = (params.get('code') || 'K2.E.fire').split(',');
  const skills = codes.map(c => fromCode(c));
  const slots = skills.map(s => game.givePower(player, s));
  await game.prebakeCreatures();
  player.aimDir.set(0, -1);
  game.world.focus = player;
  game.world.snapCamera();
  const buildMs = performance.now() - t0;
  const at = Number(params.get('at') ?? 0.4), gap = Number(params.get('gap') ?? 2.5);
  const move = params.get('move') === '1';
  const log = [];
  game.world.events.on('damage', e => log.push(Math.round(e.amount)));
  let t = 0, next = 0;
  return {
    game,
    update(dt) {
      t += dt;
      if (next < slots.length && t >= at + next * gap) {
        const target = dummies[0] || null;
        const aim = target ? game.aimAt(player, target) : { dir: [0, 0, -1], point: [0, 0, -2] };
        slots[next].cd = 0;
        const ok = game.cast(player, slots[next], aim);
        if (!ok) console.warn('cast failed', codes[next]);
        next++;
      }
      if (move) dummies.forEach((d, i) => d.moveInput.set(Math.sin(t * 1.3 + i * 2), 0));
      game.update(dt);
    },
    info: () => `fx=${game.world.fx.effects.length} [${game.world.fx.effects.map(e => (e.obj?.material?.uniforms?.uMode?.value ?? '-') + ':' + (e.obj?.scale?.x?.toFixed?.(2) ?? '') + '@' + (e.obj?.position?.y?.toFixed?.(2) ?? '')).join(' ')}] ts=${game.world.timeScale} build ${buildMs.toFixed(0)}ms | ` + skills.map(s => `${s.code} "${s.name}" ${s.tier} [${s.root.carrier.id}: ${s.root.atoms.map(a => a.id).join(',')}${s.root.chain ? ' -> ' + s.root.chain.on + ':' + s.root.chain.carrier.id : ''}] ${present(s).text.join(' ')}`).join(' || ') + ` | dmg: ${log.slice(0, 30).join(',')}`,
  };
}
