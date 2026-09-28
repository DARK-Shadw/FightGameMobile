// VFX review: projectiles and impacts for all 16 essences.
import * as THREE from 'three';
import { toonMaterial } from '../engine/toon.js';
import { FX } from '../vfx/fx.js';
import { STYLE } from '../vfx/styles.js';

const ESS = Object.keys(STYLE);

export async function setup(stage, params) {
  const { scene, camera } = stage;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), toonMaterial({ vertexColors: false, color: '#6fae52' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.background = new THREE.Color('#3d6b3a');
  const fx = new FX(stage);
  const mode = params.get('mode') || 'proj';
  const only = params.get('ess');
  const list = only ? only.split(',') : ESS;
  camera.fov = 40;
  let objs = [];
  let t = 0;
  if (mode === 'proj') {
    camera.position.set(0, 13, 9);
    camera.lookAt(0, 0, -1);
    list.forEach((e, i) => {
      const x = (i - (list.length - 1) / 2) * 1.15;
      objs.push({ e, x, z: 4, v: fx.projectile(e, 0.55) });
    });
  } else {
    camera.position.set(0, 14, 11);
    camera.lookAt(0, 0, 0);
  }
  camera.updateProjectionMatrix();
  stage.followShadow(new THREE.Vector3());
  let fired = false;
  return {
    update(dt) {
      t += dt;
      if (mode === 'proj') {
        for (const o of objs) {
          o.z -= dt * 7;
          const pos = [o.x, 0.8, o.z];
          o.v.update(dt, pos, [0, 0, -7]);
        }
      } else if (!fired && t > 0.05) {
        fired = true;
        list.forEach((e, i) => {
          const cols = Math.ceil(Math.sqrt(list.length));
          const x = ((i % cols) - (cols - 1) / 2) * 3.4, z = (Math.floor(i / cols) - (Math.ceil(list.length / cols) - 1) / 2) * 3.2;
          fx.impact(e, [x, 0.6, z], 1.1, 0.7);
        });
      }
      fx.update(dt);
    },
  };
}
