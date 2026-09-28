// Procedural sprite atlas for particles: every sprite is drawn on a canvas at
// load, white on transparent, and tinted per particle. 8x8 grid of 128px.

import * as THREE from 'three';

const CELL = 128;
const GRID = 8;
export const SPRITES = {};
let texture = null;

const list = [
  'glow', 'dot', 'ring', 'spark', 'star4', 'star5', 'puff', 'flame',
  'shard', 'leaf', 'petal', 'snow', 'bubble', 'skull', 'heart', 'plus',
  'rune1', 'rune2', 'rune3', 'rune4', 'clock', 'gear', 'bolt', 'feather',
  'bone', 'claw', 'drop', 'hex', 'square', 'swirl', 'crescent', 'eye',
  'smoke', 'ember', 'streak', 'cross', 'diamond', 'note', 'zzz', 'spiral',
  'soul', 'thorn', 'rock', 'wave', 'moon', 'sparkle', 'halo', 'crack',
  'burst', 'flare',
];

function draw(g, name, s) {
  const c = s / 2;
  g.save();
  g.translate(c, c);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const glow = (r, a = 1) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.35, `rgba(255,255,255,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
  };
  const star = (n, r1, r2, rot = -Math.PI / 2) => {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1, a = rot + (i / (n * 2)) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  };
  const rnd = (() => { let x = name.length * 97 + name.charCodeAt(0); return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; })();
  switch (name) {
    case 'glow': glow(c * 0.95); break;
    case 'burst': {
      // jagged starburst flash: long and short rays around a hot center
      glow(c * 0.6, 0.9);
      g.beginPath();
      const n = 13;
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 ? c * 0.2 : c * (0.55 + 0.4 * (((i * 7919) % 5) / 4));
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      break;
    }
    case 'flare': {
      glow(c * 0.45, 1);
      for (const [w, l] of [[0.07, 0.98], [0.05, 0.6]]) {
        g.beginPath(); g.ellipse(0, 0, c * w, c * l, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(0, 0, c * l, c * w, 0, 0, Math.PI * 2); g.fill();
        g.rotate(Math.PI / 4);
      }
      break;
    }
    case 'dot': g.beginPath(); g.arc(0, 0, c * 0.5, 0, Math.PI * 2); g.fill(); break;
    case 'ring': g.lineWidth = c * 0.16; g.beginPath(); g.arc(0, 0, c * 0.72, 0, Math.PI * 2); g.stroke(); break;
    case 'spark': {
      const gr = g.createLinearGradient(-c, 0, c, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.8)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(0, 0, c * 0.95, c * 0.14, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'star4': glow(c * 0.5, 0.6); star(4, c * 0.95, c * 0.16); break;
    case 'star5': star(5, c * 0.9, c * 0.4); break;
    case 'sparkle': star(4, c * 0.9, c * 0.1); g.rotate(Math.PI / 4); star(4, c * 0.45, c * 0.08); break;
    case 'puff': {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, r = c * (0.28 + rnd() * 0.12);
        g.beginPath(); g.arc(Math.cos(a) * c * 0.38, Math.sin(a) * c * 0.38, r, 0, Math.PI * 2); g.fill();
      }
      g.beginPath(); g.arc(0, 0, c * 0.5, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'smoke': {
      for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * c * 0.45, r = c * (0.18 + rnd() * 0.25);
        const gr = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'flame': {
      // stylized flame tongue with an inner cut
      g.beginPath();
      g.moveTo(0, -c * 0.95);
      g.bezierCurveTo(c * 0.55, -c * 0.35, c * 0.7, c * 0.3, 0, c * 0.85);
      g.bezierCurveTo(-c * 0.7, c * 0.3, -c * 0.55, -c * 0.35, 0, -c * 0.95);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(0, -c * 0.2); g.bezierCurveTo(c * 0.25, c * 0.1, c * 0.25, c * 0.45, 0, c * 0.55); g.bezierCurveTo(-c * 0.25, c * 0.45, -c * 0.25, c * 0.1, 0, -c * 0.2);
      g.globalAlpha = 0.45; g.fill();
      break;
    }
    case 'ember': glow(c * 0.6); g.beginPath(); g.arc(0, 0, c * 0.2, 0, Math.PI * 2); g.fill(); break;
    case 'shard': g.beginPath(); g.moveTo(0, -c * 0.95); g.lineTo(c * 0.32, c * 0.1); g.lineTo(0, c * 0.8); g.lineTo(-c * 0.32, c * 0.1); g.closePath(); g.fill(); break;
    case 'diamond': g.beginPath(); g.moveTo(0, -c * 0.8); g.lineTo(c * 0.5, 0); g.lineTo(0, c * 0.8); g.lineTo(-c * 0.5, 0); g.closePath(); g.fill(); break;
    case 'leaf': {
      g.beginPath(); g.moveTo(0, -c * 0.9); g.quadraticCurveTo(c * 0.7, -c * 0.1, 0, c * 0.9); g.quadraticCurveTo(-c * 0.7, -c * 0.1, 0, -c * 0.9); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.lineWidth = c * 0.06; g.beginPath(); g.moveTo(0, -c * 0.6); g.lineTo(0, c * 0.75); g.stroke();
      break;
    }
    case 'petal': g.beginPath(); g.ellipse(0, 0, c * 0.4, c * 0.8, 0, 0, Math.PI * 2); g.fill(); break;
    case 'snow': {
      g.lineWidth = c * 0.1;
      for (let i = 0; i < 6; i++) {
        g.save(); g.rotate((i / 6) * Math.PI * 2);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -c * 0.85); g.stroke();
        g.beginPath(); g.moveTo(0, -c * 0.5); g.lineTo(c * 0.22, -c * 0.7); g.moveTo(0, -c * 0.5); g.lineTo(-c * 0.22, -c * 0.7); g.stroke();
        g.restore();
      }
      break;
    }
    case 'bubble': {
      g.lineWidth = c * 0.1; g.beginPath(); g.arc(0, 0, c * 0.75, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.25; g.beginPath(); g.arc(0, 0, c * 0.7, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.beginPath(); g.ellipse(-c * 0.3, -c * 0.32, c * 0.16, c * 0.1, -0.7, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'skull': {
      g.beginPath(); g.arc(0, -c * 0.12, c * 0.62, 0, Math.PI * 2); g.fill();
      g.fillRect(-c * 0.36, c * 0.25, c * 0.72, c * 0.45);
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(-c * 0.25, -c * 0.1, c * 0.17, 0, Math.PI * 2); g.arc(c * 0.25, -c * 0.1, c * 0.17, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(0, c * 0.12); g.lineTo(c * 0.08, c * 0.26); g.lineTo(-c * 0.08, c * 0.26); g.fill();
      for (let i = -1; i <= 1; i++) g.fillRect(i * c * 0.17 - c * 0.03, c * 0.45, c * 0.06, c * 0.25);
      break;
    }
    case 'heart': {
      g.beginPath(); g.moveTo(0, c * 0.75);
      g.bezierCurveTo(-c * 1.1, -c * 0.1, -c * 0.5, -c * 0.95, 0, -c * 0.4);
      g.bezierCurveTo(c * 0.5, -c * 0.95, c * 1.1, -c * 0.1, 0, c * 0.75); g.fill();
      break;
    }
    case 'plus': g.fillRect(-c * 0.18, -c * 0.7, c * 0.36, c * 1.4); g.fillRect(-c * 0.7, -c * 0.18, c * 1.4, c * 0.36); break;
    case 'cross': g.rotate(Math.PI / 4); g.fillRect(-c * 0.12, -c * 0.75, c * 0.24, c * 1.5); g.fillRect(-c * 0.75, -c * 0.12, c * 1.5, c * 0.24); break;
    case 'rune1': case 'rune2': case 'rune3': case 'rune4': {
      g.lineWidth = c * 0.12;
      g.beginPath(); g.arc(0, 0, c * 0.82, 0, Math.PI * 2); g.stroke();
      g.lineWidth = c * 0.1;
      const k = Number(name.slice(-1));
      g.beginPath();
      if (k === 1) { g.moveTo(0, -c * 0.5); g.lineTo(0, c * 0.5); g.moveTo(-c * 0.3, -c * 0.2); g.lineTo(c * 0.3, c * 0.2); }
      if (k === 2) { g.moveTo(-c * 0.35, -c * 0.45); g.lineTo(c * 0.35, -c * 0.45); g.lineTo(-c * 0.35, c * 0.45); g.lineTo(c * 0.35, c * 0.45); }
      if (k === 3) { g.moveTo(0, -c * 0.5); g.lineTo(c * 0.42, c * 0.35); g.lineTo(-c * 0.42, c * 0.35); g.closePath(); g.moveTo(0, -c * 0.1); g.lineTo(0, c * 0.2); }
      if (k === 4) { g.arc(0, 0, c * 0.35, 0.3, Math.PI * 1.7); g.moveTo(c * 0.35, 0); g.lineTo(c * 0.55, 0); }
      g.stroke();
      break;
    }
    case 'clock': {
      g.lineWidth = c * 0.1; g.beginPath(); g.arc(0, 0, c * 0.82, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.fillRect(-c * 0.03, -c * 0.78, c * 0.06, i % 3 ? c * 0.12 : c * 0.2); g.restore(); }
      g.lineWidth = c * 0.09; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -c * 0.55); g.moveTo(0, 0); g.lineTo(c * 0.35, c * 0.12); g.stroke();
      break;
    }
    case 'gear': {
      g.beginPath();
      const teeth = 10;
      for (let i = 0; i < teeth * 2; i++) {
        const r = i % 2 ? c * 0.62 : c * 0.85, a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
        g.arc(0, 0, r, a0, a1);
      }
      g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, c * 0.28, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'bolt': g.beginPath(); g.moveTo(c * 0.15, -c * 0.95); g.lineTo(-c * 0.45, c * 0.1); g.lineTo(-c * 0.02, c * 0.1); g.lineTo(-c * 0.2, c * 0.95); g.lineTo(c * 0.48, -c * 0.15); g.lineTo(c * 0.05, -c * 0.15); g.closePath(); g.fill(); break;
    case 'feather': {
      g.beginPath(); g.moveTo(0, -c * 0.9); g.quadraticCurveTo(c * 0.45, 0, 0, c * 0.9); g.quadraticCurveTo(-c * 0.3, 0, 0, -c * 0.9); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.lineWidth = c * 0.05;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, -c * 0.5 + i * c * 0.25); g.lineTo(c * 0.3, -c * 0.62 + i * c * 0.25); g.stroke(); }
      break;
    }
    case 'bone': {
      g.fillRect(-c * 0.55, -c * 0.12, c * 1.1, c * 0.24);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { g.beginPath(); g.arc(sx * c * 0.6, sy * c * 0.14, c * 0.17, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'claw': {
      for (let i = -1; i <= 1; i++) {
        g.save(); g.translate(i * c * 0.32, 0); g.rotate(0.35);
        g.beginPath(); g.moveTo(0, -c * 0.9); g.quadraticCurveTo(c * 0.14, 0, 0, c * 0.9); g.quadraticCurveTo(-c * 0.06, 0, 0, -c * 0.9); g.fill();
        g.restore();
      }
      break;
    }
    case 'drop': g.beginPath(); g.moveTo(0, -c * 0.9); g.bezierCurveTo(c * 0.6, -c * 0.1, c * 0.6, c * 0.75, 0, c * 0.75); g.bezierCurveTo(-c * 0.6, c * 0.75, -c * 0.6, -c * 0.1, 0, -c * 0.9); g.fill(); break;
    case 'hex': {
      g.lineWidth = c * 0.12; g.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineTo(Math.cos(a) * c * 0.8, Math.sin(a) * c * 0.8); }
      g.closePath(); g.stroke(); break;
    }
    case 'square': g.fillRect(-c * 0.55, -c * 0.55, c * 1.1, c * 1.1); break;
    case 'swirl': case 'spiral': {
      g.lineWidth = c * (name === 'swirl' ? 0.14 : 0.09);
      g.beginPath();
      for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * Math.PI * (name === 'swirl' ? 3 : 5), r = c * 0.85 * t; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.stroke(); break;
    }
    case 'crescent': case 'moon': {
      g.beginPath(); g.arc(0, 0, c * 0.8, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(c * (name === 'moon' ? 0.35 : 0.2), -c * 0.2, c * 0.72, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'eye': {
      g.beginPath(); g.moveTo(-c * 0.9, 0); g.quadraticCurveTo(0, -c * 0.8, c * 0.9, 0); g.quadraticCurveTo(0, c * 0.8, -c * 0.9, 0); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, c * 0.32, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over'; g.beginPath(); g.arc(0, 0, c * 0.16, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'streak': {
      const gr = g.createLinearGradient(0, -c, 0, c);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-c * 0.12, -c, c * 0.24, c * 2); break;
    }
    case 'note': g.beginPath(); g.ellipse(-c * 0.2, c * 0.45, c * 0.3, c * 0.22, -0.4, 0, Math.PI * 2); g.fill(); g.fillRect(c * 0.04, -c * 0.8, c * 0.12, c * 1.3); g.fillRect(c * 0.04, -c * 0.8, c * 0.45, c * 0.15); break;
    case 'zzz': g.font = `bold ${c * 1.3}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', 0, 0); break;
    case 'soul': {
      const gr = g.createRadialGradient(0, c * 0.2, 0, 0, c * 0.2, c * 0.6);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, c * 0.2, c * 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(-c * 0.35, c * 0.25); g.quadraticCurveTo(-c * 0.2, -c * 0.6, 0, -c * 0.95); g.quadraticCurveTo(c * 0.2, -c * 0.6, c * 0.35, c * 0.25); g.closePath(); g.globalAlpha = 0.7; g.fill();
      break;
    }
    case 'thorn': g.beginPath(); g.moveTo(0, -c * 0.95); g.quadraticCurveTo(c * 0.2, 0, c * 0.35, c * 0.9); g.lineTo(-c * 0.35, c * 0.9); g.quadraticCurveTo(-c * 0.2, 0, 0, -c * 0.95); g.fill(); break;
    case 'rock': {
      g.beginPath();
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, r = c * (0.55 + rnd() * 0.3); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); break;
    }
    case 'wave': g.lineWidth = c * 0.16; g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40; g.lineTo((t - 0.5) * c * 1.7, Math.sin(t * Math.PI * 2) * c * 0.35); } g.stroke(); break;
    case 'halo': {
      const gr = g.createRadialGradient(0, 0, c * 0.5, 0, 0, c * 0.95);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, c * 0.95, 0, Math.PI * 2); g.fill(); break;
    }
    case 'crack': {
      g.lineWidth = c * 0.08;
      for (let i = 0; i < 6; i++) {
        let x = 0, y = 0, a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
        g.beginPath(); g.moveTo(0, 0);
        for (let s = 0; s < 4; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * c * 0.22; y += Math.sin(a) * c * 0.22; g.lineTo(x, y); }
        g.stroke();
      }
      break;
    }
    default: glow(c * 0.9);
  }
  g.restore();
}

export function getAtlas() {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELL * GRID;
  const g = canvas.getContext('2d');
  list.forEach((name, i) => {
    const x = (i % GRID) * CELL, y = Math.floor(i / GRID) * CELL;
    g.save();
    g.translate(x, y);
    g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip();
    draw(g, name, CELL);
    g.restore();
    SPRITES[name] = i;
  });
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}
export const ATLAS_GRID = GRID;
export function spriteIndex(name) { getAtlas(); return SPRITES[name] ?? 0; }
