// Bot brawlers: pick a target, keep a fighting distance that suits their
// powers, strafe, shoot, cast powers when they would land, retreat when hurt.

import { CARRIERS, paramValues } from '../../../prototypes/skill-forge/data-atoms.js';

const HELP = new Set(['heal', 'shield', 'rewind', 'invis', 'cleanse', 'resurrect']);

// How far away a power can be usefully cast from.
export function powerReach(slot) {
  const root = slot.dna.root;
  const p = paramValues(root.carrier, CARRIERS[root.carrier.id].p);
  switch (root.carrier.id) {
    case 'bolt': case 'lob': case 'leap': case 'tether': return p.range * 0.9;
    case 'beam': return p.length * 0.85;
    case 'cone': return p.length * 0.9;
    case 'nova': return p.radius * 0.85;
    case 'aura': return p.radius + 0.8;
    case 'zone': case 'trap': return 8;
    case 'strike': return 9;
    case 'dash': return p.dist * 0.9;
    case 'orbitals': return 2.8;
    case 'wall': return 6;
    case 'global': return 99;
    case 'imbue': return 7;
    default: return 6;
  }
}

export class BotBrain {
  constructor(game, f, o = {}) {
    this.game = game;
    this.f = f;
    this.skill = o.skill ?? 0.6;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.thinkT = 0;
    this.target = null;
    this.powerT = 1.5 + Math.random() * 2;
    this.roam = null;
    this.stuckT = 0;
    this.last = { x: f.pos.x, z: f.pos.z };
    this.detour = 0;
  }

  update(dt) {
    const f = this.f, g = this.game, w = g.world;
    if (!f.alive || g.paused || g.frozenInput) { f.moveInput.set(0, 0); return; }
    this.thinkT -= dt; this.strafeT -= dt; this.powerT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.25 + Math.random() * 0.25;
      this.target = w.nearestEnemy(f, 13);
    }
    const t = this.target?.alive ? this.target : null;
    let mx = 0, mz = 0;
    if (t) {
      const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1;
      const hurt = f.hpPct < 0.3;
      const ideal = hurt ? 9 : (f.form ? 1.5 : 4.6 + (f.id % 3) * 0.5);
      const radial = d > ideal + 0.7 ? 1 : d < ideal - 0.7 ? -1 : 0;
      if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.3; this.strafe = Math.random() < 0.5 ? -1 : 1; }
      const ux = dx / d, uz = dz / d;
      mx = ux * radial + -uz * this.strafe * 0.75;
      mz = uz * radial + ux * this.strafe * 0.75;
      f.aimDir.set(ux, uz);
      // basic attacks
      if (d < 7.4 && f.ammo > 0 && f.attackCd <= 0 && Math.random() < dt * (1.6 + this.skill * 3)) {
        const aim = g.aimAt(f, t);
        const j = (Math.random() - 0.5) * (1 - this.skill) * 0.5;
        const c = Math.cos(j), s = Math.sin(j);
        g.attack(f, [aim.dir[0] * c - aim.dir[2] * s, 0, aim.dir[0] * s + aim.dir[2] * c]);
      }
      // powers
      if (this.powerT <= 0) {
        for (const slot of f.powers) {
          if (slot.passive || !slot.ready) continue;
          const helps = slot.dna.root.atoms.some(a => HELP.has(a.id)) && !slot.dna.root.atoms.some(a => a.id === 'damage');
          const reach = powerReach(slot);
          const want = helps ? f.hpPct < 0.6 && d < 9 : d <= reach;
          if (want && f.canAct()) {
            if (g.cast(f, slot, g.aimAt(f, t))) { this.powerT = 1.2 + Math.random() * 1.5; break; }
          }
        }
      }
    } else {
      // roam toward the middle / the other side
      if (!this.roam || Math.hypot(this.roam[0] - f.pos.x, this.roam[1] - f.pos.z) < 1) {
        this.roam = [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12];
      }
      const dx = this.roam[0] - f.pos.x, dz = this.roam[1] - f.pos.z, d = Math.hypot(dx, dz) || 1;
      mx = dx / d; mz = dz / d;
    }
    // walls: if the way ahead is blocked, slide along it
    const l = Math.hypot(mx, mz);
    if (l > 0.01) {
      mx /= l; mz /= l;
      if (w.wallAt(f.pos.x + mx * 0.9, f.pos.z + mz * 0.9, f.radius * 0.8)) {
        const alt = [[-mz, mx], [mz, -mx]];
        const side = this.detour || (Math.random() < 0.5 ? 1 : -1);
        const pick = side > 0 ? alt[0] : alt[1];
        if (!w.wallAt(f.pos.x + pick[0] * 0.9, f.pos.z + pick[1] * 0.9, f.radius * 0.8)) { mx = pick[0]; mz = pick[1]; this.detour = side; }
        else { mx = -pick[0]; mz = -pick[1]; this.detour = -side; }
      } else this.detour = 0;
    }
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      const moved = Math.hypot(f.pos.x - this.last.x, f.pos.z - this.last.z);
      if (moved < 0.3 && l > 0.01) { this.roam = [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14]; this.strafe *= -1; }
      this.last = { x: f.pos.x, z: f.pos.z };
      this.stuckT = 0;
    }
    f.moveInput.set(mx, mz);
  }
}
