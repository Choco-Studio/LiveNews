# FULL TIME — cast critique log (Kai Sprite and Rosa Rally on screen)

The presenters' looks of `docs/programmes/full-time.md` §2. Before this work FULL TIME fell back to other designs:
Kai drew Paco's base (an older grey-haired man in a suit) and Rosa Lola's (a generic red-haired woman). **Gate: three
candidate looks each for the owner, candidate A wired in both renderers, a hostile critique above 9.7 for the wired
look.**

The panel: a lead pixel artist, a character designer and a first-time viewer. Five categories, each 0–10: readability
at 1x, distinctness from the whole cast, craft (palette only, clean clusters, no orphan pixels), integration (mouth,
eyes, blinks, gestures; nothing clipped in the wide, two-shot, closes and OTS), consistency with the channel's cast.
**The round's score is the lowest category.**

How it was looked at: the v2 cast rendered in node (the pixel buffer works without a browser) and the owner's sheets
in Chromium (`public/lab/full-time-cast.html`, captured with Playwright): every candidate's close single at 1x and its
head at 4x, neutral and talking; the wide figure at 1x and 4x; all nine Kai × Rosa two-shots, Kai talking, Rosa talking
and neutral; the looks on air in the wide, two-shot, both singles, both closes, both MCUs and both OTS; talking strips,
blinks, a yaw and pitch turnaround, six gestures (Kai: raise_hand, point_screen, count; Rosa: steeple, chin, shrug);
the old renderer's sprites and close-ups. Measured as well as looked at (numbers below are from those renders):
orphan pixels in the head box at s 1 / 2.15 / 3.4, the overlap of the head's dark mass and of its silhouette with every
other face at s 1 and 1.37, and the whole figure's colour histogram against every other look (the experts' rule).

The set in every render is a placeholder (WORLD NOW's room: FULL TIME's pitchside set is being built separately); the
framings are the channel's own (`camera.js`).

---

## Round 1 — the first lab render (during the build)

Not scored: the faults were found and fixed before the panel looked.

1. **Kai's beard bagged out on one side** and its volume covered the ear: it started at the ear's top. Under the chin
   a black box read as an object of its own, and it covered the bomber's collar. The volume now starts below the
   lobe, the base is narrower (4.1 u) and shallower (1.6 u), and Kai's head sits 0.75 u higher (a longer neck than
   Max's), so the rib collar shows below the beard.
2. **The beard was a flat black mask**: the skin's shade mapped to black. The skin's light now maps one step into the
   beard's ramp (lit → slate, base and shade → ink, only the deepest → black), with combed strands at close-ups.
3. **Both collars were blobs beside the neck** (headphone pads, said the first-time viewer). They are now the lower
   part of a ring round the neck cut open by the V; the track top's funnel collar is in the body's own group (no seam
   where it grows from the shoulders).
4. **Rosa's tail looped over the crown like a braid**, the front strands made a comb of stripes that read as a fringe,
   and the hairline was a flat bowl-cut line. The hairline is now high and rounded, the light a band of tapered
   strokes over the key side, no separations; three tail paths were rendered side by side and the high hook chosen
   (it rises a little above the tie before it falls: the ponytail at 1x).
5. **The hoops were orange gems on the cheek.**

## Round 2 — the panel's first look

Faults:

1. **Kai's orange collar was 1 px each side at 1x**: the line between the collar's group and the body ate half of it
   (pixel artist, first-time viewer). In the wide the collar now lies in the body's group, 0.5 u wider: 2–3 px of
   orange each side of the white V.
2. **A strip of bare skin between Kai's nose and moustache** (character designer: a full beard does not stop short of
   the nose). The moustache now reaches the nose.
3. **The shaved dome was lit like a face**: a flat lit half and a straight terminator (pixel artist). It now catches
   the key as an arc along the dome's curve, the crown inside it in the base, a crescent a step down on the far side.
4. **The hoops still haloed into 6 px gems**: the resolve outlines every empty pixel next to a part in that part's
   line colour, and a decal's line is its own colour, so the ring's hole filled with gold. The hoops now use materials
   with no outline (a 4 px O at close-ups, a point and its shaded half in mediums, a gold point in the wide) and hang
   beside the jaw.
5. **Rosa's hair: 151 orphan pixels at s 3.4, the most of the cast** (pixel artist), most of them on the tail, whose
   lit flank flipped sides where it bent. One lighting rule now runs along the bend, the strands are dashes along the
   tail, and stroke ends left as single pixels are pruned (`pruneSpecks`): 101 at s 3.4, mid-cast (cast 36–148).
6. **The sleeve stripe started below the shoulder** (the shoulder cap belongs to the jacket's group). It now runs from
   the shoulder to the cuff.
7. **A silver line down the tail read as a headphone band at 1x** (first-time viewer). The tail has its own material
   with no rim; the hair light stays on the crown.
8. **Kai's navy bomber measured as a recoloured twin of Lola's blazer**: the same navy body, a figure histogram 0.34
   from hers, under the 0.35 the experts' rule asks (character designer: Lola is the girl in blue; a second presenter
   in her navy takes her signature). The bomber is now midnight navy: an ink body that catches the key in navy over the
   key-side chest (1.51 from Lola now), so the orange rib and the white tee carry him.
9. The sheet itself: the talking frames caught closed mouths, the 4x crops cut the knot and the hook. Fixed (the
   instants with the mouth open, taller crops).

| Category | Score |
|---|---|
| Readability at 1x | 9.2 |
| Distinctness | 8.6 |
| Craft | 8.8 |
| Integration | 9.4 |
| Consistency | 9.3 |
| **Round** | **8.6** |

## Round 3

Faults:

1. **The midnight bomber's sheen ended in a straight vertical line**: at 4x it read as a two-colour jacket (pixel
   artist). Its edge now follows the chest's volume (out over the upper chest, back in toward the waist), so it reads
   as a lit plane of the body.
2. **Candidate Rosa B's knit lit in white**: a whole garment brighter than her face (ART_DIRECTION: white for collars
   and glints). Cream now. (A candidate, not on air; fixed for the owner's sheet.)

| Category | Score |
|---|---|
| Readability at 1x | 9.8 |
| Distinctness | 9.7 |
| Craft | 9.7 |
| Integration | 9.8 |
| Consistency | 9.8 |
| **Round** | **9.7** |

Distinctness and craft held at 9.7 on the open questions below; both were measured again for round 4.

## Round 4 — passed: 9.75

Renders: `/tmp/full-time-cast/candidates.png`, `pairs.png`, `pairs-b.png`, `pairs-neutral.png`, `onair.png`,
`legacy.png` (from `public/lab/full-time-cast.html`), plus talking, blink, turnaround and gesture strips at 3–4x.

The panel's defects (QUALITY_LOOP rule 2: at least ten, concrete; all nitpicks now, none fixed further):

1. Kai, close (s 3.8–4.4): the beard's squared base is one dark row a touch wider than the jaw's corners: a small ledge
   at 4x.
2. Kai, single at 4x: the beard's lit flank is a 1 px slate edge all the way down: slightly ruled.
3. Kai, two-shot (s 1.86): the beard is one quiet tone (the medium LOD): a dark mass with no strands.
4. Kai, close: the navy sheen ends in a hard step (the palette has no tone between navy and ink); its curve keeps it a
   plane, not a stripe.
5. Kai, wide: the far half of the rib collar is rust (its shade): the near and far sides read unequal at 1x.
6. Kai, turnaround at yaw ±0.6: the beard's far-side volume stands about 1 u off the jaw: plausible, heavy.
7. Rosa, close: the hoop's 4 px O sometimes has the jaw's outline pixel in its hole instead of the background.
8. Rosa, close: the skin's highlight above the brows (FACES', as on every light face) is a 3 px mark: at 4x it can
   read as a small scar.
9. Rosa, single: the hair above the far ear and the tail join into one dark mass for a few rows.
10. Rosa, wide: the hook over the crown is 2–3 px: on a busy background it could merge (the placeholder set is calm).
11. Rosa, mediums: the funnel collar's inside (one step darker) is 1 px and nearly invisible.
12. Rosa: where the stripe meets the silver rim at the far elbow, the two alternate for 1–2 px.
13. Both, wide: the zip's fog line continues the white V downward; for a frame it can read as a long, thin V.

The panel's reading of the wired looks (A):

- **Readability at 1x (9.8).** Kai: a bare dome over a dark squared jaw, 2–3 px of orange each side of a white V, a
  navy sheen on the key side. Rosa: a dark hook over the crown and a fall of hair beside the head, an orange line down
  each arm from shoulder to cuff, the white V. A first-time viewer names both from the wide alone ("the bald one with
  the big beard", "the one with the ponytail and the stripes").
- **Distinctness (9.8).** Where the dark mass sits in the head overlaps no other face by more than 0.32 for Kai and
  0.45 for Rosa (the cast's own nearest pairs: 0.54–0.77); head silhouettes at most 0.86 and 0.78 (cast pairs: up to
  0.93–0.97); figure histograms at least 0.89 (Kai) and 0.36 (Rosa) from everyone (the experts' rule: above 0.35).
  Nearest neighbours and why they differ:
  - Kai — **Max** (a beard; his is close-trimmed espresso under a quiff, a tobacco blazer); **Tomas** (bald; white
    tufts, round glasses, a white moustache, a brown cardigan); **Omar** (a beard; grey, receding grey hair, glasses, a
    suit and tie); **Rhea** (the same skin ramp and black, inverted: her black is the hair on top, his the beard below;
    a woman's sleek chignon, a jacket); **Lola** (navy, before round 2).
  - Rosa — **Rhea** (dark hair drawn back, and the same charcoal ramp as her jacket: the nearest by colour; Rhea's is a
    low bun at the nape, Rosa's a high hook over the crown, silver studs and an earpiece against gold hoops and orange
    stripes, warm brown skin against light tan; Rhea never airs on FULL TIME); **Penny** (drawn back too, honey blonde,
    a low chignon, a burgundy blazer); **Nova** (the nearest by dark mass at 1x, 0.45: a full coily halo, deep skin, a
    purple cardigan); **Ada** (dark straight hair to the shoulders, glasses, a green roll-neck).
  - No one on air has a shaved head with a full beard, a ponytail, a zip top or a striped sleeve.
- **Craft (9.75).** Palette only (tested at s 1 / 2.15 / 3.4 and at the remote scale). Orphan pixels at s 1 / 2.15 /
  3.4: Kai 11 / 29 / 57 (the cast's lowest third), Rosa 16 / 62 / 101 (mid-cast; the rest are the shared kits': the
  eyes, the outline's corners, the hoop's 4 px ring). Clusters: the beard's combed strands, the dome's arc, the
  ponytail's sheen band and tapered strokes, the knit rib ticks, the zip's teeth.
- **Integration (9.8).** Mouths open and close with the visemes, the lips showing through the beard; blinks; the
  beard follows the open jaw and the head's turn; the tail swings after the head; six gestures with the stripes and
  the orange cuffs following the sleeves; nothing clipped in ten framings (wide, two-shot, singles, closes, MCUs,
  OTS), the hook and the beard included (tested). The old renderer draws both, all six candidates. A close single
  costs what the cast's do (pose, draw and resolve at s 4: Kai 2.9 ms, Rosa 3.3 ms; the cast 2.5–3.3 ms): the tail's
  first version cost 6.4 ms, every pixel of its box tried every segment; its segments are now chunked by bounding box.
- **Consistency (9.8).** The cast's rig, seated bodies, outline system, key light from camera-left, silver rim on the
  right shoulder and the hair light on the upper right, the LOD tiers, the kits' clump rules; signature colours of
  their own (Kai's orange rib on midnight navy, Rosa's orange stripes on charcoal), the programme's orange only as a
  trim.

| Category | Score |
|---|---|
| Readability at 1x | 9.8 |
| Distinctness | 9.8 |
| Craft | 9.75 |
| Integration | 9.8 |
| Consistency | 9.8 |
| **Round** | **9.75** |

The bible's gate for this step is QUALITY_LOOP's character rubric; its other categories, for the looks (the rig, the
direction and the gestures are the channel's own, unchanged): anatomy and proportion 9.8 (adult proportions on the
proven seated bodies; Rosa's shoulders a little squarer than Lola's), motion 9.75 (the tail swings after the head, its
end the most; the beard rides the open jaw and the turn; defect 6), acting 9.75 (Kai's livelier head and warmer resting
mouth, Rosa's stiller head, rare smile and level gaze through the channel's own direction). Lowest: 9.75.

### Left open (honest)

- **The pitchside set.** Every render here is on a placeholder room; the looks need one more look on FULL TIME's own
  set when it lands (a night ground behind a midnight-navy bomber: the silver shoulder rim and the navy sheen are what
  keep him off a dark stand).
- **Kai's bomber is "midnight navy", not the bible's plain navy** (round 2, fault 8): the owner may prefer the
  brighter navy; it is one line in `cast/full-time.js` (`jacket`), at the cost of the twin measure with Lola.
- **Rosa's charcoal is the channel's most common cloth** (Paco's suit, Rhea's jacket): her signature is the orange
  stripe, not the cloth.
- **The bomber's rib waistband** is drawn but never seen at the desk; the beard's flat base reads as a dark band at 4x
  (meant: trimmed square).
- **Candidates B and C** are designs for the owner's choice, finished to the same rules but not taken through the
  panel's rounds; whichever the owner picks gets its own round before it airs.
