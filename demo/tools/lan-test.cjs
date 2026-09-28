// Two players over the LAN server: one page hosts, one joins, they play a
// match (moving, shooting, levelling up and picking a power through the
// network) and come back to the party. Screenshots go to shots/lan-*.png.
//   node tools/lan-server.js --port 18080 &   then   node tools/lan-test.cjs [http://127.0.0.1:18080/] [--secs 20] [--stress]
// --native 47800: the Android path instead. Both pages load dist/offline/index.html from disk
// with a stand-in for the app's bridge (window.SFNative) and meet on the app's own relay run on
// a desktop JVM (see android/test/RelayMain.java) at that port.
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };
const NATIVE = Number(opt('native', 0));
const url = NATIVE ? require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist/offline/index.html')).href : args.find(a => a.startsWith('http')) || 'http://127.0.0.1:18080/';
const SECS = Number(opt('secs', 20));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const open = async (label, w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /\[net\]/.test(m.text()))) errors.push(`${label} ${m.type()}: ${m.text()}`); });
    await page.addInitScript(() => { window.__noRender = true; });
    if (NATIVE) await page.addInitScript(port => {
      // what android/src/.../NativeBridge.java exposes; discovery "finds" the relay on this machine
      window.__native = { calls: [] };
      const log = (...a) => window.__native.calls.push(a.join(' '));
      window.SFNative = {
        platform: () => 'android', version: () => 'test',
        hostStart: name => { log('hostStart', name); return JSON.stringify({ ok: true, port, ip: '127.0.0.1' }); },
        hostSetPlayers: n => { log('hostSetPlayers', n); return ''; },
        hostStop: () => { log('hostStop'); return ''; },
        discoverStart: () => { log('discoverStart'); window.__native.t = setInterval(() => window.SFNativeEvent?.('rooms', JSON.stringify(window.__rooms || [])), 500); return ''; },
        discoverStop: () => { log('discoverStop'); clearInterval(window.__native.t); return ''; },
        localIp: () => '127.0.0.1',
        vibrate: ms => { log('vibrate', ms); return ''; },
      };
    }, NATIVE);
    await page.goto(url);
    await page.waitForSelector('.menu-screen .btn.lan', { timeout: 180000 });
    return page;
  };
  const shot = async (page, name) => {
    await page.evaluate(() => { window.__noRender = false; });
    await sleep(1800);
    await page.screenshot({ path: `shots/lan-${name}.png` });
    await page.evaluate(() => { window.__noRender = true; });
    console.log('shot', name);
  };
  const state = page => page.evaluate(() => {
    const g = window.__sfa.game, m = g.match;
    return { t: m ? Math.round(m.time) : null, phase: m?.phase, score: g.score.join(':'), replica: g.replica,
      fs: g.brawlers.map(f => `${f.name}${f.control === 'local' ? '*' : ''}(${f.control}) L${f.level} ${Math.round(f.hp)}hp @${f.pos.x.toFixed(1)},${f.pos.z.toFixed(1)} [${f.powers.map(p => p.dna.code).join(',')}]`) };
  });

  const A = await open('host', 800, 450);
  const B = await open('join', 800, 450);
  console.log('both loaded');

  await A.click('.menu-screen .btn.lan');
  await A.waitForSelector('.lan .btn.host');
  await A.fill('.lan input.name', 'Ada');
  await A.click('.lan .btn.host');
  await A.waitForSelector('.party .btn.start', { timeout: 15000 });
  console.log('A hosting');

  await B.click('.menu-screen .btn.lan');
  if (NATIVE) await B.evaluate(port => { window.__rooms = [{ name: "Ada's party", ip: '127.0.0.1', port, players: 1, max: 6 }]; }, NATIVE);
  await B.waitForSelector('.lan .room', { timeout: 15000 });
  await B.fill('.lan input.name', 'Bo');
  await B.dispatchEvent('.lan input.name', 'change');
  await shot(B, '1-join-menu');
  await B.click('.lan .room');
  await B.waitForSelector('.party .wait', { timeout: 15000 });
  await A.waitForFunction(() => document.querySelectorAll('.party .seat:not(.bot):not(.open)').length === 2, null, { timeout: 15000 });
  console.log('B joined');
  await B.click('.party .arrow[data-d="1"]');
  await sleep(600);
  await shot(A, '2-party-host');
  await shot(B, '3-party-joiner');

  await A.click('.party .btn.start');
  await A.waitForFunction(() => window.__sfa.game.match && !window.__sfa.game.paused, null, { timeout: 30000 });
  await B.waitForFunction(() => window.__sfa.game.match && !window.__sfa.game.paused && window.__sfa.game.replica, null, { timeout: 30000 });
  console.log('match running on both');

  if (args.includes('--stress')) {
    // every brawler gets reality-bending kits: summons, clones, titans, forms, time stop,
    // walls, dashes, beams, swaps, steals, hexes, links, rewinds, a resurrect passive
    await A.evaluate(() => {
      const g = window.__sfa.game, m = g.match;
      const kits = [['T7.G', 'Q2.G', 'Q1.G'], ['T1.E', 'T10.L', 'T14.L'], ['T22.L', 'T13.E', 'T194.L'], ['T11.G', 'T305.E', 'T198.L'], ['Q3.G', 'T55.G', 'T235.G'], ['T2.L', 'T3.G', 'Q222.G', 'T1087.G']];
      g.brawlers.forEach((f, i) => kits[i].forEach(code => { const id = 90000 + i * 10 + kits[i].indexOf(code); f.offers.unshift({ id, level: 7, options: [{ type: 'new', code }] }); m.pick(f, 0, id); }));
      // everyone meets in the middle; ultimates stay charged
      g.brawlers.forEach((f, i) => { f.pos.set((i % 3 - 1) * 2, 0, f.team ? -2 : 2); f.warp++; });
      setInterval(() => g.brawlers.forEach(f => f.powers.forEach(p => { if (p.ult) p.charge = 1; })), 3000);
    });
    // the joiner builds the same kits (it may be busy baking creatures for a moment)
    const kitsOf = p => p.evaluate(() => window.__sfa.game.brawlers.map(f => f.name + ':' + f.powers.map(p => p.dna.code + '@' + p.index).join(',')).join(' | '));
    const ka = await kitsOf(A);
    await B.waitForFunction(k => window.__sfa.game.brawlers.map(f => f.name + ':' + f.powers.map(p => p.dna.code + '@' + p.index).join(',')).join(' | ') === k, ka, { timeout: 30000 }).catch(() => errors.push('kits differ between host and joiner'));
    console.log('kits host  ', ka);
    console.log('kits joiner', await kitsOf(B));
    // force the rare ones and wait until the host shows each: then the joiner must match
    const forced = async (casts, label, until) => {
      const r = await A.evaluate(casts => {
        const g = window.__sfa.game;
        return casts.map(([fi, si]) => {
          const f = g.brawlers[fi], s = f.powers.find(p => p.index === si);
          if (!f.alive) g.respawn(f);
          f.clearStatuses(); f.dashing = null; f.leap = null;
          s.cd = 0; s.charge = 1;
          return g.cast(f, s, { dir: [0, 0, f.team ? 1 : -1], point: [f.pos.x, 0, f.pos.z + (f.team ? 3 : -3)] }) ? 'cast' : 'refused';
        });
      }, casts);
      const seen = await A.waitForFunction(until, null, { timeout: 20000, polling: 100 }).then(() => true, () => false);
      await sleep(800);
      const cnt = p => p.evaluate(() => { const g = window.__sfa.game; return { summons: g.summons.filter(s => s.alive).map(s => s.kind + ':' + s.id).sort().join(','), forms: g.brawlers.filter(f => f.form).map(f => f.name + ':' + f.form.ess).join(','), stop: !!g.world.globalStop }; });
      const [ha, hb] = [await cnt(A), await cnt(B)];
      console.log(label, r.join(' '), seen ? '(host shows it)' : '(host never showed it)', '\n  host  ', JSON.stringify(ha), '\n  joiner', JSON.stringify(hb));
      if (!seen) errors.push(`${label}: never happened on the host`);
      if (ha.summons !== hb.summons) errors.push(`${label}: summons differ`);
      if (ha.forms !== hb.forms) errors.push(`${label}: forms differ`);
      if (ha.stop !== hb.stop) errors.push(`${label}: time stop differs`);
    };
    await forced([[1, 0], [1, 1]], 'minions+clones', () => window.__sfa.game.summons.some(s => s.alive && s.kind === 'clone'));
    await shot(B, 's0-summons-joiner');
    await forced([[0, 2]], 'titan', () => window.__sfa.game.summons.some(s => s.alive && s.kind === 'titan'));
    await shot(B, 's0b-titan-joiner');
    await forced([[4, 0]], 'raise', () => window.__sfa.game.summons.some(s => s.alive && s.spec?.look?.rise));
    await forced([[0, 1]], 'transform', () => !!window.__sfa.game.brawlers[0].form);
    await forced([[5, 2]], 'time stop', () => !!window.__sfa.game.world.globalStop);
    await shot(B, 's0c-timestop-joiner');
    const tS = Date.now();
    let i = 0;
    while (Date.now() - tS < SECS * 1000) {
      await B.mouse.move(400 + Math.sin(i) * 200, 225 + Math.cos(i) * 120);
      await B.keyboard.press(['q', 'e', 'r', 'f'][i % 4]);
      await B.mouse.down(); await sleep(150); await B.mouse.up();
      await B.keyboard.down(['w', 'a', 's', 'd'][i % 4]); await sleep(500); await B.keyboard.up(['w', 'a', 's', 'd'][i % 4]);
      if (i % 6 === 3) {
        const [sa, sb] = [await state(A), await state(B)];
        const cnt = p => p.evaluate(() => { const g = window.__sfa.game; return { summons: g.summons.filter(s => s.alive).length, forms: g.brawlers.filter(f => f.form).map(f => f.name + ':' + f.form.ess).join(','), stop: !!g.world.globalStop, walls: g.world.dynWalls.length, st: g.brawlers.map(f => Object.keys(f.statuses).join('+')).join(' / ') }; });
        console.log(`t=${sa.t} score ${sa.score} | host ${JSON.stringify(await cnt(A))}\n               joiner ${JSON.stringify(await cnt(B))}`);
        void sb;
      }
      if (i === 8) { await shot(A, 's1-host'); await shot(B, 's2-joiner'); }
      i++;
    }
    await shot(B, 's3-joiner');
  }

  // B plays: walks up, shoots; A shoots too
  await B.keyboard.down('w');
  await B.mouse.move(400, 120);
  for (let i = 0; i < 6; i++) { await B.mouse.down(); await sleep(200); await B.mouse.up(); await sleep(300); }
  await B.keyboard.up('w');
  await B.keyboard.down('d');
  await sleep(1500);
  await B.keyboard.up('d');
  const sa = await state(A), sb = await state(B);
  console.log('host view:', JSON.stringify(sa, null, 1));
  console.log('joiner view:', JSON.stringify(sb, null, 1));
  await shot(A, '4-match-host');
  await shot(B, '5-match-joiner');

  // level B up from the host: the offer travels to B, B picks, the kit comes back
  await A.evaluate(() => { const g = window.__sfa.game; const b = g.brawlers.find(f => f.control === 'remote'); g.match.addXp(b, 340); });
  await B.waitForSelector('.picker .mini', { timeout: 10000 });
  await shot(B, '6-joiner-levelup');
  await B.click('.picker .mini:nth-child(1)');
  await sleep(300);
  await B.click('.picker .mini.sel');
  await sleep(1500);
  const kitA = await A.evaluate(() => window.__sfa.game.brawlers.find(f => f.control === 'remote').powers.map(p => p.dna.code));
  const kitB = await B.evaluate(() => window.__sfa.game.player.powers.map(p => p.dna.code));
  console.log('kit on host', kitA, 'kit on joiner', kitB);
  // cast it from B
  await B.mouse.move(400, 150);
  await B.keyboard.press('q');
  await sleep(1200);
  await shot(B, '7-joiner-cast');

  // let the bots fight a while
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    await sleep(4000);
    const s = await state(A);
    console.log(`t=${s.t} score ${s.score}`);
  }
  const sb2 = await state(B);
  console.log('joiner view later:', JSON.stringify(sb2, null, 1));

  // end it on the host
  await A.evaluate(() => window.__sfa.game.match.end(0));
  await A.waitForSelector('.results .btn', { timeout: 15000 });
  await B.waitForSelector('.results .btn', { timeout: 15000 });
  await shot(B, '8-results-joiner');
  await A.click('.results .btn');
  await B.click('.results .btn');
  await A.waitForSelector('.party .btn.start', { timeout: 15000 });
  await B.waitForSelector('.party .wait', { timeout: 15000 });
  console.log('both back in the party');

  // a rematch in the same party: B switches team first
  await B.click('.party .switch');
  await A.waitForFunction(() => [...document.querySelectorAll('.party .tm.blue .seat')].some(e => e.textContent.includes('Bo')), null, { timeout: 10000 });
  await A.click('.party .btn.start');
  await B.waitForFunction(() => window.__sfa.game.match && !window.__sfa.game.paused && window.__sfa.game.replica, null, { timeout: 30000 });
  await B.keyboard.down('a'); await sleep(1200); await B.keyboard.up('a');
  const r2 = await A.evaluate(() => { const g = window.__sfa.game, b = g.brawlers.find(f => f.control === 'remote'); return { team: b.team, x: b.pos.x.toFixed(1), level: b.level, powers: b.powers.length }; });
  console.log('rematch: joiner on the host', JSON.stringify(r2));
  if (r2.team !== 0 || r2.level !== 1 || r2.powers !== 0) errors.push('rematch state wrong: ' + JSON.stringify(r2));
  await A.evaluate(() => window.__sfa.game.match.end(1));
  await B.waitForSelector('.results .btn', { timeout: 15000 });
  await A.waitForSelector('.results .btn', { timeout: 15000 });
  await A.click('.results .btn');
  await B.click('.results .btn');
  await B.waitForSelector('.party .wait', { timeout: 15000 });
  console.log('rematch done, both back in the party');

  if (NATIVE) {
    // Android's back button on the joiner's party screen leaves the party (and must answer true)
    const handled = await B.evaluate(() => window.SFBack());
    await B.waitForSelector('.lan .btn.host', { timeout: 15000 });
    await A.waitForFunction(() => document.querySelectorAll('.party .seat:not(.bot):not(.open)').length === 1, null, { timeout: 15000 });
    console.log('back button handled:', handled, '· host sees the joiner leave');
    await B.click('.lan .room');
    await A.waitForFunction(() => document.querySelectorAll('.party .seat:not(.bot):not(.open)').length === 2, null, { timeout: 15000 });
    console.log('joiner rejoined');
    console.log('bridge calls (host):', (await A.evaluate(() => window.__native.calls)).join(' · '));
  }
  // host leaves: the joiner is told
  await A.click('.party .leave');
  await B.waitForSelector('.gone .btn', { timeout: 15000 });
  await shot(B, '9-host-left');
  await B.click('.gone .btn');
  await B.waitForSelector('.lan .btn.host', { timeout: 15000 });
  console.log('joiner back at the LAN menu');

  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 30).join('\n') : 'no errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
