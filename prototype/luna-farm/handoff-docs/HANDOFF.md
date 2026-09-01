# Luna Farm — handoff for new collaborators

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
