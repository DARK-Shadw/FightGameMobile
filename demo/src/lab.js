// Visual QA lab: loads one test scene and exposes a fixed-timestep driver
// to the screenshot harness (tools/shoot.cjs).
import { Stage } from './engine/stage.js';

const params = new URLSearchParams(location.search);
const name = params.get('scene') || 'basic';
const canvas = document.getElementById('c');
const stage = new Stage(canvas, { capture: true, maxPixelRatio: 1 });
stage.resize(innerWidth, innerHeight);

const t0 = performance.now();
const mod = await import(`./lab/${name}.js`);
const scene = await mod.setup(stage, params);
const buildMs = performance.now() - t0;
let time = 0;

function tick(dt) {
  time += dt;
  scene.update?.(dt, time);
}

window.__lab = {
  ready: true,
  stage,
  scene,
  step(total, dt = 1 / 30) {
    for (let t = 0; t < total - 1e-6; t += dt) tick(dt);
    stage.render(dt);
  },
  snap() {
    stage.render(0);
    return canvas.toDataURL('image/png');
  },
  sheet(frames, dt, cols, scale) {
    const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
    const rows = Math.ceil(frames / cols);
    const out = document.createElement('canvas');
    out.width = w * cols; out.height = h * rows;
    const g = out.getContext('2d');
    for (let i = 0; i < frames; i++) {
      if (i > 0) tick(dt);
      stage.render(dt);
      g.drawImage(canvas, (i % cols) * w, Math.floor(i / cols) * h, w, h);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect((i % cols) * w, Math.floor(i / cols) * h, 58, 18);
      g.fillStyle = '#fff'; g.font = '12px monospace';
      g.fillText(time.toFixed(2) + 's', (i % cols) * w + 4, Math.floor(i / cols) * h + 13);
    }
    return out.toDataURL('image/png');
  },
  info() { return `build ${buildMs.toFixed(0)}ms ${scene.info ? scene.info() : ''}`; },
};

if (!params.has('still')) {
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!window.__lab.frozen) { tick(dt); stage.render(dt); }
    requestAnimationFrame(loop);
  };
  if (params.has('live')) requestAnimationFrame(loop);
}
addEventListener('resize', () => stage.resize(innerWidth, innerHeight));
