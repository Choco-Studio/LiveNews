# Quality loop (owner, 5 Oct): do not stop below 9.7

The owner's bar for the presenters and the weather presenter: work in rounds of
render → harsh critique → fix, and do not stop until an extremely harsh critique
scores **above 9.7 / 10**. This file is the shared method, so every area is
judged the same way.

## The critic

Critique as a hostile panel, not as the author:

- a lead pixel artist from a top studio known for character animation in pixel art
  (judges silhouette, clusters, anatomy, consistency, palette discipline);
- a senior broadcast director (judges acting, timing, eyelines, naturalness on camera);
- a first-time viewer (judges anything that looks odd, uncanny, stiff, robotic or "AI-made").

Rules:

1. Judge only what the renders show: frames at 1x, nearest-neighbour upscales (3x or more) and
   filmstrips of every movement (at least 12 frames per second of animation for motion judgements).
   A movement is never judged from one still.
2. Before giving any score, list **at least 10 concrete defects** (where, which frame, what is wrong,
   what it should be). If you cannot find 10, look again at a higher zoom and in motion. Only nitpicks
   may remain for a score above 9.7.
3. Score every category of the rubric. The round's score is the **lowest** category score, not the average.
4. Never raise a score because of effort, code quality or tests. The screen is all that counts.
5. Compare against the previous round's renders side by side: a fix that breaks something else is a regression
   and costs points.

## Rubric (each 0–10)

| Category | What a 10 looks like |
|---|---|
| Silhouette and read at 1x | Each presenter recognisable from the silhouette alone at 1x; nothing reads as noise |
| Anatomy and proportion | Heads, necks, shoulders, arms, hands and (when visible) legs and feet in believable proportion from every angle used on air, including turns and side-on views |
| Consistency | Same person in wide, close, two-shot and every pose; no feature that pops, jumps or changes size between frames |
| Motion | Weight, timing, arcs, follow-through and settling; no sliding feet, no snapping, no mechanical repetition, no limb that moves without the body reacting |
| Acting | Eyes lead, gestures land on the words that motivate them, listeners react sparingly and naturally; nothing looks puppeted |
| Pixel craft | Clean clusters, deliberate dithering, no banding, no orphan pixels, no jaggies on curves, palette discipline, consistent light direction |
| Integration | Lit like the set they stand in; correct contact with desk/floor; no halo, cut-out edge or floating |

## Log

Each area keeps `docs/roadmap/critique/<area>.md` with one entry per round:
the renders' paths, the defect list, the rubric scores, the round score, and what changed next.
Stop only when the round score is above 9.7, then add a final entry with the evidence.
