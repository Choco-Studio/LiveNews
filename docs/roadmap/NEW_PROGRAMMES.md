# New programmes — niche study and order of work

Owner, 13 Oct: plan every new programme systematically. For each one: find the niche, design how it works inside (running
order, scenes, a repertoire big enough never to feel repetitive), critique the design hard and fix it, build it, critique it
on air, and only then move to the next. Nothing passes below **9.7** in a hostile critique (`QUALITY_LOOP.md`: the round's
score is its lowest category).

## 1. Method

Each niche was measured on a live snapshot of its sources (13 Oct, `curl` through the container's proxy) and scored on eight
criteria. Weights reflect the channel's brief: a 24/7 channel that must **entertain, not only inform**, with every word
grounded in a source.

| Criterion | Weight | What counts |
|---|---|---|
| Fresh material every day | 20 | Items a day, from more than one outlet, so a programme airing several times a day never runs dry |
| Entertainment potential | 20 | Energy, visual moments, recurring games and rituals, banter that needs no opinion on real people |
| Audience reach | 15 | How many viewers of an international English-language news channel want it |
| Safety and accuracy | 15 | Share of items that are crime, courts, deaths, abuse, gambling, leaks or opinion (they need care or exclusion) |
| Structured data | 10 | Figures the channel can show as graphics without inventing anything (scores, tables, dates) |
| Fit with the channel | 10 | Pixel-art identity, the existing cast, sets and graphics |
| Overlap | 5 | How little it repeats an existing programme |
| Cost to build | 5 | New cast, set, data plumbing |

## 2. What the sources hold (measured 13 Oct)

| Niche | Sources reachable | Items a day (full day) | Risky items | Results / data | Opinion or reviews |
|---|---|---|---|---|---|
| **Sport** | BBC Sport, Guardian Sport, Sky Sports, ESPN, France 24 Sport (NPR: 403) | ~60 | 8 % | 22 % of headlines are results; scores and dates in the text; public scoreboards and tables exist (see §4) | 7 % (gossip, Q&A, quizzes) |
| **Video games** | Eurogamer, The Verge Games (Polygon: unreachable) | ~13 | 10 % (leaks, one explicit) | release dates, sales and player-count figures | 4 % |
| **Culture** (film, music, arts) | BBC Entertainment & Arts, Guardian Culture (NPR: 403) | ~33 | **31 %** (trials, assaults, deaths, a stillbirth) | box office, auction figures | **32 %** reviews |
| **Health** | BBC Health (NPR: 403) | ~5 | 14 % (cancer, deaths) and medical-advice risk | few | 4 % |
| **Environment** | Guardian Environment (+ BBC Science, already in COSMOS) | ~5 | 12 % | some | 16 % |
| **Good news** | Positive News | ~1 | 0 % | none | 0 % |
| **On this day** | Wikimedia "on this day" API | evergreen (~60 events a date) | wars and disasters among them | dates | none |
| **News quiz** | the channel's own desk (every programme's stories) | as many as the desk | inherits the desk's checks | every figure, place and name already grounded | none |

Notes from reading the items, not only counting them:
- **Sport** is broad (Premier League, Ligue 1, Champions League, F1, tennis, Test cricket, rugby league and union, NFL, NBA in
  London, boxing, cycling, darts) and full of moments a show can play with: a 25-year wait ended, a juggling catch, a record
  £10.6m jersey, a world number one. It carries its own traps: gossip columns, "Who am I?" quiz promos, live scorecards
  that go stale, court cases and deaths.
- **Video games** suit the channel's pixel art better than anything else, and the items are light. The traps: leaks
  (one is explicit footage), studio rows, age ratings.
- **Culture** is a third crime and courts, a third reviews (an opinion, not a fact). A culture show needs strong filters
  and would still be thin on the days the arts pages are about trials.
- **Health** and **environment** are too thin (five items a day) for a programme of their own, and health risks advice.
  They stay in WORLD NOW and COSMOS, with Dr Amara Pulse and Dev Isobar.
- **Good news** is one item a day: it cannot fill a programme. The lighter stories already close every programme.
- **A news quiz** needs no new source at all: every figure, place and name on the desk is already grounded. It turns the
  day's news into a game, which is exactly the owner's "entertain, not only inform".

## 3. Scores and order

Scores 0–10 per criterion, weighted to 100.

| Niche | Fresh | Fun | Reach | Safety | Data | Fit | Overlap | Cost | **Total** |
|---|---|---|---|---|---|---|---|---|---|
| **Sport** | 10 | 9 | 10 | 8 | 9 | 8 | 10 | 5 | **89** |
| **Video games** | 7 | 9 | 7 | 8 | 6 | 10 | 8 | 7 | **78** |
| **News quiz** | 9 | 10 | 7 | 8 | 9 | 8 | 6 | 7 | **83** |
| Culture (screen and sound) | 8 | 7 | 8 | 4 | 4 | 7 | 8 | 6 | 64 |
| On this day | 10 | 6 | 6 | 7 | 7 | 7 | 9 | 8 | 74 |
| Health | 3 | 3 | 7 | 4 | 3 | 6 | 4 | 7 | 43 |
| Environment | 3 | 4 | 5 | 7 | 4 | 6 | 3 | 7 | 47 |
| Good news | 1 | 7 | 6 | 10 | 1 | 7 | 4 | 8 | 50 |

**Order of work:**
1. **FULL TIME** — the day in sport (§4). The owner named sport; it also scores highest on every count but cost.
2. **THE QUIZ** (working title) — the day's news as a game show, built from the desk's grounded facts.
3. **PLAY** (working title) — video games, in the channel's own pixel art.
4. **ON THIS DAY** — evergreen history for the small hours, if the critique of 1–3 leaves room.

Rejected for now: a culture show (a third of its items are trials and a third are reviews), health, environment and good
news (too thin; already served inside the existing programmes).

Each programme gets its own bible in `docs/programmes/<id>.md` and its own critique log in
`docs/roadmap/critique/<id>-design.md` (the design rounds) and `docs/roadmap/critique/<id>.md` (the on-air rounds).

## 4. Sport data, and what the channel may use

- **Stories:** the five sport feeds above, as category `sport` in `config/feeds.json`. No other programme takes the
  category.
- **Scores in the stories:** "Coventry City stun Newcastle United with an emphatic 4-1 victory" carries the result. The
  channel shows a scoreline only when it can read who scored what without guessing (§ FULL TIME bible), and says where it
  comes from.
- **Scoreboards and tables:** ESPN's public scoreboard and standings JSON answer from here (Premier League, LaLiga,
  Champions League, NBA, NFL…) and carry exact results, kick-off times and tables. They are undocumented and not offered
  for third-party use, so the channel does **not** use them unless the owner turns them on (`SPORTS_RESULTS=espn`), a
  decision for the owner (scores are facts, but the terms are ESPN's). TheSportsDB's free key is for testing only.
  Without a data source, everything FULL TIME shows comes from the stories.
- **Never:** betting odds, tips or gambling promotion; gossip columns and "the papers"; quiz promos; live scorecards and
  live blogs (they go stale on air).
