// Animation review: the hero runs through a scripted sequence of states.
import * as THREE from 'three';
import { toonMaterial, blobShadow } from '../engine/toon.js';
import { buildHero } from '../art/heroes.js';
import { Animator } from '../engine/anim.js';

const SCRIPT = {
  idle: [[0, { speed: 0 }]],
  run: [[0, { speed: 1 }]],
  punch: [[0, { speed: 0 }], [0.3, { action: ['punch', 0.45] }]],
  cast: [[0, { speed: 0 }], [0.2, { action: ['cast', 0.8] }]],
  throw: [[0, { speed: 0 }], [0.2, { action: ['throw', 0.6] }]],
  slam: [[0, { speed: 0 }], [0.2, { action: ['slam', 0.7] }]],
  hit: [[0, { speed: 0 }], [0.3, { action: ['hit', 0.45] }]],
  dash: [[0, { speed: 1 }], [0.2, { action: ['dash', 0.5] }]],
  summon: [[0, { speed: 0 }], [0.2, { action: ['summon', 1.0] }]],
  stun: [[0, { stunned: true }]],
  victory: [[0, { victory: true }]],
};

export async function setup(stage, params) {
  const { scene, camera } = stage;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), toonMaterial({ vertexColors: false, color: '#8fcf6f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.background = new THREE.Color('#9fc7e0');
  const hero = buildHero(params.get('id') || 'kai');
  scene.add(hero.group);
  scene.add(blobShadow(0.42, 0.3));
  hero.group.rotation.y = Number(params.get('angle') || -35) * Math.PI / 180;
  const anim = new Animator(hero.rig, hero.face);
  camera.fov = 30;
  camera.position.set(0, 1.5, 4.2);
  camera.lookAt(0, 0.7, 0);
  camera.updateProjectionMatrix();
  stage.followShadow(new THREE.Vector3());
  const events = (SCRIPT[params.get('seq') || 'run'] || SCRIPT.idle).slice();
  let t = 0;
  return {
    update(dt) {
      t += dt;
      while (events.length && events[0][0] <= t) {
        const [, e] = events.shift();
        if (e.action) anim.s.action = { kind: e.action[0], dur: e.action[1], t: 0, side: 'R' };
        for (const k of ['speed', 'stunned', 'victory']) if (k in e) anim.s[k] = e[k];
      }
      if (anim.s.action) { anim.s.action.t += dt; if (anim.s.action.t > anim.s.action.dur) anim.s.action = null; }
      anim.s.moveVel = [0, anim.s.speed * 5];
      anim.update(dt);
    },
  };
}
