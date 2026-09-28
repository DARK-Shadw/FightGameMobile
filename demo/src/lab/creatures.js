// Creature review: all 16 creatures of a role in a grid (or one creature),
// driven through a scripted animation state.
//
//   lab.html?scene=creatures&role=minion                 grid, idle
//   lab.html?scene=creatures&role=titan&essence=fire     single creature
//   &anim=idle|walk|run|attack|spawn|hit|death|cycle     animation script
//   &cam=front|game|side|back|top  &angle=-30 (creature yaw, degrees)  &zoom=1
//   &cols=4  &labels=0  &ref=1 (Kai for scale)  &cell=0.02 (override)
import * as THREE from 'three';
import { toonMaterial, blobShadow } from '../engine/toon.js';
import { buildCreature, CREATURE_ROLES, ESSENCE_IDS } from '../art/creatures.js';

function label(text, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,16,40,0.72)';
  g.beginPath(); g.roundRect(8, 8, 496, 112, 26); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
  g.fillText(text, 256, 60);
  g.fillStyle = '#ffd98a'; g.font = '30px monospace';
  g.fillText(sub, 256, 102);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  return s;
}

const SCRIPTS = {
  idle: () => ({ speed: 0 }),
  walk: () => ({ speed: 0.45 }),
  run: () => ({ speed: 1 }),
};

export async function setup(stage, params) {
  const { scene, camera } = stage;
  const role = params.get('role') || 'minion';
  const only = params.get('essence');
  const ids = only ? only.split(',') : ESSENCE_IDS.filter(e => CREATURE_ROLES[role]?.[e]);
  const animName = params.get('anim') || 'idle';
  const camMode = params.get('cam') || 'front';
  const zoom = Number(params.get('zoom') || 1);
  const yaw = Number(params.get('angle') ?? (camMode === 'front' ? -25 : 0)) * Math.PI / 180;
  const cellOverride = params.get('cell') ? Number(params.get('cell')) : undefined;

  scene.background = new THREE.Color('#9fc7e0');
  const items = [];
  for (const e of ids) {
    const t0 = performance.now();
    let c;
    try {
      c = buildCreature(role, e, { cell: cellOverride });
    } catch (err) {
      console.error(role, e, err.stack || err);
      continue;
    }
    const ms = performance.now() - t0;
    items.push({ c, e, ms, st: { speed: 0, action: null, time: 0 } });
  }
  const n = items.length;
  const cols = Number(params.get('cols') || (n <= 1 ? 1 : n <= 4 ? n : n <= 9 ? 3 : 4));
  const rows = Math.ceil(n / cols);
  const maxR = Math.max(0.3, ...items.map(i => Math.max(i.c.radius, i.c.height * 0.45)));
  const maxH = Math.max(0.3, ...items.map(i => i.c.height));
  const gap = Number(params.get('gap') || maxR * 2.5 + 0.25);
  const gapZ = gap * (camMode === 'front' || camMode === 'back' ? 1.6 : 1.0);
  items.forEach((it, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * gap;
    const z = (row - (rows - 1) / 2) * gapZ;
    it.c.group.position.set(x, 0, z);
    it.c.group.rotation.y = yaw;
    scene.add(it.c.group);
    const sh = blobShadow(it.c.radius * 1.1, 0.3);
    sh.position.set(x, 0.012, z);
    scene.add(sh);
    if (params.get('labels') !== '0' && n > 1) {
      const lb = label(it.c.name, `${it.c.stats.verts}v ${it.c.stats.ms}ms`);
      const w = gap * 0.62;
      lb.scale.set(w, w / 4, 1);
      lb.position.set(x, -0.02, z + gapZ * 0.4);
      scene.add(lb);
    }
  });
  if (params.get('ref')) {
    const { buildHero } = await import('../art/heroes.js');
    const hero = buildHero('kai', { cell: 0.02 });
    hero.group.position.set(-((cols - 1) / 2 + 0.75) * gap, 0, 0);
    hero.group.rotation.y = yaw;
    scene.add(hero.group);
  }
  const W = cols * gap, D = rows * gapZ;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, D + 40), toonMaterial({ vertexColors: false, color: '#8fcf6f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // camera framing
  camera.fov = 30;
  const aimY = n === 1 ? maxH * 0.45 : maxH * 0.3;
  const look = new THREE.Vector3(0, aimY, 0);
  const pitch = { front: n === 1 ? 0.28 : n <= 5 ? 0.3 : 0.6, back: 0.3, side: 0.2, game: 0.95, top: 1.4 }[camMode] ?? 0.3;
  const az = { front: 0, back: Math.PI, side: Math.PI / 2 }[camMode] ?? 0;
  const vHalf = (camera.fov / 2) * Math.PI / 180;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const needW = (W * 0.5) / Math.tan(hHalf) + D * 0.5;
  const needH = ((D * Math.sin(pitch) + maxH * Math.cos(pitch)) * 0.5 + 0.15) / Math.tan(vHalf) + D * 0.5 * Math.cos(pitch);
  const dist = Math.max(needW, needH) * 1.05 / zoom;
  camera.position.set(Math.sin(az) * Math.cos(pitch) * dist, aimY + Math.sin(pitch) * dist, Math.cos(az) * Math.cos(pitch) * dist);
  camera.lookAt(look);
  camera.updateProjectionMatrix();
  stage.followShadow(new THREE.Vector3());

  // animation script
  const period = Number(params.get('period') || 1.6);
  let time = 0;
  const actDur = { attack: Number(params.get('dur') || 0.7), hit: 0.45, death: 1.3, spawn: Number(params.get('dur') || (role === 'titan' ? 2.2 : 1.2)) };
  return {
    update(dt) {
      time += dt;
      for (const it of items) {
        const st = it.st;
        st.time = time;
        if (SCRIPTS[animName]) Object.assign(st, SCRIPTS[animName]());
        else if (animName === 'cycle') {
          const tt = time % 6;
          st.speed = tt < 2 ? 0.5 : tt < 3 ? 1 : 0;
          if (tt >= 3.2 && tt < 3.2 + dt * 1.01) st.action = { kind: 'attack', t: 0, dur: 0.7 };
          if (tt >= 4.4 && tt < 4.4 + dt * 1.01) st.action = { kind: 'hit', t: 0, dur: 0.45 };
        } else {
          st.speed = Number(params.get('speed') || 0);
          const once = animName === 'spawn' || animName === 'death';
          const start = animName === 'spawn' ? 0 : 0.3;
          if (!st.action && (once ? !st.done && time >= start : (time - start) % period < dt * 1.01 && time >= start)) {
            st.action = { kind: animName, t: 0, dur: actDur[animName] ?? 0.7 };
            if (once) st.done = true;
          }
        }
        if (st.action) {
          st.action.t += dt;
          if (st.action.t > st.action.dur && st.action.kind !== 'death') st.action = null;
          else if (st.action && st.action.t > st.action.dur + 0.6) st.action.t = st.action.dur;
        }
        it.c.update(dt, st);
      }
    },
    info: () => items.map(i => `${i.e}:${i.c.stats.verts}v/${i.c.stats.ms}ms`).join(' '),
  };
}
