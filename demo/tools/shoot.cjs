// Visual QA harness. Loads a lab page in headless Chromium (software WebGL),
// drives it with a fixed timestep and saves screenshots or frame sheets.
//
//   node tools/shoot.cjs "lab.html?scene=hero" shots/hero.png [--w 1280] [--h 720]
//        [--warm 1.0] [--frames 12 --dt 0.05 --cols 4 --scale 0.5] [--call "fnName(args)"]
//        [--page 1]  screenshot the whole page (HUD and menus included)
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };
const [page0, out] = args;

(async () => {
  const { startServer, resolvePath, THREE_CDN } = await import(pathToFileURL(path.join(__dirname, 'serve.js')).href);
  const server = await startServer(0);
  const port = server.address().port;
  const browser = await pw.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const w = Number(opt('w', 1280)), h = Number(opt('h', 720));
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) || opt('log')) logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.route(THREE_CDN + '**', route => {
    const rel = route.request().url().slice(THREE_CDN.length);
    route.fulfill({ path: resolvePath('/vendor/three/' + rel), contentType: 'text/javascript' });
  });
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const url = `http://127.0.0.1:${port}/demo/${page0}`;
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: Number(opt('timeout', 120000)) });
  } catch (e) {
    console.log(logs.join('\n'));
    throw e;
  }
  if (opt('waitfor')) await page.waitForFunction(k => window[k], opt('waitfor'), { timeout: 60000 });
  const t0 = Date.now();
  if (opt('call')) await page.evaluate(c => eval('window.__lab.' + c), opt('call'));
  const warm = Number(opt('warm', 0));
  if (warm > 0) await page.evaluate(t => window.__lab.step(t, 1 / 30), warm);
  const frames = Number(opt('frames', 0));
  if (frames > 0) {
    const data = await page.evaluate(({ frames, dt, cols, scale }) =>
      window.__lab.sheet(frames, dt, cols, scale), { frames, dt: Number(opt('dt', 0.05)), cols: Number(opt('cols', 4)), scale: Number(opt('scale', 0.5)) });
    fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  } else if (opt('page')) {
    await page.evaluate(() => window.__lab.snap());
    await page.waitForTimeout(Number(opt('settle', 400)));
    await page.screenshot({ path: out });
  } else {
    const data = await page.evaluate(() => window.__lab.snap());
    fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  }
  const info = await page.evaluate(() => window.__lab.info ? window.__lab.info() : '');
  console.log(`saved ${out} in ${Date.now() - t0}ms ${info || ''}`);
  if (logs.length) console.log(logs.slice(0, 30).join('\n'));
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
