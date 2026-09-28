// Multi-match soak test in the fixed-timestep lab driver: bots play every
// seat (yours too), menus click themselves, and we watch for errors across
// level-ups, evolved, fused and godly powers.
//   node tools/soak.cjs [matches=3] [matchSeconds=150]
const path = require('path');
const { pathToFileURL } = require('url');
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const rounds = Number(process.argv[2] || 3);
const secs = Number(process.argv[3] || 150);
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
  await page.goto(`http://127.0.0.1:${server.address().port}/demo/index.html?lab=1&auto=1&rounds=${rounds}&time=${secs}`);
  await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 180000 });
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 1200000) {
    const st = await page.evaluate(() => {
      const L = window.__lab, g = L.game;
      if (!g.paused) L.step(6, 1 / 30);
      const m = g.match;
      return { matches: L.app.matches || 0, paused: g.paused, phase: m ? m.phase : '-', t: m ? m.time.toFixed(0) : '-', score: g.score.join(':'),
        kits: g.brawlers.map(f => `${f.name} L${f.level} [${f.powers.map(p => p.dna.code + (p.passive ? '*' : '')).join(', ')}]`).join('\n  ') };
    });
    const key = `${st.matches}|${Math.floor(Number(st.t) / 30)}`;
    if (key !== last && st.phase !== '-') { console.log(`match ${st.matches + 1} ${st.phase} t=${st.t} score ${st.score}\n  ${st.kits}`); last = key; }
    if (st.matches >= rounds) break;
    await page.waitForTimeout(st.paused ? 700 : 150);
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no errors');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
