# Luna Farm — collaborator pack (v31)

Everything a new Claude (or human) needs, in one document. Attach `luna_farm_handoff_v31.zip` alongside it.

---

## 1. Kickoff prompt (paste this at the top of a new chat, with the zip attached)

```
You're joining "Luna Farm", a hand-pixelled idle farm sim starring Digital Luna (DL), a chibi chocolate Havanese sheepdog. Unzip the attached luna_farm_handoff zip and read docs/HANDOFF.md first, then docs/FARM_RULES.md. The look of DL and the sheep is settled — do not redesign them; every sprite is a hand-placed text grid in src/pixel_grids.py + src/hand_sprites.py, never scaled or rotated. The game is src/sim_template.html (tunables in the RULES block, every feature exposed in the ACTIONS registry). Build with `python3 render_v3.py` from src/, verify every frame builds, run `node --check` on the template's script, smoke-test farm_sim.html in headless Chromium, then zip as the next version and show me a screenshot or GIF of what changed. I give feedback as numbered pin comments from the in-game overlay; answer them pin by pin. Be honest about weak frames. Your task: <fill in>.
```

---

## 2. Handoff

You are joining an idle pixel-art farm simulator starring **Digital Luna** (DL for short — never "DG"), a chocolate Havanese modelled on the owner's real dog, herding a small flock of sheep. It began as an agent-monitoring visualisation (archived, see below) and is now a cozy ecosystem you can interact with. The owner has strong taste, notices everything, and hates over-claiming. Show, don't tell; admit weak frames.

## Ground truth you must not relitigate
- **Art is hand-pixelled text grids.** `pixel_grids.py` holds the base SHEEP and LUNA grids (chars → `PAL` colours); `hand_sprites.py` builds every animation frame by editing those grids (`paste/clear/shift/crop/flip_v/rot90/outline`). No vector-to-pixel rasterising for characters — we tried it for ~12 versions and it was rejected every time ("10–15% cute"). Scenery only is still vector (`farm_v3.py` + `farm_vectors.py`), snapped to a palette.
- **Never scale or rotate a sprite** except an exact 90° turn. Frames are variations, not transforms.
- **DL's look is settled:** chibi proportions, big round head, long drop ears, dark eyes with a white glint (option "F" from the head bake-off — 5px eyes, fringe just brushing the top), cream beard and chest, white haunch with a brown patch, white plume tail, **no collar**. When she runs, her ears flap (three flap heights) and her head lags the body bounce. Keep that.
- **Sheep look:** round cloud, upright dark face at the front with a wool tuft, wide white eyes with a low pupil, pink nose/smile, pink ears, four 2px legs joined to a flat underside. Wool has three levels (trim / normal / overgrown).
- Every frame must **touch the ground**: the sheet builder bottom-trims per animation (`render_v3.py`). Don't defeat it.
- Palette is fixed (`PAL` in `pixel_grids.py` + extras in `hand_sprites.py`). Add colours deliberately.

## Files (all in `src/`)
| file | what |
|---|---|
| `pixel_grids.py` | base grids + palette. Start here for any character change. |
| `hand_sprites.py` | all animations, icons, people, props, `*_ANIMS` tables `(frames, fps, note)`. |
| `farm_v3.py` | `ANIMS` registry (what goes on the sheet) + `background()` scenery + lights layer. |
| `farm_vectors.py` | vector helpers for scenery (barn, fence, gate, trough, trees). |
| `render_v3.py` | builds `spritesheet.png/json`, `farm.js`, 8 backgrounds (4 phases × normal/snow), GIFs, showcase, and both HTML demos from templates. |
| `sim_template.html` | **the game.** `RULES` block at top = all tunables. Sections: runtime → clock/weather → geometry → entities → sim (`tick`) → NPCs → draw → input → action registry → comment overlay. |
| `demo_template.html` | frozen agent-monitor version; don't extend. |
| `FARM_RULES.md` | rules of the world, DL's priority order, extension recipes. |

## Build & verify (do this every time, in this order)
```
cd src && python3 hand_sprites.py          # writes check_hand_anims.png — LOOK at it
python3 -c "import hand_sprites as H; ..."  # build every frame of every *_ANIMS (catches missing grids)
python3 render_v3.py                       # sheet + demos
node --check <extracted script>            # sim_template is big; a stray brace breaks everything silently
playwright: load farm_sim.html, drive a few actions, print state, screenshot
zip as pixel_farm_sim_vN.zip; present vN_farm_sim.html + a screenshot/GIF
```
Two hard-won gotchas: (1) `str.replace` in patch scripts replaces **all** occurrences — a substring match once nuked `DL_PEEK_ANIMS`; prefer index/slice edits and assert the anchor exists. (2) The owner views files in a sandboxed mobile viewer: clipboard and downloads are blocked, so UI features need in-page fallbacks (see the comment overlay's modal).

## Feedback loop
The sim has a **comment overlay**: "add comments" freezes the farm, click drops numbered pins, "copy as markdown" gives a list like `1. [lantern] looks unrealistic (499, 276)`. The owner pastes that back. Answer pin by pin.

## How the sim thinks
- Sheep: needs-driven idle loop (graze tuft / hay / drink / rest / wander), wool grows, lambs born & grow, shelter in barn in rain (peeking heads), huddle in snow, wet/snowcap looks, footprints & mud stamps.
- DL priority: fetch (stick throw) > manual action > riding a sheep > rain shepherd (waits at the door until every sheep is in, then enters last) > dusk bed / dawn stretch > idle play (flop, stick, nibble, ride, rabbit). Any interruption drops the chase / dismounts.
- NPCs: `farmer` (twice a day: trough, hay, shear, pat DL) and `merchant` (timer: buys wool → coins → auto upgrades). Both use `npcStep` with a job plan.
- Weather: `weather ∈ sun|rain|snow`, `temp`, seasons (~9 real days each, or forced), live mode via open-meteo. Snow swaps to the snowified backgrounds; winter keeps ground snow.
- Everything triggerable is in `ACTIONS` (group, id, label, fn) → dropdown + text list. **Add new features there too.**

## Backlog the owner has expressed interest in
Crops/seasons growth, more animals, spendable wool/coin choices for the player, flock social behaviours (grooming, headbutts, lamb zoomies), DL digging/burying, crows she chases off, autumn leaves, a farmhouse, sounds. Keep each addition small, verified, and pinned-feedback-ready.

---

## 3. Rules of the world

## The world in one paragraph
A fixed isometric field (640×400 world px) with a barn at the top, a gate at the right, a trough, a hay bale, and a ring of edible grass tufts. Time runs on a clock (`clock.t` in 0–1: day → dusk → night → dawn) with four pre-tinted backgrounds. Weather rolls itself (`autoWeather`). Everything that moves is either a **sheep**, **Digital Luna (DL)**, or **small life** (bird, butterflies, rabbit). All sprites are hand-pixelled grids in `pixel_grids.py` / `hand_sprites.py`, compiled into one sprite sheet by `render_v3.py`.

## The rules (all tunables live in `RULES` at the top of `sim_template.html`)
| System | Rule |
|---|---|
| Wool | Grows shorn→full in `woolGrowSec` (150s). Click at ≥ `shearReadyAt` (.8) to shear: +1 wool bank. Below that, a click is a pet. |
| Grass | Tufts regrow at `tuftRegrowPerSec`; a grazing sheep eats at `tuftBitePerSec`; a claimed tuft can't be shared. |
| Needs | Sheep pick between: nearest tall tuft (50%), hay (12%), trough drink (10%), rest (small), or wander. Night forces rest. |
| Lambs | When settled, each sheep has `lambChancePerSec` odds; lamb follows mother, becomes a named sheep after `lambGrowMs`. Flock caps at `flockCap`. |
| Rain | Rolled every `rain.rollEveryMs`, hits with `rain.chance`, lasts `rain.lengthMs`. All sheep walk into the barn (peeking heads in the doorway); **DL waits by the door until every sheep is in, then enters last.** Manual toggle overrides auto. |
| DL autopilot | Idle rolls every ~7s of calm: flop / stick zoomies / nibble a tuft / **ride a sheep (rare)** / chase the rabbit. Dusk: trots to the barn doorway, circles, sleeps. Dawn: stretch. |
| Player verbs | Click sheep = pet or shear. Click DL = pet. Click grass = throw stick (she fetches out fast, carries back slow). Buttons force her tricks. |
| Priority order | fetch > manual buttons > riding > rain shepherding > dusk/dawn routine > idle play. Rain or any command dismounts/interrupts. |

## How to add things
**A new animation for an existing character** — add a frame function in `hand_sprites.py` (edit the base grid with `paste/clear/shift/crop`), add it to that character's `*_ANIMS` table `(frames, fps, note)`, rebuild with `python3 render_v3.py`. The demo can then use it by name.

**A new creature or object** — draw a grid (chars → `PAL` colours), give it an `ANIMS` table, register one line in `farm_v3.ANIMS` as `{"pil": True, "anims": as_pil(...)}`. It lands on the sheet and in `spritesheet.json` automatically. Baselines are auto-trimmed so feet always touch ground.

**A new landmark** — draw it in `farm_v3.background()`, add its foot coordinate to `SPOT` in the template, and (if solid) extend the obstacle check the way `BARN`/`inBarn` works.

**A new behaviour** — sheep behaviours live in the one `for (const s of sheep)` block; DL's are the `else if` chain ordered by priority. Add new branches respecting that order, and use `setPath`/`stepToward` for movement (it routes around the barn for you).

**A new resource / economy hook** — follow `woolBank`: a counter, a way to earn (shear click), a HUD line. Spending wants an NPC or a menu (see roadmap).

## Known debts
- `demo_template.html` (agent version) is frozen in `outputs/archive/`; only the sim moves forward.
- Tag colours are inherited from agent days; sheep could get subtle collar colours instead.
- The behaviour chain is `if/else` — fine to ~15 behaviours, then worth a small registry (condition, priority, tick).
