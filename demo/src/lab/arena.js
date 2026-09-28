// Arena from the gameplay camera, with the hero standing in it.
import * as THREE from 'three';
import { blobShadow } from '../engine/toon.js';
import { buildHero } from '../art/heroes.js';
import { Animator } from '../engine/anim.js';
import { buildArena } from '../game/arena.js';

export async function setup(stage, params) {
  const { scene, camera } = stage;
  scene.background = new THREE.Color('#5d8f5a');
  const t0 = performance.now();
  const arena = await buildArena(scene);
  const ms = performance.now() - t0;
  const hero = buildHero('kai');
  const px = Number(params.get('x') || 0), pz = Number(params.get('z') || 3);
  hero.group.position.set(px, 0, pz);
  hero.group.rotation.y = Math.PI * 0.85;
  scene.add(hero.group);
  const blob = blobShadow(0.42, 0.3);
  blob.position.set(px, 0.012, pz);
  scene.add(blob);
  const anim = new Animator(hero.rig, hero.face);
  const view = params.get('view') || 'game';
  const target = new THREE.Vector3(px, 0, pz);
  if (view === 'game') {
    camera.fov = 38;
    camera.position.copy(target).add(new THREE.Vector3(0, 12.5, 8.6));
  } else if (view === 'top') {
    camera.fov = 45;
    camera.position.set(0, 30, 12);
    target.set(0, 0, 0);
  } else {
    camera.fov = 32;
    camera.position.copy(target).add(new THREE.Vector3(2.5, 3.2, 5.5));
    target.y = 0.8;
  }
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  stage.followShadow(new THREE.Vector3(px, 0, pz - 2));
  return {
    update(dt) { anim.update(dt); },
    info: () => `arena ${ms.toFixed(0)}ms ${JSON.stringify(arena.stats)}`,
  };
}
