// Builds the single-file page: the whole game (and the Skill Forge engine it
// imports) bundled and minified into one inline module. Three.js loads from
// jsDelivr through an import map, the display font from Google Fonts.
//   node tools/build.js            → dist/skill-forge-arena.html
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.186.1/';

const res = await build({
  entryPoints: [here('../src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  external: ['three', 'three/addons/*'],
  target: ['es2020'],
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// Page styles and markup come from index.html; the publish skeleton adds
// doctype/head/body, so only the contents go in.
const src = await readFile(here('../index.html'), 'utf8');
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = src.match(/<body>([\s\S]*?)<script type="module"/)[1].trim();

const html = `<title>Skill Forge Arena</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&display=swap" rel="stylesheet">
<style>${style}</style>
${body}
<script type="importmap">{"imports":{"three":"${THREE}build/three.module.js","three/addons/":"${THREE}examples/jsm/"}}</script>
<script type="module">${js}</script>
`;
await mkdir(here('../dist/'), { recursive: true });
await writeFile(here('../dist/skill-forge-arena.html'), html);
console.log(`dist/skill-forge-arena.html  ${(html.length / 1024).toFixed(0)} KB (script ${(js.length / 1024).toFixed(0)} KB)`);
