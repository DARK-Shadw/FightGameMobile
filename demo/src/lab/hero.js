// Hero turnaround: front, three-quarter, side, back.
import * as THREE from 'three';
import { toonMaterial, blobShadow } from '../engine/toon.js';
import { buildHero } from '../art/heroes.js';

export async function setup(stage, params) {
  const { scene, camera } = stage;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), toonMaterial({ vertexColors: false, color: '#8fcf6f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.background = new THREE.Color('#9fc7e0');
  const t0 = performance.now();
  const hero = buildHero(params.get('id') || 'kai', { cell: Number(params.get('cell') || 0.012) });
  const ms = performance.now() - t0;
  scene.add(hero.group);
  scene.add(blobShadow(0.42, 0.3));
  const zoom = Number(params.get('zoom') || 1);
  camera.fov = 30;
  camera.position.set(0, 1.35, 3.6 / zoom);
  camera.lookAt(0, 0.72 + (zoom > 1.5 ? 0.3 : 0), 0);
  camera.updateProjectionMatrix();
  stage.followShadow(new THREE.Vector3());
  let angle = Number(params.get('angle') || 0) * Math.PI / 180;
  hero.group.rotation.y = angle;
  const step = Number(params.get('turn') || 90) * Math.PI / 180;
  return {
    update(dt) { angle += step * dt; hero.group.rotation.y = angle; },
    info: () => `mesh ${ms.toFixed(0)}ms ${JSON.stringify(hero.stats)}`,
  };
}
