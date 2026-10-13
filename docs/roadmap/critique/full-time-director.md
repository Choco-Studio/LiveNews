# FULL TIME — director and pace critique log (build step 4)

Step 4 of `docs/programmes/full-time.md` §9: the shapes' shots, SCORE CENTRE as a full-screen sequence, board rotation;
the boards of step 3 on air. The bible sets no gate of its own for this step; it is held to the same one as the others:
**a hostile critique above 9.7**, on what can be measured before the set, the sound and the voices exist (steps 5–7).

The panel is the design critique's (a senior sports editor, a standards and legal editor, a senior broadcast director, a
lead pixel artist and a first-time viewer). Each category 0–10; **the round's score is the lowest category.**

How it was looked at:

- **Playout.** Every edition of the step-2 gate was played through the real default-path director in node: the shots, the
  cards and the length (`tools/pace/fakeplay.mjs`, speech at 15 characters a second; the director's own estimate is 14.5,
  so real lengths run about 3 % longer). The editions were written from three live snapshots (13 Oct) at eight air times
  and from the offline desk.
- **Card log.** Each card was logged with the board it showed.
- **The v2 planner.** Its plan for the board segments was checked.
- **Tests.** The director's board segments were run with a voice stub that reaches each mark in turn
  (`test/full-time-wiring.test.js`).
- **Reading.** The thirteen-story editions were read again in full.

---

## Round 1 — the first wiring (found while building)

1. **The night ground used the viewer's own clock.** It took the browser's local hour, not the channel's London clock.
2. **The director pulled in the v2 studio's modules** just to read the hour. The director loads v2 only when asked.
3. **COMING UP's leaves dropped on a fixed beat** while the dates were read at their own pace.
4. **SCORE CENTRE and COMING UP borrowed a stranger's picture.** Their `storyId` is a candidate's, so the card's ground and
   the story beats took that story's photo.
5. **A trap in the old card builder.** It wrapped any story board as `{ timeline }`, so a new board would have been drawn
   as a timeline.

All five were fixed before the first commit:

- the London clock, through `gfx/clock.js`;
- no v2 import;
- `leafTimes` set from the voice marks, like `rowTimes`;
- `storyId: null` on a board segment, and `hasImage: false` honoured;
- the card built from the picked board's own kind.

## Round 2 — the playout

Faults:

1. **Four KEY FACT cards in a row.** The quiet Tuesday's tennis, cricket, darts and boxing stories each showed a plain fact
   card such as "6-4 6-3" or "141". That breaks the bible's "never the same board type twice in a row" four times over.
   It also shows a card the bible never names: its boards are the scoreline, the chalkboard, WHO'S WHO, IN PROPORTION,
   WHAT HAPPENS NEXT, WHAT WE KNOW and THE NUMBER's card. (Director, pixel artist.)
2. **World maps under sport stories.** WORLD NOW's grammar, which FULL TIME borrowed, opened stories with a location on a
   map: Coventry, Riyadh, Durban. A map under a result says nothing a sport bulletin needs. (Director, sports editor.)
3. **Five minutes long, not six to eight.** The real editions ran 308–326 s against the bible's 360–480. The bible's own
   segment budgets add up to 311 s (MIDWEEK) and 346 s (MATCHDAY), so the first design undercounted itself. (Director.)
4. **Four rugby stories in a row.** A rugby league World Cup squad day (gate run 3) gave four straight rugby stories, and
   the twelve-story edition made it plainer still. (Sports editor.)
5. **An opinion column aired as news.** "Christian Pulisic is no longer a focal point for the US or Milan – and that's OK"
   (Guardian, a column that opens on Mark Twain) came in once the edition had room for more stories. It aired the
   headline's verdict on a real person and a mangled sentence, "The magnificence: 43 goals and 28 assists". (Standards,
   sports editor.)

Scores:

| Category | Score | Worst fault |
|---|---|---|
| Boards: choice and rotation | 8.0 | 1 |
| Board segments (SCORE CENTRE, COMING UP) | 9.6 | — |
| Shots and grammar | 8.5 | 2 |
| Length and rhythm | 7.5 | 3 |
| Editorial on air | 8.0 | 5, 4 |
| Robustness and tests | 9.5 | — |

**Round score: 7.5.**

## Round 3 — after the fixes

1. **No plain KEY FACT card in FULL TIME.** The new pace setting `shots.factCard: false` means a story without one of its
   boards stands on its picture, and THE NUMBER keeps its card. `plainFact` is read by the director's beats, by the v2
   planner and by the plan's cue filter, so all three agree. The other programmes keep their cards.
2. **No maps.** The shape removes every story's location and the rundown's, so a story without a picture stands on its
   board or its presenter, and a headline frame stands on its field.
3. **Thirteen stories an edition.** The bible's "when under: a story more in AROUND THE GROUNDS" is applied once, measured,
   and AROUND THE GROUNDS becomes 4–7 stories. The real editions now run **364–413 s** at the stub's rate, about 375–425 s
   at the voices'. The thin desk of the next morning gives the shortest, 364 s.
4. **Any other sport at most a quarter of the edition** (three of twelve or thirteen), beside football's half.
5. **Opinion headlines never air.** That covers a headline that ends on its writer's verdict ("– and that's OK", "– but
   that's the point") and one that argues ("Why…", "In praise of…", "The case for…"). "Magnificence", "majesty" and
   "mastery" join the verdict nouns.

All fifteen gate editions re-run clean on the automatic checks. The thirteen-story editions were re-read: the column is
gone, its place taken by the Asian Cup's security story, which sits with the match delayed by the Riyadh missile alert.

What is built, for the record:

- **pace.** FULL TIME's profile: 6–8 minutes, lively like TECH BYTES, its boards, SCORE CENTRE held up to 40 s. Each board
  has a validator, and `pickBoard` takes the strongest board unless it is the type shown last and the story has another.
- **The director.** The card is the picked board. `playBoardSegment` runs SCORE CENTRE full frame (shot `scores`) and
  COMING UP on the calendar card. A row or a leaf comes in when the voice reaches the char offset the shape puts on it;
  with no offsets it comes at the sentence that reads it. The night or evening ground follows the London clock.
- **The v2 planner.** It plans a board segment as one shot for its length, and `scores` hides the presenters from the
  gesture and glance rules.
- **The other programmes.** IN PROPORTION, WHAT HAPPENS NEXT and WHO'S WHO now air on WORLD NOW, TECH BYTES, COSMOS and
  MONEY MINUTE, whose writers already made them (task 73).

Scores after the fixes:

| Category | Score | What keeps it from 10 |
|---|---|---|
| Boards: choice and rotation | 9.8 | on a quiet day the real desks give few boards. The 13 Oct midweek editions show the lead's scoreline, THE NUMBER and COMING UP. WHO'S WHO and WHAT WE KNOW need roles and points the copy rarely states ("Brian McDermott has opted", with no role). The rest stand on their pictures, as the bible says |
| Board segments (SCORE CENTRE, COMING UP) | 9.8 | timed to the voice through the shape's char offsets and proven with a stub voice and the playout. The recorded voices' word marks on air are step 7's |
| Shots and grammar | 9.8 | FULL TIME uses WORLD NOW's camera grammar (singles, over-the-shoulders, the two-shot for THE BREAKDOWN) with its own pace. A grammar of its own (the pitchside platform's angles) comes with the set in step 5 |
| Length and rhythm | 9.8 | the offline fixture desk (17 fictional items) still gives 315 s; it is a test desk, and every real edition is in range |
| Editorial on air | 9.8 | the step-2 gate on weekend data is still owed (the scheduled snapshots of 17–19 Oct) |
| Robustness and tests | 9.8 | `test/full-time-wiring.test.js` (10) covers rotation, the validators, the hold, the cards, the board segments and the v2 plan; the suite stays green |

**Round score: 9.8. Passed.**

## Carried to step 5

- **Sound for the boards.** The bed's crowd swell under the lead's scoreline (`seg.scoreSting`) and SCORE CENTRE's tick
  per row (on the same marks as the rows).
- **The pitchside platform set**, and with it FULL TIME's own camera angles.
