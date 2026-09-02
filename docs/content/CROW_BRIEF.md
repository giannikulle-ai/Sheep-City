# Crow — creature brief

The first creature after Digital Luna and the sheep. It has to look like it lives on the same farm: same pixel
scale, same one-pixel `k` outline, same light from the top-left. Art lives in `tools/art/hand_sprites.py`
(`CROW_*` grids, `CROW_ANIMS`); this page is the look and the frame list. Behaviour is the sim lane's ticket.

## Role
A nuisance, never a threat. Crows drop onto the field, peck at grass tufts and hop between them, and unsettle
the flock: sheep nearby look up and shuffle a step away. Digital Luna chases them off; a crow takes off when she
runs at it and comes back later. A crow never harms anything: no sheep, no lamb, no stored hay, no wool. It is
weather for the flock's mood, not a predator. The sim ticket owns numbers (how often, how many tufts, how far
the sheep move); this brief only says what the crow is allowed to be seen doing.

## Size against a sheep
About half a lamb. The lamb is 21 by 16 pixels standing; the crow stands 17 by 13 on its feet (tail tip to bill
tip by crown to toes, so about half the lamb's area) and spans the full 22 by 16 canvas with a wing raised on
landing. Its head is about the size of a lamb's face. It is noticeably bigger than the small orange `bird`
(8 by 6), which stays as it is.

## Silhouette rules
- Facing screen-right in three-quarter view like the rest of the cast; the client flips for the other way.
- Chibi: a big round head, a short heavy bill, a compact body, a straight tail that sticks out behind. The head
  reads first at 1x.
- One wing shows in flight. It has three notched primaries at the tip so an upstroke reads as feathers, not a fin.
- Legs are one pixel wide with two-pixel feet, both feet flat on the ground in every landed frame.
- The whole crow is a dark shape with a light bill and one white eye pixel. If the eye and bill do not read at
  1x, the frame is wrong.

## Palette
No new colour. Every pixel is one of the existing entries from `PAL` in `pixel_grids.py`:

| char | rgb | used for |
|---|---|---|
| `k` | 43, 29, 23 | outline, legs, feet |
| `f` | 58, 52, 62 | body (the sheep's face colour) |
| `g` | 86, 79, 92 | top-left highlight on the crown and back, and the bill (the sheep's face highlight) |
| `n` | 28, 18, 14 | belly and tail underside shadow, the pupil (DL's nose and pupil) |
| `h` | 255, 255, 255 | the eye glint (the sheep's wool highlight, DL's eye glint) |

The bill is `g` so it catches the light and separates from the head at 1x; a black bill on a black head
disappears.

## Frames and timings
Seven frames on one shared 22 by 16 canvas with the ground line on row 15. Every animation includes a frame
that touches row 15, so the sheet builder trims all of them to the same 16 rows and the crow's ground point is
the same in every state (the sim adds altitude while it flies).

| frame | what | ground |
|---|---|---|
| stand | folded wings, head level; doubles as peck a | feet on row 15 |
| peck | tail up, head down, bill tip on the ground | feet and bill on row 15 |
| fly a | wing raised, primaries spread | tail hangs on row 12 |
| fly b | wing swept down and back | wingtip brushes row 15 |
| land | wing up, body tilted, legs reaching down | toes on row 15 |
| takeoff | crouched spring, wing half raised, legs pushing back | toes on row 15 |
| hop | tucked into a ball, feet drawn up | three rows clear of the ground |

Animations in `CROW_ANIMS`, all at the fps stored in the table:

| animation | frames | fps | plays |
|---|---|---|---|
| `fly` | fly a, fly b | 6 | loop; three wingbeats a second |
| `land` | land, stand | 4 | once, half a second, then `peck` or `hop` |
| `peck` | stand, peck | 4 | two to four times, then hold `stand` for a beat |
| `hop` | hop, stand | 6 | once, a third of a second, moving 4 to 6 px sideways |
| `takeoff` | takeoff, fly a | 6 | once, then `fly` |

A typical visit: `fly` in, `land`, two rounds of `peck`, `hop`, two rounds of `peck`, then `takeoff` and `fly`
away when DL arrives or the crow has had enough.

## Weak frames
Named in the PR that ships them; kept here so the next pass knows where to start: the head-down peck (the bill is
two pixels and the far leg hides behind the head), and hop, which is the stand grid drawn a little forward with
the legs tucked and so reads close to a shifted stand at 1x.
