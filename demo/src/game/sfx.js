// Procedural sound: every effect is synthesized with WebAudio at play time
// (filtered noise, swept oscillators, little chords). No audio files.
// Sounds far from the camera are quieter; busy sounds are rate-limited.

const ESS_SOUND = {
  fire:   { lp: 2400, boom: 70, crackle: 1 }, frost: { lp: 7000, boom: 90, glass: 1 }, storm: { lp: 6000, boom: 80, zap: 1 },
  stone:  { lp: 900, boom: 50 }, tide: { lp: 1800, boom: 60, splash: 1 }, gale: { lp: 3500, boom: 100 },
  light:  { lp: 6500, boom: 110, glass: 1 }, shadow: { lp: 1400, boom: 55 }, life: { lp: 3000, boom: 90 },
  death:  { lp: 1600, boom: 45 }, blood: { lp: 1500, boom: 60, splash: 1 }, mind: { lp: 4000, boom: 120, glass: 1 },
  time:   { lp: 5000, boom: 80, glass: 1 }, space: { lp: 2600, boom: 40 }, beast: { lp: 1400, boom: 65 }, void: { lp: 1000, boom: 35 },
};

export class SFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('sfa-muted') === '1'; } catch { /* storage may be blocked */ }
    this.last = {};
    this.listener = null; // () => [x, z] of the camera focus
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('sfa-muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  // gain for a sound at world position `pos` (null = UI / global)
  near(pos) {
    if (!pos || !this.listener) return 1;
    const [x, z] = this.listener();
    const d = Math.hypot(pos[0] - x, pos[2] - z);
    return Math.max(0, 1 - d / 22) ** 1.3;
  }
  gate(name, min) {
    const t = performance.now();
    if (t - (this.last[name] || 0) < min) return false;
    this.last[name] = t;
    return true;
  }
  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; }

  // ── primitives ──
  noise(dur, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate ?? 1;
    const f = c.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f0 ?? 2000, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 ?? o.f0 ?? 2000), t + dur);
    f.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain ?? 0.5), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }
  tone(dur, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0 ?? 440, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 ?? o.f0 ?? 440), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain ?? 0.3), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; out = osc.connect(f); }
    out.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // ── game sounds ──
  shoot(ess, pos) {
    if (!this.ok() || !this.gate('shoot', 45)) return;
    const k = this.near(pos) * 0.8;
    if (k < 0.05) return;
    const s = ESS_SOUND[ess] || ESS_SOUND.fire;
    const p = 0.9 + Math.random() * 0.2;
    this.tone(0.1, { type: 'triangle', f0: 880 * p, f1: 260 * p, gain: 0.16 * k });
    this.noise(0.07, { type: 'bandpass', f0: s.lp, f1: s.lp * 0.5, q: 1.2, gain: 0.18 * k });
  }
  impact(ess, power = 0.5, radius = 1, pos = null) {
    if (!this.ok()) return;
    const big = power > 0.6 || radius > 1.6;
    if (!this.gate(big ? 'boom' : 'impact', big ? 70 : 40)) return;
    const k = this.near(pos);
    if (k < 0.05) return;
    const s = ESS_SOUND[ess] || ESS_SOUND.fire;
    const dur = 0.16 + power * 0.45 + Math.min(0.3, radius * 0.08);
    this.noise(dur, { f0: s.lp * (0.8 + power * 0.4), f1: 90, gain: (0.35 + power * 0.4) * k });
    this.tone(dur * 0.9, { f0: s.boom * 1.8, f1: s.boom * 0.6, gain: (0.3 + power * 0.5) * k });
    if (s.crackle) for (let i = 0; i < 4; i++) this.noise(0.03, { type: 'highpass', f0: 3000, gain: 0.12 * k, delay: 0.05 + Math.random() * dur * 0.6 });
    if (s.zap) this.noise(0.18, { type: 'bandpass', f0: 5200, f1: 1800, q: 6, gain: 0.3 * k, rate: 2.5 });
    if (s.glass) this.tone(0.35, { type: 'sine', f0: 2400 + Math.random() * 600, f1: 2200, gain: 0.07 * k, delay: 0.01 });
    if (s.splash) this.noise(0.3, { type: 'bandpass', f0: 1200, f1: 500, q: 2, gain: 0.25 * k, delay: 0.02 });
  }
  hit(pos, heavy = false) {
    if (!this.ok() || !this.gate('hit', 35)) return;
    const k = this.near(pos) * (heavy ? 1 : 0.7);
    if (k < 0.05) return;
    this.tone(0.09, { f0: heavy ? 150 : 210, f1: 70, gain: 0.35 * k });
    this.noise(0.05, { type: 'highpass', f0: 2500, gain: 0.12 * k });
  }
  ko(pos) {
    if (!this.ok()) return;
    const k = Math.max(0.35, this.near(pos));
    this.noise(0.4, { f0: 3000, f1: 200, gain: 0.35 * k });
    [660, 523, 392, 262].forEach((f, i) => this.tone(0.14, { type: 'square', f0: f, gain: 0.07 * k, delay: i * 0.07, lp: 2400 }));
  }
  cast(ess, pos, law = 0) {
    if (!this.ok() || !this.gate('cast', 60)) return;
    const k = this.near(pos);
    if (k < 0.05) return;
    const s = ESS_SOUND[ess] || ESS_SOUND.fire;
    this.tone(0.3 + law * 0.2, { type: 'sawtooth', f0: 220, f1: 660 + law * 300, gain: 0.08 * k, attack: 0.08, lp: 1800 });
    this.noise(0.35, { type: 'bandpass', f0: s.lp * 0.4, f1: s.lp, q: 1.5, gain: 0.2 * k, attack: 0.12 });
  }
  whoosh(pos, dur = 0.3) {
    if (!this.ok() || !this.gate('whoosh', 60)) return;
    const k = this.near(pos);
    if (k < 0.05) return;
    this.noise(dur, { type: 'bandpass', f0: 500, f1: 2600, q: 1.4, gain: 0.35 * k, attack: dur * 0.4 });
  }
  heal(pos) {
    if (!this.ok() || !this.gate('heal', 300)) return;
    const k = this.near(pos);
    [784, 988, 1175].forEach((f, i) => this.tone(0.22, { f0: f, gain: 0.07 * k, delay: i * 0.06 }));
  }
  shield(pos) {
    if (!this.ok() || !this.gate('shield', 200)) return;
    const k = this.near(pos);
    this.tone(0.5, { f0: 1320, f1: 1250, gain: 0.08 * k });
    this.tone(0.5, { f0: 1760, f1: 1700, gain: 0.05 * k, delay: 0.03 });
  }
  godly() {
    if (!this.ok()) return;
    // a swelling choir-like chord over a rising roar
    [110, 138.6, 164.8, 220, 277.2].forEach((f, i) => this.tone(1.6, { type: 'sawtooth', f0: f, gain: 0.05, attack: 0.5, lp: 1400, detune: (i % 2 ? 6 : -6) }));
    this.noise(1.4, { type: 'bandpass', f0: 200, f1: 3000, q: 0.8, gain: 0.25, attack: 1.0 });
  }
  timeStop() {
    if (!this.ok()) return;
    this.noise(0.5, { type: 'highpass', f0: 1500, f1: 6000, gain: 0.3, attack: 0.45 });
    this.tone(2.2, { f0: 62, f1: 55, gain: 0.55, delay: 0.45 });
    this.tone(1.8, { f0: 1568, f1: 1560, gain: 0.08, delay: 0.47 });
    for (let i = 0; i < 4; i++) this.noise(0.03, { type: 'bandpass', f0: 4000, q: 8, gain: 0.25, delay: 0.9 + i * 0.5 });
  }
  timeResume() {
    if (!this.ok()) return;
    this.noise(0.6, { f0: 6000, f1: 300, gain: 0.4 });
    this.tone(0.5, { f0: 90, f1: 40, gain: 0.5 });
  }
  summon(big = false) {
    if (!this.ok()) return;
    this.tone(big ? 1.2 : 0.6, { type: 'sawtooth', f0: big ? 55 : 110, f1: big ? 45 : 220, gain: big ? 0.2 : 0.08, attack: 0.1, lp: big ? 600 : 1500 });
    this.noise(big ? 1.1 : 0.5, { f0: big ? 500 : 1500, f1: 120, gain: big ? 0.5 : 0.2, attack: 0.05 });
    if (big) this.tone(0.8, { type: 'square', f0: 180, f1: 90, gain: 0.08, delay: 0.25, lp: 900 });
  }
  ui(kind = 'click') {
    if (!this.ok()) return;
    if (kind === 'click') this.tone(0.06, { type: 'triangle', f0: 900, f1: 1200, gain: 0.12 });
    if (kind === 'reveal') [1047, 1319, 1568].forEach((f, i) => this.tone(0.18, { f0: f, gain: 0.08, delay: i * 0.05 }));
    if (kind === 'legend') [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(0.35, { type: 'triangle', f0: f, gain: 0.08, delay: i * 0.06 }));
    if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => this.tone(i === 3 ? 0.6 : 0.16, { type: 'square', f0: f, gain: 0.07, delay: i * 0.12, lp: 3000 }));
    if (kind === 'lose') [392, 330, 262, 196].forEach((f, i) => this.tone(i === 3 ? 0.6 : 0.2, { type: 'triangle', f0: f, gain: 0.09, delay: i * 0.14 }));
    if (kind === 'fight') { this.noise(0.4, { f0: 3000, f1: 300, gain: 0.3 }); this.tone(0.4, { type: 'square', f0: 392, f1: 523, gain: 0.08, lp: 2500 }); }
  }
}

// Wire the sound to the game's events and the effect library.
export function attachSfx(sfx, game) {
  const w = game.world, ev = w.events, fx = w.fx;
  sfx.listener = () => [w.camLook.x, w.camLook.z];
  const at = f => [f.pos.x, 0, f.pos.z];
  ev.on('cast', e => sfx.cast(e.dna.essences[0], at(e.caster), e.law));
  ev.on('damage', e => { if (!e.dot) sfx.hit(at(e.target), e.target === game.player || e.crit); });
  ev.on('death', e => { if (e.target.kind === 'brawler' || e.target.kind === 'titan') sfx.ko(at(e.target)); });
  ev.on('heal', e => { if (e.amount > 60) sfx.heal(at(e.target)); });
  ev.on('godly', () => sfx.godly());
  ev.on('timestop', () => sfx.timeStop());
  ev.on('summon', () => sfx.summon(false));
  ev.on('titan', () => sfx.summon(true));
  ev.on('transform', () => sfx.summon(false));
  // effect library hooks
  const wrap = (name, fn) => { const orig = fx[name]; if (!orig) return; fx[name] = function (...a) { try { fn(...a); } catch { /* never break visuals */ } return orig.apply(this, a); }; };
  wrap('impact', (ess, pos, radius, power) => sfx.impact(ess, power, radius, pos));
  wrap('muzzle', (ess, pos) => sfx.shoot(ess, pos));
  wrap('dashStart', (ess, f) => sfx.whoosh(at(f), 0.3));
  wrap('coneBlast', (ess, pos) => { sfx.whoosh(pos, 0.45); sfx.impact(ess, 0.5, 1.4, pos); });
  wrap('nova', (ess, pos, r) => sfx.impact(ess, 0.8, r, pos));
  wrap('timeResume', () => sfx.timeResume());
  wrap('teleport', (ess, pos) => sfx.whoosh(pos, 0.2));
}
