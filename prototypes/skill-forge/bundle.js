#!/usr/bin/env node
// Inlines the ES modules into one self-contained page: dist/skill-forge.html.
// That file opens straight from disk or a phone, with no server needed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ORDER = ['rng.js', 'data-atoms.js', 'data-essences.js', 'shared.js', 'describe.js', 'forge.js', 'app.js'];

function wrap(file) {
  let src = readFileSync(join(here, file), 'utf8');
  const exported = [];
  src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'\.\/[^']+';/g, (_, names) => `const {${names}} = __mods;`);
  src = src.replace(/^export (async function|function|const|let) (\w+)/gm, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*export\s/m.test(src)) throw new Error(`${file}: unsupported export form`);
  return `// ── ${file}\n(() => {\n${src}\nObject.assign(__mods, { ${exported.join(', ')} });\n})();\n`;
}

const bundle = 'const __mods = {};\n' + ORDER.map(wrap).join('\n');
const page = readFileSync(join(here, 'index.html'), 'utf8')
  .replace('<script type="module" src="app.js"></script>', () => `<script>\n${bundle}</script>`);
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'skill-forge.html'), page);
console.log(`Wrote dist/skill-forge.html (${(page.length / 1024).toFixed(1)} KB)`);
