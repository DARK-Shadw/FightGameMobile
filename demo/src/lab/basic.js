// Pipeline smoke test: a clay figure, a ground plane and the full post chain.
import * as THREE from 'three';
import { S, P } from '../engine/sdf.js';
import { staticModel } from '../engine/rig.js';
import { toonMaterial, blobShadow } from '../engine/toon.js';

export async function setup(stage) {
  const { scene, camera } = stage;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), toonMaterial({ vertexColors: false, color: '#7cc46a' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const skin = P('#f5c29a', 0.35), shirt = P('#ff6b3d', 0.25), pants = P('#3d4f9e', 0.2), shoe = P('#fdfdfd', 0.5), hair = P('#4a2a1c', 0.45);
  const body = S.union(0.06,
    S.ellipsoid([0, 0.62, 0], [0.27, 0.3, 0.22]).paint(shirt),
    S.ellipsoid([0, 1.12, 0.02], [0.34, 0.31, 0.3]).paint(skin),
    S.sphere([0, 1.1, 0.31], 0.055).paint(skin),
    S.mirror(S.union(0.04,
      S.limb([0.24, 0.8, 0], [0.38, 0.5, 0.05], 0.085, 0.07).paint(shirt),
      S.sphere([0.4, 0.44, 0.06], 0.1).paint(skin),
      S.limb([0.12, 0.38, 0], [0.13, 0.12, 0.02], 0.1, 0.085).paint(pants),
      S.ellipsoid([0.13, 0.07, 0.06], [0.1, 0.07, 0.14]).paint(shoe),
    )),
    S.ellipsoid([0, 1.3, -0.04], [0.36, 0.2, 0.33]).paint(hair),
  );
  const m = staticModel(body, { mesh: { cell: 0.018 } });
  scene.add(m.group);
  const blob = blobShadow(0.45);
  scene.add(blob);

  camera.position.set(0, 2.2, 3.4);
  camera.lookAt(0, 0.7, 0);
  stage.followShadow(new THREE.Vector3(0, 0, 0));
  let angle = 0;
  return {
    update(dt) { angle += dt * 0.8; m.group.rotation.y = angle; },
    info: () => JSON.stringify(m.stats),
  };
}
