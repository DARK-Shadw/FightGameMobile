// Afterimage check: a hero runs past, leaving frozen ghost copies.
import * as THREE from 'three';
import { toonMaterial, blobShadow } from '../engine/toon.js';
import { buildHero } from '../art/heroes.js';
import { Animator } from '../engine/anim.js';
import { FX } from '../vfx/fx.js';

export async function setup(stage, params) {
  const { scene, camera } = stage;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), toonMaterial({ vertexColors: false, color: '#79b85a' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const fx = new FX(stage);
  const hero = buildHero(params.get('id') || 'kai');
  scene.add(hero.group);
  const anim = new Animator(hero.rig, hero.face);
  const fighter = { model: hero, pos: hero.group.position };
  camera.position.set(0, 7, 7);
  camera.lookAt(0, 0.6, 0);
  let t = 0, g = 0;
  return {
    update(dt) {
      t += dt; g += dt;
      hero.group.position.x = -3 + t * 4;
      hero.group.rotation.y = Math.PI / 2;
      anim.s.speed = 1; anim.s.moveVel = [4, 0];
      anim.update(dt);
      hero.group.updateMatrixWorld(true);
      if (g > 0.15) { g = 0; fx.afterimage(fighter, params.get('ess') || 'fire', 0.7); }
      fx.update(dt);
    },
  };
}
