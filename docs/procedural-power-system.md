# Procedural Power System

Design brainstorm for the power system of a mobile PvP brawler: LF2-style fights, Brawl Stars-style controls and look, and a new power every match that the game grows from scratch instead of picking from a list.

A working prototype of everything below lives in [`prototypes/skill-forge`](../prototypes/skill-forge).

## The idea in one paragraph

Don't design skills. Design the atoms that skills are made of, the grammar that joins them, and a budget that prices them. When a player levels up, the game grows a small tree of atoms around one intent, spends the budget on its numbers, then names it and draws it from its own DNA. "Time stop", "rewind" and "necromancy" are never written anywhere. They show up when the dice land on the right atoms.

It works like chemistry: nobody authors water, you author hydrogen, oxygen and the bonding rules.

## Why element classes plus combos still end up as presets

Classes like Fire, Water, Earth, Time with a skill list each are presets. A combo table ("Fire + Time = X") is still presets, just N² of them. Either way a human wrote every result.

The fix is to push the creative part one level down:

- **Essences** (Fire, Time, Death...) stop being skill lists. Each one becomes a flavor vector: weights over atoms, shapes and modifiers, plus colors, words and creatures.
- **Atoms** are mechanical verbs the engine understands: deal damage, change an entity's clock, snapshot and restore state, spawn an entity from a template, take over input.
- **Skills** are trees of atoms, built by a typed grammar.

Blending two essences blends their weights, so a Frost + Void power that stops time across the whole arena can appear even though nobody wrote a "Frost + Void" entry.

## The model

### 1. Atoms: what the engine can do

About 40 atoms in 7 families. Every power, from a fireball to a time stop, is made of these.

| Family | Atoms |
|---|---|
| Harm | damage, damage over time, delayed mark, execute below X% |
| Force | knockback, pull, launch |
| Control | slow, root, stun, silence, blind, confuse (inverted controls), fear |
| Sustain and buffs | heal, shield, lifesteal, cleanse, haste, empower, invisibility, teleport, reflect |
| Creation | terrain, summon |
| Minor laws (bend a rule) | clones, polymorph, swap places, steal a power, soul link, null field, time slow, time haste, transformation |
| Major laws (break a rule) | time stop, rewind, raise the dead, summon a titan, mind control, HP exchange, resurrection |

"Godly" is not bigger numbers. Godly means access to laws: atoms that break the rules of the match. That is why a top-tier power feels like a different category, not +50% damage.

### 2. Shapes: how a power reaches the world

The carrier (shape) decides the controls, so the UI stays the same no matter what you roll.

| Control | Shapes |
|---|---|
| Aim a direction | bolt, cone, dash, wall, tether |
| Aim a spot | lob, zone, leap, trap, sky strike |
| Tap | nova, aura, orbitals, self, imbue next attacks, whole arena |
| Hold | beam, anything with a charge-up modifier |
| No button | passives, fired by a trigger |

The HUD is always Attack, Power 1, Power 2, Ultimate. The shape picks the gesture.

### 3. The grammar (the power's DNA)

```
POWER   := TRIGGER  SHAPE  [MODIFIER...]  PAYLOAD  [DRAWBACK...]
PAYLOAD := ATOM... [ on(hit | end | kill | landing) -> SHAPE PAYLOAD ]
```

- **Trigger**: pressed, or a passive: below 30% HP, when hit, on dodge, on kill, when you would die, every N seconds.
- **Modifiers**: pierce, split, chain, homing, boomerang, growing, lingering, volley, delayed, charge-up, echo, mirror, phasing.
- **Chains** are the recursion: a bolt that on impact opens a field that freezes time. This is where powers start to feel like they were designed on purpose.
- **Type rules** keep trees valid: harmful atoms need a shape that hits enemies, rewind only rides on "self", swap needs a single target, mind control can't live on a lingering field, one hard crowd control per payload, one law per power.

### 4. Essences are flavor vectors

Each of the 16 essences carries weights for atoms, shapes, modifiers, intents and drawbacks, plus the dressing:

| Essence | Leans toward | Dressing |
|---|---|---|
| Fire | damage, burn, bolts, novas, splitting | imps, Fire Drake, Dragon form, meteors |
| Time | time slow and stop, rewind, echo, delay | echoes of your past self, your Future Self, snail hex |
| Death | raise dead, lifesteal, execute, wither | skeletons, Bone Dragon, Lich form |
| Space | teleport, swap, pull, portals, phasing | starlings, Star Serpent, gravity warps |
| Mind | confuse, control, illusions, silence | phantasms, sheep hex, mass delusion |

Every atom takes its flavor from whichever essence cares about it most. A Fire + Death power burns with fire but raises the dead as skeletons, and a Death + Beast titan comes out as a Bone Dragon.

### 5. Intent first, or you get oatmeal

Kate Compton's "10,000 bowls of oatmeal" problem: you can generate endless variations that are all technically unique and all feel the same. Pure random trees are also incoherent.

So each power starts from an **intent**: Blast, Control, Zone, Summoner, Shapeshift, Trickster, Sustain, Assassin, Chrono, Reaper, Chain Reaction, Sacrifice, Guardian, Domain, Barrage. The intent biases which atoms and shapes get picked. Then:

1. Pick the **keystone** atom first, so the power has an identity.
2. Pick a shape that can carry the keystone.
3. Add extras while there is room in the tree.

Intents are abstract fantasies, not skills. Chrono + Frost can become a rune that freezes time, Chrono + Beast can summon echoes of your past self.

### 6. Power budget: from fireball to godhood

Every shape, atom and modifier has a structural cost in Power Points (PP). Every step of every number (damage, radius, duration, and seconds off the cooldown) has a price too.

| Tier | Budget | Max nodes | Laws |
|---|---|---|---|
| Common | 10 PP | 3 | none |
| Rare | 15 PP | 4 | none |
| Epic | 22 PP | 5 | sometimes minor |
| Legendary | 32 PP | 6 | minor |
| Godly | 46 PP | 7 | major, always |

Budget first, numbers second. The generator builds the structure, then spends what is left on numbers using a per-power **personality** (random weights over its parameters). The same structure can come out as a slow, huge sun or a rapid-fire ember. Same atoms, different feel.

### 7. Drawbacks buy power

Drawbacks refund PP: HP cost, long windup, slowed afterwards, fragile afterwards, hits you too, wild aim, locks your other powers, reveals you, blood debt ("if nobody dies in 6s you lose 25% max HP"), twice per match. High tiers reach for drawbacks first, which gives godly powers a "forbidden art" feel.

## Coverage test: can the atoms rebuild famous powers?

If the atom set can rebuild well-known powers, it can generate new ones of the same caliber.

| Power | Built from |
|---|---|
| Fireball | bolt → damage + burn |
| Time stop ("The World") | whole arena → time stop, damage stored until time resumes |
| Rewind | self → rewind 3s |
| Necromancy | field → raise the fallen; or passive on kill → raise |
| Dragon's power | self → transformation (Dragon: bigger, fire-breath attacks, flight) |
| Black hole (Brawl Stars' Tara) | lob → pull + damage |
| Grab (Brawl Stars' Gene) | bolt → pull toward you |
| Force field (LF2's John) | aura → reflect |
| Clones (LF2's Rudolf) | self → clones |
| Phoenix | passive when you would die → resurrect + nova |
| Doom | bolt → delayed mark → execute below X% |

## Fair and readable in PvP

Random powers in a competitive game only work if they are fair and readable.

- **Hard caps.** At most 2.5s of hard crowd control per power. Major laws never recharge faster than 20s. Anything that stays on the field (forms, clones, summons) always ends at least 2s before the power is ready again.
- **Telegraphs.** Every law has a windup of at least 0.35s (minor) or 0.6s (major) and a visible warning.
- **Simulation gauntlet.** Before a new power is offered, run it through a few hundred headless bot duels on the server. Reject or retune it if its win rate lands outside 40 to 60%, if it does nothing, or if it soft-locks someone.
- **Balance the periodic table, not the molecules.** You can't balance a power that exists once. But atoms show up in millions of powers, so you can regress match results on atom usage and re-price atoms every week.
- **Visual grammar.** Shape means carrier (a circle on the ground is a zone, a line is a beam), color means what it does to you, icons mean statuses. A power nobody has seen before still reads instantly: "gold circle with a clock icon, don't stand there".
- **Killcam card.** When you die, you see the card that killed you, name and rules. It teaches, and it creates hype.

## The match loop

Recommendation: powers last one match, like a roguelite. Everyone starts equal, and bad luck only lasts one game.

- Start with a basic kit (move, attack, dodge) and one Common power.
- Level up from hits, KOs and objectives. Each level-up offers a **draft of 3**: new powers, stat upgrades, or mutations of powers you already have.
- **Attunement** gives you some control over the randomness: stat picks tilt future drafts toward an essence, and two attunements unlock blends.
- **Evolve**: one mutation and one tier up (new modifier, new chain, a new essence, or the keystone ascends: slow → time slow → time stop). The power keeps its old numbers and spends the new budget on top, so it grows instead of rerolling.
- **Fuse**: two powers become one. The first keeps its shape, and the second goes off on impact, at the end, or on a kill.
- **Steal** (idea): a KO lets you absorb a mutated copy of the victim's power. "He stole my time stop and used it on me" is a story players will tell.
- **Catch-up** (idea): players who are behind get higher-tier drafts, Mario Kart style. Godly powers become comeback moments.
- **Godly reveal**: a global banner when someone rolls a godly power. It builds hype and warns everyone to play around it.
- **Grimoire** (meta progression): every power you forge is saved by code. Collect them, share them, chase first discoveries. Cosmetics and codex, not stats.

## Tech to lock in early

These are cheap on day one and very expensive to retrofit.

- **A power is data, the engine is an interpreter.** A power is a small tree plus a seed. The server forges it (authoritative, no cheating) and sends the DNA; every client rebuilds the same logic and visuals.
- **Deterministic generation.** One seeded PRNG, integer or fixed-point math, no platform `Random`. Then a short code rebuilds any power anywhere, which gives you sharing, replays and bug reports for free.
- **Every entity has its own clock.** Movement, cooldowns, animation, projectiles and DoTs all run on entity-local delta time. Time slow and time stop are impossible to add later without this.
- **Keep a state history.** The server already keeps a few seconds of snapshots for lag compensation. Rewind, echoes and "summon your past self" reuse it.
- **Everything spawns from templates.** Projectiles, minions, clones, walls and dragon forms all go through one spawn system, so raise, clone and transform are "spawn template X, owner Y".
- **Composed visuals.** Essence gives the palette and particles, the shape gives the mesh and telegraph, modifiers give motion, tier gives scale and extra layers. 17 shapes × 16 palettes covers everything with no per-power art.
- **Optional LLM, never for mechanics.** An LLM can polish names and flavor text, or help designers invent new atoms offline. Mechanics stay deterministic and budgeted.

## Long term: a living magic ecosystem

The server can keep a gene pool of DNA that players pick, keep and win with, and breed future offers from it (Galactic Arms Race did this with evolved weapons). Seasons can shift essence weights ("the Void is spreading") so the meta changes without authoring new content.

## What the prototype shows

`prototypes/skill-forge` implements the forge, evolution, fusion and codes, plus a page for rolling level-up drafts. Measured on 20,000 forged powers:

- About 0.3ms per power in Node, fast enough to forge drafts on demand on a server.
- No rule violations (laws, crowd control caps, budgets, lasting effects vs cooldowns), and every checked code rebuilds the same power, including evolved and fused ones.
- Share of powers whose structure no other power in the sample had: Common 14%, Rare 59%, Epic 92%, Legendary 94%, Godly 95%. Commons are simple on purpose; their variety comes from numbers and flavor.

Not in the prototype yet: the combat simulation, the balance regression, attunement and stealing, and any real VFX.

## Open questions

1. Do powers last one match (roguelite, fair) or persist (RPG, grindy)? The recommendation above is one match plus a Grimoire.
2. How many active powers at once? Two plus an ultimate, or unlimited stacking like Vampire Survivors?
3. Team modes or free-for-all? Ally-affecting atoms and mind control play very differently in each.
4. Engine choice. A deterministic ECS (for example Unity with Photon Quantum) fits this model well, but any engine works if the tech list above holds.
