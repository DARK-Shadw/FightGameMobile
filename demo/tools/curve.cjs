// Level curve check: bots play a full match in the fixed-step driver; prints
// average level, XP sources and the kit every 30 s.   node tools/curve.cjs [seconds=270]
const path = require('path');
const { pathToFileURL } = require('url');
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const total = Number(process.argv[2] || 270);
(async () => {
  const { startServer, resolvePath, THREE_CDN } = await import(pathToFileURL(path.join(__dirname, 'serve.js')).href);
  const server = await startServer(0);
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(THREE_CDN + '**', r => r.fulfill({ path: resolvePath('/vendor/three/' + r.request().url().slice(THREE_CDN.length)), contentType: 'text/javascript' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/demo/index.html?lab=1&auto=1&time=${total}`);
  await page.waitForFunction(() => window.__lab && window.__lab.ready && window.__lab.game.match, null, { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.__lab.game;
    window.__why = {};
    g.world.events.on('xp', e => { window.__why[e.why] = (window.__why[e.why] || 0) + e.amount; });
  });
  for (let t = 30; t <= total + 30; t += 30) {
    const r = await page.evaluate(() => {
      const L = window.__lab, g = L.game;
      for (let i = 0; i < 30 * 30 && g.match && g.match.phase !== 'over'; i++) L.app.tick(1 / 30);
      const b = g.brawlers;
      return { t: g.world.time.toFixed(0), phase: g.match?.phase, score: g.score.join(':'), avg: (b.reduce((a, f) => a + f.level, 0) / b.length).toFixed(1),
        levels: b.map(f => f.level).join(''), tiers: b.map(f => f.powers.map(p => p.dna.tier[0].toUpperCase()).join('')).join(' '), why: JSON.stringify(window.__why) };
    });
    console.log(`t=${r.t}s ${r.phase} score ${r.score} avgLv ${r.avg} [${r.levels}] kits: ${r.tiers}`);
    if (r.phase === 'over' || !r.phase) { console.log('xp by source', r.why); break; }
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'no errors');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
