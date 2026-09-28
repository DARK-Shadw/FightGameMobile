// Triangle budget per mesh (instances × triangles, shadow casters marked).
import { buildArena } from '../game/arena.js';
export async function setup(stage) {
  const arena = await buildArena(stage.scene);
  const rows = [];
  stage.scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    rows.push({ name: (o.material?.type || '') + (o.isInstancedMesh ? ' inst' : '') + (o.material?.side === 1 ? ' outline' : ''), tris, n, total: tris * n, shadow: o.castShadow });
  });
  rows.sort((a, b) => b.total - a.total);
  const sum = rows.reduce((a, r) => a + r.total, 0);
  const sh = rows.filter(r => r.shadow).reduce((a, r) => a + r.total, 0);
  return { update() {}, info: () => `total ${(sum / 1e6).toFixed(2)}M, shadow casters ${(sh / 1e6).toFixed(2)}M | ` + rows.slice(0, 16).map(r => `${r.name} ${r.tris}x${r.n}=${(r.total / 1e3).toFixed(0)}k${r.shadow ? 'S' : ''}`).join(' | ') };
}
