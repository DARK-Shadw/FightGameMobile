// Runs a power's DNA in the arena. Every carrier (shape) is an entity that
// moves, finds targets and delivers its payload; modifiers change how it
// moves; chains spawn child shapes on hit / end / kill / landing.

import { CARRIERS, MODS, ATOMS, paramValues, stepValue, DRAWBACKS } from '../../../prototypes/skill-forge/data-atoms.js';
import { applyToEnemy, applyToAlly, atomParams } from './atoms.js';
import * as L from '../vfx/fxlib.js';
import { STYLE } from '../vfx/styles.js';

const cp = h => (h.raw ? { ...paramValues(h, CARRIERS[h.id].p), ...h.raw } : paramValues(h, CARRIERS[h.id].p));
const mp = h => (h.raw ? { ...paramValues(h, MODS[h.id].p), ...h.raw } : paramValues(h, MODS[h.id].p));
const whoOf = id => ATOMS[id].who;
const AREA = new Set(['nova', 'aura', 'zone', 'global', 'lob', 'strike', 'leap', 'cone']);
const TICK = new Set(['zone', 'aura', 'beam', 'wall', 'tether', 'global']);
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; };
const rot = (d, a) => [d[0] * Math.cos(a) - d[2] * Math.sin(a), 0, d[0] * Math.sin(a) + d[2] * Math.cos(a)];

// Power slot on a fighter
export class PowerSlot {
  constructor(dna) {
    this.dna = dna;
    this.cd = 0;
    this.cdMax = dna.stats.cooldown ?? 0;
    this.ess = dna.essences[0];
    this.uses = dna.drawbacks.some(d => d.id === 'limited') ? 2 : Infinity;
    this.passive = dna.trigger !== 'cast';
  }
  get ready() { return this.cd <= 0 && this.uses > 0 && !this.stolen; }
}

function ctxFor(game, caster, dna, extra = {}) {
  return { game, world: game.world, caster, dna, ess: dna.essences[0], essences: dna.essences, hitOnce: new Set(), origin: [caster.pos.x, 0, caster.pos.z], scale: 1, ...extra };
}

// Deliver one payload to the fighters a shape reached.
function deliver(ctx, node, targets, where, o = {}) {
  const { world, caster } = ctx;
  const enemyAtoms = node.atoms.filter(a => whoOf(a.id) === 'enemies');
  const helpAtoms = node.atoms.filter(a => ['allies', 'self'].includes(whoOf(a.id)));
  const actx = { ...ctx, origin: o.origin || where, tick: o.tick || 0, dur: o.dur || 0, scale: o.scale ?? ctx.scale ?? 1, pushFrom: o.pushFrom, pullTo: o.pullTo };
  let dealt = 0;
  const kills = [];
  for (const t of targets) {
    if (!t.alive) continue;
    if (t.statuses.reflect && ctx.projectile && !ctx.reflected) { ctx.reflect?.(t); continue; }
    const hp0 = t.hp + t.shieldHp;
    for (const a of enemyAtoms) applyToEnemy(actx, a, t);
    dealt += Math.max(0, hp0 - (t.hp + t.shieldHp));
    if (!t.alive) kills.push(t);
    if (o.friendlyFire) {}
  }
  const ls = node.atoms.find(a => a.id === 'lifesteal');
  if (ls && dealt > 0) caster.heal(dealt * atomParams(ls).pct / 100);
  if (helpAtoms.length && !o.noHelp) {
    // 'self' atoms always go to the caster (once per cast for lasting shapes);
    // 'allies' atoms reach allies inside an area, or the caster otherwise
    const area = AREA.has(node.carrier.id) && o.radius;
    const allies = area ? world.inCircle(where[0], where[2], o.radius, f => f.team === caster.team) : [caster];
    const hctx = { ...actx, blinkTo: ctx.blinkTo || (area || o.landed ? [where[0], 0, where[2]] : null) };
    for (const a of helpAtoms) {
      if (whoOf(a.id) === 'self') {
        if (o.tick) { const key = 'self:' + a.id; if (ctx.hitOnce.has(key)) continue; ctx.hitOnce.add(key); }
        applyToAlly(hctx, a, caster);
      } else for (const r of allies) applyToAlly(hctx, a, r);
    }
  }
  if (!o.tick) for (const a of node.atoms) {
    const w = whoOf(a.id);
    if (w !== 'summon' && w !== 'ground' && w !== 'corpse') continue;
    const key = 'spawn:' + a.id;
    if (ctx.hitOnce.has(key)) continue; // once per cast, even for piercing or bouncing shapes
    ctx.hitOnce.add(key);
    if (w === 'summon') ctx.game.summon?.(ctx, a, where);
    if (w === 'ground') spawnTerrain(ctx, a, where);
    if (w === 'corpse') ctx.game.raise?.(ctx, a, where, o.radius || 3);
  }
  // chains
  const ch = node.chain;
  if (ch && !o.tick) {
    if (ch.on === 'hit' && targets.length) {
      const perEnemy = !['bolt', 'lob', 'strike'].includes(node.carrier.id);
      const spots = perEnemy ? targets.slice(0, 4).map(t => [t.pos.x, 0, t.pos.z]) : [where];
      spots.forEach((s, i) => setTimeout0(ctx, 0.05 + i * 0.05, () => spawnChild(ctx, ch, s, o.dir)));
    }
    if (ch.on === 'kill' && kills.length) kills.forEach(k => spawnChild(ctx, ch, [k.pos.x, 0, k.pos.z], o.dir));
  }
  return { dealt, kills };
}

function setTimeout0(ctx, t, fn) {
  ctx.world.spawn({ t, owner: ctx.caster, update(dt) { this.t -= dt; if (this.t <= 0) { fn(); return false; } return true; } });
}

function spawnChild(ctx, ch, at, dir) {
  const node = { carrier: ch.carrier, mods: [], atoms: ch.atoms, chain: null };
  const child = { ...ctx, hitOnce: new Set(), isChild: true, ess: ctx.essences[1] || ctx.ess };
  runNode(child, node, at, dir || [0, 0, 1], at);
}

// ── Main entry ─────────────────────────────────────────────────────────
export function castPower(game, caster, slot, aim) {
  const dna = slot.dna;
  if (!slot.ready || !caster.canAct()) return false;
  const world = game.world;
  const ctx = ctxFor(game, caster, dna);
  const c = dna.root.carrier.id;
  let dir = norm(aim.dir[0], aim.dir[2]);
  if (dna.drawbacks.some(d => d.id === 'wobble')) dir = rot(dir, (Math.random() - 0.5) * 0.9);
  const range = cp(dna.root.carrier).range ?? 9;
  let point = aim.point ? aim.point.slice() : [caster.pos.x + dir[0] * range * 0.8, 0, caster.pos.z + dir[2] * range * 0.8];
  const dx = point[0] - caster.pos.x, dz = point[2] - caster.pos.z, dl = Math.hypot(dx, dz);
  if (dl > range) { point = [caster.pos.x + dx / dl * range, 0, caster.pos.z + dz / dl * range]; }
  caster.aimDir.set(dir[0], dir[2]);
  const anim = { bolt: 'cast', tether: 'cast', cone: 'cast', beam: 'cast', wall: 'cast', lob: 'throw', strike: 'summon', global: 'summon',
    nova: 'slam', aura: 'summon', self: 'summon', leap: 'slam', dash: 'dash', imbue: 'punch', orbitals: 'summon', trap: 'throw', zone: 'throw' }[c] || 'cast';
  const windup = Math.max(0.12, dna.stats.windup ?? 0.15);
  const law = dna.stats.law || 0;
  caster.setAction(anim, windup + 0.45, 'R');
  slot.cd = slot.cdMax;
  if (slot.uses !== Infinity) slot.uses--;
  world.events.emit('cast', { caster, slot, dna, law });
  // telegraph during the windup for law-breaking powers
  if (law > 0) world.fx.lawWindup?.(ctx.ess, caster, windup, law);
  world.fx.charge?.(ctx.ess, caster, windup);
  setTimeout0(ctx, windup, () => {
    if (!caster.alive) return;
    const fire = (d, p) => runNode(ctx, dna.root, caster.handPos(), d, p, true);
    fire(dir, point);
    const mirror = dna.root.mods.find(m => m.id === 'mirror');
    if (mirror) fire([-dir[0], 0, -dir[2]], [caster.pos.x - dir[0] * range * 0.8, 0, caster.pos.z - dir[2] * range * 0.8]);
    const echo = dna.root.mods.find(m => m.id === 'echo');
    if (echo) {
      const ep = mp(echo);
      const at = { pos: [caster.pos.x, 0, caster.pos.z], dir, point };
      for (let i = 1; i <= ep.count; i++) setTimeout0(ctx, ep.delay * i, () => { world.fx.echo?.(ctx.ess, at.pos); runNode({ ...ctx, hitOnce: new Set(), echo: true }, dna.root, [at.pos[0], 0.9, at.pos[2]], at.dir, at.point, true, at.pos); });
    }
    applyDrawbacks(game, caster, slot);
  });
  return true;
}

function applyDrawbacks(game, caster, slot) {
  for (const d of slot.dna.drawbacks) {
    switch (d.id) {
      case 'hpCost': caster.takeDamage(Math.round(caster.hp * stepValue(DRAWBACKS.hpCost.p.pct, d.s.pct || 0) / 100), caster, { dot: true, ess: 'blood' }); break;
      case 'exhaust': caster.addStatus('slow', 2, { pct: 40 }); break;
      case 'fragile': caster.addStatus('fragile', 3); break;
      case 'lockout': for (const s of caster.powers) if (s !== slot) s.cd = Math.max(s.cd, 3); break;
      case 'reveal': caster.addStatus('revealed', 4); break;
      case 'bloodDebt': {
        const k0 = caster.kills;
        caster.addStatus('bloodDebt', 6, { onEnd: () => { if (caster.kills === k0 && caster.alive) caster.takeDamage(Math.round(caster.maxHp * 0.25), caster, { ess: 'blood' }); } });
        break;
      }
      default: break;
    }
  }
}

// Run one node (root or chain child) from `origin` toward `dir` / `point`.
export function runNode(ctx, node, origin, dir, point, isRoot = false, fromPos = null) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const st = STYLE[ctx.ess] || STYLE.fire;
  const cid = node.carrier.id;
  const p = cp(node.carrier);
  const mods = Object.fromEntries((node.mods || []).map(m => [m.id, mp(m)]));
  const base = fromPos || [caster.pos.x, 0, caster.pos.z];
  const ground = [origin[0], 0, origin[2]];
  const ess = ctx.ess;
  switch (cid) {
    case 'bolt': {
      const n = mods.volley ? mods.volley.count : 1;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? (i - (n - 1) / 2) * 0.2 : 0;
        spawnBolt(ctx, node, origin, rot(dir, a), p, mods);
      }
      fx.muzzle(ess, origin, dir);
      break;
    }
    case 'lob': {
      const n = mods.volley ? mods.volley.count : 1;
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? [(Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4] : [0, 0, 0];
        spawnLob(ctx, node, origin, [point[0] + spread[0], 0, point[2] + spread[2]], p, mods);
      }
      break;
    }
    case 'strike': {
      const n = mods.volley ? mods.volley.count : 1;
      for (let i = 0; i < n; i++) setTimeout0(ctx, i * 0.35, () => spawnStrike(ctx, node, [point[0] + (i ? (Math.random() - 0.5) * 1.6 : 0), 0, point[2] + (i ? (Math.random() - 0.5) * 1.6 : 0)], p, mods));
      break;
    }
    case 'nova': {
      const at = isRoot ? base : ground;
      const go = () => {
        const r = p.radius * (mods.charge ? 1.3 : 1);
        const targets = world.inCircle(at[0], at[2], r, f => f.team !== caster.team);
        fx.nova?.(ess, at, r);
        deliver(ctx, node, targets, at, { radius: r, origin: at, dir });
        if (mods.lingering) spawnZoneLike(ctx, node, at, r * 0.8, mods.lingering.dur, 0.3);
      };
      if (mods.delayed) { fx.telegraphCircle?.(ess, at, p.radius, mods.delayed.delay); setTimeout0(ctx, mods.delayed.delay, go); } else go();
      break;
    }
    case 'cone': {
      const at = isRoot ? base : ground;
      const ang = (p.angle * Math.PI) / 180, len = p.length;
      const targets = world.inCircle(at[0], at[2], len, f => f.team !== caster.team).filter(f => {
        const dx = f.pos.x - at[0], dz = f.pos.z - at[2];
        const a = Math.acos(Math.max(-1, Math.min(1, (dx * dir[0] + dz * dir[2]) / (Math.hypot(dx, dz) || 1))));
        return a <= ang / 2 + 0.15;
      });
      fx.coneBlast?.(ess, [at[0], 0, at[2]], dir, len, p.angle);
      deliver(ctx, node, targets, at, { origin: at, pushFrom: at, pullTo: at, dir });
      if (mods.lingering) spawnZoneLike(ctx, node, [at[0] + dir[0] * len * 0.5, 0, at[2] + dir[2] * len * 0.5], len * 0.4, mods.lingering.dur, 0.3);
      break;
    }
    case 'zone': case 'aura': {
      const follow = cid === 'aura';
      const at = follow ? base : (isRoot ? point : ground);
      const start = () => spawnZone(ctx, node, at, p.radius, p.dur, follow, mods);
      if (mods.delayed) { fx.telegraphCircle?.(ess, at, p.radius, mods.delayed.delay); setTimeout0(ctx, mods.delayed.delay, start); } else start();
      break;
    }
    case 'beam': spawnBeam(ctx, node, p, mods); break;
    case 'dash': spawnDash(ctx, node, dir, p, mods); break;
    case 'leap': spawnLeap(ctx, node, point, p, mods); break;
    case 'trap': {
      for (let i = 0; i < p.charges; i++) {
        const off = i === 0 ? [0, 0] : [Math.cos(i * 2.1) * 1.3, Math.sin(i * 2.1) * 1.3];
        spawnTrap(ctx, node, [(isRoot ? point : ground)[0] + off[0], 0, (isRoot ? point : ground)[2] + off[1]], p);
      }
      break;
    }
    case 'orbitals': spawnOrbitals(ctx, node, p, mods); break;
    case 'wall': spawnWall(ctx, node, isRoot ? [base[0] + dir[0] * 2.2, 0, base[2] + dir[2] * 2.2] : ground, dir, p); break;
    case 'tether': spawnTether(ctx, node, origin, dir, p); break;
    case 'self': {
      fx.selfBurst?.(ess, caster);
      deliver(ctx, node, [], [caster.pos.x, 0, caster.pos.z], { radius: 0 });
      break;
    }
    case 'imbue': {
      caster.imbue = { node, left: p.hits, ctx };
      caster.addStatus('imbue', 12, { ess });
      fx.selfBurst?.(ess, caster, 0.6);
      break;
    }
    case 'global': spawnGlobal(ctx, node, p); break;
    default: break;
  }
}

// ── Carriers ───────────────────────────────────────────────────────────
function spawnBolt(ctx, node, origin, dir, p, mods, o = {}) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const size = p.size * (mods.charge ? 1.4 : 1) * (o.scale ?? 1);
  const vis = fx.projectile(ctx.ess, Math.max(0.35, size), { grow: () => (mods.growing ? 1 + travelled / p.range : 1) });
  let pos = origin.slice(), d = dir.slice(), travelled = 0, returning = false;
  const hit = new Set();
  let bounces = mods.bounce ? mods.bounce.count : 0;
  let alive = true;
  const speed = p.speed;
  const lingerT = { t: 0 };
  let delivered = false;
  const near = new Set(); // enemies it grazed: a clean miss counts as their dodge
  const end = (at, withImpact = true) => {
    if (!alive) return;
    alive = false;
    for (const f of near) if (!hit.has(f) && f.alive) f.passiveHook?.('onDodge');
    if (withImpact) fx.impact(ctx.ess, at, Math.max(0.6, size * 1.1), 0.35);
    if (!delivered && !o.shard && !ctx.basic) deliver({ ...ctx }, { ...node, chain: null }, [], [at[0], 0, at[2]], { landed: true, origin: at });
    if (mods.split && !o.shard) {
      for (let i = 0; i < mods.split.count; i++) {
        const a = (i / mods.split.count) * Math.PI * 2;
        spawnBolt({ ...ctx, hitOnce: new Set() }, { ...node, chain: null }, [at[0], 0.8, at[2]], [Math.cos(a), 0, Math.sin(a)], { ...p, range: p.range * 0.35, size: p.size * 0.6 }, {}, { shard: true, scale: 0.7, ignore: hit });
      }
    }
    if (node.chain?.on === 'expire') spawnChild(ctx, node.chain, [at[0], 0, at[2]], d);
  };
  world.spawn({
    owner: caster,
    update(dt) {
      if (!alive) return false;
      // homing: steer toward the nearest enemy in front
      if (mods.homing) {
        const t = world.nearestEnemy(caster, 8);
        if (t) { const nd = norm(t.pos.x - pos[0], t.pos.z - pos[2]); d = norm(d[0] + (nd[0] - d[0]) * Math.min(1, dt * 5), d[2] + (nd[2] - d[2]) * Math.min(1, dt * 5)); }
      }
      if (returning) { const nd = norm(caster.pos.x - pos[0], caster.pos.z - pos[2]); d = nd; }
      const step = speed * dt;
      const next = [pos[0] + d[0] * step, pos[1], pos[2] + d[2] * step];
      if (!mods.ghost && world.segmentHitsWall(pos, next, 0.05) !== null) { end(next); return false; }
      // hit fighters
      const r = size * 0.5 + 0.35;
      for (const f of world.fighters) {
        if (!f.alive || f.team === caster.team || hit.has(f) || o.ignore?.has(f)) continue;
        const ds = distToSeg(f.pos.x, f.pos.z, pos, next);
        if (ds > r + f.radius) { if (ds < r + f.radius + 0.9 && f.kind === 'brawler') near.add(f); continue; }
        hit.add(f);
        delivered = true;
        const res = deliver({ ...ctx, projectile: true, reflect: tgt => { d = norm(-d[0], -d[2]); ctx.reflected = true; hit.clear(); } }, node, [f], [f.pos.x, 0, f.pos.z], { dir: d, origin: pos, scale: o.shard ? 0.5 : 1, pullTo: [caster.pos.x, 0, caster.pos.z] });
        fx.impact(ctx.ess, [f.pos.x, 0.8, f.pos.z], Math.max(0.6, size * 1.2), 0.45);
        if (bounces > 0) {
          bounces--;
          const nxt = world.fighters.filter(g => g.alive && g.team !== caster.team && !hit.has(g) && Math.hypot(g.pos.x - f.pos.x, g.pos.z - f.pos.z) < 6).sort((a, b) => Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z) - Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z))[0];
          if (nxt) { fx.chainArc?.(ctx.ess, [f.pos.x, 0.8, f.pos.z], [nxt.pos.x, 0.8, nxt.pos.z]); d = norm(nxt.pos.x - f.pos.x, nxt.pos.z - f.pos.z); pos = [f.pos.x, pos[1], f.pos.z]; travelled = 0; return true; }
        }
        if (!mods.pierce) { end(next, false); if (mods.split && !o.shard) {} return false; }
      }
      pos = next;
      travelled += step;
      if (mods.lingering) { lingerT.t += dt; if (lingerT.t > 0.25) { lingerT.t = 0; spawnZoneLike(ctx, node, [pos[0], 0, pos[2]], 0.7, mods.lingering.dur, 0.3); } }
      vis.update(dt, pos, [d[0] * speed, 0, d[2] * speed]);
      if (travelled >= p.range) {
        if (mods.boomerang && !returning) { returning = true; travelled = 0; hit.clear(); return true; }
        end(pos);
        return false;
      }
      if (returning && Math.hypot(caster.pos.x - pos[0], caster.pos.z - pos[2]) < 0.6) { alive = false; return false; }
      return true;
    },
    dispose() { vis.stop(); },
  });
}

function distToSeg(x, z, a, b) {
  const vx = b[0] - a[0], vz = b[2] - a[2];
  const l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[2]) * vz) / l2));
  return Math.hypot(x - (a[0] + vx * t), z - (a[2] + vz * t));
}

function spawnLob(ctx, node, origin, target, p, mods) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const vis = fx.projectile(ctx.ess, 0.6);
  const dur = 0.55 + Math.hypot(target[0] - origin[0], target[2] - origin[2]) * 0.03;
  const tele = fx.push(L.telegraph(world.scene, { pos: target, radius: p.radius, color: STYLE[ctx.ess].color, dur }));
  let t = 0;
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt;
      const k = Math.min(1, t / dur);
      const pos = [origin[0] + (target[0] - origin[0]) * k, origin[1] + Math.sin(k * Math.PI) * 3 * (1 - k * 0.3), origin[2] + (target[2] - origin[2]) * k];
      vis.update(dt, pos, [(target[0] - origin[0]) / dur, (1 - 2 * k) * 6, (target[2] - origin[2]) / dur]);
      if (k >= 1) {
        const go = () => {
          const targets = world.inCircle(target[0], target[2], p.radius, f => f.team !== caster.team);
          fx.impact(ctx.ess, [target[0], 0.4, target[2]], p.radius, 0.7);
          deliver(ctx, node, targets, target, { radius: p.radius, origin: target, pushFrom: target, pullTo: target });
          if (mods.lingering) spawnZoneLike(ctx, node, target, p.radius * 0.8, mods.lingering.dur, 0.3);
        };
        if (mods.delayed) { fx.telegraphCircle?.(ctx.ess, target, p.radius, mods.delayed.delay); setTimeout0(ctx, mods.delayed.delay, go); } else go();
        return false;
      }
      return true;
    },
    dispose() { vis.stop(); tele.kill?.(); },
  });
}

function spawnStrike(ctx, node, at, p, mods) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  fx.push(L.telegraph(world.scene, { pos: at, radius: p.radius, color: STYLE[ctx.ess].color, dur: p.delay }));
  fx.skyFall?.(ctx.ess, at, p.radius, p.delay);
  setTimeout0(ctx, p.delay, () => {
    const targets = world.inCircle(at[0], at[2], p.radius, f => f.team !== caster.team);
    fx.impact(ctx.ess, [at[0], 0.4, at[2]], p.radius, 0.85);
    deliver(ctx, node, targets, at, { radius: p.radius, origin: at, pushFrom: at, pullTo: at });
    if (mods.lingering) spawnZoneLike(ctx, node, at, p.radius * 0.8, mods.lingering.dur, 0.3);
  });
}

// Persistent area that ticks its payload.
function spawnZone(ctx, node, at, radius, dur, follow, mods = {}) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const pos = at.slice();
  let t = 0, acc = 0;
  const R = () => radius * (mods.growing ? 1 + 0.6 * Math.min(1, t / dur) : 1);
  const vis = fx.zoneVisual?.(ctx.ess, pos, radius, dur, { follow: follow ? () => [caster.pos.x, 0, caster.pos.z] : null, kind: node.carrier.id, atoms: node.atoms, grow: () => R() / radius });
  const tctx = { ...ctx, hitOnce: new Set() };
  const tick = 0.5;
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt; acc += dt;
      if (follow) { pos[0] = caster.pos.x; pos[2] = caster.pos.z; }
      if (acc >= tick) {
        acc -= tick;
        const targets = world.inCircle(pos[0], pos[2], R(), f => f.team !== caster.team);
        deliver(tctx, node, targets, pos, { tick, dur, radius: R(), origin: pos, pullTo: pos, pushFrom: pos });
      }
      if (t >= dur || (follow && !caster.alive)) {
        if (node.chain?.on === 'expire') spawnChild(ctx, node.chain, pos.slice(), [0, 0, 1]);
        return false;
      }
      return true;
    },
    dispose() { vis?.kill?.(); },
  });
  // first touch lands immediately so CC feels responsive
  const first = world.inCircle(pos[0], pos[2], radius, f => f.team !== caster.team);
  deliver(tctx, node, first, pos, { tick, dur, radius, origin: pos, noHelp: false, pullTo: pos, pushFrom: pos });
}

// Lingering trail/afterglow: re-applies a node's payload at reduced strength.
function spawnZoneLike(ctx, node, at, radius, dur, scale) {
  const world = ctx.world, caster = ctx.caster;
  const pos = at.slice();
  let t = 0, acc = 0;
  const vis = world.fx.afterglow?.(ctx.ess, pos, radius, dur);
  const tctx = { ...ctx, hitOnce: new Set(), scale };
  const tnode = { ...node, chain: null, atoms: node.atoms.filter(a => ['damage', 'dot', 'slow'].includes(a.id)) };
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt; acc += dt;
      if (acc >= 0.5) { acc -= 0.5; deliver(tctx, tnode, world.inCircle(pos[0], pos[2], radius, f => f.team !== caster.team), pos, { tick: 0.5, dur, scale, noHelp: true }); }
      return t < dur;
    },
    dispose() { vis?.kill?.(); },
  });
}

function spawnBeam(ctx, node, p, mods) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  let t = 0, acc = 0;
  const ends = () => {
    const h = caster.handPos();
    const d = [caster.aimDir.x, 0, caster.aimDir.y];
    let len = p.length;
    const far = [h[0] + d[0] * len, h[1], h[2] + d[2] * len];
    const hitT = mods.ghost ? null : world.segmentHitsWall(h, far, 0.05);
    if (hitT !== null) len *= hitT;
    return [h, [h[0] + d[0] * len, h[1] - 0.1, h[2] + d[2] * len]];
  };
  const vis = fx.beamVisual?.(ctx.ess, ends, 0.22 * (mods.charge ? 1.4 : 1), p.dur);
  const tctx = { ...ctx, hitOnce: new Set() };
  caster.channeling = true;
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt; acc += dt;
      caster.setAction('cast', 0.6, 'R');
      caster.action.t = 0.3;
      if (acc >= 0.25) {
        acc -= 0.25;
        const [a, b] = ends();
        const targets = world.fighters.filter(f => f.alive && f.team !== caster.team && distToSeg(f.pos.x, f.pos.z, a, b) < f.radius + 0.35);
        deliver(tctx, node, targets, b, { tick: 0.25, dur: p.dur, origin: a, pushFrom: a, pullTo: a });
        if (mods.bounce) targets.slice(0, 1).forEach(f => {
          const n = world.fighters.find(g => g.alive && g.team !== caster.team && g !== f && Math.hypot(g.pos.x - f.pos.x, g.pos.z - f.pos.z) < 5);
          if (n) { fx.chainArc?.(ctx.ess, [f.pos.x, 0.8, f.pos.z], [n.pos.x, 0.8, n.pos.z]); deliver(tctx, node, [n], [n.pos.x, 0, n.pos.z], { tick: 0.25, dur: p.dur }); }
        });
      }
      if (t >= p.dur || !caster.alive || !caster.canAct()) {
        caster.channeling = false;
        if (node.chain?.on === 'expire') { const [, b] = ends(); spawnChild(ctx, node.chain, [b[0], 0, b[2]], [caster.aimDir.x, 0, caster.aimDir.y]); }
        return false;
      }
      return true;
    },
    dispose() { vis?.kill?.(); caster.channeling = false; },
  });
}

function spawnDash(ctx, node, dir, p, mods) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const speed = 20, dur = p.dist / speed;
  const hit = new Set();
  let ghostT = 0;
  const start = [caster.pos.x, 0, caster.pos.z];
  fx.dashStart?.(ctx.ess, caster, dir);
  caster.dashing = {
    dir, speed, dur, t: 0,
    onStep: dt => {
      ghostT += dt;
      if (ghostT > 0.06) { ghostT = 0; fx.afterimage(caster, ctx.ess, 0.55); fx.trailPuff?.(ctx.ess, caster.center(), 0.9, [dir[0] * 10, 0, dir[2] * 10]); }
      fx.motif(ctx.ess, 'trail', caster.center(), 0.6, 0, [dir[0] * 10, 0, dir[2] * 10]);
      for (const f of world.fighters) {
        if (!f.alive || f.team === caster.team || hit.has(f)) continue;
        if (Math.hypot(f.pos.x - caster.pos.x, f.pos.z - caster.pos.z) < f.radius + caster.radius + 0.3) {
          hit.add(f);
          fx.impact(ctx.ess, f.center(), 0.9, 0.5);
          deliver(ctx, node, [f], [f.pos.x, 0, f.pos.z], { dir, origin: [caster.pos.x, 0, caster.pos.z], pushFrom: [caster.pos.x, 0, caster.pos.z], pullTo: [caster.pos.x, 0, caster.pos.z] });
          if (!mods.pierce && !mods.ghost) { /* keep going: dashes pass through by default */ }
        }
      }
    },
    onEnd: () => {
      fx.dashEnd?.(ctx.ess, caster);
      deliver(ctx, { ...node, atoms: node.atoms.filter(a => whoOf(a.id) !== 'enemies'), chain: null }, [], [caster.pos.x, 0, caster.pos.z], { noHelp: false });
      if (node.chain?.on === 'end') spawnChild(ctx, node.chain, [caster.pos.x, 0, caster.pos.z], dir);
      if (mods.lingering) spawnZoneLike(ctx, node, [(start[0] + caster.pos.x) / 2, 0, (start[2] + caster.pos.z) / 2], p.dist / 2, mods.lingering.dur, 0.3);
    },
  };
  caster.setAction('dash', dur + 0.15);
}

function spawnLeap(ctx, node, point, p, mods) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const from = [caster.pos.x, 0, caster.pos.z];
  const dur = 0.5 + Math.hypot(point[0] - from[0], point[2] - from[2]) * 0.03;
  fx.push(L.telegraph(world.scene, { pos: point, radius: p.radius, color: STYLE[ctx.ess].color, dur }));
  fx.dashStart?.(ctx.ess, caster, norm(point[0] - from[0], point[2] - from[2]));
  caster.leap = {
    from, to: point, t: 0, dur, height: 2.4,
    onLand: () => {
      const targets = world.inCircle(point[0], point[2], p.radius, f => f.team !== caster.team);
      fx.impact(ctx.ess, [point[0], 0.3, point[2]], p.radius, 0.9);
      fx.slamCracks?.(ctx.ess, point, p.radius);
      deliver(ctx, node, targets, point, { radius: p.radius, origin: point, pushFrom: point, pullTo: point });
      if (node.chain?.on === 'end') spawnChild(ctx, node.chain, point, [0, 0, 1]);
      if (mods.lingering) spawnZoneLike(ctx, node, point, p.radius * 0.8, mods.lingering.dur, 0.3);
    },
  };
}

function spawnTrap(ctx, node, at, p) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const vis = fx.trapVisual?.(ctx.ess, at, p.radius);
  let t = 0;
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt;
      if (t > 0.6) {
        const targets = world.inCircle(at[0], at[2], p.radius, f => f.team !== caster.team);
        if (targets.length) {
          fx.impact(ctx.ess, [at[0], 0.4, at[2]], p.radius, 0.75);
          deliver(ctx, node, targets, at, { radius: p.radius, origin: at, pushFrom: at, pullTo: at });
          return false;
        }
      }
      return t < 14;
    },
    dispose() { vis?.kill?.(); },
  });
}

function spawnOrbitals(ctx, node, p, mods) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const orbs = [];
  for (let i = 0; i < p.count; i++) orbs.push({ a: (i / p.count) * Math.PI * 2, vis: fx.projectile(ctx.ess, 0.62), cool: new Map() });
  fx.selfBurst?.(ctx.ess, caster, 0.7);
  let t = 0;
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt;
      for (const o of orbs) {
        o.a += dt * 3.2;
        const r = 1.25;
        const pos = [caster.pos.x + Math.cos(o.a) * r, 0.85, caster.pos.z + Math.sin(o.a) * r];
        o.vis.update(dt, pos, [-Math.sin(o.a) * 4, 0, Math.cos(o.a) * 4]);
        for (const f of world.fighters) {
          if (!f.alive || f.team === caster.team) continue;
          if (Math.hypot(f.pos.x - pos[0], f.pos.z - pos[2]) < f.radius + 0.35 && (o.cool.get(f) ?? 0) <= t) {
            o.cool.set(f, t + 0.6);
            fx.impact(ctx.ess, [pos[0], 0.8, pos[2]], 0.6, 0.3);
            deliver({ ...ctx, hitOnce: new Set() }, node, [f], pos, { origin: pos, pushFrom: pos, scale: 0.5 });
          }
        }
      }
      if (t >= p.dur || !caster.alive) { if (node.chain?.on === 'expire') spawnChild(ctx, node.chain, [caster.pos.x, 0, caster.pos.z], [0, 0, 1]); return false; }
      return true;
    },
    dispose() { orbs.forEach(o => o.vis.stop()); },
  });
}

function spawnWall(ctx, node, center, dir, p) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const perp = [-dir[2], 0, dir[0]];
  const n = Math.max(2, Math.round(p.length / 0.8));
  const blocks = [];
  for (let i = 0; i < n; i++) {
    const k = (i / (n - 1) - 0.5) * p.length;
    const b = { x: center[0] + perp[0] * k, z: center[2] + perp[2] * k, hx: 0.42, hz: 0.42, dead: false, passable: who => who && who.team === caster.team };
    blocks.push(b);
    world.dynWalls.push(b);
  }
  const vis = fx.wallVisual?.(ctx.ess, center, perp, p.length, p.dur);
  const tctx = { ...ctx, hitOnce: new Set() };
  let t = 0, acc = 0;
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt; acc += dt;
      if (acc >= 0.5) {
        acc -= 0.5;
        const targets = world.fighters.filter(f => f.alive && f.team !== caster.team && blocks.some(b => Math.hypot(f.pos.x - b.x, f.pos.z - b.z) < 1.0));
        deliver(tctx, node, targets, center, { tick: 0.5, dur: p.dur, origin: center, pushFrom: center, pullTo: center });
      }
      if (t >= p.dur) { if (node.chain?.on === 'expire') spawnChild(ctx, node.chain, center, dir); return false; }
      return true;
    },
    dispose() { blocks.forEach(b => { b.dead = true; }); vis?.kill?.(); },
  });
}

function spawnTether(ctx, node, origin, dir, p) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  // hook flies out; latches onto the first enemy
  let pos = origin.slice(), travelled = 0, target = null, t = 0, acc = 0;
  const vis = fx.projectile(ctx.ess, 0.35);
  let chain = null;
  const tctx = { ...ctx, hitOnce: new Set() };
  world.spawn({
    owner: caster,
    update(dt) {
      if (!target) {
        const step = 16 * dt;
        const next = [pos[0] + dir[0] * step, pos[1], pos[2] + dir[2] * step];
        const f = world.fighters.find(g => g.alive && g.team !== caster.team && distToSeg(g.pos.x, g.pos.z, pos, next) < g.radius + 0.3);
        pos = next; travelled += step;
        vis.update(dt, pos, [dir[0] * 16, 0, dir[2] * 16]);
        if (f) {
          target = f;
          vis.stop();
          chain = fx.tetherVisual?.(ctx.ess, () => (target.alive && caster.alive ? [caster.handPos(), target.center()] : null));
          fx.impact(ctx.ess, f.center(), 0.7, 0.4);
          deliver(tctx, node, [f], [f.pos.x, 0, f.pos.z], { tick: 0.5, dur: p.dur, origin: [caster.pos.x, 0, caster.pos.z], pullTo: [caster.pos.x, 0, caster.pos.z], pushFrom: [caster.pos.x, 0, caster.pos.z] });
        } else if (travelled >= p.range || world.segmentHitsWall(pos, next, 0.05) !== null) { vis.stop(); return false; }
        return true;
      }
      t += dt; acc += dt;
      if (acc >= 0.5) { acc -= 0.5; deliver(tctx, node, target.alive ? [target] : [], [target.pos.x, 0, target.pos.z], { tick: 0.5, dur: p.dur, origin: [caster.pos.x, 0, caster.pos.z], pullTo: [caster.pos.x, 0, caster.pos.z] }); }
      const d = Math.hypot(target.pos.x - caster.pos.x, target.pos.z - caster.pos.z);
      if (t >= p.dur || !target.alive || !caster.alive || d > p.range + 3) {
        if (node.chain?.on === 'expire') spawnChild(ctx, node.chain, [target.pos.x, 0, target.pos.z], dir);
        return false;
      }
      return true;
    },
    dispose() { if (!target) vis.stop(); chain?.kill?.(); },
  });
}

function spawnGlobal(ctx, node, p) {
  const world = ctx.world, fx = world.fx, caster = ctx.caster;
  const stop = node.atoms.find(a => a.id === 'clockStop');
  if (stop) {
    const dur = atomParams(stop).dur;
    world.globalStop = { caster, t: 0, dur, onEnd: () => fx.timeResume?.(caster) };
    fx.timeStop?.(caster, dur);
  }
  const vis = fx.globalVisual?.(ctx.ess, p.dur, caster);
  const tctx = { ...ctx, hitOnce: new Set() };
  let t = 0, acc = 0;
  const once = { ...node, atoms: node.atoms.filter(a => a.id !== 'clockStop') };
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt; acc += dt;
      if (acc >= 0.5) {
        acc -= 0.5;
        deliver(tctx, once, world.enemiesOf(caster), [caster.pos.x, 0, caster.pos.z], { tick: 0.5, dur: p.dur, radius: 99, origin: [caster.pos.x, 0, caster.pos.z], pullTo: [caster.pos.x, 0, caster.pos.z] });
      }
      return t < p.dur;
    },
    dispose() { vis?.kill?.(); },
  });
  if (stop) for (const f of world.enemiesOf(caster)) f.addStatus('timestop', atomParams(stop).dur, { ess: ctx.ess, onEnd: () => {
    const dmg = f.stored; f.stored = 0;
    if (dmg > 0 && f.alive) { f.takeDamage(dmg, caster, { ess: ctx.ess, release: true, crit: true }); fx.impact(ctx.ess, f.center(), 1.1, 0.9); }
  } });
}

// Terrain atom: an essence-flavored patch of ground.
function spawnTerrain(ctx, atom, at) {
  const p = atomParams(atom);
  const world = ctx.world, caster = ctx.caster;
  const ess = ctx.essences.find(e => e) || ctx.ess;
  const vis = world.fx.zoneVisual?.(ess, at.slice(), p.size, p.dur, { kind: 'terrain' });
  let t = 0, acc = 0;
  const effects = {
    fire: f => f.takeDamage(20, caster, { ess: 'fire', dot: true }), storm: f => f.takeDamage(15, caster, { ess: 'storm', dot: true }),
    frost: f => f.addStatus('slow', 0.6, { pct: 35 }), tide: f => f.addStatus('slow', 0.6, { pct: 30 }), time: f => f.addStatus('clockSlow', 0.6, { pct: 50 }),
    life: f => f.addStatus('root', 0.8), void: f => f.addStatus('silence', 0.6), shadow: f => f.addStatus('blind', 0.6), death: f => f.addStatus('slow', 0.6, { pct: 15 }),
    gale: f => { if (!f.statuses.launch) f.addStatus('launch', 0.6); }, space: f => f.knock(at[0] - f.pos.x, at[2] - f.pos.z, 3),
  };
  world.spawn({
    owner: caster,
    update(dt) {
      t += dt; acc += dt;
      if (acc >= 0.5) {
        acc -= 0.5;
        for (const f of world.inCircle(at[0], at[2], p.size, f => f.team !== caster.team)) effects[ess]?.(f);
        if (ess === 'light' || ess === 'blood') for (const f of world.inCircle(at[0], at[2], p.size, f => f.team === caster.team)) f.heal(25, { quiet: true });
      }
      return t < p.dur;
    },
    dispose() { vis?.kill?.(); },
  });
}

// A plain damaging bolt (minions, clones, transformed casters).
export function shootBolt(game, caster, ess, dir, dmg, size = 0.4, o = {}) {
  const node = { carrier: { id: 'bolt', s: {} }, mods: [], atoms: [{ id: 'damage', s: {}, raw: { amount: dmg } }], chain: null };
  const ctx = ctxFor(game, caster, { essences: [ess], root: node }, { basic: true });
  const h = caster.handPos();
  game.world.fx.muzzle(ess, h, norm(dir[0], dir[2]));
  spawnBolt(ctx, node, h, norm(dir[0], dir[2]), { range: o.range ?? 7.5, size, speed: o.speed ?? 16 }, o.mods || {});
}

// Transformed brawlers attack the way their form does (the card's promise:
// dragons breathe fire, colossi slam, seraphs throw piercing lances...).
const FORM_ATTACK = {
  fire:   { c: 'cone', p: { length: 4.5, angle: 55 }, extra: [{ id: 'dot', raw: { dps: 70, dur: 2 } }], k: 0.75 },
  frost:  { c: 'bolt', p: { range: 7.5, size: 0.5, speed: 18 }, mods: [{ id: 'volley', raw: { count: 3 } }], extra: [{ id: 'slow', raw: { pct: 30, dur: 1.5 } }], k: 0.5 },
  storm:  { c: 'bolt', p: { range: 8, size: 0.45, speed: 22 }, mods: [{ id: 'bounce', raw: { count: 3 } }], k: 0.8 },
  stone:  { c: 'nova', p: { radius: 2.1 }, ahead: 1.6, extra: [{ id: 'push', raw: { dist: 2 } }], k: 1 },
  tide:   { c: 'cone', p: { length: 4.2, angle: 75 }, extra: [{ id: 'push', raw: { dist: 2.5 } }], k: 0.8 },
  gale:   { c: 'bolt', p: { range: 8, size: 0.6, speed: 18 }, extra: [{ id: 'launch', raw: { dur: 0.5 } }], k: 0.75 },
  light:  { c: 'bolt', p: { range: 10, size: 0.9, speed: 26 }, mods: [{ id: 'pierce', raw: {} }], k: 0.95 },
  shadow: { c: 'cone', p: { length: 2, angle: 120 }, lifesteal: 30, k: 1.1 },
  life:   { c: 'bolt', p: { range: 7.5, size: 0.5, speed: 17 }, extra: [{ id: 'root', raw: { dur: 0.6 } }], k: 0.75 },
  death:  { c: 'bolt', p: { range: 8, size: 0.55, speed: 16 }, extra: [{ id: 'dot', raw: { dps: 80, dur: 2.5 } }], k: 0.6 },
  blood:  { c: 'cone', p: { length: 2, angle: 120 }, lifesteal: 40, k: 1.1 },
  mind:   { c: 'bolt', p: { range: 8, size: 0.55, speed: 18 }, extra: [{ id: 'confuse', raw: { dur: 1 } }], k: 0.75 },
  time:   { c: 'bolt', p: { range: 8, size: 0.5, speed: 18 }, extra: [{ id: 'mark', raw: { delay: 1, amount: 120 } }], k: 0.7 },
  space:  { c: 'bolt', p: { range: 8, size: 0.55, speed: 20 }, extra: [{ id: 'pull', raw: { dist: 2 } }], k: 0.85 },
  beast:  { c: 'cone', p: { length: 2, angle: 120 }, extra: [{ id: 'dot', raw: { dps: 60, dur: 2 } }], k: 1.1 },
  void:   { c: 'bolt', p: { range: 8, size: 0.55, speed: 20 }, extra: [{ id: 'silence', raw: { dur: 1 } }], k: 0.8 },
};

function formAttack(game, caster, dir) {
  const ess = caster.form.ess;
  const F = FORM_ATTACK[ess] || FORM_ATTACK.fire;
  const node = {
    carrier: { id: F.c, s: {}, raw: F.p },
    mods: (F.mods || []).map(m => ({ ...m, s: {} })),
    atoms: [{ id: 'damage', s: {}, raw: { amount: Math.round((caster.basicDamage ?? 260) * F.k) } }, ...(F.extra || []).map(a => ({ ...a, s: {} }))],
    chain: null,
  };
  if (F.lifesteal) node.atoms.push({ id: 'lifesteal', s: {}, raw: { pct: F.lifesteal } });
  const ctx = ctxFor(game, caster, { essences: [ess], root: node }, { basic: true });
  caster.ammo--;
  caster.attackCd = 0.42;
  caster.setAction(F.c === 'bolt' ? 'cast' : 'punch', 0.45, 'R');
  const d = norm(dir[0], dir[2]);
  caster.aimDir.set(d[0], d[2]);
  setTimeout0(ctx, 0.1, () => {
    if (!caster.alive) return;
    const ahead = F.ahead ?? 0;
    const at = [caster.pos.x + d[0] * ahead, 0.9, caster.pos.z + d[2] * ahead];
    runNode(ctx, node, F.c === 'bolt' ? caster.handPos() : at, d, at, false, [caster.pos.x, 0, caster.pos.z]);
  });
  return true;
}

// Basic attack: a quick rune bolt from the gauntlet (or an imbued strike).
export function basicAttack(game, caster, dir) {
  if (!caster.canAct() || caster.ammo <= 0 || caster.attackCd > 0 || caster.channeling) return false;
  if (caster.form) return formAttack(game, caster, dir);
  caster.ammo--;
  caster.attackCd = 0.38;
  caster.setAction('punch', 0.4, 'R');
  caster.aimDir.set(dir[0], dir[2]);
  const world = game.world;
  const ess = caster.imbue ? caster.imbue.ctx.ess : caster.essence;
  const node = caster.imbue ? caster.imbue.node : { carrier: { id: 'bolt', s: {} }, mods: [], atoms: [{ id: 'damage', s: {} }], chain: null };
  const ctx = caster.imbue ? { ...caster.imbue.ctx, hitOnce: new Set(), basic: true } : ctxFor(game, caster, { essences: [ess], root: node }, { basic: true });
  if (caster.imbue && --caster.imbue.left <= 0) { caster.imbue = null; caster.removeStatus('imbue'); }
  setTimeout0(ctx, 0.12, () => {
    const h = caster.handPos();
    const p = { range: 7.5, size: 0.42, speed: 17 };
    world.fx.muzzle(ess, h, [dir[0], 0, dir[2]]);
    const basicNode = { ...node, atoms: [{ id: 'damage', s: {}, raw: { amount: caster.basicDamage ?? 260 } }, ...node.atoms.filter(a => a.id !== 'damage')] };
    spawnBolt(ctx, basicNode, h, norm(dir[0], dir[2]), p, {});
  });
  return true;
}
