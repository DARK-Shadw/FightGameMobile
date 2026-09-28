// What each atom does to the game. Called by the carriers in powers.js with
// resolved parameters (from the power's DNA) and a context describing where
// it happened.

import { ATOMS, paramValues } from '../../../prototypes/skill-forge/data-atoms.js';
import { ESSENCES } from '../../../prototypes/skill-forge/data-essences.js';

export const atomParams = a => paramValues(a, ATOMS[a.id].p);
const ONCE_ON_TICK = new Set(['mark', 'push', 'launch', 'root', 'stun', 'fear', 'silence', 'blind', 'confuse', 'hex', 'clockStop', 'swap', 'steal', 'link', 'exchange', 'control', 'execute']);

// ctx: { world, caster, ess, origin:[x,y,z], tick (seconds per tick, 0 for instant), dur (carrier duration), scale (0..1 strength), hitOnce:Set }
export function applyToEnemy(ctx, atom, target) {
  const { world, caster, ess } = ctx;
  const p = atom.raw ? { ...atomParams(atom), ...atom.raw } : atomParams(atom);
  const fx = world.fx;
  const k = ctx.scale ?? 1;
  const tick = ctx.tick || 0;
  if (tick && ONCE_ON_TICK.has(atom.id)) {
    const key = atom.id + ':' + target.id;
    if (ctx.hitOnce.has(key)) return;
    ctx.hitOnce.add(key);
  }
  const dir = [target.pos.x - ctx.origin[0], 0, target.pos.z - ctx.origin[2]];
  switch (atom.id) {
    case 'damage': {
      let amt = p.amount * k * caster.buffs.dmg;
      if (tick) amt = (p.amount / Math.max(ctx.dur, 0.5)) * 1.3 * tick * k;
      if (!tick && caster.buffs.empowerHits > 0 && ctx.basic) { amt *= 1 + caster.buffs.empowerPct / 100; caster.buffs.empowerHits--; }
      target.takeDamage(Math.round(amt), caster, { ess, dir, dot: !!tick });
      if (!tick) fx.hitSpark?.(ess, target);
      break;
    }
    case 'dot':
      target.addStatus('dot', p.dur, { dps: p.dps * k, ess, src: caster, acc: 0, tick: (dt, f) => {
        const st = f.statuses.dot; st.acc += dt;
        if (st.acc >= 0.5) { st.acc -= 0.5; f.takeDamage(Math.round(st.dps * 0.5), st.src, { ess: st.ess, dot: true }); }
      } });
      break;
    case 'mark':
      target.addStatus('mark', p.delay, { ess, src: caster, amount: p.amount * k, onEnd: () => {
        if (!target.alive) return;
        target.takeDamage(Math.round(p.amount * k), caster, { ess });
        fx.impact(ess, target.center(), 1.0, 0.6);
      } });
      break;
    case 'execute':
      if (target.hpPct * 100 < p.threshold) {
        fx.execute?.(ess, target);
        target.takeDamage(target.hp + target.shieldHp + 1, caster, { ess });
      }
      break;
    case 'push': {
      const c = ctx.pushFrom || ctx.origin;
      target.knock(target.pos.x - c[0] || dir[0] || 0.01, target.pos.z - c[2] || dir[2], p.dist * 6.5 * k);
      break;
    }
    case 'pull': {
      const c = ctx.pullTo || ctx.origin;
      const d = Math.hypot(c[0] - target.pos.x, c[2] - target.pos.z);
      if (d > 0.4) target.knock(c[0] - target.pos.x, c[2] - target.pos.z, Math.min(p.dist, d) * (tick ? 2 : 6.5) * k);
      break;
    }
    case 'launch': target.addStatus('launch', p.dur, { ess }); break;
    case 'slow': target.addStatus('slow', tick ? 0.6 : p.dur, { pct: p.pct, ess }); break;
    case 'root': target.addStatus('root', p.dur, { ess }); break;
    case 'stun': target.addStatus('stun', p.dur, { ess }); break;
    case 'silence': target.addStatus('silence', p.dur, { ess }); break;
    case 'blind': target.addStatus('blind', p.dur, { ess }); break;
    case 'confuse': target.addStatus('confuse', p.dur, { ess }); break;
    case 'fear': target.addStatus('fear', p.dur, { ess, from: [caster.pos.x, 0, caster.pos.z] }); break;
    case 'hex': target.addStatus('hex', p.dur, { ess, critter: (ESSENCES[ess] || ESSENCES.beast).critter }); break;
    case 'clockSlow': target.addStatus('clockSlow', tick ? 0.6 : p.dur, { pct: p.pct, ess }); break;
    case 'clockStop':
      target.addStatus('timestop', p.dur, { ess, onEnd: () => {
        const dmg = target.stored; target.stored = 0;
        if (dmg > 0 && target.alive) { target.takeDamage(dmg, caster, { ess, release: true, crit: true }); fx.impact(ess, target.center(), 1.1, 0.9); }
      } });
      break;
    case 'control': target.addStatus('control', p.dur, { ess, by: caster }); break;
    case 'swap': {
      const a = [caster.pos.x, caster.pos.z], b = [target.pos.x, target.pos.z];
      fx.teleport?.(ess, caster.center()); fx.teleport?.(ess, target.center());
      caster.pos.x = b[0]; caster.pos.z = b[1]; target.pos.x = a[0]; target.pos.z = a[1];
      break;
    }
    case 'exchange': {
      const a = caster.hpPct, b = target.hpPct;
      caster.hp = Math.max(1, b * caster.maxHp); target.hp = Math.max(1, a * target.maxHp);
      fx.exchange?.(ess, caster, target);
      break;
    }
    case 'steal': {
      const slot = target.powers.find(s => !s.stolen);
      if (slot) {
        slot.stolen = true;
        const copy = { ...slot, cd: 0, borrowed: true, dna: slot.dna };
        caster.powers.push(copy);
        fx.steal?.(ess, target, caster);
        target.addStatus('robbed', p.dur, { onEnd: () => { slot.stolen = false; caster.powers = caster.powers.filter(x => x !== copy); } });
      }
      break;
    }
    case 'link': caster.addStatus('link', p.dur, { pct: p.pct, to: target, ess }); break;
    case 'negate':
      target.addStatus('silence', tick ? 0.6 : p.dur, { ess: 'void' });
      target.shieldHp = 0; target.removeStatus('shield'); target.removeStatus('haste'); target.removeStatus('clockHaste');
      break;
    default: break;
  }
}

// Helpful atoms: `who` is the recipient (caster or ally).
export function applyToAlly(ctx, atom, who) {
  const { world, caster, ess } = ctx;
  const p = atomParams(atom);
  const fx = world.fx;
  switch (atom.id) {
    case 'heal': who.heal(ctx.tick ? (p.amount / Math.max(ctx.dur, 0.5)) * 1.3 * ctx.tick : p.amount); if (!ctx.tick) fx.healBurst?.(ess, who); break;
    case 'shield': who.shieldHp = Math.max(who.shieldHp, p.amount); who.shieldT = p.dur; who.addStatus('shield', p.dur, { ess }); break;
    case 'cleanse':
      for (const s of ['slow', 'root', 'stun', 'silence', 'blind', 'confuse', 'fear', 'dot', 'mark', 'hex', 'clockSlow']) who.removeStatus(s);
      fx.cleanse?.(ess, who);
      break;
    case 'haste': who.addStatus('haste', ctx.tick ? 0.6 : p.dur, { pct: p.pct, ess }); break;
    case 'clockHaste': who.addStatus('clockHaste', ctx.tick ? 0.6 : p.dur, { pct: p.pct, ess }); break;
    case 'empower': who.buffs.empowerHits = p.hits; who.buffs.empowerPct = p.pct; who.addStatus('empower', 8, { ess }); break;
    case 'invis': who.addStatus('invis', p.dur, { ess }); break;
    case 'reflect': who.addStatus('reflect', p.dur, { ess }); break;
    case 'lifesteal': break; // handled when the payload's damage lands
    case 'blink': {
      const to = ctx.blinkTo || [who.pos.x + who.aimDir.x * p.dist, 0, who.pos.z + who.aimDir.y * p.dist];
      fx.teleport?.(ess, who.center());
      who.pos.x = to[0]; who.pos.z = to[2];
      world.resolveCircle(who.pos, who.radius, who);
      fx.teleport?.(ess, who.center());
      break;
    }
    case 'rewind': {
      const back = Math.round(p.secs * 10);
      const h = who.history[Math.max(0, who.history.length - 1 - back)];
      if (h) {
        fx.rewind?.(ess, who, who.history.slice(-back));
        who.pos.x = h.x; who.pos.z = h.z; who.hp = Math.max(who.hp, h.hp); who.facing = h.facing;
        for (const s of who.powers) if (s.dna !== ctx.dna) s.cd = Math.max(0, s.cd - p.secs);
      }
      break;
    }
    case 'transform': ctx.game?.transform?.(who, ess, p.dur, p.bonus); break;
    case 'resurrect': break;
    default: break;
  }
}
