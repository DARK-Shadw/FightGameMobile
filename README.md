# FightGameMobile

A mobile PvP brawler: LF2-style fights with Brawl Stars-style controls and art, where every match gives you a new power the game invents on the spot.

- [Procedural power system](docs/procedural-power-system.md): the design brainstorm.
- [Skill Forge prototype](prototypes/skill-forge): a working generator for those powers, with a CLI and a draft page.
- [Skill Forge Arena](demo): the playable game. 3v3 fights where you start with a basic attack and forge tier-capped powers as you level up mid-match. Characters, creatures and effects are all generated in code. It runs in the browser, over LAN (browsers via a tiny Node server, or phones), and as an Android app (`demo/tools/build-apk.sh`).
