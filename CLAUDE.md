# Sheepcliff — rules for every agent session

Sheepcliff is a cozy, watchable, pixel-art digital civilization that grows out of the Luna Farm prototype.
Read these before touching anything:

1. `docs/SHEEPCLIFF_PLAN.md` — what we are building, the simulation model, phases, and current milestone.
2. `docs/AGENT_FRAMEWORK.md` — how work is assigned, verified, reviewed, and merged.
3. Your lane charter in `docs/agents/charters/` — what you own and what you must not touch.
4. `prototype/luna-farm/handoff-docs/HANDOFF.md` and `FARM_RULES.md` — ground truth for the existing art and sim.

## Non-negotiables (owner's taste, do not relitigate)
- Character art is hand-pixelled text grids (`pixel_grids.py`, `hand_sprites.py`). Never rasterise vectors into characters. Never scale or rotate a sprite except an exact 90° turn. Frames are variations, not transforms.
- Digital Luna (DL) and the sheep look are settled. Do not redesign them.
- Palette is fixed; add colours deliberately and say so in the PR.
- Every frame touches the ground; do not defeat the bottom-trim in the sheet builder.
- New characters, props, and colours ship only after the owner's pin review (label `needs-owner-pin`).
- Show, don't tell. Admit weak frames and weak features in the PR. Never over-claim.

## Working rules
- One task, one branch, one PR. Branch name `lane/<lane>/<issue-number>-<slug>`.
- Stay inside your lane's owned paths. If a task needs a file outside them, stop and comment on the issue.
- Before opening a PR run the checks in your charter and paste the output summary in the PR body.
- A PR includes a screenshot or GIF of what changed when anything visual moved.
- Never force-push, never rewrite someone else's branch, never skip or disable a test to go green.
- Secrets never enter the repo. API keys live in the environment only.
- When blocked, write what you tried and what you need on the issue, then stop. Do not guess your way past a design decision that is the owner's.
