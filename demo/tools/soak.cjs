// Multi-round soak test in the fixed-timestep lab driver: bots play every
// seat, menus auto-pick, and we watch for errors across level-ups, evolved
// and fused powers.   node tools/soak.cjs [rounds=4]
const path = require('path');
const { pathToFileURL } = require('url');
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const rounds = Number(process.argv[2] || 4);
(async () => {
  const { startServer, resolvePath, THREE_CDN } = await import(pathToFileURL(path.join(__dirname, 'serve.js')).href);
  const server = await startServer(0);
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(THREE_CDN + '**', r => r.fulfill({ path: resolvePath('/vendor/three/' + r.request().url().slice(THREE_CDN.length)), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/demo/index.html?lab=1&auto=1&rounds=${rounds}`);
  await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 180000 });
  const t0 = Date.now();
  let lastRound = 0;
  while (Date.now() - t0 < 600000) {
    const st = await page.evaluate(() => {
      const g = window.__lab.game;
      const menu = !!document.querySelector('.draft');
      if (!g.paused) window.__lab.step(6, 1 / 30);
      return { round: g.round, paused: g.paused, menu, score: g.score.join(':'), t: g.world.time.toFixed(0), powers: g.brawlers.map(f => f.name + '[' + f.powers.map(p => p.dna.code).join(', ') + ']').join(' ') };
    });
    if (st.round !== lastRound) { console.log(`round ${st.round} t=${st.t} score ${st.score}\n  ${st.powers}`); lastRound = st.round; }
    if (st.round > rounds) break;
    await page.waitForTimeout(st.paused ? 700 : 250);
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no errors');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
