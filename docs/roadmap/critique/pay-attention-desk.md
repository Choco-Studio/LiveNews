# PAY ATTENTION — question desk critique log (build step 1)

Step 1 of `docs/programmes/pay-attention.md` §9, the question desk. It covers:

- eligibility by event and the exclusions;
- the headline checks and the give-away checks;
- the five round kinds with their options;
- the grave-day rule and the edition planner.

**Gate:**

- three real days of archive;
- every question and option the planner makes over them checked by hand: 100 % real and correct, 0 % from an excluded
  kind, no give-aways;
- the grave-day rule airs the quiz on those days, and does not air it on a grave day built from the archive's own grave
  stories;
- the editions that fit each day and the seats per presenter reported.

**What is built:**

- `server/quiz/desk.js`: what may be used: the exclusions, the words, places, figures and events;
- `server/quiz/grave.js`: the grave-day rule;
- `server/quiz/rounds.js`: the five round kinds and their options;
- `server/quiz/planner.js`: pairings, rotation, DOUBLE OR NOTHING, the tie-break and the whole plan;
- `tools/quiz/desk.mjs`: prints every plan of one or more days for the hand check;
- `tools/quiz/playout.mjs`: plays the channel headless at air pace, so the server records real archive with no browser;
- `test/pay-attention-desk.test.js`: 22 tests. The whole suite: 2234 of 2234.

**Status: built; the gate is pending.** The gate's three days of archive have been recording since 13 Oct, 20:30
London, from the real feeds through the channel's own programmes. The station itself needs three days of archive before
the quiz may air (§3.3). The gate falls due on 16 Oct.

---

## Round 1 — found while building, on the real archive

The desk was run on the development archive. That is 12 Oct, 14:00–24:00 London, and 13 Oct up to 22:00: 314 story
groups, of which 112 were read grave or serious. Every story it kept and every story it left out was read, with the word
that decided it. Faults:

1. **Fixture stories passed as real.** The test feeds' fictional outlets ("Ledger Line", "Pixelburg Sport": "Quaywick
   Albion thrash Copperfold Town") carry links on `fixtures.globit.invalid` and came through as eligible. Fixed: a real
   story's link is a web address on a public host.
2. **The harm list had no closing word boundary.** "Diesel" read as "dies", so "Electric car sales overtake diesel in
   Europe" was out, and "deadline" would have read as "dead". Fixed.
3. **Whole-text matching left too much out.** "The government says it cuts the journey by 40 minutes", in a tunnel
   story's second sentence, made "Norway opens a 27 kilometre road tunnel" politics. Fixed: politics, children, health,
   money, hardship, promotion and a person's failure are judged on the story's subject (headline, title, opening
   sentences). Harm, disasters, crime, conflict and betting still count anywhere.
4. **Senses that only look excluded** were left out:
   - "Roman fort found in Wales…", whose Roman emperor "led his troops";
   - "New injection makes fat cells self-destruct" (an injection that "destroys fat cells");
   - "NASA spots patch of Moon-like rock on Earth", which "bears the scars" of 600-million-year-old collisions;
   - "earns City a draw";
   - "Citroën bets on nostalgia".
   
   Fixed with a list of lookalikes: deep time and history, cells and microbes, sky and space, sport's own words, a
   figurative bet.
5. **Leaks, the worst finding.** "Ethiopian forces enter strategic Tigray town of Adwa" was eligible: it was not read
   grave, and no list word caught it. "IEA urges additional diesel releases", an intergovernmental call on governments,
   was eligible too. Fixed:
   - the conflict list takes armed forces, forces that enter, take or seize, "strategic town", militants, coups and the
     hot spots (Tigray, Sudan, Yemen, Syria, Somalia, the Sahel, Kashmir, Iran, North Korea, Hormuz);
   - politics takes intergovernmental bodies and central banks.
6. **Hardship missed a store with a name.** "HMV to close Oxford Street store" put three words between "close" and
   "store". Fixed.
7. **Fragments and notices passed:**
   - a comma between two adjectives was read as a clause boundary: "Google Play now lets anyone build private[, vibe-coded
     apps]";
   - NASA's feed gave a job notice, "Job opportunities: NASA office of general counsel";
   - it also gave picture captions: "Transporter-18 SmallSats Encapsulation", "Comparing Off-World Rover Driving
     Distances".
   
   Fixed:
   - a comma is a boundary only before a clause opener;
   - notices, job adverts and countdowns join the promotion list;
   - a headline must say what happened, so one with no verb is "not a headline".
8. **WHERE IN THE WORLD? had almost nothing to ask.** In a day and a half there were 3 usable places, because most
   headlines name their place. Fixed: when the headline names the place, its country or its people, those words are
   masked, as HOW MANY? masks its figure ("F1 in ▮▮▮▮▮: There's new fastest car now"). One mask's length serves every
   name, so it tells nothing. That gave 7 usable places.
9. **WHERE had too few wrong pins.** The week's eligible stories named six countries, five of them in Asia or North
   America. No round of three questions could find two wrong pins in two other regions for each. Fixed:
   - the week's places come first, then a fixed list of 49 well-known countries in seven regions;
   - never a country named by a story the week left out: no playful pin on a country in the news for a war or a
     disaster.
10. **WHERE recycled its answers.** The three answers were each other's wrong pins (ITALY, CHILE, INDIA three times), so
    the last question could be solved by elimination. Fixed:
    - an answer is never another question's wrong pin;
    - a pin shows at most twice in a round;
    - pins not yet shown come first.
11. **PICTURE THIS's "three desks" cannot be met.** The 13 Oct pool held 20 technology, 13 science and 2 world stories,
    and no edition could find three desks for every question. Fixed: at most two tiles from one desk. A distractor from
    the answer's own desk is also the harder, fairer question.
12. **Two takes on one story across rounds.** The desk's story grouping does not always join two outlets' takes (the
    Citroën 2CV: two headlines, two ids). Fixed:
    - an edition asks one take per story, judged by a shared name;
    - no option shares a name with a story the edition asks.
    
    A headline's first word counts as a name only when it is shaped like one ("OpenAI", "NASA", "Citroën's"), never
    "Museum opens…".
13. **DOUBLE OR NOTHING offered one desk.** The rounds had used up the wrong options its second desk needed. Fixed: its
    wrong options may be ones the rounds showed, since only one of its offers airs.

The bible is amended to match: §3.1 (notices; a headline says what happened) and §4.1 (PICTURE THIS's desks; WHERE's
mask and wrong pins).

## Found later, in the step-2 reading (fixed in the desk)

Reading twenty written editions (`docs/roadmap/critique/pay-attention-writer.md`) found three more:

- "Enter the Zachbot: Trump's new press secretary malfunctions on podium debut". The politics list now names politicians
  and press secretaries.
- "BBC FM radio transmissions suspended in Afghanistan". Censorship and suspended broadcasts now count as politics;
  Afghanistan, Myanmar, Haiti, Libya, Burkina Faso, Eritrea, Belarus and Venezuela join the conflict places.
- "Iconic Iguazu Falls walkway dismantled amid record water levels". Record water levels and surging water are now
  disasters.
- "Google makes it easier to launch your vibe-coded apps" had "a new feature in the US" as its place. Features, services
  and roll-outs are where a product is sold, never a place.

That makes two leaks found only by reading. The gate reads every question by hand for this reason.

## The first plan on real data (a dry run)

This was planned for **13 Oct, 22:00 London** on the archive as it stood that evening (1.3 days), with the three-day
minimum lifted (`--min-days 0`). That is never the gate. TODAY OR NOT TODAY could not be filled, since nothing in the
archive aired before yesterday, and HOW MANY? had one usable figure. The plan:

- **Players**: Paco v Penny. WORLD NOW, SEVEN DAYS and MONEY MINUTE stories were all left out; the pool held 28 stories.
- **LETTER BY LETTER**:
  - "Owls ringed to measure benefits of wildlife farming";
  - "New injection makes fat cells self-destruct";
  - "Prime Video unveils Blade Runner 2099 full trailer".
- **WHERE IN THE WORLD?**:
  - "'Jellyfish' effect lights up ▮▮▮▮▮ sky" (USA, against the Netherlands and Singapore);
  - "NASA spots patch of Moon-like rock on Earth" (Madagascar, against India and Jordan);
  - "Smart ring maker Ultrahuman to roll out biological-age model across ▮▮▮▮▮" (UAE, against Malaysia and Namibia).
- **PICTURE THIS**: Facebook's feed algorithm, ESA's Mars moon lander, Xbox's AI game ports.
- **DOUBLE OR NOTHING**: PICTURE THIS, technology or science.
- **Tie-break**: "Inside mini factory where GM builds its EV future".

Every question and option was checked by hand against its archive entry:

- every headline is the aired one or its source's title;
- every answer is the story's own;
- every country is where the story happened;
- no option comes from WORLD NOW, SEVEN DAYS or MONEY MINUTE;
- nothing is from an excluded kind.

What stays weak, for the gate: the questions lean on technology and science, because world news is mostly excluded
kinds. "Comparing Off-World Rover Driving Distances", a NASA chart, reached the plan before the verb rule. A picture that
is mostly text can give its answer away at the last step; that makes an easy question, not a false one.

## Still owed for the gate

- **Three real days of archive**, recorded from 13 Oct, 20:30 London. Then `node tools/quiz/desk.mjs --from <day> --days
  3`, and every question and option of every edition checked by hand.
- **The grave-day rule on a grave day built from the archive's own grave stories.** It must not air.
- **Editions per day and seats per presenter**, reported here.

## The gate (16 Oct): read by the reviewer

**The archive.** Real days 12 and 13 Oct, 14 Oct to 17:32 London time, then a gap to 16 Oct 15:25 (the recorder was
down: the account's usage limit, then a container restart). Not three continuous days, and said so. Planned with
`tools/quiz/desk.mjs` at 15:30 and 20:30 London on 14, 15 and 16 Oct:
- 14 Oct: no edition (the archive held 2.0 and 2.1 days; the quiz needs 3). Right.
- 15 Oct: no edition (no airings in the six hours before: too little to judge). Right.
- 16 Oct: both editions air (Lola v UNIT-8, Penny v Sam).

**Every question and option read by hand. Four leaks, all fixed with tests:**
1. "Netflix is laying off around 1,000 employees" as a tie-break and as an option: the hardship list had "layoffs" and
   "laid off" but not "laying off" / "lays off".
2. "Google’s Universal Cart shopping tool launches in ▮▮▮▮▮" as WHERE: the availability rule's "launches in" needed
   two spaces before "in", so it never matched.
3. "This tiny jurassic predator helped pave way" as an option: the channel's headline cut the title and dropped its
   articles, so the cut was not recognised. A cut that drops articles is now a cut (the whole title is used).
4. "Is your boss watching you? The rise of AI surveillance at work – podcast" as PICTURE THIS's answer and a TODAY
   headline: a programme's episode, not a story. Episode titles ("– podcast", "– video", "Podcast:") are promotions.

Re-planned and read again after each fix: the two editions are clean.

**The grave-day rule on the archive's own grave stories** (254 airings read grave): 37.5 % grave in six hours does not
air; 27.5 % does not; 25 % airs (the rule is "more than"); 12.5 % airs; a story with people harmed leading WORLD NOW
four times stops it.

**Seats.** Eight editions planned in a row on 16 Oct's archive: every presenter plays (Paco 3, Nova 1, the others 2);
Max plays twice (step 2's gate asked for it). Every set of rounds differs from the edition before.

**What stays weak.** The questions lean on technology and science: 16 Oct 15:30 had 12 of 15 from technology (an hour
after the recorder restarted, today's pool was mostly TECH BYTES); 20:30 was mixed. The pool is what it is: the
exclusions take most world news.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Standards (nothing excluded asked) | 9.6 | four leaks in two editions on the gate day, each a new pattern; fixed, but a day's new headlines may bring new ones |
| Truth (the words and facts on screen) | 9.8 | the aired words, cuts recognised; "SpaceXSI…" is the source's own headline |
| Robustness (when it airs, when not) | 9.8 | young archive, thin hours and grave days all refuse correctly |
| Fairness and variety | 9.7 | every presenter seated; the technology lean |

**Gate not yet passed: 9.6.** The rule for passing: one more day's editions (17 Oct, on a continuous archive) read by
hand with no leak.
