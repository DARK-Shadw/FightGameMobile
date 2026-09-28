// Static dev server rooted at the repo, so the demo can import the Skill Forge
// modules from ../prototypes. Three.js is served from node_modules under the
// same path the page's import map uses on jsDelivr.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const THREE_DIR = fileURLToPath(new URL('../node_modules/three', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.1/';

export function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (clean.startsWith('/vendor/three/')) return join(THREE_DIR, clean.slice('/vendor/three/'.length));
  return join(ROOT, clean);
}

export function startServer(port = 0) {
  const server = http.createServer(async (req, res) => {
    let file = resolvePath(req.url);
    if (file.endsWith('/')) file += 'index.html';
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found: ' + req.url);
    }
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 8080);
  startServer(port).then(() => console.log(`Serving repo at http://127.0.0.1:${port}/demo/`));
}
