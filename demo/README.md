# Skill Forge Arena

A browser demo of the game: a 3v3 Brawl Stars-style brawler where every round you draft a power forged by the [Skill Forge](../prototypes/skill-forge). No power is a preset. Fireballs, time stops, necromancy and dragon forms all come out of the same generator, and the game turns each power's DNA into gameplay and visuals.

Everything you see is made in code at load time: characters, creatures, props and effects are sculpted from signed distance fields, meshed, rigged and animated procedurally. There are no model, texture or audio files.

## Run it

```sh
cd demo
npm install
npm run dev            # http://127.0.0.1:8080/demo/
npm run build          # dist/skill-forge-arena.html, a single self-contained page
```

The dev server serves the repository root, because the game imports the Skill Forge modules from `../prototypes`. Three.js comes from jsDelivr through an import map (the dev server and test tools map it to `node_modules`).

### Controls

| | Phone | Desktop |
|---|---|---|
| Move | Left thumb stick (appears where you touch) | WASD or arrows |
| Attack | Big button: drag to aim, release to fire; tap auto-aims | Click (hold to keep firing) or Space, aims at the cursor |
| Powers | Round buttons: drag to aim, tap auto-aims | Q, E, R (or 1, 2, 3) cast at the cursor |

Passive powers (for example "when you take a hit") trigger by themselves and show as small badges.

### URL options

| Option | Effect |
|---|---|
| `?code=KV.G.time,K5.G.death` | Start with these Skill Forge powers and skip the first draft |
| `?auto=1` | Your seat is played by a bot too |
| `?lab=1` | Fixed-timestep driver for the screenshot tools (`&ui=title|draft|stats` shows a menu) |

Try `KV.G.time` (stop time for the whole arena), `ZB5.G` (a titan crashes down), `KD.L.fire` (become a dragon), `Z64.G` (raise the dead), `ZNI.G` (rewind yourself).

## How a match flows

1. **Lobby.** Both teams on pedestals, and a title screen.
2. **Draft.** Three forged powers, revealed like loot. Rarer tiers take longer to flip, and godly cards get a rainbow rim.
3. **Fight.** 3v3 against bots. The first team to 5 knockouts wins, or the round times out after 90 s.
4. **Level up.** Pick a stat, then draft again. The choices are new powers, an evolution of one you own, or, from round 3, a fusion of two. Your kit holds 3 active powers.

## Code map

| Folder | What lives there |
|---|---|
| `src/engine` | SDF sculpting (`sdf.js`), surface-nets mesher, rigging, face decals, the spring animator, toon and outline materials, the stage with its post chain (bloom, grade, time-stop, rewind, flashes) |
| `src/art` | Kai and the three opponents (`heroes.js`, `heroes2.js`), arena props, the creature library (64 creatures: minions, titans, forms, critters) and its faster mesher |
| `src/game` | World and fighters, `powers.js` (all 17 power shapes running from DNA), `atoms.js` (what each effect does), summons, bots, input, HUD, draft screens, lobby, procedural sound |
| `src/vfx` | Particle atlas and systems, toon cloud puffs, energy meshes, per-essence styles, power visuals and status visuals |
| `src/lab` | Visual QA scenes: `power` (cast any code at dummies), `hero`, `anim`, `brawl`, `creatures`, `vfx`, `arena`, `budget` |
| `tools` | Dev server, headless screenshot harness, end-to-end and soak tests, single-file build |

### From DNA to screen

A power is a tree: a **shape** (bolt, cone, zone, beam, dash, leap, global, and 10 more) carrying **atoms** (damage, stun, time stop, summon, transform...), bent by **modifiers** (split, homing, echo, lingering...) and optionally chaining into a second shape. `powers.js` runs each shape as an entity. `atoms.js` applies each atom to whoever the shape reaches. The visual layer reads the same DNA: the essence picks colors, particle shapes, cloud ramps and sounds, the shape picks the effect, and law-breaking powers get a cinematic wind-up.

## QA tools

```sh
node tools/shoot.cjs "lab.html?scene=power&code=KV.G.time" shots/x.png --w 1280 --h 720 --warm 1 --frames 8 --dt 0.2 --cols 4 --scale 0.5
node tools/shoot.cjs "index.html?lab=1&ui=draft" shots/draft.png --page 1 --settle 4500   # menus (DOM included)
node tools/e2e.cjs                 # built page, played like a person: title, draft, pick, fight
node tools/soak.cjs 4              # four rounds of bots, auto-picked drafts, errors reported
```

## Performance

- Heroes are meshed a little coarser for gameplay than for close-ups.
- Props are instanced in spatial chunks, so the camera and the shadow map cull what is off screen.
- A governor lowers resolution, then shadows and MSAA, then bloom while frames run slow.
- A full match frame is about 2.5 to 3 million triangles across all passes.
- Creatures a round needs are baked before the round starts.
