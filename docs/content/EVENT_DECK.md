# The farm event deck

Fifteen things that can happen on Luna Farm when nobody is steering. The Director (the sim's editor, issue #40) looks at the world once a sim-minute and, when the pacing curve says it is time, draws a card whose preconditions hold. The data lives in `packages/content/events/farm.json`; this page is the same fifteen cards in words, one to a page, so the owner can read the deck the way the player will meet it.

How to read a page. **When** is the card's preconditions in plain words. **You see** is the beat within one second of the card firing, then what marks its end. **The ledger** is what changed underneath. **The storybook** is the line "while you were gone" tells, with the names filled in. A line in brackets after the title is a note for the team, not for the player.

Two rules held while writing. Nothing here hurts anyone: crows get chased, not caught; the lamb comes home; the well runs low, never dry. And every card is something you would notice from across the room, because if it is not watchable it is not an event.

Time is in-world time. A sim day is 24 sim hours, and lasts three real minutes when you are watching, so a card that runs for 240 sim minutes runs for 30 real seconds. Cooldowns are counted from the card's end.

---

## Fog morning

Some dawns the cliff breathes out and the field goes soft and grey. The barn is a red shape, the tree is a suggestion, and the sheep, who do not care for surprises, drift together until they are one woolly island. DL walks the edge of the field with her nose up, counting them the only way she can.

**When.** Dawn, in autumn, winter or spring, with no rain or snow falling. Not more than once in two days.

**You see.** Within a second the field greys out to shapes and the flock bunches. It lasts 240 sim minutes (half a real minute). It ends from the top down: the sky clears first, then the barn's red comes back, then the sheep are sheep again.

**The ledger.** Visibility drops to a third and comes back to full. A `fog` flag while it lasts, so the sheep huddle and DL patrols.

**The storybook.** *A fog came down at dawn and Digital Luna counted the flock by their bleats.*

---

## Crows on the field

Three crows have noticed the hay. They land on the bale and around it, black and pleased with themselves, and the nearest sheep backs off a step because crows are rude. DL has opinions about crows. (Crows are drawn in their own ticket, #47; the chase itself is sim work, #48. This card only puts them on the field.)

**When.** A sunny daytime in summer or autumn, with at least one sheep out. Not more than once in a day and a half.

**You see.** Three crows drop onto the hay bale within a second. For 90 sim minutes (about eleven real seconds) they hop and peck. Then DL runs at them, they scatter over the fence, and she trots back with her tail up.

**The ledger.** The flock is a little unsettled while the crows are there. DL is a little pleased with herself afterwards.

**The storybook.** *Three crows landed on the hay and Digital Luna sent them packing.*

---

## Lost lamb

At dusk a lamb that should know better slips out through the gate. Its mother stands up and calls after it. This is the card DL was born for: she goes out, she finds it, and she walks it home slowly, right behind it, the way she was taught. (One of the four reference events the Director implements in code, #40.)

**When.** Dusk, when there is a lamb on the farm, in sun or rain but not snow. Not more than once in two days.

**You see.** A lamb goes out the gate and the ewe bleats after it. Up to 120 sim minutes (fifteen real seconds) later DL brings it back through the gate at walking pace, and the ewe comes to meet them.

**The ledger.** The flock's mood dips while the lamb is out and comes back up, and a little more, when it is home. DL gets a point for a job done. A `lambLost` flag while it lasts, which DL's fetch behaviour reads.

**The storybook.** *Willow wandered off at dusk and Digital Luna brought them home before dark.*

---

## Merchant caravan

A cart on the lane. The merchant rolls in from the right, past the outer gate, and stops where he always stops. He buys the wool bank at three coins a fleece, and if the coins stretch to the next thing on his list, that thing is standing on the farm when he leaves. (This card takes over the merchant's fixed timer, #40. The cadence is the prototype's: the cooldown is `merchant.everyMs`, the duration is `merchant.stayMs`, both from `balance/farm.json`.)

**When.** Day or dusk, when the merchant is not already here. Not more than once in 32 sim hours, which is the prototype's four real minutes.

**You see.** The cart rolls in from the edge within a second and DL looks up. He trades for 240 sim minutes (thirty real seconds): a coin bubble, then the cart rolls out, and sometimes a new thing has appeared.

**The ledger.** The trade itself pays the coins and buys the upgrades; this card only brings the cart. No coins hook.

**The storybook.** *The merchant's cart rolled in and 27 coins changed hands.*

---

## Shearing day

Every fleece on the farm is ready on the same morning, which never happens by accident, and the farmer comes in with the shears bubble already showing. He works down the field one sheep at a time until the whole flock is trim and the wool bank is full. The sheep feel the breeze. (A reference event for #40: the sim tops every fleece to ready and gives the farmer a visit outside his usual hours.)

**When.** A sunny daytime in spring or summer, with at least three sheep. Not more than once in three days.

**You see.** Every sheep goes fluffy at once and the farmer walks in. For up to 300 sim minutes (about forty real seconds) he shears, one name tag at a time. It ends when the last sheep is trim; the flock does a little hop.

**The ledger.** A `shearingDay` flag keeps the farmer's shear job re-queuing until nobody qualifies. The flock's mood goes up two when it is over: lighter, cooler, bouncier.

**The storybook.** *Shearing day. The farmer clipped 6 fleeces and the sheep felt the breeze.*

---

## DL's birthday

Once in a long while, on a sunny spring day, a cake bubble appears over DL and every sheep on the field turns and walks towards her. They stand in a ring. There are hearts. DL does her spin. Nobody knows how the sheep know. (Rare on purpose. We do not know DL's real birthday, so it is pinned to spring with a tiny weight; the owner can move it. The cake bubble is an art ask.)

**When.** A sunny spring day. Not more than once a month of sim time, and at the lowest weight in the deck.

**You see.** A cake bubble over DL and the flock walking towards her within a second. For 180 sim minutes (about twenty real seconds) they stand round her with heart bubbles. It ends when the ring drifts apart and DL flops down in the middle, done in.

**The ledger.** Everyone's mood goes up three. A `party` flag while it lasts.

**The storybook.** *It was Digital Luna's birthday. The whole flock came over to say so.*

---

## First snow

The first snow of the winter, or the first the flock remembers. Every sheep stops and looks up at the same moment. The lambs bounce. DL leaps at a flake, misses, and tries again. Then everybody goes back to grazing with white on their backs, as if nothing happened. (The card is made rare by its cooldown rather than by a calendar; a once-per-season field would be cleaner and is proposed in the PR.)

**When.** Winter, while snow is falling. Not more than once a month of sim time.

**You see.** Within a second the flock freezes and looks up, and DL jumps at the air. It lasts 120 sim minutes (fifteen real seconds) and ends with the sheep grazing again, snow on their wool.

**The ledger.** The flock's mood goes up one. A `firstSnow` flag while it lasts.

**The storybook.** *The first snow fell and Digital Luna tried to catch it in her mouth.*

---

## Rainbow after rain

The rain stops, the sheep come out of the barn doorway, and a rainbow stands over the barn for a while. That is the whole event. It is the one card in the deck that asks nothing of anybody. (Needs a precondition the issue did not list, `recentWeather`: sun now, rain within the last twenty sim minutes. Proposed in the PR.)

**When.** Day or dusk, in sun, within twenty sim minutes of rain ending. Not more than once a day.

**You see.** The arc fades in over the barn as the last drops fall. It stays 90 sim minutes (about eleven real seconds) and fades from the outside in.

**The ledger.** Everyone's mood goes up one. A `rainbow` flag for the weather layer.

**The storybook.** *The rain stopped and a rainbow stood over the barn for a while.*

---

## A stray cat visits

At dusk a cat pads in along the fence, the way cats do, and settles on the post nearest the gate. DL freezes mid-step and stares. The cat looks at nothing in particular. This goes on for some time. Then the cat hops down and leaves the way it came, and DL does a stretch as if that is what she was doing all along. (The cat is a new creature: data here, art and behaviour in their own tickets, and the owner's pin before it ships.)

**When.** A dry dusk or night. Not more than once in two and a half days.

**You see.** The cat walking in along the fence and DL going still, within a second. It stays 150 sim minutes (about nineteen real seconds) and leaves on its own.

**The ledger.** Nothing. Some visitors are just visitors.

**The storybook.** *A stray cat sat on the fence at dusk. Digital Luna pretended not to care.*

---

## The farmer's day off

The gate stays shut at the usual hour. DL waits, then trots to the trough and looks into it, then does the rounds herself: the trough, the hay, and a visit to each sheep in turn, because that is what the farmer does and somebody has to. The sheep get a bit woolly and a bit grumbly. Next morning the farmer is back with a heart bubble for the dog who covered for him.

**When.** Fires at dawn, in any season and any weather, so that both of the farmer's visits are skipped. Not more than once in four days.

**You see.** No farmer at the usual time, and DL peering into the trough. It runs 720 sim minutes, half a day (ninety real seconds), and ends with the farmer's next visit.

**The ledger.** A `farmerAway` flag skips the farmer's schedule. The flock's mood dips one while he is away; DL's goes up two when it is over. She managed.

**The storybook.** *The farmer took the day off, so Digital Luna did the rounds herself.*

---

## Night of the fireflies

On a warm summer night a dozen lights blink on around the tree and drift out over the field. DL bounces after the nearest one, then the next, then the next. She catches none of them. Nobody has told her. (Fireflies are small life from #33; this card brings a swarm and gives DL something to do with it.)

**When.** A clear summer night. Not more than once in two days.

**You see.** Lights blinking on by the tree and DL leaping, within a second. It lasts 200 sim minutes (twenty-five real seconds). The lights thin out one by one and DL sits down, panting.

**The ledger.** A `fireflies` flag while it lasts, which DL's idle play reads.

**The storybook.** *Fireflies filled the field and Digital Luna snapped at every one and caught none.*

---

## Lamb zoomies hour

A lamb bolts from its mother's side for no reason and tears round the trough at full speed, and any other lamb on the field joins in. The ewes do not move. They have seen this before. DL may or may not join; she is a dog. It ends the way it always ends: the lamb stops dead, wobbles, and lies down next to its mother.

**When.** A sunny day or dusk, with a lamb on the farm. Not more than once a day.

**You see.** A lamb bolting within a second. It lasts 60 sim minutes (seven and a half real seconds), the shortest card that has an end.

**The ledger.** The flock's mood goes up one. A `zoomies` flag while it lasts, which the lamb behaviour reads.

**The storybook.** *Poppy got the zoomies and ran rings round the trough.*

---

## The well runs low

A hot dry spell and a full field. The trough's water drops to a line and the sheep gather round it, taking turns at not much. A drop bubble over the nearest one says what they are thinking. It ends when the farmer walks in with buckets and the queue breaks up drinking. Never dry; low. (The drop bubble is an art ask.)

**When.** A sunny summer day with at least five sheep. Not more than once in three days.

**You see.** The trough drawn low and a drop bubble, within a second. It lasts 180 sim minutes (about twenty-two real seconds) and ends with the farmer's extra visit and the trough full.

**The ledger.** A `troughLow` flag: drinking gives less and the sheep gather. Mood dips two, then comes back two when the water does.

**The storybook.** *The well ran low in the heat until the farmer came with buckets.*

---

## A windfall

DL digs at the foot of the tree, the way she sometimes does, and this time there is a purse. A coin bubble pops over her. She trots back to the field with her nose muddy and the coin count is twelve higher, which is four fleeces at the merchant's price: a nice surprise, not a jackpot. Nobody asks whose it was.

**When.** Daytime, in sun or rain. Not more than once in three days, and rare.

**You see.** DL digging and a coin bubble, within a second. It lasts 30 sim minutes (about four real seconds); the event is the moment.

**The ledger.** Twelve coins into the bank, straight away, so the merchant can spend them next visit. DL's mood goes up one.

**The storybook.** *Digital Luna dug up a purse by the tree. 12 coins, and nobody asked whose.*

---

## Stargazing night

A clear night in late summer or autumn, and the stars come up brighter than they should. The sheep lie down facing up. DL sits by the gate with her head tipped back. Nothing happens for a good while, on purpose. Then the sky dims to its ordinary night and DL walks to the barn door to sleep.

**When.** A clear night in summer or autumn. Not more than once in two days.

**You see.** The stars brightening and DL sitting down by the gate, within a second. It lasts 240 sim minutes (thirty real seconds) and ends when the sky dims.

**The ledger.** Everyone's mood goes up one. A `starsBright` flag for the sky layer and the lie-down.

**The storybook.** *A clear night. Digital Luna sat by the gate and watched the stars with the flock.*

---

## What the deck does not do yet

- **No cross-district cards.** The harbour and the wildwood arrive in Phase 3 with the deck at fifty.
- **No calendar.** DL's birthday and first snow are made rare by cooldowns, not dates. A `dayOfSeason` or `oncePerSeason` precondition would fix both; proposed in the PR, not added.
- **No chained cards.** The farmer's day off leaves the flock woolly, which makes the next shearing day bigger; that is the ledger doing the chaining, not the deck. A `recentEvents` precondition would let a card follow another on purpose.
- **Weights are a first guess.** The sim's pacing curve and the qa lane's event coverage (#49) are where they get tuned. Every number sits in the JSON with a comment for a reason.
