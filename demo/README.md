# Skill Forge Arena

A 3v3 Brawl Stars-style brawler where every power is forged by the [Skill Forge](../prototypes/skill-forge) mid-match. No power is a preset. Fireballs, time stops, necromancy and dragon forms all come out of the same generator, and the game turns each power's DNA into gameplay and visuals.

Everything you see is made in code at load time: characters, creatures, props and effects are sculpted from signed distance fields, meshed, rigged and animated procedurally. There are no model, texture or audio files.

It runs in a browser, on a LAN with friends, and as an Android app.

## Run it

```sh
cd demo
npm install
npm run dev                      # http://127.0.0.1:8080/demo/
node tools/build.js              # dist/skill-forge-arena.html, the published single page
node tools/build.js --offline    # dist/offline/index.html, fully offline (three.js and fonts inside)
```

The dev server serves the repository root, because the game imports the Skill Forge modules from `../prototypes`.

## How a match flows

1. **Title.** Pick your brawler, then PLAY (3v3 with bots) or LAN PARTY.
2. **Start with your fists.** Everyone begins at level 1 with only a basic attack.
3. **Earn XP.** Damage, knockouts (worth more against higher levels), assists, forge shards dropped by the fallen or spawned at the two wells, and a slow trickle. A team trailing by 2 knockouts gets +30% XP.
4. **Level up mid-fight.** Each level opens a picker at the bottom of the screen. The fight doesn't pause. Tap a card to read it, tap again to forge it, or tuck the picker away and choose later.
5. **Win.** First team to 20 knockouts, or the leader when 4½ minutes run out. A tie goes to overtime, where the next knockout wins.

### Rarity is earned, not rolled

Each level caps how rare a power can be. You can't jump into epic or godly powers early:

| Level | XP | Spell slots | Rarity cap | The level-up offers |
|---|---|---|---|---|
| 1 | 0 | 0 | none | basic attack only |
| 2 | 100 | 1 | Rare | 3 new spells |
| 3 | 320 | 2 | Epic | 2 new spells + an evolution or a stat |
| 4 | 660 | 2 | Epic | evolve, a stat, or trade your weakest spell |
| 5 | 1080 | 3 | Legendary | 2 new spells + an evolution |
| 6 | 1600 | 3 | Legendary | evolve, fuse two spells, or a stat |
| 7 | 2200 | 3 | Godly | evolve into godly, or trade for an ultimate |

- **Ultimates.** Godly powers have no cooldown. They charge from the damage you deal, and slowly over time.
- **Pacing.** In a typical match you reach level 2 in about 30 seconds and level 5 around the 3-minute mark. Level 7 comes near the end, so reality-breaking powers are the finale, not the opener.
- **Passives.** "When you take a hit" and "every few seconds" powers sometimes replace a stat card. You can hold up to two.

### Controls

| | Phone | Desktop |
|---|---|---|
| Move | Left thumb stick (appears where you touch) | WASD or arrows |
| Attack | Big button: drag to aim, release to fire; tap auto-aims | Click (hold to keep firing) or Space, aims at the cursor |
| Spells | Round buttons, unlocked at levels 2, 3 and 5: drag to aim, tap auto-aims | Q, E, R cast at the cursor (F: a stolen power) |
| Level-up picker | Tap a card, tap again to forge | 1–3 select, same key or Enter forges |
| Leave a match | Back twice | Esc twice |

## LAN multiplayer

Up to 6 players on the same Wi-Fi, 3v3. Bots fill empty seats unless the host turns them off. The host device runs the match: the rules, the bots, every hit. The other devices send their moves and show what the host sends back, 20 times a second.

- **In browsers:** run `node tools/lan-server.js` on any computer. It needs no dependencies and builds the offline page if needed. Every phone and computer on the network opens the address it prints (for example `http://192.168.1.10:8080`) and taps **LAN PARTY**. One device hosts, the others tap the party in the Join list.
- **On Android:** install the APK on each phone and tap **LAN PARTY**. A phone that hosts runs its own relay and announces the party over UDP, so the others see it in the Join list. You can also type the address shown on the host's screen.
- **In the party lobby:** everyone picks a brawler and a team. The host sets the match length (3, 4½ or 6 min) and the bots, then starts. After each match, everyone comes back to the party.
- **Leaving:** if a player leaves mid-match, a bot takes over their brawler. If the host leaves, the party ends for everyone.

How it works:

- **Relay protocol:** [`src/net/PROTOCOL.md`](src/net/PROTOCOL.md). Both relays, the Node one and the Android one, pass the same conformance test: `node tools/relay-test.mjs ws://127.0.0.1:8080/ws`.
- **Replication:** [`src/net/sync.js`](src/net/sync.js). Joiners replay casts for their visuals only and move their own brawler themselves. Everyone else is shown 100 ms in the past so their motion stays smooth.
- **Test:** `node tools/lan-test.cjs [--stress]` plays a two-page match through the server.

## Android app

```sh
tools/build-apk.sh               # → dist/SkillForgeArena.apk (min Android 7.0, signed with android/debug.keystore)
adb install -r dist/SkillForgeArena.apk
```

The app is a full-screen WebView around the offline page, plus a small Java layer ([`android/src`](android/src)) for the LAN relay, room discovery, the back button and vibration.

The build runs without Gradle and without Google's SDK downloads. The tools come from Ubuntu's archive: `aapt`, `dalvik-exchange` (dx), `zipalign`, `apksigner` and `android-sdk-platform-23`. The script installs any that are missing.

## URL options

| Option | Effect |
|---|---|
| `?code=KV.G.time,K5.G.death` | Start at max level with these Skill Forge powers (sandbox) |
| `?level=4` | Start at that level with its picks waiting |
| `?time=90` | Match length in seconds |
| `?auto=1` | Your seat is played by a bot too (`&rounds=N`: menus click themselves) |
| `?lab=1` | Fixed-timestep driver for the screenshot tools (`&ui=title|picker|results` shows a screen) |

Try `KV.G.time` (stop time for the whole arena), `ZB5.G` (a titan crashes down), `KD.L.fire` (become a dragon), `Z64.G` (raise the dead), `ZNI.G` (rewind yourself).

## Code map

| Folder | What lives there |
|---|---|
| `src/engine` | SDF sculpting (`sdf.js`), surface-nets mesher, rigging, face decals, the spring animator, toon and outline materials, the stage with its post chain (sanitize, bloom, grade, time-stop, rewind, flashes) |
| `src/art` | Kai and the three opponents, arena props, the creature library (64 creatures: minions, titans, forms, critters) and its faster mesher |
| `src/game` | World and fighters, `powers.js` (all 17 power shapes running from DNA), `atoms.js` (what each effect does), summons, bots, input, the match and its progression (`match.js`, `progression.js`), HUD, level-up picker, menus, lobby, procedural sound, type and text (`theme.js`, `text.js`) |
| `src/net` | LAN play: relay client, party lobby, match replication |
| `src/vfx` | Particle atlas and systems, toon cloud puffs, energy meshes, per-essence styles, power visuals and status visuals |
| `src/lab` | Visual QA scenes: `power` (cast any code at dummies), `hero`, `anim`, `brawl`, `creatures`, `vfx`, `arena`, `budget` |
| `android` | The Android shell: manifest, icon, WebView activity, relay, UDP beacon and discovery |
| `tools` | Dev server, builds (page, offline page, APK), LAN server, headless screenshot harness, tests |
| `assets/fonts` | Lilita One and Nunito (SIL Open Font License), embedded in the builds |

### From DNA to screen

A power is a tree:

- A **shape** (bolt, cone, zone, beam, dash, leap, global, and 10 more) carries **atoms** (damage, stun, time stop, summon, transform...).
- **Modifiers** (split, homing, echo, lingering...) bend the shape, and it can chain into a second shape.
- `powers.js` runs each shape as an entity, and `atoms.js` applies each atom to whoever the shape reaches.
- The visual layer reads the same DNA. The essence picks colors, particle shapes, cloud ramps and sounds, the shape picks the effect, and law-breaking powers get a cinematic wind-up.
- `text.js` turns the same DNA into card text. It gives a one-line headline, then one line per effect with an icon, then the numbers as chips.

## QA tools

```sh
node tools/shoot.cjs "lab.html?scene=power&code=KV.G.time" shots/x.png --w 1280 --h 720 --warm 1 --frames 8 --dt 0.2 --cols 4 --scale 0.5
node tools/shoot.cjs "index.html?lab=1&ui=picker&level=3&sel=1" shots/picker.png --page 1 --waitfor __labReady
node tools/e2e.cjs                 # built page, played like a person: title, play, first level-up, forge, fight
node tools/soak.cjs 3 150          # three 150 s matches of bots, menus clicking themselves, errors reported
node tools/curve.cjs 270           # how fast levels come in a bot match
node tools/lan-test.cjs --stress   # two pages over the LAN server: summons, forms, time stop kept in sync
```

## Performance

- Heroes are meshed a little coarser for gameplay than for close-ups.
- Props are instanced in spatial chunks, so the camera and the shadow map cull what is off screen.
- While frames run slow, a governor lowers the resolution and then turns off bloom.
- A full match frame is about 2.5 to 3 million triangles across all passes.
- Creatures a power can summon are baked when the power is forged.
