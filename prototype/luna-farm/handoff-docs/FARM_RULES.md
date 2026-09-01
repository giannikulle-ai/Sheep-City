# Luna Farm — rules of the world & how to add things

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
