// Lobby stage shown behind the title, party and results screens: the six brawlers on
// team-colored pedestals, idling, framed like a character select. The
// fighters' own models are borrowed from the arena and handed back when the
// round starts.

import * as THREE from 'three';
import { toonMaterial, outlineMaterial } from '../engine/toon.js';

export class Lobby {
  constructor(stage, game) {
    this.stage = stage;
    this.game = game;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9a86a');
    scene.fog = new THREE.Fog('#e9a86a', 14, 30);
    scene.add(new THREE.HemisphereLight('#fff1dc', '#7a4a6a', 1.4));
    const sun = new THREE.DirectionalLight('#fff0d8', 2.4);
    sun.position.set(-4, 9, 7);
    scene.add(sun);
    const rim = new THREE.DirectionalLight('#ffd0a0', 1.2);
    rim.position.set(3, 4, -6);
    scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    // backdrop: warm sky dome with a horizon glow
    const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
        vec3 top = vec3(0.26, 0.2, 0.52), mid = vec3(0.98, 0.55, 0.36), low = vec3(1.0, 0.82, 0.55);
        vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.6, h)) : mix(low, mid, smoothstep(-0.2, 0.08, h));
        float rays = 0.06 * smoothstep(0.2, 1.0, sin(atan(vP.x, vP.z) * 18.0)) * smoothstep(0.5, 0.0, abs(h - 0.15));
        gl_FragColor = vec4(c + rays, 1.0); }`,
    }));
    scene.add(dome);
    // round stage: stone rim, grass top
    const stageMesh = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 0.5, 64), toonMaterial({ vertexColors: false, color: '#8a7a9a', rim: 0.3 }));
    stageMesh.position.y = -0.25;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 5.9, 0.06, 64), toonMaterial({ vertexColors: false, color: '#7cc466', rim: 0.2 }));
    top.position.y = 0.01;
    scene.add(stageMesh, top);
    const out = new THREE.Mesh(stageMesh.geometry, outlineMaterial({ vertexColors: false, width: 0.002 }));
    out.position.copy(stageMesh.position);
    scene.add(out);
    this.pedestals = [];
    this.slots = [];
    this.active = false;
    this.t = 0;
  }

  // Blue team on the left (you in front), red team on the right, like a versus screen.
  layout() {
    const g = this.game;
    const me = g.player, allies = g.brawlers.filter(f => f.team === me.team && f !== me), rivals = g.brawlers.filter(f => f.team !== me.team);
    const left = [me, ...allies], right = rivals;
    const spots = [];
    const row = [[1.25, 1.05], [2.5, 0.25], [3.65, -0.6]];
    left.forEach((f, i) => spots.push([f, -row[i][0], row[i][1], 0.42 - i * 0.05]));
    right.forEach((f, i) => spots.push([f, row[i][0], row[i][1] - 0.1, -0.42 + i * 0.05]));
    return spots;
  }

  enter() {
    if (this.active) return;
    this.active = true;
    const g = this.game;
    this.slots = this.layout().map(([f, x, z, yaw]) => {
      const col = f === g.player ? '#ffc02e' : f.team === g.player.team ? '#3fa9ff' : '#ff4a5a';
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.16, 40), toonMaterial({ vertexColors: false, color: col, rim: 0.6 }));
      ped.position.set(x, 0.08, z);
      ped.userData.u = ped.material.userData.u;
      ped.material.userData.u.uEmissive.value = 0;
      this.scene.add(ped);
      this.pedestals.push(ped);
      this.scene.add(f.group);
      f.group.position.set(x, 0.16, z);
      f.model.group.rotation.y = yaw;
      f.blob.visible = false;
      return { f, x, z, yaw, ped };
    });
    this.stage.setView(this.scene, this.camera);
    this.resize();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    const w = this.game.world;
    for (const s of this.slots) { w.scene.add(s.f.group); s.f.blob.visible = true; }
    for (const p of this.pedestals) { p.removeFromParent(); p.geometry.dispose(); p.material.dispose(); }
    this.pedestals = [];
    this.slots = [];
    this.stage.setView(w.scene, w.camera);
  }

  resize() {
    const a = this.stage.camera.aspect || innerWidth / innerHeight;
    this.camera.aspect = a;
    // keep all six in frame on narrow screens
    const back = Math.max(1, 1.75 / a);
    this.camera.position.set(0, 2.2 + back * 0.35, 8.4 * back);
    this.camera.lookAt(0, 0.82, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    for (const s of this.slots) {
      const f = s.f;
      f.anim.s.speed = 0;
      f.anim.s.action = null;
      f.anim.s.look = [Math.sin(this.t * 0.6 + s.x) * 0.25, 0];
      f.anim.update(dt);
      f.group.position.set(s.x, 0.16, s.z);
      f.model.group.rotation.y = s.yaw + Math.sin(this.t * 0.4 + s.x) * 0.08;
    }
    // slow drift for life
    this.camera.position.x = Math.sin(this.t * 0.15) * 0.3;
    this.camera.lookAt(0, 0.82, 0);
  }
}
