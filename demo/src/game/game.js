// Match orchestration without any DOM: spawns brawlers, gives them powers,
// runs passive triggers, summons, deaths and respawns. The HUD, input, menus
// and LAN sync (main.js, net/) sit on top of this.

import { World } from './world.js';
import { buildHero } from '../art/heroes.js';
import { Fighter } from './fighter.js';
import { PowerSlot, castPower, basicAttack, shootBolt } from './powers.js';
import { atomParams } from './atoms.js';
import { summonMinions, summonClones, summonTitan, raiseDead, transformInto, makeCritter, loadCreatures, prebake } from './summons.js';

export const TEAM_COLORS = ['#3fa9ff', '#ff4a5a'];
export const HERO_CELL = 0.019;

export class Game {
  constructor(stage, arena, opts = {}) {
    this.stage = stage;
    this.arena = arena;
    this.world = new World(stage, arena);
    this.world.game = this;
    this.world.playerTeam = 0;
    this.world.fx.makeCritter = ess => makeCritter(ess);
    this.brawlers = [];
    this.summons = [];
    this.corpses = [];
    this.respawnTime = opts.respawnTime ?? 3;
    this.spawns = opts.spawns || [[[0, 0, 8.5], [-3, 0, 8], [3, 0, 8]], [[0, 0, -8.5], [3, 0, -8], [-3, 0, -8]]];
    this.score = [0, 0];
    this.paused = false;
    this.replica = false; // LAN joiner: shows the host's match (see net/sync.js)
    const ev = this.world.events;
    ev.on('death', ({ target, src }) => this.onDeath(target, src));
  }

  static async preload() { await loadCreatures(); }

  // ── brawlers ─────────────────────────────────────────────────────────
  // Replaces every brawler (a new match or a new lobby lineup). Summons,
  // lingering power entities and walls from the last match go too.
  setRoster(roster) {
    const w = this.world;
    for (const f of [...this.brawlers, ...this.summons]) f.dispose();
    for (const e of w.entities) e.dispose?.();
    w.entities.length = 0;
    w.fighters.length = 0;
    w.dynWalls.length = 0;
    w.globalStop = null;
    w.timeScale = 1;
    this.brawlers = [];
    this.summons = [];
    this.corpses = [];
    this.score = [0, 0];
    const slots = [0, 0];
    for (const r of roster) this.addBrawler({ ...r, slot: slots[r.team ?? 0]++ });
    return this.brawlers;
  }

  addBrawler(o) {
    const team = o.team ?? 0;
    const slot = o.slot ?? this.brawlers.filter(b => b.team === team).length;
    const sp = this.spawns[team][slot % this.spawns[team].length];
    // gameplay meshes are a little coarser than close-up ones: identical at game zoom, half the triangles
    const model = buildHero(o.hero || 'kai', { cell: o.cell ?? HERO_CELL });
    const f = new Fighter(this.world, { id: o.id, hero: o.hero, model, team, name: o.name, isPlayer: o.isPlayer, x: sp[0], z: sp[2], facing: team === 0 ? Math.PI : 0, essence: o.essence, maxHp: o.maxHp ?? 1600 });
    f.spawnSlot = slot;
    f.control = o.control || 'bot';   // local | bot | remote (host: a joiner plays it) | puppet (joiner: someone else plays it)
    f.peer = o.peer ?? null;
    f.remote = f.control === 'remote';
    f.puppet = f.control === 'puppet';
    f.level = 1; f.xp = 0; f.offers = [];
    f.basicDamage = o.basicDamage ?? 260;
    f.passiveHook = (ev, data) => this.trigger(f, ev, data);
    this.world.add(f);
    this.brawlers.push(f);
    return f;
  }

  givePower(f, dna) {
    const slot = new PowerSlot(dna);
    if (slot.passive) {
      slot.cdMax = Math.max(dna.stats.cooldown ?? 8, 4);
      if (dna.trigger === 'every') slot.cd = slot.cdMax * 0.5;
    }
    f.powers.push(slot);
    if (!f.essenceLocked) f.essence = dna.essences[0];
    return slot;
  }

  // Bake every creature the current powers can summon, transform into or hex into.
  prebakeCreatures(onStep) { return prebake(this.brawlers.flatMap(f => f.powers.map(p => p.dna)), onStep); }
  prebakeFor(dna) { return prebake([dna]); }

  // A level-up choice (a LAN client routes this to the host instead).
  choose(f, offerId, i) { return this.match?.pick(f, i, offerId); }

  cast(f, slot, aim) { return castPower(this, f, slot, aim); }
  attack(f, dir) { return basicAttack(this, f, dir); }
  shootBolt(f, ess, dir, dmg, size, o) { shootBolt(this, f, ess, dir, dmg, size, o); }

  // Aim a fighter's power at a target: lead moving targets a little.
  aimAt(f, target, slot = null) {
    const lead = 0.25;
    const tx = target.pos.x + target.vel.x * lead, tz = target.pos.z + target.vel.z * lead;
    const d = [tx - f.pos.x, 0, tz - f.pos.z];
    return { dir: d, point: [tx, 0, tz] };
  }

  // ── passive triggers ─────────────────────────────────────────────────
  trigger(f, ev, data) {
    if (this.replica || (!f.alive && ev !== 'onDeath')) return false;
    let saved = false;
    for (const slot of f.powers) {
      if (!slot.passive || slot.dna.trigger !== ev || slot.cd > 0 || slot.uses <= 0 || slot.stolen) continue;
      if (ev === 'onDeath') {
        if (slot.usedDeath) continue;
        slot.usedDeath = true;
        const res = slot.dna.root.atoms.find(a => a.id === 'resurrect');
        if (res) {
          saved = true;
          f.hp = Math.max(1, f.maxHp * atomParams(res).hpPct / 100);
          this.world.show('selfBurst', slot.ess, f, 1.5);
          this.world.show('flash', '#ffffff', 0.4);
          this.world.events.emit('resurrect', { target: f });
        }
      }
      this.autoCast(f, slot, ev === 'onDeath');
    }
    return saved;
  }

  autoCast(f, slot, force = false) {
    const t = this.world.nearestEnemy(f, 12);
    const aim = t ? this.aimAt(f, t) : { dir: [f.aimDir.x, 0, f.aimDir.y], point: null };
    const was = f.statuses;
    if (force && !f.canAct()) {
      // death triggers fire even while stunned
      f.statuses = {};
      castPower(this, f, slot, aim);
      f.statuses = was;
    } else castPower(this, f, slot, aim);
    this.world.events.emit('passive', { caster: f, slot });
  }

  // ── power hooks (called from powers.js / atoms.js) ────────────────────
  summon(ctx, atom, where) {
    const p = atomParams(atom);
    const ess = ctx.ess;
    const at = where || [ctx.caster.pos.x, 0, ctx.caster.pos.z];
    if (atom.id === 'summon') summonMinions(this, ctx, p.count, p.dur, p.pow, at, ess);
    else if (atom.id === 'clone') summonClones(this, ctx, p.count, p.dur, p.dmg, ess);
    else if (atom.id === 'titan') summonTitan(this, ctx, p.hp, p.dur, at, ess);
  }
  raise(ctx, atom, where, radius) {
    const p = atomParams(atom);
    raiseDead(this, ctx, p.count, p.dur, p.hpPct, where || [ctx.caster.pos.x, 0, ctx.caster.pos.z], radius);
  }
  transform(who, ess, dur, bonus) { transformInto(this, who, ess, dur, bonus); }
  addSummon(f) { this.summons.push(f); }

  // ── deaths and respawns ──────────────────────────────────────────────
  onDeath(f, src) {
    this.corpses.push({ x: f.pos.x, z: f.pos.z, t: this.world.time });
    if (this.corpses.length > 12) this.corpses.shift();
    if (f.kind === 'brawler' || f.kind === 'titan') {
      // knockout burst: the brawler's own essence, a shockwave and a soul rising
      const fx = this.world.fx, c = f.center();
      fx.impact(f.essence, c, 1.3, 0.8);
      fx.motes(f.essence, c, 20, 0.6, { sprite: 'soul', up: 2.5, size: 2 });
      this.world.events.emit('ko', { target: f, src });
    }
    if (f.kind === 'brawler') {
      const killer = src?.owner || src;
      if (!this.replica) {
        if (killer && killer.team !== f.team) this.score[killer.team]++;
        f.respawnT = this.respawnTime + Math.max(0, (f.level || 1) - 4) * 0.5;
      }
      if (f.form) f.removeStatus('form');
    }
  }

  respawn(f, first = false) {
    const sp = this.spawns[f.team][f.spawnSlot % this.spawns[f.team].length];
    if (first) f.alive = false;
    f.revive(1, sp);
    f.clearStatuses();
    f.push.set(0, 0, 0);
    f.vel.set(0, 0, 0);
    f.ammo = f.ammoMax;
    f.history.length = 0;
    f.facing = f.team === 0 ? Math.PI : 0;
    f.addStatus('shield', 1.5, { ess: 'light' });
    f.shieldHp = 400; f.shieldT = 1.5;
    f.warp++;
    this.world.fx.teleport?.(f.essence, f.center());
    this.world.events.emit('respawn', { f, first });
  }

  update(dt) {
    if (this.paused) return;
    this.world.update(dt);
    this.match?.update(dt);
    if (!this.replica) for (const f of this.brawlers) {
      if (!f.alive && f.respawnT !== undefined && f.respawnT !== null) {
        f.respawnT -= dt;
        if (f.respawnT <= 0) { f.respawnT = null; this.respawn(f); }
      }
      if (f.alive) for (const slot of f.powers) {
        if (slot.passive && slot.dna.trigger === 'every' && slot.cd <= 0 && f.canAct() && this.world.nearestEnemy(f, 10)) this.autoCast(f, slot);
      }
    }
    // clear dead summons once their dissolve finished
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const s = this.summons[i];
      if (!s.alive && s.deadT > 1.6) {
        s.dispose();
        this.world.fighters.splice(this.world.fighters.indexOf(s), 1);
        this.summons.splice(i, 1);
      }
    }
  }
}
