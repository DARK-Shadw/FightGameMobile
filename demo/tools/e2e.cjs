// End-to-end check of the built page: boots it like a player would (title,
// play, draft, pick, fight) and saves a screenshot of each step.
//   node tools/e2e.cjs [dist/skill-forge-arena.html] [--w 1280 --h 720] [--fight 6] [--touch 1]
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };
const file = args[0] && !args[0].startsWith('--') ? args[0] : 'dist/skill-forge-arena.html';

(async () => {
  const { startServer, resolvePath, THREE_CDN } = await import(pathToFileURL(path.join(__dirname, 'serve.js')).href);
  const server = await startServer(0);
  const port = server.address().port;
  // the publish skeleton: doctype + head with charset/viewport, then the page
  const tmp = path.join(__dirname, '..', 'dist', '_e2e.html');
  fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${fs.readFileSync(path.join(__dirname, '..', file), 'utf8')}</body></html>`);
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const touch = !!opt('touch');
  const ctx = await browser.newContext({ viewport: { width: Number(opt('w', 1280)), height: Number(opt('h', 720)) }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.route(THREE_CDN + '**', route => route.fulfill({ path: resolvePath('/vendor/three/' + route.request().url().slice(THREE_CDN.length)), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.addInitScript(() => { window.__minFrame = 700; });
  const shot = async name => { await page.screenshot({ path: `shots/e2e-${name}.png` }); console.log('shot', name); };
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/demo/dist/_e2e.html`);
  await page.waitForTimeout(1500);
  await shot('1-boot');
  await page.waitForSelector('.draft .btn', { timeout: 180000 });
  console.log('loaded in', Date.now() - t0, 'ms');
  await page.waitForTimeout(800);
  await shot('2-title');
  await page.click('.draft .btn');
  await page.waitForSelector('.card.open', { timeout: 20000 });
  await page.waitForTimeout(3500);
  await shot('3-draft');
  await page.click('.card:nth-child(3)');
  await page.waitForTimeout(3000);
  await shot('4-fight-start');
  // fight: hold attack toward the enemies for a while
  const secs = Number(opt('fight', 6));
  const cx = Number(opt('w', 1280)) / 2, cy = Number(opt('h', 720)) / 2;
  if (!touch) {
    await page.mouse.move(cx, cy - 200);
    await page.keyboard.down('w');
    for (let i = 0; i < secs * 2; i++) { await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up(); await page.waitForTimeout(250); if (i === 3) await page.keyboard.press('q'); }
    await page.keyboard.up('w');
  } else await page.waitForTimeout(secs * 1000);
  await shot('5-fight');
  console.log(logs.slice(0, 20).join('\n') || 'no errors');
  await browser.close();
  server.close();
  fs.unlinkSync(tmp);
})().catch(e => { console.error(e); process.exit(1); });
