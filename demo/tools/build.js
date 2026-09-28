// Builds the game into single self-contained HTML files: the whole game (and
// the Skill Forge engine it imports) bundled and minified into one inline
// module, fonts embedded.
//   node tools/build.js            → dist/skill-forge-arena.html   page body for the artifact
//                                     (three.js from jsDelivr through an import map)
//   node tools/build.js --offline  → dist/offline/index.html        full document, no network
//                                     at all (Android app, LAN server)
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.186.1/';
const offline = process.argv.includes('--offline');

const res = await build({
  entryPoints: [here('../src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  external: offline ? [] : ['three', 'three/addons/*'],
  target: ['es2020'],
  legalComments: 'none',
  define: { __OFFLINE__: String(offline) },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// Embedded fonts (SIL Open Font License, see assets/fonts): no font request, same look offline.
const font = async (file, family, weight) => {
  const b64 = (await readFile(here('../assets/fonts/' + file))).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
};
const fontCss = [await font('LilitaOne-latin.woff2', 'Lilita One', 400), await font('Nunito-latin.woff2', 'Nunito', '200 1000')].join('\n');

// Page styles and markup come from index.html.
const src = await readFile(here('../index.html'), 'utf8');
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = src.match(/<body>([\s\S]*?)<script type="module"/)[1].trim();
const title = 'Skill Forge Arena';

let html, out;
if (offline) {
  html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#1a0f2e">
<title>${title}</title>
<style>${fontCss}\n${style}</style>
</head>
<body>
${body}
<script type="module">${js}</script>
</body>
</html>
`;
  out = here('../dist/offline/index.html');
  await mkdir(here('../dist/offline/'), { recursive: true });
} else {
  // the publish skeleton adds doctype/head/body, so only the contents go in
  html = `<title>${title}</title>
<style>${fontCss}\n${style}</style>
${body}
<script type="importmap">{"imports":{"three":"${THREE}build/three.module.js","three/addons/":"${THREE}examples/jsm/"}}</script>
<script type="module">${js}</script>
`;
  out = here('../dist/skill-forge-arena.html');
  await mkdir(here('../dist/'), { recursive: true });
}
await writeFile(out, html);
console.log(`${out.split('/demo/')[1]}  ${(html.length / 1024).toFixed(0)} KB (script ${(js.length / 1024).toFixed(0)} KB)`);
