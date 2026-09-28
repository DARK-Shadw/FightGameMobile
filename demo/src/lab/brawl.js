// Opponent brawler review: close-ups with a free camera, and lineups.
//   ?scene=brawl&ids=brute,punk,bot   side by side (turntable with &turn=90)
//   &ty=1.4 &cy=1.6 &dist=1.6         camera target height, camera height, distance
//   &angle=-25 &cell=0.014 &anim=idle  pose through the Animator (idle, run)
import * as THREE from 'three';
import { toonMaterial, blobShadow } from '../engine/toon.js';
import { buildHero } from '../art/heroes.js';
import { Animator } from '../engine/anim.js';

export async function setup(stage, params) {
  const { scene, camera } = stage;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 64), toonMaterial({ vertexColors: false, color: '#8fcf6f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.background = new THREE.Color('#9fc7e0');
  const ids = (params.get('ids') || params.get('id') || 'brute').split(',');
  const gap = Number(params.get('gap') || 1.45);
  const cell = Number(params.get('cell') || 0.014);
  const t0 = performance.now();
  const heroes = ids.map((id, i) => {
    const h = buildHero(id, { cell });
    const x = (i - (ids.length - 1) / 2) * gap;
    h.group.position.x = x;
    scene.add(h.group);
    const sh = blobShadow(0.42 * (h.def.height ?? 1.5) / 1.5, 0.3);
    sh.position.x = x;
    scene.add(sh);
    return h;
  });
  const ms = performance.now() - t0;
  const seq = params.get('anim');
  const anims = seq ? heroes.map(h => new Animator(h.rig, h.face)) : [];
  camera.fov = Number(params.get('fov') || 30);
  const ty = Number(params.get('ty') || 0.75);
  camera.position.set(Number(params.get('cx') || 0), Number(params.get('cy') || 1.35), Number(params.get('dist') || 3.6));
  camera.lookAt(Number(params.get('cx') || 0), ty, 0);
  camera.updateProjectionMatrix();
  stage.followShadow(new THREE.Vector3());
  let angle = Number(params.get('angle') || 0) * Math.PI / 180;
  const step = Number(params.get('turn') || 0) * Math.PI / 180;
  heroes.forEach(h => { h.group.rotation.y = angle; });
  return {
    update(dt) {
      angle += step * dt;
      heroes.forEach(h => { h.group.rotation.y = angle; });
      anims.forEach(a => {
        a.s.speed = seq === 'run' ? 1 : 0;
        a.s.moveVel = [0, a.s.speed * 5];
        a.update(dt);
      });
    },
    info: () => `mesh ${ms.toFixed(0)}ms ` + heroes.map((h, i) => `${ids[i]}:${h.stats.verts}`).join(' '),
  };
}
