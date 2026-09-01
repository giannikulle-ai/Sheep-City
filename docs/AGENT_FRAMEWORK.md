# Large-Scale Project Agent Guide and Framework

How Sheepcliff is built by a team of AI agents that you can watch, steer, grow, and shrink without becoming a full-time manager.

The framework is written for this project, but the shape is generic: a small number of durable roles, a lane system that gives every agent a fenced area, GitHub as the single coordination surface, and a fixed set of gates that decide how much human attention a change gets.

---

## 1. The idea in one page

**You are the owner.** You set taste, direction, and priority. You never do the coordination.

**The Foreman is one long-lived session** (this session, or its successor) that turns your intent into tickets, spawns workers, reads every pull request, posts a daily digest, and tells you only what needs your judgement.

**Lanes are fenced focus areas** (simulation, world, art, economy, client, infra, QA). Every lane has a charter that says what it owns, what it must not touch, how it proves its work, and what review gate its changes need.

**Workers are short-lived sessions**, one per task. A worker is spawned with a kickoff prompt, works on one branch, opens one pull request, and is archived. Nothing about a worker is precious. Adding an agent means writing a charter and a first ticket. Decommissioning means closing its tickets and archiving its session.

**GitHub is the only memory the team shares.** Issues are tasks, labels are lanes and gates, pull requests are the only way code lands, milestones are phases. If it is not in the repo or on an issue, the team does not know it.

**Three gates decide attention.** Low-risk work merges on green checks. Medium-risk work gets a Verifier agent review. High-risk work (anything touching the art rules, the sim's core numbers, or player-facing feel) waits for your pin review. You spend your time only on the third kind.

---

## 2. Roles

| Role | Who | Lifetime | Job |
|---|---|---|---|
| Owner | You | Forever | Taste, priorities, pin reviews, go/no-go on phases |
| Foreman | One Claude Code session | Long-lived, replaced when context is stale | Triage, ticket writing, spawning, digests, escalation |
| Worker | Claude Code session per task | Hours | One ticket, one branch, one PR |
| Verifier | Claude Code session per review | Minutes to an hour | Adversarial review of medium-risk PRs, runs the checks, blocks or approves |
| Scout | Optional session, any model | Hours | Research and idea generation that produces a document, never code |

Model choice per role. Foreman and Verifier run on the strongest model available because judgement is what they sell. Workers run on the strongest model for sim and art lanes and a faster model for mechanical lanes such as infra and content data entry. GPT keys are useful for Scouts and for bulk content drafting (villager names, event flavour text, dialogue) where a second voice helps, and never for merging code.

---

## 3. Lanes

A lane is a focus area with an owner charter. Lanes are the unit you add and remove. Start with these seven; add a lane when a backlog of more than ten tickets no longer fits one.

| Lane | Owns | Never touches | Default gate |
|---|---|---|---|
| `sim` | `packages/sim/**`, behaviour registry, clock, needs, director | Sprite grids, palette, client CSS | Medium |
| `world` | `packages/content/**` (creatures, buildings, districts, events data), lore docs | Sim engine internals | Low for data, High for new creatures |
| `art` | `tools/art/**` (Python pipeline), sprite grids, backgrounds | Sim logic | High (owner pin) |
| `economy` | Ledger rules, prices, unlock tree, balance tests | Rendering, art | Medium |
| `client` | `apps/web/**`, renderer, input, UI tray, PWA, deity power UX | Sim rules, sprite grids | Medium, High if it changes player feel |
| `infra` | CI, deploy scripts, save migrations, telemetry | Everything else | Low |
| `qa` | Test harnesses, golden screenshots, watch tests, bug triage | Feature code (files bugs, does not fix) | Low |

The full charters live in `docs/agents/charters/`. A charter is the kickoff prompt's backbone, so keep it current: when a lane's owned paths change, change the charter in the same PR.

**Ownership is by path.** A worker whose diff touches paths outside its lane's owned list fails the ownership check and must explain on the issue. The Foreman can grant a one-ticket exception by writing it in the ticket.

---

## 4. The task lifecycle

Every change follows the same nine steps. The Foreman runs steps 1 to 3 and 8 to 9. Workers run 4 to 6. Gates run 7.

1. **Intake.** Your idea, a pin comment export from the game, a bug, or a plan milestone arrives as an issue. Pin exports are pasted verbatim into one issue and split by the Foreman.
2. **Triage.** Foreman assigns lane, size (S under two hours, M half a day, L must be split), risk (low, medium, high), and milestone. Anything L is split before it is worked.
3. **Brief.** Foreman writes the ticket using the template: goal in one sentence, done-means checklist, constraints, and notes. A good ticket lets a worker start with zero conversation.
4. **Spawn.** Foreman creates a worker session with the kickoff prompt (section 8), pointed at the ticket, on branch `lane/<lane>/<issue>-<slug>`.
5. **Work.** Worker reads `CLAUDE.md`, its charter, and the ticket. Works only inside owned paths. Commits small.
6. **Self-verify.** Worker runs the charter's checks and captures a screenshot or GIF for anything visual. Opens a PR with the template filled honestly, including weak spots.
7. **Gate.** Low: CI green merges automatically. Medium: a Verifier session reviews adversarially, re-runs checks, approves or requests changes. High: Foreman posts a preview link and screenshot in the digest and waits for your pin comments; worker answers pin by pin.
8. **Land.** Merge, deploy to the dev URL, close the ticket with a one-line outcome. Worker session archived.
9. **Digest.** The change appears in the next digest with the preview link.

Ticket sizing is the single biggest lever on quality. A worker that can finish in one session with one PR produces reviewable work. A worker that runs for a day produces a diff nobody can review.

---

## 5. Gates and what gets your attention

| Gate | Trigger | Who decides | Your time |
|---|---|---|---|
| Low | Infra, tests, content data within existing schema, refactors with no behaviour change | CI | None |
| Medium | Sim behaviour, economy numbers, client UI, anything with a screenshot | Verifier agent | Read one line in the digest |
| High | New or changed sprites, palette, DL or sheep behaviour priority, deity power feel, save format | You, via pin comments | Five to fifteen minutes |

Labels carry the gate: `gate:low`, `gate:medium`, `gate:high`, plus `needs-owner-pin` when a high-gate PR is waiting on you. The Foreman never lets more than three `needs-owner-pin` items pile up. If a fourth arrives, it pauses the lane that produced it.

**Verifier rules.** The Verifier is spawned with only the PR, the ticket, and the charter. It must re-run the checks itself rather than trust the PR body. It looks for: ownership violations, scaled or rotated sprites, new colours, behaviour priority changes, test deletions, and any claim in the PR body not backed by the diff. It approves with a two-line summary or requests changes with specific line references. It never fixes the code itself.

---

## 6. Monitoring: what you see and when

You should be able to know the state of the whole project in two minutes a day without opening a terminal.

**The daily digest** is one comment on a pinned issue titled `Digest` (and, when you want it, a published artifact page). Format:

```
Sheepcliff digest — 2026-09-02
Milestone: M1 Alive (day 4 of 10). Health: green.
Landed (3): #12 behaviour registry, #15 seeded RNG, #18 save/load v1 — preview: <dev url>
Needs you (1): #21 crow sprite set — 4 frames, screenshot attached, label needs-owner-pin
In flight (4): #22 director scaffold (sim), #23 event deck schema (world), #24 tray UI (client), #25 golden screenshots (qa)
Blocked (0)
Cost: 6 sessions, ~1.9M tokens, est. $31 today, $164 this milestone
Risks: client lane two days behind; recommend pausing world data tickets until #24 lands
```

**The roster** (`docs/agents/ROSTER.md`) is the live list of lanes, active session IDs, current ticket, and status. The Foreman updates it whenever it spawns or archives a session.

**Health signals** the Foreman checks every wake-up, and escalates on:

- A worker session active for more than three hours without a commit.
- CI red twice on the same PR.
- A diff touching paths outside the lane.
- Any test deleted or skipped.
- More than three items waiting on you.
- Spend above the day's budget line.

**Cost tracking** is per session. Every kickoff prompt tells the worker to end its PR body with an approximate token count. The Foreman sums them in the digest. Budget tiers (rough, at current prices):

| Tier | Active lanes | Sessions per day | Approximate monthly spend |
|---|---|---|---|
| Lean | 2 | 2 to 3 | $150 to $400 |
| Standard | 4 | 5 to 8 | $600 to $1,500 |
| Push | 6 or more | 10 or more | $2,000 and up |

You set the tier; the Foreman sizes the daily spawn count to it.

**Visual monitoring** is the dev URL itself. Every merge deploys, and the game has the pin overlay, so watching the build is reviewing the build.

---

## 7. Adding and decommissioning agents

**Add a lane or agent** when a focus area has ten or more tickets that no existing lane owns, or when a lane is consistently the bottleneck in the digest. Steps:

1. Foreman drafts a charter from `docs/agents/charters/_TEMPLATE.md`: mission, owned paths, forbidden paths, checks, gate.
2. You approve the charter in one comment.
3. Foreman adds the lane to the roster and labels, and writes its first three tickets.
4. First ticket is always small and lands within a day, so the lane proves its loop before it takes on anything big.

**Pause a lane** when it is producing more review load than value, or when another lane must land first. Pausing means: no new spawns, in-flight PRs finish, roster marks it paused. No charter changes.

**Decommission a lane or agent** when its scope is done or absorbed. Checklist:

- [ ] All its open PRs merged or closed with a reason.
- [ ] Open tickets reassigned or closed.
- [ ] A handoff note appended to the charter: what landed, what is rough, what it would do next.
- [ ] Sessions archived.
- [ ] Roster and labels updated. Charter file stays in the repo as history.

**Replace the Foreman** whenever its context is stale (a phase boundary is a natural point). The new Foreman reads the plan, the roster, the last five digests, and the open tickets. Nothing lives only in a session's memory, so replacement costs nothing.

---

## 8. Kickoff prompt template

Every worker session starts with this. Fill the angle brackets; do not add conversation.

```
You are a Sheepcliff <lane> worker. Read, in order: CLAUDE.md, docs/agents/charters/<lane>.md, issue #<n>.
Branch: lane/<lane>/<n>-<slug>, from origin/main. Push with -u.
Task: <goal sentence from the ticket>.
Done means: <checklist from the ticket>.
Stay inside your charter's owned paths. If you need a file outside them, comment on the issue and stop.
Before opening the PR run every check in your charter and paste the summary lines in the PR body.
Attach a screenshot or GIF for anything visual. List weak spots honestly. End the PR body with an approximate token count for this session.
Open exactly one PR titled "<lane>: <goal>" that closes #<n>. Then stop.
```

Verifier kickoff:

```
You are the Sheepcliff Verifier. Review PR #<n> against issue #<m> and docs/agents/charters/<lane>.md.
Re-run the charter's checks yourself. Check: ownership paths, no scaled or rotated sprites, no new colours, no test removed or skipped, behaviour priority unchanged unless the ticket asks, every claim in the PR body backed by the diff.
Approve with two lines, or request changes with file and line references. Do not edit code. Then stop.
```

---

## 9. Feedback loop with the game

The pin overlay in the game is the owner's review tool, and it stays. The path from a pin to a change:

1. You drop pins on the dev build and copy the markdown list.
2. Paste it into a new issue titled `Pins <date>`.
3. The Foreman splits it into tickets, one per pin or cluster, and links each back.
4. Workers answer pin by pin in their PR bodies, quoting the pin text.
5. The digest lists which pins landed.

Because clipboard and downloads are blocked in your mobile viewer, the overlay's in-page modal remains the export path, and the client lane keeps it working on every build.

---

## 10. Mechanics in this environment

What the Foreman actually uses, so a replacement Foreman can do the same:

- **Sessions.** `create_session` with the kickoff prompt, `source_url` the repo, `outcome_branch` the lane branch. `list_events` and `get_session` to watch progress. `archive_session` on completion.
- **PR events.** `subscribe_pr_activity` on every worker PR so CI failures and review comments wake the Foreman.
- **Schedules.** One Routine fires the digest every morning. A second fires a health sweep every four hours during active phases.
- **Repo conventions.** `CLAUDE.md` is read by every session automatically, so the non-negotiables live there. Charters live in `docs/agents/charters/`. Labels: `lane:*`, `gate:*`, `size:*`, `needs-owner-pin`, `blocked`.
- **Deploy.** CI on `main` builds the web app and pushes it to the dev URL. Workers never deploy by hand.
- **Secrets.** API keys live in the environment configuration only. A worker that finds a key in a file stops and reports.

---

## 11. Failure modes and the fix for each

| Symptom | Usual cause | Fix |
|---|---|---|
| Huge unreviewable PR | Ticket was L and not split | Foreman closes PR, splits ticket; sizing rule enforced at triage |
| Two workers edit the same file | Lane paths overlap | Fix charters; ownership check in CI |
| Worker "fixes" a test by deleting it | Pressure to go green | Verifier rule; CI fails on removed tests |
| Art drifts off style | Agent drew sprites without pin review | Art lane is always High gate; palette diff check in CI |
| You become the bottleneck | Too many High gate items | Foreman caps `needs-owner-pin` at three and pauses lanes |
| Foreman loses the plot | Stale context | Replace it; everything is in the repo |
| Spend spikes | Long-running sessions | Three-hour health signal; sessions are archived on PR open |
| Features work but the farm feels worse | No feel check | QA lane's watch test: five unattended minutes must produce three noticeable moments |

---

## 12. Cadence

- **Daily.** Digest at your morning. You read it, drop pins if you want, answer any `needs-owner-pin`. Ten minutes.
- **Weekly.** A demo build is tagged and a short GIF of the week's changes goes in the digest. You set next week's priorities in one comment.
- **Per phase.** Go/no-go on the phase's exit criteria from the plan. The Foreman is replaced or refreshed here.

The framework is done when you can be away for a week and come back to a healthier build and a digest that tells you what happened.
