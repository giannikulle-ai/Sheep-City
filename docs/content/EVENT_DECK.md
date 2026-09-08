# The farm event deck (v2)

Fifteen things that can happen on Luna Farm when nobody is steering, plus three that
happen on their own terms. The engine (the sim's editor, issue #40; the word Director
is retired, plan section 2) looks at the world once a sim-minute and, when the pacing
curve says it is time, draws a card whose conditions hold, weighted live by whatever is
true right now. The data lives in `packages/content/events/farm.json` (the fifteen
cards) and `packages/content/events/authored.json` (the three authored events); this
page is the same eighteen in words, one to a page, so the owner can read the deck the
way the player will meet it.

How to read a card's page. **When** is the card's conditions in plain words, including
what makes it *more* likely, not just what makes it possible. **You see** is the beat
within one second of the card firing, then what marks its end. **The ledger** is what
changed underneath. **The storybook** is the line "while you were gone" tells, with the
names filled in. A line in brackets after the title is a note for the team, not for the
player.

Two rules held while writing, same as v1. Nothing here hurts anyone: crows get chased,
not caught; the lamb comes home; the well runs low, never dry; even the storm and the
drought that calls it are relief, not harm. And every card is something you would notice
from across the room, because if it is not watchable it is not an event.

Time is in-world time. A sim day is 24 sim hours, and lasts three real minutes when you
are watching, so a card that runs for 240 sim minutes runs for 30 real seconds.
Cooldowns are counted from the card's end.

## What changed from v1

v1's `preconditions` was a fixed allow-list (season, weather, timeOfDay, flockSize,
merchantPresent, lambPresent, recentWeather) and `weight` was one flat number. Real
causes — a lamb far from its mother, DL far from the flock, the flock scattered, the
grass parched — could not move the odds, only gate them on or off. v2 replaces both:

- **`conditions`** is a list of predicates, `{ on, op, value }`. `on` is a clock or
  weather field, a Ledger stock, or a named actor predicate — see the two tables below
  for what each one means. Every listed predicate must hold for the card to be eligible
  at all.
- **`weight`** is `{ base, multipliers }`. `base` is the old flat number's replacement,
  10 still ordinary. Each entry in `multipliers` is `{ when, times }`: a further
  predicate (the same shape as a condition) that, when true, scales the weight by
  `times`. A card can be *possible* under its conditions and still be *far likelier*
  under its multipliers — the issue's own example, a lost lamb, is conditioned on there
  being a lamb at dusk, and weighted up hard when the lamb is actually far from its
  mother.
- **`limits`** replaces the card-level `cooldownSimHours` with `{ concurrent,
  minGapSimMinutes, cooldownSimHours }`. `concurrent` (always 1 in this deck) is how
  many copies of the card may run at once. `cooldownSimHours` is unchanged from v1: the
  in-world hours after the card ends before it may fire again. `minGapSimMinutes` is new:
  the minimum sim-minutes between one draw starting and the next, start to start — always
  exactly the card's own `durationSimMinutes` plus its cooldown in minutes, so the two
  numbers can never quietly disagree.
- **`storybook.notability`** (0 to 1) is new: the card author's own read on how much the
  line deserves a spot in a storybook page, alongside the plan's own selection rule
  (deviation from normal, and firsts).

## What a condition can read

| `on` | What it means | Kind |
|---|---|---|
| `season` | The current season. | one of `spring`, `summer`, `autumn`, `winter` |
| `weather` | The current weather. | one of `sun`, `rain`, `snow` |
| `timeOfDay` | The clock's phase. | one of `dawn`, `day`, `dusk`, `night` |
| `simMinutesSinceRain` | Sim minutes since the weather was last `rain`. Carries v1's proposed `recentWeather` forward in the ordinary predicate shape instead of a bespoke nested object; still **PROPOSED to sim on #40**, same as v1 flagged it. | number |
| `ledger.wool` | The flock's mean fleece level, 0 to 1 — read the way `packages/sim/src/ledger/ledger.ts`'s `meanOf` already reads it, not a sum. | number, 0 to 1 |
| `ledger.grass` | The mean tuft level across the field, 0 to 1. The Ledger has no separate "hay" stock, so cards that talk about the hay bale (`crowsOnTheField`) or a dry spell (`wellRunsLow`, `cliffStorm`'s trigger) read this instead. | number, 0 to 1 |
| `ledger.coins` | Coins banked. | number |
| `ledger.flock` | Sheep plus lambs on the field (`ledgerFlock` in the sim) — v2's replacement for v1's `flockSize.min`/`max`. | integer, 0 to the flock cap |
| `lambFarFromMother` | True when a lamb has wandered a real distance from the ewe it trails. This *is* what "a lost lamb" means. **PROPOSED to sim on #40**, same as `simMinutesSinceRain` and the `simDate` trigger's day-of-season: today's sim springs every lamb to a fixed point behind its mother every tick with no detachment behaviour, so this cannot yet be true. | boolean |
| `dlFarFromFlock` | True when Digital Luna is a real distance from the flock's centre. | boolean |
| `flockScattered` | True when the sheep are spread out rather than settled together — the opposite of a calm, grazing-together field. | boolean |
| `merchantPresent` | True while the merchant is on the field, from his entrance to his exit. | boolean |
| `lambPresent` | True while at least one lamb is on the field. | boolean |
| `farmerPresent` | True while the farmer is on the field, from his entrance to his exit. | boolean |

`op` is `eq`/`ne` for one value, `in`/`not-in` for a list (v1's old allow-list, in
predicate shape), and `gte`/`lte`/`gt`/`lt` for a number.

## The fifteen cards

---

### Fog morning

Some dawns the cliff breathes out and the field goes soft and grey. The barn is a red shape, the tree is a suggestion, and the sheep, who do not care for surprises, drift together until they are one woolly island. DL walks the edge of the field with her nose up, counting them the only way she can.

**When.** Dawn, in autumn, winter or spring, with no rain or snow falling. Not more than once in two days. No multiplier: a fog roll is weather, not an actor state, so it stays a flat likelihood among cards whose conditions hold.

**You see.** Within a second the field greys out to shapes and the flock bunches. It lasts 240 sim minutes (half a real minute). It ends from the top down: the sky clears first, then the barn's red comes back, then the sheep are sheep again.

**The ledger.** Visibility drops to a third and comes back to full. A `fog` flag while it lasts, so the sheep huddle and DL patrols.

**The storybook.** *A fog came down at dawn and Digital Luna counted the flock by their bleats.* (notability 0.3)

---

### Crows on the field

Three crows have noticed the hay. They land on the bale and around it, black and pleased with themselves, and the nearest sheep backs off a step because crows are rude. DL has opinions about crows. (Crows are drawn in their own ticket, #47; the chase itself is sim work, #48. This card only puts them on the field.)

**When.** A sunny daytime in summer or autumn, with at least one sheep out (`ledger.flock` at least 1). Not more than once in a day and a half. **Far likelier** (×2) when `ledger.grass` reads 0.6 or higher — the issue's own example: crows come for the hay, and this deck's stand-in for "the hay is high" is the field's mean grass level, since the Ledger has no separate hay stock.

**You see.** Three crows drop onto the hay bale within a second. For 90 sim minutes (about eleven real seconds) they hop and peck. Then DL runs at them, they scatter over the fence, and she trots back with her tail up.

**The ledger.** The flock is a little unsettled while the crows are there. DL is a little pleased with herself afterwards.

**The storybook.** *Three crows landed on the hay and Digital Luna sent them packing.* (notability 0.35)

---

### Lost lamb

At dusk a lamb that should know better slips out through the gate. Its mother stands up and calls after it. This is the card DL was born for: she goes out, she finds it, and she walks it home slowly, right behind it, the way she was taught. (One of the four reference events the engine implements in code, #40. The issue's own worked example for v2's causality.)

**When.** Dusk, when there is a lamb on the farm, in sun or rain but not snow. Not more than once in two days — the hard gate stays dusk-only so the storybook line stays true. **Far likelier** when `lambFarFromMother` is true (×3, the strongest driver once sim on #40 can produce it — see below, PROPOSED — this is what "lost" means), when `flockScattered` is true (×2, nobody was minding the edges), and when `dlFarFromFlock` is true (×1.5, she was not close enough to notice it slip out). The base weight alone (5) is deliberately low: without these, a dusk lamb almost never wanders.

**You see.** A lamb goes out the gate and the ewe bleats after it. Up to 120 sim minutes (fifteen real seconds) later DL brings it back through the gate at walking pace, and the ewe comes to meet them.

**The ledger.** The flock's mood dips while the lamb is out and comes back up, and a little more, when it is home. DL gets a point for a job done. A `lambLost` flag while it lasts, which DL's fetch behaviour reads.

**The storybook.** *Willow wandered off at dusk and Digital Luna brought them home before dark.* (notability 0.6)

---

### Merchant caravan

A cart on the lane. The merchant rolls in from the right, past the outer gate, and stops where he always stops. He buys the wool bank at three coins a fleece, and if the coins stretch to the next thing on his list, that thing is standing on the farm when he leaves. (This card takes over the merchant's fixed timer, #40. The cadence is the prototype's: the cooldown is `merchant.everyMs`, the duration is `merchant.stayMs`, both from `balance/farm.json`.)

**When.** Day or dusk, when `merchantPresent` is false. Not more than once in 32 sim hours, which is the prototype's four real minutes. No multiplier: his cadence is mechanical, not actor-driven.

**You see.** The cart rolls in from the edge within a second and DL looks up. He trades for 240 sim minutes (thirty real seconds): a coin bubble, then the cart rolls out, and sometimes a new thing has appeared.

**The ledger.** The trade itself pays the coins and buys the upgrades; this card only brings the cart. No coins hook.

**The storybook.** *The merchant's cart rolled in and 27 coins changed hands.* (notability 0.4)

---

### Shearing day

Every fleece on the farm is ready on the same morning, which never happens by accident, and the farmer comes in with the shears bubble already showing. He works down the field one sheep at a time until the whole flock is trim and the wool bank is full. The sheep feel the breeze. (A reference event for #40: the sim tops every fleece to ready and gives the farmer a visit outside his usual hours.)

**When.** A sunny daytime in spring or summer, with at least three sheep (`ledger.flock` at least 3) **and** the flock's mean fleece already more than half grown (`ledger.wool` at least 0.5) — v2 makes this a day whose time has come, not a random draw against a season and a coin flip. Not more than once in three days. **Far likelier** (×2) when `ledger.wool` reads 0.75 or higher: the fuller the flock already is, the readier the day.

**You see.** Every sheep goes fluffy at once and the farmer walks in. For up to 300 sim minutes (about forty real seconds) he shears, one name tag at a time. It ends when the last sheep is trim; the flock does a little hop.

**The ledger.** A `shearingDay` flag keeps the farmer's shear job re-queuing until nobody qualifies. The flock's mood goes up two when it is over: lighter, cooler, bouncier.

**The storybook.** *Shearing day. The farmer clipped 6 fleeces and the sheep felt the breeze.* (notability 0.7)

---

### Rainbow after rain

The rain stops, the sheep come out of the barn doorway, and a rainbow stands over the barn for a while. That is the whole event. It is the one card in the deck that asks nothing of anybody.

**When.** Day or dusk, in sun, with `simMinutesSinceRain` 20 or under (v1 proposed a bespoke `recentWeather` object for this; v2 carries the same idea in the ordinary predicate shape). Not more than once a day. No multiplier.

**You see.** The arc fades in over the barn as the last drops fall. It stays 90 sim minutes (about eleven real seconds) and fades from the outside in.

**The ledger.** Everyone's mood goes up one. A `rainbow` flag for the weather layer.

**The storybook.** *The rain stopped and a rainbow stood over the barn for a while.* (notability 0.3)

---

### A stray cat visits

At dusk a cat pads in along the fence, the way cats do, and settles on the post nearest the gate. DL freezes mid-step and stares. The cat looks at nothing in particular. This goes on for some time. Then the cat hops down and leaves the way it came, and DL does a stretch as if that is what she was doing all along. (The cat is a new creature: data here, art and behaviour in their own tickets, and the owner's pin before it ships.)

**When.** A dry dusk or night. Not more than once in two and a half days. **A little likelier** (×1.3) when `flockScattered` is false: a settled field is quieter, and a cautious visitor comes closer to a quiet one.

**You see.** The cat walking in along the fence and DL going still, within a second. It stays 150 sim minutes (about nineteen real seconds) and leaves on its own.

**The ledger.** Nothing. Some visitors are just visitors.

**The storybook.** *A stray cat sat on the fence at dusk. Digital Luna pretended not to care.* (notability 0.5)

---

### The farmer's day off

The gate stays shut at the usual hour. DL waits, then trots to the trough and looks into it, then does the rounds herself: the trough, the hay, and a visit to each sheep in turn, because that is what the farmer does and somebody has to. The sheep get a bit woolly and a bit grumbly. Next morning the farmer is back with a heart bubble for the dog who covered for him.

**When.** Fires at dawn, in any season and any weather, when `farmerPresent` is false — v2 adds this: he cannot take the day off if he is already on the field. Not more than once in four days. No multiplier.

**You see.** No farmer at the usual time, and DL peering into the trough. It runs 720 sim minutes, half a day (ninety real seconds), and ends with the farmer's next visit.

**The ledger.** A `farmerAway` flag skips the farmer's schedule. The flock's mood dips one while he is away; DL's goes up two when it is over. She managed.

**The storybook.** *The farmer took the day off, so Digital Luna did the rounds herself.* (notability 0.55)

---

### Night of the fireflies

On a warm summer night a dozen lights blink on around the tree and drift out over the field. DL bounces after the nearest one, then the next, then the next. She catches none of them. Nobody has told her. (Fireflies are small life from #33; this card brings a swarm and gives DL something to do with it.)

**When.** A clear summer night. Not more than once in two days. **A little likelier** (×1.2) when `flockScattered` is false: a settled flock leaves DL free to bounce after lights instead of minding sheep.

**You see.** Lights blinking on by the tree and DL leaping, within a second. It lasts 200 sim minutes (twenty-five real seconds). The lights thin out one by one and DL sits down, panting.

**The ledger.** A `fireflies` flag while it lasts, which DL's idle play reads.

**The storybook.** *Fireflies filled the field and Digital Luna snapped at every one and caught none.* (notability 0.4)

---

### Lamb zoomies hour

A lamb bolts from its mother's side for no reason and tears round the trough at full speed, and any other lamb on the field joins in. The ewes do not move. They have seen this before. DL may or may not join; she is a dog. It ends the way it always ends: the lamb stops dead, wobbles, and lies down next to its mother.

**When.** A sunny day or dusk, with a lamb on the farm. Not more than once a day. **Likelier** (×1.5) when `flockScattered` is false: a lamb only feels safe enough to bolt for fun when the flock around it is calm, not stressed.

**You see.** A lamb bolting within a second. It lasts 60 sim minutes (seven and a half real seconds), the shortest card that has an end.

**The ledger.** The flock's mood goes up one. A `zoomies` flag while it lasts, which the lamb behaviour reads.

**The storybook.** *Poppy got the zoomies and ran rings round the trough.* (notability 0.25)

---

### The well runs low

A hot dry spell and a full field. The trough's water drops to a line and the sheep gather round it, taking turns at not much. A drop bubble over the nearest one says what they are thinking. It ends when the farmer walks in with buckets and the queue breaks up drinking. Never dry; low. (The drop bubble is an art ask.)

**When.** A sunny summer day with at least five sheep (`ledger.flock` at least 5) **and** the field genuinely parched (`ledger.grass` 0.3 or under, not just an ordinary dry-ish summer day). Not more than once in three days. **Likelier** (×1.4) when `farmerPresent` is false: nobody is around yet to catch it early.

**You see.** The trough drawn low and a drop bubble, within a second. It lasts 180 sim minutes (about twenty-two real seconds) and ends with the farmer's extra visit and the trough full.

**The ledger.** A `troughLow` flag: drinking gives less and the sheep gather. Mood dips two, then comes back two when the water does.

**The storybook.** *The well ran low in the heat until the farmer came with buckets.* (notability 0.5)

---

### A windfall

DL digs at the foot of the tree, the way she sometimes does, and this time there is a purse. A coin bubble pops over her. She trots back to the field with her nose muddy and the coin count is twelve higher, which is four fleeces at the merchant's price: a nice surprise, not a jackpot. Nobody asks whose it was.

**When.** Daytime, in sun or rain, with `ledger.coins` 40 or under — v2 adds this: a find lands better, and reads truer to "nobody asked whose", on a lean bank. Not more than once in three days, and rare. No multiplier.

**You see.** DL digging and a coin bubble, within a second. It lasts 30 sim minutes (about four real seconds); the event is the moment.

**The ledger.** Twelve coins into the bank, straight away, so the merchant can spend them next visit. DL's mood goes up one.

**The storybook.** *Digital Luna dug up a purse by the tree. 12 coins, and nobody asked whose.* (notability 0.45)

---

### Stargazing night

A clear night in late summer or autumn, and the stars come up brighter than they should. The sheep lie down facing up. DL sits by the gate with her head tipped back. Nothing happens for a good while, on purpose. Then the sky dims to its ordinary night and DL walks to the barn door to sleep.

**When.** A clear night in summer or autumn. Not more than once in two days. **Likelier** (×1.3) when `flockScattered` is false: a scattered flock does not settle down together to watch the sky.

**You see.** The stars brightening and DL sitting down by the gate, within a second. It lasts 240 sim minutes (thirty real seconds) and ends when the sky dims.

**The ledger.** Everyone's mood goes up one. A `starsBright` flag for the sky layer and the lie-down.

**The storybook.** *A clear night. Digital Luna sat by the gate and watched the stars with the flock.* (notability 0.3)

---

### Rain, and a flock to gather

New for #59, filling the seat DL's birthday and first snow left behind. Rain starts, the flock startles apart, and DL runs her own rain-shepherd priority (plan section 2 names her fixed order: fetch, manual, riding, rain shepherd, dusk and dawn routine, idle play) hard enough to be worth watching for once, instead of being an unremarked background rule.

**When.** Raining, with `flockScattered` true. **Likelier** (×1.5) when `dlFarFromFlock` is true: a bigger job, a bigger moment, when she has further to run.

**You see.** The rain starts and the flock startles apart; DL breaks into a run toward the furthest one. It lasts 60 sim minutes (seven and a half real seconds). The last sheep is walked in under the barn eave and DL circles the group once, checking.

**The ledger.** A `gathering` flag while it lasts. The flock's mood dips one at the start (rain, nobody gathering them in yet) and comes back up two, plus DL gets one, when they are safe under the eave.

**The storybook.** *Rain caught the flock scattered and Digital Luna gathered every one of them in.* (notability 0.45)

---

### The farmer meets the merchant

New for #59, filling the seat DL's birthday and first snow left behind. The farmer's morning round and the merchant's cart land on the farm at the same time, which is rare on its own — this card shows off an *and* of two actor predicates rather than one, so its base weight (3) needs no multiplier to stay rare.

**When.** `merchantPresent` and `farmerPresent` both true.

**You see.** The merchant's cart rolls in just as the farmer is finishing his rounds; they stop to talk. It lasts 45 sim minutes. They go their separate ways, the farmer to the gate, the cart down the lane, and DL trots off after her nose.

**The ledger.** A `crossing` flag, purely cosmetic — the two NPCs pause instead of following their separate plans for a moment. DL's mood goes up one: two of her favourite visitors at once.

**The storybook.** *The farmer and the merchant crossed paths on the lane and Digital Luna sat between them.* (notability 0.55)

---

## The three authored events

Authored events are the punctuation the cards don't do (plan section 2): a seasonal
festival, a storm, DL's birthday. Where a card is drawn under a pacing target, an
authored event becomes eligible only when its own `trigger` fires, and while it runs it
outranks anything named in `priorityOver` — a card id, or a bare parameter name such as
`mood`, meaning no other card's mood hook applies until it ends. Each carries
`variables`, a bag of authored parameters no card gets, specific to that one event, plus
its own sibling `variablesComment` explaining the bag — `comment` is never a key inside
`variables` itself, so an engine reading its keys never sees a phantom parameter.

v1's `dlBirthday` and `firstSnow` were random-draw cards, made rare only by a low weight
and a long cooldown. The plan itself frames DL's birthday as one of the examples of
authored punctuation, not a draw; #59 moves both here, and gives `farm.json` two new
cards (above) to keep the deck at fifteen.

**The calendar (#83).** Seasons follow the real year — the owner's decision, 2026-09-08
(plan section 2, "Time" and section 11 decision 10): a nominal length of about 91 real
days per season, a quarter of 365, with a little seeded drift on both how long a season
runs and when it starts, so no two years land on the same dates. All of it lives in
`balance/farm.json`'s `outsideRules.seasons.calendar` — `nominalRealDays`,
`lengthDriftRealDays`, `startOffsetDriftRealDays`, and the `anchors` each season begins
around, northern hemisphere: spring the equinox around March 20, summer the solstice
around June 21, autumn the equinox around September 22, winter the solstice around
December 21. The old fixed nine-real-day season (`rules.season.realDays`) stays in the
data too, because the sim still reads it today; sim ticket #84 retires it once the sim
reads the calendar instead. One consequence: because a season's real length now varies,
a `simDate` trigger's `dayOfSeason` is no longer an absolute day count
(`clock.dayCount mod 9`) — it is a fraction, 0 up to but not including 1, of however long
the current season turns out to be that year, so 0.5 always means the season's midpoint
whether it ran 81 real days or 101. A date that should recur every real year regardless
of the sim's season — DL's birthday — is not a `simDate` at all any more: it is the new
`realDate` trigger kind below, a plain `month` and `day` plus an optional
`windowSimMinutes` for how much sim time either side of that moment still counts as a
match.

### DL's birthday

Once a year, the flock turns as one and walks towards DL. A cake bubble. Heart bubbles
all round. She does her spin. Nobody knows how the sheep know.

**Trigger.** `realDate`: December 15, the owner's decision (2026-09-08). Recurs every
real year, regardless of which sim season that calendar date falls in for a given
world's seeded calendar — a change from v1's guess at the first day of spring, since a
birthday is a real date, not a point in the sim's own season cycle.

**Variables.** `cakeFlavour` (honey — a light nod to the wildwood's eventual honey
economy, plan section 3, not a dependency on it), `ringFormation` (how the flock
arranges itself), `heartBubbleCount` (6) — values a card has no field for.

**Priority.** Outranks `wellRunsLow` and `farmersDayOff` (both would read as tonally
wrong, lowering mood, mid-party) and the bare parameter `mood` (a broader net: no other
card's mood hook competes while the party runs).

**You see.** A cake bubble over DL and the flock turning to walk towards her, within a
second. It lasts 180 sim minutes (about twenty seconds). The ring of sheep drifts apart
and DL flops down in the middle, done in.

**The ledger.** Everyone's mood goes up three. A `party` flag while it lasts — the same
flag v1's card used, now set by the date instead of a draw.

**The storybook.** *It was Digital Luna's birthday. The whole flock came over to say
so.* (notability 0.9)

### A storm off the cliff

New for #59: the storm the issue asks for. A real drought, not a coin flip, calls it, so
it reads as relief arriving, not a random inconvenience.

**Trigger.** `stockThreshold`: `ledger.grass` at or under 0.15 — a real drought line,
well under `wellRunsLow`'s card-level 0.3. A 20-sim-day cooldown keeps it from firing
again the moment the grass is still low a minute later, and gives the flock's mood time
to recover before the next one is due.

**Variables.** `windGustPx` (6) and `thunderClaps` (3) — cosmetic parameters for the
weather layer's shake and thunder beats; nothing here touches the Ledger beyond the
mood hooks.

**Priority.** Outranks `fogMorning`, `stargazingNight`, `nightOfTheFireflies` (all three
would clash with driving rain and a dark sky) and the bare parameter `weather` (no card
also tries to change the weather mid-storm).

**You see.** The sky darkens fast, rain hits hard, and every sheep bolts for the barn
doorway at once. It lasts 90 sim minutes (about eleven real seconds). The rain eases to
a drip off the eave and the flock spreads back out, drenched but calm.

**The ledger.** Visibility drops to a half (higher — clearer — than `fogMorning`'s
third, so the barn stays a clear shape through it) and returns to full. A `storm` flag while it lasts; the
flock's mood dips two at the start and comes back one, plus DL gets one, at the end —
wet, but the grass will be glad of it.

**The storybook.** *A storm broke over the cliff and Digital Luna kept the whole flock
under the barn eave.* (notability 0.75)

### First snow of the season

The first snow of the winter, or the first the flock remembers. Every sheep stops and
looks up at the same moment. The lambs bounce. DL leaps at a flake, misses, and tries
again. Then everybody goes back to grazing with white on their backs, as if nothing
happened.

**Trigger.** `predicates`: season is winter and weather is snow, with a 303-sim-day
cooldown, re-derived for #83's calendar from the old 30-sim-day cooldown by the same
ratio the season length changed (30 * (91 / 9) ≈ 303) — under a full year (four ~91-day
seasons ≈ 364 sim days), long enough to span most of a year so the predicates holding
again the next snowy moment doesn't retrigger it, but short enough that the next
winter's first snow isn't skipped. v1's card made this rare only with a 720-hour
cooldown and said so was a proxy for a real "first"; the authored trigger's own cooldown
is that fix.

**Variables.** `flakeBurst` (24) — extra snowflake sprites for this one flurry, more
than an ordinary snowy scene gets.

**Priority.** Outranks `farmersDayOff` (no weather or season gate, so it could otherwise
land on the same winter dawn) and the bare parameter `mood`. `farmersDayOff` is not the
only card without a weather or season gate — `merchantCaravan` has none either, and
`farmerMeetsMerchant` has no clock gate at all — but of those three only `farmersDayOff`
fires at dawn, the same phase a winter morning's first snow lands on, so it is the one
worth naming here.

**You see.** Every sheep stops and looks up at the same moment; DL leaps at a flake. It
lasts 120 sim minutes (fifteen real seconds). The flock goes back to grazing with white
on their backs.

**The ledger.** The flock's mood goes up one. A `firstSnow` flag while it lasts — the
same flag v1's card used.

**The storybook.** *The first snow of the season fell and Digital Luna tried to catch it
in her mouth.* (notability 0.85)

---

## What the deck does not do yet

- **No cross-district cards.** The harbour and the wildwood arrive in Phase 3 with the deck at fifty.
- **`simMinutesSinceRain`, the `simDate` trigger's day-of-season, the new `realDate` trigger, the calendar it reads (`outsideRules.seasons.calendar`), and `lambFarFromMother` are proposed, not confirmed.** All are flagged to sim, `simMinutesSinceRain` and `lambFarFromMother` on #40 and the calendar and both date triggers on #84, in the schema and in this page, the same way v1 flagged `recentWeather`. The sim has a running `dayCount` and a season cycle but no explicit real-calendar concept yet, and still reads the old fixed nine-real-day season (`rules.season.realDays`) rather than the new calendar; no authored event uses `simDate` today (`dlBirthday` moved to `realDate` on #83), so its fraction-of-a-season `dayOfSeason` is untested against real sim behaviour until #84 lands. `lambFarFromMother` is structurally always false in today's sim: every lamb is sprung to a fixed point behind its mother each tick, with no detachment behaviour yet — `lostLamb`'s strongest multiplier is written for the sim #40 will build, not the one that exists today.
- **No chained cards.** The farmer's day off leaves the flock woolly, which makes the next shearing day bigger; that is the Ledger doing the chaining (via `ledger.wool`, now a real condition), not the deck. A `recentEvents` predicate would let a card follow another on purpose.
- **Weights are a first guess, doubly so now.** Both `base` and every multiplier's `times` are the sim's pacing curve and the qa lane's event coverage (#49) to tune. Every number sits in the JSON with a comment for a reason.
- **Authored `variables` are open by design**, unlike every other closed shape in these two schemas (`additionalProperties: false` holds everywhere else). Each of the three events needs a different bag of named values; nothing enforces what's inside one beyond "at least one". Worth an owner's eye if that looseness turns out to matter before more authored events are written.
