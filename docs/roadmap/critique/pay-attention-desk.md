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
- `test/pay-attention-desk.test.js`: 38 tests (22 at the first build; the 17 Oct gate's cases added).

**Status: built; the gate is not passed: day 2 (17 Oct) failed and the gate moves to 18 Oct (the end of this log).**
The gate's three days of archive have been recording since 13 Oct, 20:30 London, from the real feeds through the
channel's own programmes. The station itself needs three days of archive before the quiz may air (§3.3). The gate fell
due on 16 Oct.

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

## The gate's second day (17 Oct): failed

**The run.** `node tools/quiz/desk.mjs --from 2026-10-17 --days 1 --at 15:30,20:30` on the continuous archive (16 Oct
15:25 to 17 Oct), every question and option read by hand by the owner's reviewer. Both editions aired (Lola v Penny,
Ada v Nova). **Seven leaks against §3.1 and three other faults.** Day 2 failed; step 1 has not passed.

**The leaks, each with its root cause and its fix** (all in `server/quiz/desk.js`, a test from each real case in
`test/pay-attention-desk.test.js`):

1. **"AOC transfers $1m to Michigan candidate El-Sayed in progressive push"** (PICTURE THIS's answer). The politics list
   knew heads of state, party leaders and offices like "minister", but not a race's words or a politician known by
   initials. Fixed: candidates (not a vaccine, planet or job candidate), nominees, primaries, "progressives" and a
   progressive push or caucus, left- and right-wing, populists, Ocasio-Cortez, and "AOC" in capitals (not AOC's
   monitors).
2. **"Lisa Nandy 'minded to intervene' in Sky's £1.6bn purchase of ITV"** (DOUBLE OR NOTHING, WHERE). Its source opens
   "The culture secretary, Lisa Nandy, …", but the list had only "press secretary". Fixed: every secretary of state by
   office ("culture", "home", "foreign", "shadow …" secretary, "secretary of state for …"), attorneys general, house
   speakers, first ministers, the shadow cabinet, Whitehall, Capitol Hill, the State Department; and Nandy by name.
   The story's two other takes ("Nandy 'minded to intervene' in Sky-ITV deal", "…in Sky's £1.6bn takeover of ITV
   entertainment arm") go out with it.
3. **LETTER BY LETTER "Italy cuts air traffic in half"**. The source's title goes on "amid data transmission issue", so the
   clean cut hid the incident, and no list knew a failure worded mildly. Fixed, counted anywhere like every disaster: a
   technical, network, data transmission, computer, signalling or power issue, problem, fault, failure, glitch, outage
   or error; issues that hit a network or a control system; glitches and outages; travel, flight, rail or service
   disruption (not the business sense, "disrupt the market"); delays and cancellations; flights cancelled, grounded,
   halted; air traffic or flights cut, halved or restricted; malicious activity; an IT failure. The aired cut alone
   ("Italy cuts air traffic in half") is now out too. The 16 Oct take ("Italy's air traffic cut 50% after network
   problems as delays spread nationwide") was eligible the same way and goes out the same way.
4. **HOW MANY? on Isabel Allende's €1m prize**. The money list knew salaries and earnings but not the prize a person
   wins. Fixed: a sum before a prize, award or purse ("€1m Spanish literary prize"), a prize worth a sum, prize money, a
   cash prize, a lucrative prize. A grant is no one's earnings and stays ("Red squirrel project opens £250k community
   grant").
5. **HOW MANY? from "Fuel costs squeezing margins for some businesses"**. Hardship knew closures and job losses, not a
   squeeze. Fixed: costs squeezing margins, squeezed households, budgets, firms or families, feeling the squeeze (a
   "squeezy banana" toy stays), and with it bills, costs, prices or rents through the roof or soaring, and a market's
   plunge (stocks, indices: "Indonesian stocks plunge 11% …", found in the same archive).
6. **PICTURE THIS answer "Low-cost clinic helps pet owners with vet bills"**, whose source opens "the pets of people with
   low incomes". The list had "income" but not "incomes". Fixed: incomes, low and lower incomes, people on low pay, food
   banks, soup kitchens, being unable to afford, financial hardship.
7. **"Artisanal miners behind Nigeria's lithium boom"** (LETTER BY LETTER, Al Jazeera). **Ruled out.** By its own text:
   the event aired three times, and the third airing (17 Oct, 00:18 UTC) went on "But as investment grows, they say
   they face unsafe working conditions", which is dangerous work; one airing out puts the event out. No list knew
   dangerous work. Fixed, counted anywhere: unsafe, dangerous or hazardous working conditions, risking their lives,
   child and forced labour, modern slavery, sweatshops. And since its first two airings said only that "artisanal
   miners hope to benefit", the event would still have been eligible on 16 Oct: artisanal and informal mining and
   subsistence farming are now hardship by subject, a story of poor workers' livelihoods. No child labour was in its
   text; a story that names one is out as children.

**The other faults:**

8. **A broken cut: PICTURE THIS option "Meta may use sweeping commercial TOS"** (the title: "Meta may use sweeping new
   commercial TOS to avoid millions in AI licensing fees"). The cut detector let a headline skip only articles, so a
   headline that also dropped "new" was taken for a rewrite and shown as it aired. Fixed: a headline whose words are the
   title's in order, with any words dropped, is a cut, and its rest must be a clean one ("to avoid…" is not; the title
   is 78 characters, so the story is not used). A cut that dropped a word that is not an article shows the source's
   title when it fits, since a dropped word can break the sense; so does an article dropped inside a name. A kicker
   cut off the front stays clean. The same reading found more of them in the archive: "Apple's HomeView is just[ the
   latest] threat to online recipe writers", "India becomes[ the latest] country to report…", "… warns[ small] AI models
   could self-replicate", "Fairphone's[ latest] repairable earbuds are smaller[, lighter…]", "Apple's[ new] smart
   home lineup includes[ a] smart lock[, thermostat…]", "Veritas expands[ its] anti-counterfeit chip to jewelry[, trophies…]",
   "Bear with taste for honey: Winnie[ the] Pooh turns 100".
   **And a quote:** "Replit's CEO says future of work is ‘self-driving firm’" put in quotation marks a word the CEO
   never said (the source: "the ‘self-driving company’"). A quoted phrase in an aired headline must now be found in the
   source's title, summary or text, else the title is shown (or the story is not used).
9. **An unfair wrong option: PICTURE THIS with a portrait of Ramp's chief executive**, the answer "Ramp reaches $60B
   valuation…", a wrong option "These execs think voice AI hasn't reached its … moment yet". Fixed in
   `server/quiz/rounds.js`: no wrong option fits the picture. The desk knows what a cleared picture shows from the picture
   desk's own choice, which the archive now keeps beside the picture's rights record (`imageSubject`: a person, a place,
   an event, a craft…; `server/archive.js`). Under a portrait no wrong option is about people: a person's role or a
   group of people ("execs", "scientists", "author", "fans"…), a full name ("Joni Mitchell"), or a story whose own
   picture is a portrait. Under a picture of a place, no option naming a place; under a spacecraft or the sky, no space
   headline; under any known kind, no option whose own picture is of that kind. An outlet's photo in a private preview
   could show anyone and is treated as a possible portrait. That option was itself a second fault: the desk's grouping
   had joined 12 Oct's "These execs think voice AI…" with 16 Oct's "A Nvidia insider-turned-VC on why robotics hasn't
   hit its … moment, yet", whose own headline was too long, so the event showed the first story's words over the
   second story's picture and airing. Fixed: an event's words, picture and figure are its latest airing's own story
   (its story id); when that story has no whole headline, the event is not used (it costs two real stories on 17 Oct,
   a Fitbit and a NASA lander, whose latest airing's headline was too long while an earlier feed story's was whole).
10. **Rights: PICTURE THIS showed outlet photos** (a Getty image from Ars Technica, TechCrunch's and the BBC's own). The
    station's archive strips an uncleared picture when it runs with `PICTURE_RIGHTS=cleared`, but the desk itself took
    any picture it was given, the desk tool read the archive without a mode, and the producer and the director took the
    plan's picture on trust. Fixed along the picture's whole way:
    - `desk.js` `pictureCleared`: by default an event's picture is one whose rights record is cleared for that very
      picture (`server/rights.js` `currentRights`), or the operator's own local file; `pictures: 'preview'` also lets an
      outlet's photo through, for a private preview only;
    - `rounds.js`: PICTURE THIS asks only such a story (`pickAsked`) and builds no question round any other
      (`buildQuestions`); `planner.js` and `edition.js` carry the mode (the station's `PICTURE_RIGHTS`, through
      `producer.js`);
    - `producer.js`: an edition carrying an uncleared picture outside a preview is not made; a preview's quiz episode
      says `picturePreview: true`, so it is never published;
    - `public/js/quizplay.js` `quizPictureAirable` and `quizdirector.js`: the director loads no picture that is not
      cleared, unless the episode is a private preview, so an outlet's photo never reaches the board on air by default;
    - `tools/quiz/desk.mjs` plans as the station does (`PICTURE_RIGHTS`, else cleared; `--pictures preview` for a
      private preview) and prints PICTURE THIS's candidates per edition.

**Found by looking for the same class of miss in the 16–17 Oct archive** (every eligible story of each edition's window
read, then every story the fixes took out read again to check it deserved it):

- politics by a state's act told as done: "Australia has proposed a switch to force social media platforms…" (under
  "Toxic algorithms wouldn't let them go - now Australia wants off switch"), "Portugal has chosen Lufthansa … completing
  the first phase of the airline's privatisation"; a state's grip on an industry: "China's influence in gaming industry
  is growing", whose source opens "…one of the most tightly regulated" (the 17 Oct HOW MANY? came from it);
- crime counted anywhere: a lawsuit in passing ("Amazon has since filed an amended complaint", under "Websites are
  closing their doors to AI agents", a TODAY headline on 17 Oct), a breach ("India becomes the latest country to report
  rogue AI agent activity");
- a weapon: "Jad Abumrad loves a butterfly knife and a good springy pillow";
- a review: "Bose's new wired earbuds are simple[ in the best way]" (a TODAY headline on 17 Oct);
- private spending in first person: "'I'd spend $1,000 on a wedding present'" ("I'd" was not a first-person word);
- notices: "NASA to Discuss Artemis Acceleration…" (a media advisory: "will provide an update … at 2 p.m. EDT"), "NASA
  Welcomes All Ages … for Space Apps Challenge" ("Registration is open");
- a picture caption in Title Case: "NASA's Space X CRS-35 Launch Jellyfish" (a bare verb in a Title Case caption is a
  noun unless it follows "to", a modal or a plural subject);
- give-aways on WHERE: "Joni Mitchell becomes US citizen…" over the pin on the USA (the gazetteer reads "US citizen" as
  a nationality, so the mask missed it; the answer country's own names are now masked wherever they stand); "Cost of
  balancing Great ▮▮▮▮▮'s power grid…" (a name's first word now goes under the mask with it); "Smart ring maker Ultrahuman
  to roll out biological-age model across ▮▮▮▮▮" (a roll-out a few words before its place is where a product is sold,
  never a place).

**Re-run on 16 and 17 Oct** (`--from 2026-10-16 --days 2 --at 15:30,20:30`, `data/quiz-run/gate-16-17-r2.md`), as the
station runs, with cleared pictures only:

- 16 Oct 15:30, Lola v UNIT-8: TODAY OR NOT TODAY / LETTER BY LETTER / HOW MANY?, DOUBLE OR NOTHING LETTER BY LETTER;
- 16 Oct 20:30, Penny v Sam: WHERE / LETTER BY LETTER / TODAY OR NOT TODAY, DOUBLE OR NOTHING HOW MANY?;
- 17 Oct 15:30 and 20:30: **no edition.** With the 29 stories the two 16 Oct editions asked out for the week, TODAY OR
  NOT TODAY short of today's stories (two first aired since 06:00 at 15:30), PICTURE THIS without a cleared picture
  (below) and WHERE short of places, no allowed pairing fills three round types with five questions from the last 24
  hours (the best holds four such stories at 15:30, three at 20:30). The rule says the quiz does not air; it does not.

The same days were also planned as a private preview would (`--pictures preview`, `gate-16-17-r2-preview.md`), to read
the desk's other fixes on more material and on PICTURE THIS: three editions (17 Oct 15:30 airs there, Paco v Ada, with
PICTURE THIS), 20:30 still does not.

**Read again by hand, every question and option of the five editions: no leak against §3.1, no broken words, no
give-away found.** Judgement calls, noted for the reviewer:

- "Lufthansa to buy 44.9% of TAP Air Portugal in €1.2B deal" (HOW MANY? on 16 Oct): its own airing tells an airline's
  purchase; another outlet's take of the same deal, told as Portugal's privatisation, is out. Kept by the subject rule;
- "Cost of balancing Great Britain's power grid reaches nearly £50m a day" (WHERE): a system's cost, no household in its
  subject;
- "NASA to Conduct Low-Altitude Flights[ Over Texas Farmland]" (WHERE): research flights announced ahead; read as news,
  not a notice. "NASA" makes the USA an easy answer, not a false one;
- HOW MANY? "It comes after a ▮▮▮▮ investment from UK Research and Innovation's…" opens on an "It" the board does not
  explain; true, but a weak question. And "NEARLY 320 LIGHT-YEARS" reveals the qualifier its programme's figure board
  aired, which the masked sentence itself does not carry.

**PICTURE THIS under cleared pictures: 0 candidates in every edition of 16 and 17 Oct** (0 in each window, 0 in each
pairing's pool). Not one of the archive's 5,600 airings carries a rights record: they were all recorded before the
station archived the rights desk's records, or carried outlets' photos (the airings since the 17 Oct restart carry no
picture at all). So the planner does not choose PICTURE THIS (data first) and the other four rounds rotate; DOUBLE OR
NOTHING falls back to LETTER BY LETTER or WHERE. **Too few for the round, and the rule is not lowered.** Proposed:

- PICTURE THIS stays off until a pairing's pool holds three stories with a cleared picture (it needs nothing else: its
  wrong options are words). As the station archives cleared pictures from now on, that comes with the archive; the
  desk tool's count shows when;
- the picture desk could clear pictures for the week's archived stories ahead of an edition (a FILE picture of the
  subject or the place, with its record), so PICTURE THIS does not wait a week;
- **open before a cleared picture airs in PICTURE THIS:** the quiz board does not draw the picture's own credit (the
  "FILE · AUTHOR · CC BY 4.0 · PIXELATED" line every licence asks for while the picture is on screen), nor a private
  preview's "PREVIEW · NOT CLEARED". That is the graphics' (step 3) and the rights desk's to add; the question already
  carries its `imageRights`.

**Gate: not passed. Day 2 (17 Oct) failed; the gate moves to the next clean day, 18 Oct**: its two editions planned
on the continuous archive and read by hand, with no leak.
