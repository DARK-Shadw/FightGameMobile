// Player controls.
//   Touch: floating move stick on the left; attack and power buttons on the
//   right (drag to aim, release to fire; a quick tap auto-aims).
//   Desktop: WASD / arrows to move, mouse to aim, click or Space to attack,
//   Q E R (or 1 2 3) to cast powers at the cursor.
// While aiming, a ground indicator shows the shot's shape and reach.

import * as THREE from 'three';
import { CARRIERS, paramValues } from '../../../prototypes/skill-forge/data-atoms.js';
import { STYLE } from '../vfx/styles.js';

const AIM_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uShape, uAngle, uOpacity, uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), a = 0.0, inside = 0.0, edge = 0.0;
  if (uShape < 0.5) {            // circle
    inside = step(r, 1.0);
    edge = smoothstep(0.86, 0.93, r) * inside;
  } else if (uShape < 1.5) {     // cone toward +y
    float ang = abs(atan(p.x, p.y));
    inside = step(r, 1.0) * step(ang, uAngle * 0.5);
    edge = inside * max(smoothstep(0.9, 0.97, r), smoothstep(uAngle * 0.5 - 0.05, uAngle * 0.5, ang));
  } else {                       // line (rect) toward +y
    inside = step(abs(p.x), 1.0) * step(-1.0, p.y) * step(p.y, 1.0);
    edge = inside * max(smoothstep(0.7, 0.9, abs(p.x)), smoothstep(0.96, 0.995, p.y));
    float chev = step(0.5, fract(p.y * 3.0 - uTime * 2.0 - abs(p.x) * 0.6)) * 0.12;
    inside *= 1.0 + chev;
  }
  float al = inside * 0.22 + edge * 0.6;
  if (al < 0.01) discard;
  gl_FragColor = vec4(uColor * (0.6 + edge * 0.6), al * uOpacity);
}`;

function aimMesh(scene) {
  const geo = new THREE.PlaneGeometry(2, 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = vec2(uv.x, 1.0 - uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: AIM_FRAG,
    uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uShape: { value: 2 }, uAngle: { value: 1 }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 12;
  m.visible = false;
  scene.add(m);
  return m;
}

// The shape of the aim indicator for a power (or the basic attack).
export function aimShape(slot) {
  if (!slot) return { shape: 'line', range: 7.5, width: 0.55, point: false };
  const c = slot.dna.root.carrier;
  const p = paramValues(c, CARRIERS[c.id].p);
  switch (c.id) {
    case 'bolt': return { shape: 'line', range: p.range, width: Math.max(0.5, p.size), point: false };
    case 'beam': return { shape: 'line', range: p.length, width: 0.5, point: false };
    case 'dash': return { shape: 'line', range: p.dist, width: 0.9, point: false };
    case 'tether': return { shape: 'line', range: p.range, width: 0.35, point: false };
    case 'cone': return { shape: 'cone', range: p.length, angle: p.angle, point: false };
    case 'lob': return { shape: 'circle', range: p.range, radius: p.radius, point: true };
    case 'leap': return { shape: 'circle', range: p.range, radius: p.radius, point: true };
    case 'strike': return { shape: 'circle', range: 10, radius: p.radius, point: true };
    case 'zone': return { shape: 'circle', range: 9, radius: p.radius, point: true };
    case 'trap': return { shape: 'circle', range: 9, radius: p.radius, point: true };
    case 'wall': return { shape: 'line', range: 2.6, width: p.length / 2, point: false, wall: true };
    case 'nova': return { shape: 'circle', range: 0, radius: p.radius, self: true };
    case 'aura': return { shape: 'circle', range: 0, radius: p.radius, self: true };
    case 'orbitals': return { shape: 'circle', range: 0, radius: 1.5, self: true };
    case 'global': return { shape: 'circle', range: 0, radius: 3, self: true };
    default: return { shape: 'circle', range: 0, radius: 1.2, self: true };
  }
}

export class PlayerInput {
  constructor(game, player, root) {
    this.game = game;
    this.player = player;
    this.root = root;
    this.keys = new Set();
    this.move = new THREE.Vector2();
    this.stick = null;          // { id, x0, y0, x, y }
    this.aiming = null;         // { id, which, x0, y0, dx, dy, t0 }
    this.mouse = { x: 0, y: 0, ground: new THREE.Vector3(), inside: false, down: false };
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.indicator = aimMesh(game.world.scene);
    this.enabled = true;
    this.buildDom();
    this.bind();
  }

  buildDom() {
    const r = this.root;
    r.innerHTML = `
      <div class="stick-zone"></div>
      <div class="stick"><div class="knob"></div></div>
      <div class="btns">
        <div class="pbtn" data-slot="2"><canvas></canvas><div class="cd"></div><span class="key">R</span></div>
        <div class="pbtn" data-slot="1"><canvas></canvas><div class="cd"></div><span class="key">E</span></div>
        <div class="pbtn" data-slot="0"><canvas></canvas><div class="cd"></div><span class="key">Q</span></div>
        <div class="abtn" data-slot="-1"><div class="ammo"><i></i><i></i><i></i></div><span class="key">Click</span></div>
      </div>`;
    this.stickEl = r.querySelector('.stick');
    this.knobEl = r.querySelector('.knob');
    this.zoneEl = r.querySelector('.stick-zone');
    this.btnEls = [...r.querySelectorAll('[data-slot]')];
  }

  bind() {
    const canvas = this.game.stage.renderer.domElement;
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      const map = { q: 0, e: 1, r: 2, 1: 0, 2: 1, 3: 2 };
      if (k in map && !e.repeat) this.castAtCursor(map[k]);
      if (k === ' ' && !e.repeat) this.attackAtCursor();
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; } });
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.mouse.inside = false; });
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button === 0) { this.mouse.down = true; this.attackAtCursor(); }
    });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse') this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // floating move stick
    this.zoneEl.addEventListener('pointerdown', e => {
      if (this.stick || !this.enabled) return;
      this.touchMode = true;
      this.zoneEl.setPointerCapture(e.pointerId);
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.stickEl.style.left = e.clientX + 'px';
      this.stickEl.style.top = e.clientY + 'px';
      this.stickEl.classList.add('on');
      e.preventDefault();
    });
    this.zoneEl.addEventListener('pointermove', e => {
      if (!this.stick || e.pointerId !== this.stick.id) return;
      this.stick.x = e.clientX; this.stick.y = e.clientY;
    });
    const endStick = e => { if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.stickEl.classList.remove('on'); this.knobEl.style.transform = ''; } };
    this.zoneEl.addEventListener('pointerup', endStick);
    this.zoneEl.addEventListener('pointercancel', endStick);

    // attack / power buttons
    for (const el of this.btnEls) {
      const which = Number(el.dataset.slot);
      el.addEventListener('pointerdown', e => {
        if (this.aiming || !this.enabled) return;
        el.setPointerCapture(e.pointerId);
        this.aiming = { id: e.pointerId, which, el, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, t0: performance.now(), mouse: e.pointerType === 'mouse' };
        el.classList.add('held');
        e.preventDefault();
        e.stopPropagation();
      });
      el.addEventListener('pointermove', e => {
        const a = this.aiming;
        if (!a || e.pointerId !== a.id) return;
        a.dx = e.clientX - a.x0; a.dy = e.clientY - a.y0;
      });
      const release = cancel => e => {
        const a = this.aiming;
        if (!a || e.pointerId !== a.id) return;
        this.aiming = null;
        el.classList.remove('held');
        if (cancel) return;
        const drag = Math.hypot(a.dx, a.dy);
        if (drag < 14) this.fire(which, null);                       // tap: auto-aim
        else if (drag > 12) this.fire(which, this.aimFromDrag(which, a.dx, a.dy));
      };
      el.addEventListener('pointerup', release(false));
      el.addEventListener('pointercancel', release(true));
    }
  }

  slotOf(which) { return which < 0 ? null : this.player.powers.filter(s => !s.passive)[which] || null; }

  // Drag vector (screen px) → aim in the world. Screen up is world -z.
  aimFromDrag(which, dx, dy) {
    const shape = aimShape(this.slotOf(which));
    const l = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, l / 90);
    const dir = [dx / l, 0, dy / l];
    const p = this.player.pos;
    const range = shape.range || 0;
    const dist = shape.point ? Math.max(1.2, range * k) : range;
    return { dir, point: [p.x + dir[0] * dist, 0, p.z + dir[2] * dist], shape };
  }

  autoAim(which) {
    const f = this.player, t = this.game.world.nearestEnemy(f, 12);
    if (t) return this.game.aimAt(f, t);
    return { dir: [f.aimDir.x, 0, f.aimDir.y], point: [f.pos.x + f.aimDir.x * 5, 0, f.pos.z + f.aimDir.y * 5] };
  }

  cursorAim() {
    const f = this.player, g = this.mouse.ground;
    const d = [g.x - f.pos.x, 0, g.z - f.pos.z];
    if (Math.hypot(d[0], d[2]) < 0.1) return this.autoAim();
    return { dir: d, point: [g.x, 0, g.z] };
  }

  fire(which, aim) {
    const f = this.player;
    if (!f.alive || this.game.paused) return;
    aim = aim || this.autoAim(which);
    if (which < 0) { this.game.attack(f, aim.dir); return; }
    const slot = this.slotOf(which);
    if (!slot) return;
    if (!slot.ready) { this.btnEls.find(b => Number(b.dataset.slot) === which)?.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 160 }); return; }
    this.game.cast(f, slot, aim);
  }
  castAtCursor(which) { if (this.mouse.inside && !this.touchMode) this.fire(which, this.cursorAim()); else this.fire(which, null); }
  attackAtCursor() { if (this.mouse.inside && !this.touchMode) this.fire(-1, this.cursorAim()); else this.fire(-1, null); }

  update(dt) {
    const f = this.player;
    // mouse → ground
    const cam = this.game.world.camera;
    if (this.mouse.inside) {
      const ndc = new THREE.Vector2((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1);
      this.ray.setFromCamera(ndc, cam);
      this.ray.ray.intersectPlane(this.plane, this.mouse.ground);
    }
    // movement
    let mx = 0, mz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (this.stick) {
      const dx = this.stick.x - this.stick.x0, dy = this.stick.y - this.stick.y0, l = Math.hypot(dx, dy);
      const R = 56, k = Math.min(1, l / R);
      if (l > 6) { mx = dx / l * k; mz = dy / l * k; }
      const cl = Math.min(l, R);
      this.knobEl.style.transform = l > 0 ? `translate(${dx / (l || 1) * cl}px, ${dy / (l || 1) * cl}px)` : '';
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    f.moveInput.set(this.enabled ? mx : 0, this.enabled ? mz : 0);
    // aim direction follows the cursor on desktop
    if (this.mouse.inside && !this.touchMode && f.alive) {
      const d = [this.mouse.ground.x - f.pos.x, this.mouse.ground.z - f.pos.z], l = Math.hypot(d[0], d[1]);
      if (l > 0.2 && !f.channeling) f.aimDir.set(d[0] / l, d[1] / l);
    }
    if (this.mouse.down && this.enabled && f.ammo > 0 && f.attackCd <= 0) this.attackAtCursor();
    this.updateIndicator(dt);
  }

  updateIndicator(dt) {
    const f = this.player, m = this.indicator, u = m.material.uniforms;
    u.uTime.value += dt;
    let aim = null, which = null;
    if (this.aiming && Math.hypot(this.aiming.dx, this.aiming.dy) > 12) { which = this.aiming.which; aim = this.aimFromDrag(which, this.aiming.dx, this.aiming.dy); }
    else if (this.mouse.inside && !this.touchMode && f.alive) { which = -1; aim = { ...this.cursorAim(), shape: aimShape(null) }; }
    if (!aim || !f.alive) { m.visible = false; return; }
    const slot = this.slotOf(which);
    const sh = slot ? aim.shape || aimShape(slot) : aimShape(null);
    m.visible = true;
    u.uColor.value.set(slot ? (STYLE[slot.ess]?.glow ?? '#ffe066') : '#ffffff');
    u.uOpacity.value = which < 0 && !this.aiming ? 0.55 : 1;
    const d = aim.dir, l = Math.hypot(d[0], d[2]) || 1, dx = d[0] / l, dz = d[2] / l;
    const yaw = Math.atan2(dx, dz);
    if (sh.shape === 'line') {
      u.uShape.value = 2;
      const len = sh.range;
      m.scale.set(sh.width / 2, 1, len / 2);
      m.rotation.set(0, yaw, 0);
      m.position.set(f.pos.x + dx * len / 2, 0.07, f.pos.z + dz * len / 2);
      if (sh.wall) { m.scale.set(sh.width, 1, 0.35); m.position.set(f.pos.x + dx * 2.2, 0.07, f.pos.z + dz * 2.2); }
    } else if (sh.shape === 'cone') {
      u.uShape.value = 1;
      u.uAngle.value = sh.angle * Math.PI / 180;
      m.scale.set(sh.range, 1, sh.range);
      m.rotation.set(0, yaw, 0);
      m.position.set(f.pos.x, 0.07, f.pos.z);
    } else {
      u.uShape.value = 0;
      m.scale.set(sh.radius, 1, sh.radius);
      m.rotation.set(0, 0, 0);
      const pt = sh.self ? [f.pos.x, 0, f.pos.z] : aim.point;
      m.position.set(pt[0], 0.07, pt[2]);
    }
  }
}
