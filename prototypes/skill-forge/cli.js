#!/usr/bin/env node
// Usage:
//   node cli.js                         forge 6 random powers
//   node cli.js --count 3 --tier godly  forge 3 godly powers
//   node cli.js --essence time,death    lock essences
//   node cli.js --code 7K2F9Q.G>        rebuild a power from its code
//   node cli.js --evolve                also show each power evolved once
//   node cli.js --stats 20000           sanity-check and measure variety
import {
  forge, evolve, fuse, fromCode, evolveCode, fuseCode, dnaTree, shapeOf,
  ESSENCES, TIERS, TIER_ORDER, ATOMS, allAtoms,
} from './skillforge.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const LAW = ['', ' [law I]', ' [law II]'];

function print(s) {
  const line = '─'.repeat(72);
  const ess = s.essences.map(e => ESSENCES[e].name).join(' + ');
  const st = s.stats;
  const timing = [st.control, st.cooldown != null ? `cd ${st.cooldown}s` : '', st.windup != null ? `windup ${st.windup}s` : '']
    .filter(Boolean).join(' · ');
  console.log(line);
  console.log(`[${st.tier.toUpperCase()}] ${s.name}${s.epithet ? ' — ' + s.epithet : ''}`);
  console.log(`${ess} · intent: ${st.hook} · ${timing} · code ${s.code}`);
  for (const l of s.lineage || []) {
    if (l.fused) console.log(`  (fusion of ${l.fused[0]} + ${l.fused[1]})`);
    else console.log(`  (evolved from ${l.from}: ${l.change.kind}${l.change.id ? ' ' + l.change.id : ''})`);
  }
  console.log('');
  for (const t of s.text) console.log('  ' + t);
  console.log('\n  DNA');
  for (const r of dnaTree(s)) {
    const mark = r.key ? '★ ' : '';
    console.log(`  ${'  '.repeat(r.depth)}${r.kind.padEnd(8)} ${mark}${r.label}${LAW[r.law || 0]}${r.detail ? '  ' + r.detail : ''}`);
  }
  const b = s.budget;
  console.log(`\n  Budget ${b.total} PP = base ${b.base} + refund ${b.refund} → structure ${b.structure} · numbers ${b.magnitude} · cooldown ${b.cooldown} · unspent ${b.left}`);
}

function stats(n) {
  const problems = [];
  const shapes = new Set();
  const names = new Set();
  const count = (map, k) => map.set(k, (map.get(k) || 0) + 1);
  const tiers = new Map(), hooks = new Map(), triggers = new Map(), keys = new Map();
  let nodes = 0;
  let unspent = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const s = forge({ seed: 'S' + i.toString(36).toUpperCase() });
    shapes.add(shapeOf(s));
    names.add(s.name);
    count(tiers, s.tier); count(hooks, s.stats.hook); count(triggers, s.trigger); count(keys, s.stats.keystone);
    nodes += 1 + s.root.atoms.length + s.root.mods.length + (s.root.chain ? 1 + s.root.chain.atoms.length : 0);
    unspent += s.budget.left;
    const text = s.text.join(' ');
    const check = (ok, what) => { if (!ok) problems.push(`${s.code}: ${what}`); };
    check(!/undefined|NaN|null/.test(text + s.name), 'bad text');
    check(s.name && s.text.length, 'empty name or text');
    const laws = allAtoms(s).filter(a => ATOMS[a.id].law).length + s.root.mods.filter(m => m.id === 'echo').length;
    check(laws <= 1, `${laws} laws`);
    check(s.tier !== 'godly' || s.stats.law === 2 || s.root.carrier.id === 'global' || s.stats.keystone === 'transform', 'godly without a law');
    const hard = allAtoms(s).filter(a => ATOMS[a.id].hard);
    const hardDur = hard.reduce((t, a) => t + (ATOMS[a.id].p.dur[0] + (a.s.dur || 0) * ATOMS[a.id].p.dur[2]), 0);
    check(hardDur <= 2.5 + 1e-6, `hard CC ${hardDur}s`);
    check(s.budget.structure + s.budget.magnitude + s.budget.cooldown <= s.budget.total + 1e-6, 'over budget');
    const lasting = allAtoms(s).filter(a => ['transform', 'clone', 'summon', 'titan', 'raise'].includes(a.id));
    if (lasting.length && s.stats.cooldown != null) {
      const longest = Math.max(...lasting.map(a => ATOMS[a.id].p.dur[0] + (a.s.dur || 0) * ATOMS[a.id].p.dur[2]));
      check(longest + 2 <= s.stats.cooldown + 1e-6, `lasts ${longest}s but recharges in ${s.stats.cooldown}s`);
    }
    if (i % 50 === 0) {
      const again = fromCode(s.code);
      check(again.name === s.name && again.text.join() === s.text.join(), 'code does not reproduce');
      const ev = evolve(s, evolveCode(s));
      check(fromCode(ev.code).text.join() === ev.text.join(), 'evolved code does not reproduce');
      const other = forge({ seed: 'F' + i });
      const fu = fuse(s, other, fuseCode(s, other));
      check(fromCode(fu.code).text.join() === fu.text.join(), 'fused code does not reproduce');
      check(!/undefined|NaN/.test(ev.text.join() + fu.text.join() + ev.name + fu.name), 'bad evolved/fused text');
    }
  }
  const ms = Date.now() - t0;
  const top = (map, k = 8) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([key, v]) => `${key} ${(100 * v / n).toFixed(1)}%`).join(', ');
  console.log(`Forged ${n} powers in ${ms}ms (${(ms / n).toFixed(3)}ms each)`);
  console.log(`Distinct structures: ${shapes.size} (${(100 * shapes.size / n).toFixed(1)}%)   distinct names: ${names.size}`);
  console.log(`Average nodes per power: ${(nodes / n).toFixed(2)}   average unspent PP: ${(unspent / n).toFixed(2)}`);
  console.log(`Tiers: ${TIER_ORDER.map(t => `${t} ${(100 * (tiers.get(t) || 0) / n).toFixed(1)}%`).join(', ')}`);
  console.log(`Intents: ${top(hooks, 15)}`);
  console.log(`Triggers: ${top(triggers)}`);
  console.log(`Keystones: ${top(keys, 12)}`);
  console.log(problems.length ? `\n${problems.length} problems:\n` + problems.slice(0, 25).join('\n') : '\nNo rule violations.');
  if (problems.length) process.exitCode = 1;
}

if (opt('stats')) {
  stats(Number(opt('stats')) || 20000);
} else if (opt('code')) {
  const s = fromCode(String(opt('code')));
  print(s);
} else {
  const n = Number(opt('count', 6));
  const tier = opt('tier') && TIERS[opt('tier')] ? opt('tier') : undefined;
  const essences = opt('essence') ? String(opt('essence')).split(',') : undefined;
  for (let i = 0; i < n; i++) {
    const s = forge({ seed: opt('seed') && n === 1 ? String(opt('seed')) : undefined, tier, essences });
    print(s);
    if (opt('evolve')) print(evolve(s, evolveCode(s)));
  }
}
