// Summoned things: minions, clones of the caster, titans, raised dead,
// transformation forms and hex critters. Creatures come from the creature
// library when it has the (role, essence); otherwise sensible stand-ins
// (a recolored minion, a scaled clone of the caster) keep every power
// working.

import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { buildHero } from '../art/heroes.js';
import { STYLE } from '../vfx/styles.js';
import * as L from '../vfx/fxlib.js';
import { ESSENCES } from '../../../prototypes/skill-forge/data-essences.js';

let creatures = null; // lazily imported creature library
export async function loadCreatures() {
  try { creatures = await import('../art/creatures.js'); } catch (e) { console.warn('creature library unavailable', e); creatures = null; }
  return creatures;
}
const hasCreature = (role, ess) => !!creatures?.CREATURE_ROLES?.[role]?.[ess];

// Animator adapter so Fighter can drive a creature like a hero.
class CreatureAnimator {
  constructor(c) {
    this.c = c;
    this.time = 0;
    this.s = { speed: 0, action: null, dead: 0, stunned: false, frozen: false, airborne: 0, moveVel: [0, 0], look: [0, 0], aimLocal: 0 };
  }
  kick() {}
  update(dt) {
    this.time += dt;
    const s = this.s, a = s.action;
    let action = null;
    if (s.dead) action = { kind: 'death', t: s.dead, dur: 1 };
    else if (a) action = { kind: a.kind === 'hit' ? 'hit' : a.kind === 'spawn' ? 'spawn' : 'attack', t: a.t, dur: a.dur };
    this.c.update(s.frozen ? 0 : dt, { speed: s.speed, action, time: this.time });
  }
}

function creatureModel(role, ess) {
  const key = hasCreature(role, ess) ? ess : role === 'minion' && hasCreature('minion', 'fire') ? 'fire' : null;
  if (!key) return null;
  const c = creatures.buildCreature(role, key);
  if (key !== ess) {
    // stand-in: recolor another essence's creature
    c.group.traverse(m => { const u = m.material?.userData?.u; if (u?.uTint) { u.uTint.value.set(STYLE[ess]?.color ?? '#ffffff'); u.uTintAmount.value = 0.55; } });
  }
  const model = { group: c.group, rig: { bones: {} }, face: null, def: { height: c.height }, creature: c };
  return { model, animator: new CreatureAnimator(c), height: c.height, radius: c.radius };
}

// A copy of a brawler's model (cached geometry: cheap) with an essence look.
function heroCopy(heroId, ess, o = {}) {
  const m = buildHero(heroId);
  const st = STYLE[ess] || STYLE.fire;
  m.group.traverse(x => {
    const u = x.material?.userData?.u;
    if (!u?.uTint) return;
    u.uTint.value.set(st.color);
    u.uTintAmount.value = o.tint ?? 0.45;
  });
  if (o.scale) m.group.scale.setScalar(o.scale);
  return m;
}

// Simple melee/ranged brain for summons: chase the nearest enemy near the
// owner, attack in range, otherwise follow the owner.
class SummonBrain {
  constructor(game, f, o) {
    this.game = game; this.f = f; this.o = o;
    this.cd = 0.4 + Math.random() * 0.4;
    this.retarget = 0;
    this.target = null;
  }
  update(dt) {
    const f = this.f, w = this.game.world;
    if (!f.alive) return;
    this.cd -= dt;
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target?.alive) { this.retarget = 0.5; this.target = w.nearestEnemy(f, this.o.aggro ?? 9); }
    const owner = f.owner;
    let tx, tz, want = 0;
    if (this.target) { tx = this.target.pos.x; tz = this.target.pos.z; want = this.o.range * 0.8; }
    else if (owner?.alive) { tx = owner.pos.x + Math.cos(f.id) * 1.4; tz = owner.pos.z + Math.sin(f.id) * 1.4; want = 0.3; }
    else { f.moveInput.set(0, 0); return; }
    const dx = tx - f.pos.x, dz = tz - f.pos.z, d = Math.hypot(dx, dz);
    if (d > want + 0.15) f.moveInput.set(dx / d, dz / d); else f.moveInput.set(0, 0);
    if (this.target && d > 0.01) f.aimDir.set(dx / d, dz / d);
    if (this.target && d <= this.o.range + this.target.radius && this.cd <= 0 && f.canAct()) {
      this.cd = this.o.rate;
      this.o.attack(this.game, f, this.target);
    }
  }
}

function meleeHit(dmg, ess, radius = 1.1) {
  return (game, f, target) => {
    f.setAction('punch', 0.35);
    game.world.spawn({ t: 0.16, owner: f, update(dt) {
      this.t -= dt;
      if (this.t > 0) return true;
      if (!f.alive) return false;
      const at = [f.pos.x + f.aimDir.x * 0.6, 0.6, f.pos.z + f.aimDir.y * 0.6];
      for (const e of game.world.inCircle(at[0], at[2], radius * 0.7, o => o.team !== f.team)) {
        e.takeDamage(Math.round(dmg * f.buffs.dmg), f.owner || f, { ess, dir: [f.aimDir.x, 0, f.aimDir.y] });
        game.world.fx.hitSpark?.(ess, e);
      }
      game.world.fx.push(L.slash(game.world.scene, { pos: [f.pos.x, 0.65, f.pos.z], dir: [f.aimDir.x, 0, f.aimDir.y], color: STYLE[ess].color, core: STYLE[ess].core, edge: STYLE[ess].edge, radius: radius * 0.9, arc: 110, width: 0.28, dur: 0.2 }));
      return false;
    } });
  };
}

function boltShot(dmg, ess, size = 0.36) {
  return (game, f, target) => {
    f.setAction('cast', 0.35);
    game.shootBolt(f, ess, [target.pos.x - f.pos.x, 0, target.pos.z - f.pos.z], dmg, size);
  };
}

function summonFighter(game, o) {
  const f = new Fighter(game.world, { team: o.team, name: o.name, x: o.x, z: o.z, facing: o.facing ?? 0, essence: o.ess, kind: o.kind, owner: o.owner,
    model: o.model, animator: o.animator, maxHp: o.hp, speed: o.speed, radius: o.radius, height: o.height });
  f.hp = f.maxHp;
  f.summonLife = o.dur;
  f.brain = new SummonBrain(game, f, o.brain);
  f.controller = { update: dt => {
    f.brain.update(dt);
    f.summonLife -= dt;
    if (f.summonLife <= 0 && f.alive) { game.world.fx.puffs(o.ess, [f.pos.x, 0.2, f.pos.z], 8, 0.7, { alpha: 0.6 }); f.die(null); }
  } };
  game.world.add(f);
  game.addSummon(f);
  // arrival
  f.setAction('spawn', 0.5);
  game.world.fx.impact(o.ess, [f.pos.x, 0.3, f.pos.z], 0.8 * (o.fxScale ?? 1), 0.3);
  return f;
}

// ── power hooks ──────────────────────────────────────────────────────────
export function summonMinions(game, ctx, count, dur, pow, where, ess) {
  const caster = ctx.caster;
  const info = ESSENCES[ess];
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const x = where[0] + Math.cos(a) * 1.2, z = where[2] + Math.sin(a) * 1.2;
    const cm = creatureModel('minion', ess);
    const ranged = ['storm', 'light', 'tide', 'space', 'mind', 'time'].includes(ess);
    const dmg = Math.round(38 + pow * 1.2);
    let model, animator, height, radius;
    if (cm) ({ model, animator, height, radius } = cm);
    else { model = heroCopy(caster.heroId, ess, { scale: 0.55, tint: 0.6 }); height = 0.85; radius = 0.3; }
    const f = summonFighter(game, {
      team: caster.team, owner: caster, name: info?.minion?.[0] ?? 'minion', ess, kind: 'minion', x, z, facing: caster.facing,
      model, animator, hp: 260 + pow * 3, speed: 4.6, radius: radius ?? 0.32, height: height ?? 0.8, dur,
      brain: ranged ? { range: 5, rate: 1.0, attack: boltShot(dmg, ess, 0.3) } : { range: 0.9, rate: 0.8, attack: meleeHit(dmg, ess) },
    });
    out.push(f);
  }
  game.world.events.emit('summon', { caster, count, ess, kind: 'minion' });
  return out;
}

export function summonClones(game, ctx, count, dur, dmgPct, ess) {
  const caster = ctx.caster;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = caster.facing + (i - (count - 1) / 2) * 1.2 + Math.PI / 2;
    const model = heroCopy(caster.heroId, ess, { tint: 0.5 });
    const x = caster.pos.x + Math.cos(a) * 1.3, z = caster.pos.z + Math.sin(a) * 1.3;
    const f = summonFighter(game, {
      team: caster.team, owner: caster, name: ESSENCES[ess]?.clones?.[0] ?? 'double', ess, kind: 'clone', x, z, facing: caster.facing,
      model, hp: 300, speed: caster.speed, dur,
      brain: { range: 6.5, rate: 0.7, aggro: 11, attack: boltShot(Math.round(90 * dmgPct / 100 + 20), ess, 0.38) },
    });
    f.setLook('uGhost', 0.3);
    f.lookMats.forEach(m => { m.transparent = true; m.needsUpdate = true; });
    game.world.fx.teleport?.(ess, f.center());
    out.push(f);
  }
  return out;
}

export function summonTitan(game, ctx, hp, dur, where, ess) {
  const caster = ctx.caster;
  const cm = creatureModel('titan', ess);
  let model, animator, height, radius;
  if (cm) ({ model, animator, height, radius } = cm);
  else { model = heroCopy(caster.heroId, ess, { scale: 2.1, tint: 0.55 }); height = 3.1; radius = 0.95; }
  const st = STYLE[ess] || STYLE.fire;
  const slam = (g, f, target) => {
    f.setAction('slam', 0.7);
    g.world.spawn({ t: 0.35, owner: f, update(dt) {
      this.t -= dt;
      if (this.t > 0) return true;
      if (!f.alive) return false;
      const at = [f.pos.x + f.aimDir.x * 1.4, 0, f.pos.z + f.aimDir.y * 1.4];
      g.world.fx.impact(ess, [at[0], 0.3, at[2]], 2.4, 0.9);
      g.world.fx.nova?.(ess, at, 2.4);
      for (const e of g.world.inCircle(at[0], at[2], 2.4, o => o.team !== f.team)) {
        e.takeDamage(Math.round(160 * f.buffs.dmg), caster, { ess, dir: [e.pos.x - at[0], 0, e.pos.z - at[2]] });
        e.knock(e.pos.x - at[0], e.pos.z - at[2], 9);
      }
      return false;
    } });
  };
  const f = summonFighter(game, {
    team: caster.team, owner: caster, name: (ESSENCES[ess]?.titan ?? 'Titan').replace(/^an? /, ''), ess, kind: 'titan',
    x: where[0], z: where[2], facing: caster.facing, model, animator, hp, speed: 2.6, radius: radius ?? 0.9, height: height ?? 3, dur, fxScale: 2.5,
    brain: { range: 1.9, rate: 1.5, aggro: 14, attack: slam },
  });
  // landing: dust ring, cracks, a big shake
  const fx = game.world.fx;
  fx.push(L.ring(game.world.scene, { pos: [where[0], 0, where[2]], color: st.color, core: st.core, radius: 4.5, dur: 0.6 }));
  fx.slamCracks?.(ess, where, 3);
  fx.shake(1.1);
  fx.flash(st.glow, 0.3);
  game.world.events.emit('titan', { caster, ess, name: f.name });
  return f;
}

// Necromancy: the fallen (or the ground itself) rise as thralls of the caster.
export function raiseDead(game, ctx, count, dur, hpPct, where, radius) {
  const caster = ctx.caster, ess = 'death';
  const w = game.world;
  const spots = game.corpses.filter(c => Math.hypot(c.x - where[0], c.z - where[2]) < radius + 2).slice(0, count).map(c => [c.x, 0, c.z]);
  while (spots.length < count) { const a = Math.random() * Math.PI * 2, d = Math.random() * radius * 0.7; spots.push([where[0] + Math.cos(a) * d, 0, where[2] + Math.sin(a) * d]); }
  const out = [];
  spots.forEach((s, i) => {
    w.spawn({ t: 0.25 + i * 0.18, owner: caster, update(dt) {
      this.t -= dt;
      if (this.t > 0) return true;
      w.fx.push(L.circle(w.scene, { pos: s, color: STYLE.death.color, core: STYLE.death.core, radius: 0.9, dur: 0.9, spin: 2 }));
      w.fx.motif(ess, 'impact', [s[0], 0.3, s[2]], 0.8, 0.6);
      const cm = creatureModel('minion', ess);
      let model, animator, height, rad;
      if (cm) ({ model, animator, height, radius: rad } = cm);
      else { model = heroCopy(caster.heroId, ess, { scale: 0.62, tint: 0.7 }); height = 0.95; rad = 0.32; }
      out.push(summonFighter(game, {
        team: caster.team, owner: caster, name: 'risen', ess, kind: 'minion', x: s[0], z: s[2], model, animator,
        hp: Math.round(700 * hpPct / 100), speed: 3.8, radius: rad ?? 0.32, height: height ?? 0.9, dur,
        brain: { range: 0.9, rate: 0.9, attack: meleeHit(55, ess) },
      }));
      return false;
    } });
  });
  w.events.emit('summon', { caster, count, ess, kind: 'raise' });
  return out;
}

// Transformation: the caster becomes the essence's form for a while.
export function transformInto(game, who, ess, dur, bonus) {
  const w = game.world, fx = w.fx;
  if (who.form) endForm(game, who, true);
  const st = STYLE[ess] || STYLE.fire;
  const cm = creatureModel('form', ess);
  const form = { ess, t: 0, dur, bonus, name: ESSENCES[ess]?.form ?? 'Avatar', model: null };
  const hpBoost = Math.round(who.maxHp * bonus / 100);
  who.maxHp += hpBoost; who.heal(hpBoost, { quiet: true });
  who.buffs.dmg *= 1 + bonus / 100;
  form.hpBoost = hpBoost;
  if (cm) {
    form.model = cm;
    who.model.group.visible = false;
    who.group.add(cm.model.group);
  } else {
    who.model.group.scale.setScalar(1.3);
    who.setLook('uTint', st.color);
    who.setLook('uTintAmount', 0.35);
  }
  who.form = form;
  who.addStatus('form', dur, { ess, onEnd: () => endForm(game, who) });
  fx.selfBurst?.(ess, who, 1.6);
  fx.push(L.pillar(w.scene, { pos: [who.pos.x, 0, who.pos.z], color: st.color, core: st.core, radius: 1.3, height: 9, dur: 0.7 }));
  fx.shake(0.7);
  fx.flash(st.glow, 0.3);
  w.events.emit('transform', { who, ess, name: form.name });
  // aura while transformed
  const aura = { t: 0, update(dt) {
    if (who.form !== form || !who.alive) return false;
    this.t += dt;
    if (Math.random() < dt * 30) fx.motif(ess, 'trail', [who.pos.x + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 1.4, who.pos.z + (Math.random() - 0.5) * 0.8], 0.55, 0, [0, -1, 0]);
    if (form.model) {
      form.model.model.group.rotation.y = who.facing;
      form.model.animator.s.speed = who.anim.s.speed;
      form.model.animator.s.action = who.action && who.action.kind !== 'hit' ? { kind: 'attack', t: who.action.t, dur: who.action.dur } : who.action;
      form.model.animator.update(dt);
    }
    return true;
  } };
  fx.push(aura);
}

export function endForm(game, who, quiet = false) {
  const form = who.form;
  if (!form) return;
  who.form = null;
  who.maxHp -= form.hpBoost;
  who.hp = Math.min(who.hp, who.maxHp);
  who.buffs.dmg /= 1 + form.bonus / 100;
  if (form.model) { form.model.model.group.removeFromParent(); who.model.group.visible = true; }
  who.model.group.scale.setScalar(1);
  who.setLook('uTintAmount', 0);
  if (!quiet) { game.world.fx.puffs(form.ess, [who.pos.x, 0.3, who.pos.z], 10, 1, { alpha: 0.6 }); game.world.fx.selfBurst?.(form.ess, who, 0.8); }
}

export function makeCritter(ess) {
  if (!hasCreature('critter', ess)) return null;
  const c = creatures.buildCreature('critter', ess);
  return { group: c.group, update: (dt, s) => c.update(dt, s), dispose: () => {} };
}
