// Procedural character animation.
//
// Every frame we compute a target pose from the character's state, and each
// bone chases its target with a critically damped spring. Transitions,
// overlap and follow-through fall out of the springs, so poses stay simple.
//
// Axes: characters face +Z, their left is +X. Positive X rotation swings a
// hanging limb backward and tips the torso forward.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const ease = (t, a, b) => smooth(clamp((t - a) / (b - a), 0, 1));

class Spring {
  constructor(k = 180, d = 2 * Math.sqrt(180)) { this.x = 0; this.v = 0; this.k = k; this.d = d; }
  // substepped semi-implicit Euler: stable for stiff springs at any frame rate
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * (target - this.x) - this.d * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArm.L', 'foreArm.L', 'hand.L', 'upperArm.R', 'foreArm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R', 'scarf1', 'scarf2'];

// Stiffness per bone: limbs snap, torso and cloth lag.
const STIFF = { hips: 260, spine: 220, chest: 200, neck: 160, head: 140, scarf1: 45, scarf2: 30 };

export class Animator {
  constructor(rig, face) {
    this.rig = rig;
    this.face = face;
    this.bones = {};
    this.ch = {};
    // any bone named cloth*/scarf* (capes, tails, ears, ribbons) trails motion
    const cloth = Object.keys(rig.bones).filter(n => /^(cloth|scarf)/.test(n)).sort();
    this.cloth = cloth;
    for (const name of [...BONES.filter(b => !/^(cloth|scarf)/.test(b)), ...cloth]) {
      const b = rig.bones[name];
      if (!b) continue;
      this.bones[name] = b;
      const isCloth = /^(cloth|scarf)/.test(name);
      const k = STIFF[name] ?? (isCloth ? 40 : 320);
      const d = 2 * Math.sqrt(k) * (isCloth ? 0.45 : 0.9);
      this.ch[name] = [new Spring(k, d), new Spring(k, d), new Spring(k, d)];
    }
    this.hipY = new Spring(300, 30);
    this.squash = new Spring(380, 30);
    this.lean = new Spring(120, 20);
    this.phase = 0;
    this.t = 0;
    this.blinkT = 2 + Math.random() * 2;
    this.blink = 0;
    // state (set by the owner every frame)
    this.s = {
      speed: 0, // 0..1
      action: null, // { kind, t, dur, side }
      stunned: false, frozen: false, dead: 0, victory: false,
      airborne: 0, // 0..1 for leaps/launches
      aimLocal: 0, // aim angle relative to facing (radians)
      look: [0, 0],
      mood: 'neutral',
      moveVel: [0, 0], // for cloth
    };
  }

  // Squash/stretch kick (e.g. landing): positive = squash.
  kick(amount) { this.squash.v += amount * 7; }

  update(dt) {
    const s = this.s;
    if (s.frozen) return; // time stop: hold the pose exactly
    this.t += dt;
    const P = {}; // target Euler per bone
    const set = (b, x = 0, y = 0, z = 0) => { P[b] = [x, y, z]; };
    const addp = (b, x = 0, y = 0, z = 0) => { const p = P[b] || (P[b] = [0, 0, 0]); p[0] += x; p[1] += y; p[2] += z; };
    const t = this.t;
    let hipY = 0;

    // ── base layer: idle breathing or run cycle ──
    const sp = s.speed;
    const idleW = 1 - clamp(sp * 2, 0, 1);
    const runW = clamp(sp * 1.4, 0, 1);
    const br = Math.sin(t * 2.2);
    set('chest', 0.03 * br * idleW, 0, 0);
    set('spine', 0.02 * idleW, 0, 0.015 * Math.sin(t * 1.1) * idleW);
    set('head', -0.04 * br * idleW, 0, 0.03 * Math.sin(t * 0.9) * idleW);
    set('hips', 0, 0, 0.02 * Math.sin(t * 1.1) * idleW);
    set('upperArm.L', 0.05 * br * idleW, 0, 0.1 + 0.04 * br * idleW);
    set('upperArm.R', 0.05 * br * idleW, 0, -0.1 - 0.04 * br * idleW);
    set('foreArm.L', -0.25, 0, 0);
    set('foreArm.R', -0.25, 0, 0);
    set('thigh.L', 0, 0, 0.02); set('thigh.R', 0, 0, -0.02);
    hipY += 0.006 * br * idleW;

    if (runW > 0) {
      this.phase += dt * (6 + sp * 7);
      const ph = this.phase;
      const sn = Math.sin(ph), cs = Math.cos(ph);
      const w = runW;
      addp('thigh.L', -sn * 0.95 * w, 0, 0);
      addp('thigh.R', sn * 0.95 * w, 0, 0);
      addp('shin.L', (0.55 + 0.6 * Math.max(0, cs)) * w, 0, 0);
      addp('shin.R', (0.55 + 0.6 * Math.max(0, -cs)) * w, 0, 0);
      addp('foot.L', -0.3 * sn * w, 0, 0);
      addp('foot.R', 0.3 * sn * w, 0, 0);
      addp('upperArm.L', sn * 0.9 * w, 0, 0.12 * w);
      addp('upperArm.R', -sn * 0.9 * w, 0, -0.12 * w);
      addp('foreArm.L', -0.9 * w, 0, 0);
      addp('foreArm.R', -0.9 * w, 0, 0);
      addp('spine', 0.18 * w, -sn * 0.18 * w, 0);
      addp('chest', 0.06 * w, -sn * 0.12 * w, 0);
      addp('hips', 0, sn * 0.22 * w, 0);
      addp('head', -0.12 * w, sn * 0.1 * w, 0);
      hipY += (Math.abs(cs) * 0.05 - 0.02) * w;
      // footfall squash
      if (Math.sign(Math.sin(ph - dt * (6 + sp * 7))) !== Math.sign(sn) && w > 0.5) this.kick(0.06 * w);
    }

    // ── aim: torso turns toward the aim while doing something ──
    const aim = clamp(s.aimLocal, -1.2, 1.2);

    // ── actions ──
    const a = s.action;
    let mood = s.mood;
    if (a) {
      const k = a.dur > 0 ? clamp(a.t / a.dur, 0, 1) : 1;
      const side = a.side === 'L' ? 'L' : 'R';
      const sgn = side === 'L' ? 1 : -1;
      const wind = ease(k, 0, 0.3), hit = ease(k, 0.3, 0.45), back = ease(k, 0.6, 1);
      switch (a.kind) {
        case 'punch': case 'attack': {
          // wind up, snap forward, recover
          const f = wind * (1 - hit) - hit * (1 - back) * 1.0;
          addp('spine', 0.1 * hit * (1 - back), aim * 0.6 - sgn * 0.35 * f, 0);
          addp('chest', 0, sgn * 0.3 * (hit - wind) * (1 - back), 0);
          set('upperArm.' + side, (0.7 * wind - 2.0 * hit) * (1 - back) , sgn * 0.2 * hit * (1 - back), sgn * (0.2 + 0.2 * wind));
          set('foreArm.' + side, (-1.8 * wind + 1.6 * hit) * (1 - back) - 0.25, 0, 0);
          addp('upperArm.' + (side === 'L' ? 'R' : 'L'), -0.4 * hit * (1 - back), 0, 0);
          mood = 'fierce';
          break;
        }
        case 'cast': {
          // gather energy, then thrust both arms forward
          const gather = ease(k, 0, 0.35), rel = ease(k, 0.35, 0.5);
          const hold = 1 - back;
          addp('spine', (-0.15 * gather + 0.3 * rel) * hold, aim * 0.7, 0);
          addp('head', (0.1 * gather - 0.15 * rel) * hold, -aim * 0.2, 0);
          set('upperArm.L', (0.5 * gather - 1.9 * rel) * hold, -0.2 * rel * hold, 0.9 * gather * (1 - rel) * hold + 0.1);
          set('upperArm.R', (0.5 * gather - 1.9 * rel) * hold, 0.2 * rel * hold, -0.9 * gather * (1 - rel) * hold - 0.1);
          set('foreArm.L', (-1.2 * gather + 1.0 * rel) * hold - 0.2, 0, 0);
          set('foreArm.R', (-1.2 * gather + 1.0 * rel) * hold - 0.2, 0, 0);
          hipY += (-0.04 * gather + 0.02 * rel) * hold;
          mood = 'shout';
          break;
        }
        case 'throw': {
          // overhead lob
          const hold = 1 - back;
          set('upperArm.' + side, (-2.6 * wind * (1 - hit) - 1.2 * hit) * hold, 0, sgn * 0.3);
          set('foreArm.' + side, (-1.4 * wind * (1 - hit) + 0.2 * hit) * hold - 0.2, 0, 0);
          addp('spine', (-0.25 * wind + 0.45 * hit) * hold, aim * 0.5, 0);
          mood = 'fierce';
          break;
        }
        case 'slam': {
          // both fists overhead, then down into the ground
          const hold = 1 - back;
          const up = wind * (1 - hit);
          set('upperArm.L', (-2.9 * up - 0.8 * hit) * hold, 0, 0.3 * up);
          set('upperArm.R', (-2.9 * up - 0.8 * hit) * hold, 0, -0.3 * up);
          set('foreArm.L', -0.4 * up * hold - 0.2, 0, 0);
          set('foreArm.R', -0.4 * up * hold - 0.2, 0, 0);
          addp('spine', (-0.3 * up + 0.6 * hit) * hold, 0, 0);
          hipY += (0.05 * up - 0.12 * hit) * hold;
          if (k > 0.3 && k < 0.34) this.kick(0.6);
          mood = 'shout';
          break;
        }
        case 'dash': {
          // lean hard into it, arms swept back
          const w = 1 - ease(k, 0.75, 1);
          addp('spine', 0.55 * w, 0, 0);
          addp('head', -0.35 * w, 0, 0);
          set('upperArm.L', 1.1 * w, 0, 0.3 * w);
          set('upperArm.R', 1.1 * w, 0, -0.3 * w);
          addp('thigh.L', -0.6 * w, 0, 0); addp('shin.L', 0.9 * w, 0, 0);
          addp('thigh.R', 0.5 * w, 0, 0); addp('shin.R', 0.4 * w, 0, 0);
          mood = 'fierce';
          break;
        }
        case 'hit': {
          const w = 1 - ease(k, 0.2, 1);
          addp('spine', -0.35 * w, 0, 0.12 * w * sgn);
          addp('head', -0.3 * w, 0, -0.2 * w * sgn);
          addp('upperArm.L', -0.6 * w, 0, 0.5 * w);
          addp('upperArm.R', -0.6 * w, 0, -0.5 * w);
          mood = 'hurt';
          break;
        }
        case 'summon': {
          // arms up to the sky
          const hold = 1 - back;
          const up = ease(k, 0, 0.4);
          set('upperArm.L', -2.6 * up * hold, 0, 0.5 * up * hold + 0.1);
          set('upperArm.R', -2.6 * up * hold, 0, -0.5 * up * hold - 0.1);
          set('foreArm.L', -0.2, 0, 0);
          set('foreArm.R', -0.2, 0, 0);
          addp('spine', -0.2 * up * hold, 0, 0);
          addp('head', -0.3 * up * hold, 0, 0);
          mood = 'shout';
          break;
        }
        default: break;
      }
    }

    if (s.airborne > 0) {
      const w = s.airborne;
      addp('thigh.L', -0.9 * w, 0, 0.1 * w); addp('shin.L', 1.3 * w, 0, 0);
      addp('thigh.R', -0.5 * w, 0, -0.1 * w); addp('shin.R', 1.0 * w, 0, 0);
      addp('upperArm.L', -0.4 * w, 0, 0.8 * w);
      addp('upperArm.R', -0.4 * w, 0, -0.8 * w);
    }

    if (s.stunned) {
      const w = 1;
      addp('head', 0.15 * Math.sin(t * 7) * w, 0, 0.25 * Math.cos(t * 7) * w);
      addp('spine', 0.08 * Math.cos(t * 7) * w, 0, 0.12 * Math.sin(t * 7) * w);
      addp('upperArm.L', 0, 0, 0.5 * w);
      addp('upperArm.R', 0, 0, -0.5 * w);
      mood = 'dizzy';
    }

    if (s.victory) {
      const j = Math.abs(Math.sin(t * 5));
      set('upperArm.R', -2.8, 0, -0.3);
      set('foreArm.R', -0.3, 0, 0);
      set('upperArm.L', 0.2, 0, 0.6);
      hipY += j * 0.12;
      addp('spine', -0.1, Math.sin(t * 5) * 0.2, 0);
      mood = 'happy';
    }

    if (s.dead > 0) {
      const w = s.dead;
      addp('spine', -0.6 * w, 0, 0.3 * w);
      addp('head', -0.5 * w, 0, 0.4 * w);
      addp('upperArm.L', -1.2 * w, 0, 1.2 * w);
      addp('upperArm.R', -1.2 * w, 0, -1.2 * w);
      mood = 'ko';
    }

    // cloth: scarf trails behind motion and flutters
    const v = s.moveVel;
    const vmag = Math.hypot(v[0], v[1]);
    const flutter = Math.sin(t * 13) * 0.12 * clamp(vmag / 5, 0, 1) + Math.sin(t * 2.1) * 0.05;
    this.cloth.forEach((name, i) => {
      const depth = /\d$/.test(name) ? Number(name.slice(-1)) - 1 : i;
      set(name, (-0.22 - clamp(vmag / 6, 0, 1) * (0.9 - depth * 0.35) + flutter * (1 + depth * 0.6)) * (this.rig.bones[name].userData.clothScale ?? 1),
        (0.1 + depth * 0.05) * Math.sin(t * (3 + depth) + i), 0);
    });

    // head looks toward the aim
    addp('head', 0, aim * 0.35, 0);
    addp('neck', 0, aim * 0.2, 0);

    // ── apply springs ──
    for (const name in this.bones) {
      const target = P[name] || [0, 0, 0];
      const c = this.ch[name];
      const b = this.bones[name];
      b.rotation.set(c[0].step(target[0], dt), c[1].step(target[1], dt), c[2].step(target[2], dt));
    }
    const hips = this.bones.hips;
    const hy = this.hipY.step(hipY, dt);
    hips.position.y = hips.userData.rest.y + hy;
    // squash and stretch on the root, volume preserving
    const sq = clamp(this.squash.step(0, dt), -0.3, 0.3);
    const root = this.rig.root;
    root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    this.updateFace(dt, mood);
  }

  updateFace(dt, mood) {
    const f = this.face;
    if (!f) return;
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 1.8 + Math.random() * 3.5; }
    let bl = 0;
    if (this.blink > 0) { this.blink -= dt; bl = Math.sin(clamp(1 - this.blink / 0.14, 0, 1) * Math.PI); }
    const M = MOODS[mood] || MOODS.neutral;
    const lerp = (u, key, target, rate = 14) => { u[key].value += (target - u[key].value) * Math.min(1, dt * rate); };
    for (const e of ['eyeL', 'eyeR']) {
      const u = f.u[e];
      if (!u) continue;
      lerp(u, 'uAngry', M.angry);
      lerp(u, 'uHappy', M.happy);
      lerp(u, 'uSad', M.sad);
      u.uBlink.value = Math.max(bl, M.closed);
      u.uLook.value.set(this.s.look[0], this.s.look[1]);
    }
    for (const b of ['browL', 'browR']) {
      const u = f.u[b];
      if (!u) continue;
      lerp(u, 'uAngle', M.brow);
      lerp(u, 'uRaise', M.raise);
    }
    const m = f.u.mouth;
    if (m) {
      lerp(m, 'uOpen', M.open);
      lerp(m, 'uSmile', M.smile);
      lerp(m, 'uFrown', M.frown);
    }
  }
}

const MOODS = {
  neutral: { angry: 0, happy: 0, sad: 0, closed: 0, brow: 0.4, raise: -0.1, open: 0.4, smile: 0.9, frown: 0 },
  fierce: { angry: 1, happy: 0, sad: 0, closed: 0, brow: 1.1, raise: -0.25, open: 0.55, smile: 0.2, frown: 0.2 },
  shout: { angry: 0.7, happy: 0, sad: 0, closed: 0, brow: 1.0, raise: -0.15, open: 1.0, smile: 0.1, frown: 0 },
  hurt: { angry: 0, happy: 0, sad: 1, closed: 0.55, brow: -0.6, raise: 0.1, open: 0.7, smile: 0, frown: 1.0 },
  dizzy: { angry: 0, happy: 0, sad: 0.5, closed: 0.3, brow: -0.4, raise: 0.1, open: 0.3, smile: 0, frown: 0.6 },
  happy: { angry: 0, happy: 1, sad: 0, closed: 1, brow: 0.0, raise: 0.1, open: 0.9, smile: 1.2, frown: 0 },
  ko: { angry: 0, happy: 0, sad: 1, closed: 1, brow: -0.6, raise: 0.1, open: 0.5, smile: 0, frown: 1 },
};
