# Skill Forge

Prototype of the procedural power generator described in [docs/procedural-power-system.md](../../docs/procedural-power-system.md). No dependencies, plain JavaScript modules, Node 18+.

## Try it

```sh
cd prototypes/skill-forge
node cli.js                          # forge 6 random powers
node cli.js --tier godly --count 3   # only godly powers
node cli.js --essence time,death     # lock up to 3 essences
node cli.js --code "KV.G.time"       # rebuild a power from its code
node cli.js --evolve                 # show each power evolved once
node cli.js --stats 20000            # rule checks and variety stats
node bundle.js                       # build dist/skill-forge.html, a single-file page
```

The page (`index.html` + `app.js`) needs a static server because it loads ES modules (`python3 -m http.server`, then open http://localhost:8000). `dist/skill-forge.html` works straight from disk.

## Codes

Every power is a pure function of its code, so a code is all you need to share or replay one.

| Code | Meaning |
|---|---|
| `K2.G.time` | seed `K2`, tier Godly, essence locked to Time |
| `K2.G.time>` | the same power, evolved once (`>>` twice, and so on) |
| `(K15.E)x(K2.G.time)` | a fusion of two powers |

Tier letters: C, R, E, L, G.

## Files

| File | What it holds |
|---|---|
| `data-atoms.js` | tiers, atoms, shapes, modifiers, intents, triggers, drawbacks, evolution paths |
| `data-essences.js` | the 16 essences: weights plus words, colors, creatures and forms |
| `forge.js` | the generator: forge, evolve, fuse, budget solver, codes |
| `describe.js` | names, rules text, DNA tree |
| `shared.js` | rules used by both (controls, cooldowns, labels) |
| `rng.js` | deterministic PRNG |
| `cli.js` | command line forge and checks |
| `index.html`, `app.js` | the draft page |
| `bundle.js` | inlines everything into one HTML file |

## Tuning

Almost everything is data. To change how powers feel, edit weights and costs in `data-atoms.js` and `data-essences.js`, then run `node cli.js --stats 20000` to check the rules still hold and see how variety moved.
