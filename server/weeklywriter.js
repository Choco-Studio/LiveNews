// SEVEN DAYS, the week on the channel (owner 12 Oct: "Resumen semanal: sí, pero cúrratelo"), written from what the
// channel aired (server/archive.js): the presenters' own words of each story, checked against the sources when they
// were made, told again as the week's story. No AI is needed, so nothing new can be invented; the words that aired
// as "today" become the day they aired ("on Tuesday").
//
// Running order (about 7 minutes):
//   intro              the week's three biggest stories as a montage, then the greeting
//   story of the week  the most told story: its fullest telling, HOW THE WEEK UNFOLDED (a board of the days it was
//                      told and what each day said), and the latest word when it moved on
//   the week in 60 s   one story a day, Monday to Sunday, with its picture (a round-up read by the co-presenter)
//   the week's desks   three or four more big stories, a section each (world, business, technology, science)
//   quote of the week  a public figure's words that aired (IN THEIR WORDS: the person re-stages them when allowed)
//   and finally        the week's lighter story
//   outro              "That was the week."
//
//   writeWeekly(week, { presenters, channelName, title, seed, now }) -> { title, segments, storyIds, rundown, weekly } | null
//   relabelTime(text, weekday)   "today" -> "on Tuesday" (the aired words in a weekly)

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SECTION = {
  world: ['Around the world this week', 'Elsewhere in the world this week', 'Further afield this week'],
  business: ['In business this week', 'On the money pages this week', 'In the economy this week'],
  tech: ['In technology this week', 'From the tech world this week', 'In tech this week'],
  science: ['In science this week', 'From the world of science this week', 'In science and space this week'],
};

function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The weekday a time falls on in a time zone ('Tuesday'). */
export function weekdayOf(ms, timeZone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(new Date(ms));
  } catch {
    return DAY_NAMES[new Date(ms).getUTCDay()];
  }
}

/**
 * The aired words, said a few days later: "today" is the day they aired, "yesterday" the day before it, "tomorrow"
 * the day after, "this morning" that day's morning, "tonight" that night.
 */
export function relabelTime(text, weekday) {
  const W = weekday;
  return String(text ?? '')
    .replace(/\b([Tt])oday's\b/g, `${W}'s`)
    .replace(/\b(?:earlier |later )?today\b/gi, (m) => (/^[A-Z]/.test(m) ? `On ${W}` : `on ${W}`))
    .replace(/\bthis (morning|afternoon|evening)\b/gi, (m, part) => `on ${W} ${part.toLowerCase()}`)
    .replace(/\btonight\b/gi, (m) => (/^T/.test(m) ? `On ${W} night` : `on ${W} night`))
    .replace(/\byesterday\b/gi, (m) => (/^Y/.test(m) ? 'The day before' : 'the day before'))
    .replace(/\btomorrow\b/gi, (m) => (/^T/.test(m) ? 'The next day' : 'the next day'))
    .replace(/\bon on\b/g, 'on')
    .replace(/(^|[.!?]\s+)on\b/g, (m, p) => `${p}On`);
}

// A programme's own furniture in its aired words, which a weekly never repeats: the number of the day's opener, "And
// finally", round-up and signpost openers, hand-overs and thanks, an expert's introduction and the questions to them
const FURNITURE = [
  /^breaking news[.:!]?$/i, // the flash that opened a breaking story (a week later it is not breaking)
  /^(?:our |the )?number of the day\b/i,
  /^(?:now,\s*)?(?:around the world|quick bytes|in brief|the markets|still to come|coming up|after the break)\b/i,
  /^let'?s (?:bring in|hear from|go to|cross to|turn to|talk to)\b/i,
  /^(?:joining us|with us (?:is|now)|we'?re joined|i'?m joined|our [\w' -]+ (?:is with us|joins us|has been following))\b/i,
  /^(?:thanks|thank you)\b/i,
  /^[A-Z][\w'’-]*[.!]$/, // a toss: "Lola."
  /\?["”’]?$/, // a question (to the partner or an expert)
];
/** The aired words without the furniture, "And finally" taken off the front. */
export function cleanAired(text) {
  return sentencesOf(String(text ?? '').replace(/^\s*(?:and )?finally[,:]?\s*/i, ''))
    .map((t) => t.replace(/^(?:and )?finally[,:]\s*/i, '').replace(/^breaking news[:,]\s*/i, ''))
    .filter((t) => !FURNITURE.some((re) => re.test(t.trim())))
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

const sentencesOf = (t) => String(t ?? '').split(/(?<=[.!?…]["”’]?)\s+(?=["“‘]?[A-Z0-9])/).filter((s) => s.trim());
const words = (t) => String(t ?? '').split(/\s+/).filter(Boolean).length;
// Words a sentence starts with only because they start it (they lose the capital after "On Monday, "); any other
// capital word is taken for a name and kept ("Tokyo's main index...", "NASA says...")
const COMMON_START = new RegExp(`^(?:${['The', 'A', 'An', 'It', 'This', 'That', 'These', 'Those', 'Its', 'Their', 'Our', 'New', 'More', 'Some', 'Most', 'Many', 'Few', 'Several', 'Two', 'Three', 'Four', 'Five', 'Ten', 'Thousands', 'Hundreds', 'Millions', 'Officials', 'Police', 'Scientists', 'Researchers', 'Astronomers', 'Archaeologists', 'Biologists', 'Geologists', 'Physicists', 'Economists', 'Historians', 'Surgeons', 'Rangers', 'Hospitals', 'Doctors', 'Nurses', 'Hotels', 'Shipping', 'Engineers', 'Workers', 'Farmers', 'Pilots', 'Teachers', 'Students', 'Residents', 'Voters', 'Lawmakers', 'Ministers', 'Leaders', 'Talks', 'Plans', 'Storms', 'Floods', 'Fires', 'Wildfires', 'Rain', 'Snow', 'Fog', 'Heat', 'Temperatures', 'Traffic', 'Trains', 'Flights', 'Airlines', 'Banks', 'Markets', 'Shares', 'Stocks', 'Prices', 'Oil', 'Gold', 'Investors', 'Analysts', 'Experts', 'Volunteers', 'Fans', 'Divers', 'Firefighters', 'Rescuers', 'Authorities', 'Regulators', 'Governments', 'Companies', 'Firms', 'Carmakers', 'Chipmakers', 'Global', 'World', 'European', 'Asian', 'African', 'In', 'On', 'At', 'For', 'After', 'Before', 'With', 'From', 'Across', 'Over', 'Under', 'During', 'Thick', 'Heavy', 'Strong', 'Hurricane', 'Tropical', 'Typhoon', 'Cyclone'].join('|')})\\b`);
const lowerUnlessName = (s) => (COMMON_START.test(s) && !/^(?:Hurricane|Tropical|Typhoon|Cyclone) [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** At most `max` sentences of an aired text, the time words relabelled to the day it aired. */
function retell(entry, max, timeZone) {
  const day = weekdayOf(entry.at, timeZone);
  return sentencesOf(relabelTime(cleanAired(entry.text), day)).slice(0, max).join(' ');
}

/** A board line within `max` characters, cut at a word (never "a day-long cl"). */
const clipWords = (s, max) => {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, '');
  return cut.replace(/[\s,;:–-]+$/, '');
};

/**
 * The week's story as it unfolded: one point a day it was told (its headline that day), at most five, oldest first.
 * Only when it was told on two days or more.
 */
function unfolding(cluster, timeZone) {
  const byDay = new Map();
  for (const e of cluster.entries) {
    const d = new Date(e.at).toISOString().slice(0, 10);
    if (!byDay.has(d) || (e.rank === 0 && byDay.get(d).rank !== 0)) byDay.set(d, e);
  }
  if (byDay.size < 2) return null;
  // a day that says what the day before said adds nothing: only the days its headline moved on
  const events = [];
  const key = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
  for (const e of [...byDay.values()]) {
    const what = clipWords(e.headline || e.title, 40);
    if (events.length && key(events.at(-1).what) === key(what)) continue;
    events.push({ when: weekdayOf(e.at, timeZone).slice(0, 3).toUpperCase(), what });
  }
  return events.length >= 2 ? events.slice(-5) : null;
}

const isLighter = (c) => c.entries.some((e) => e.feature === 'lighter');
const isGrave = (c) => c.entries.some((e) => e.grave);

/**
 * The SEVEN DAYS episode body from the week's stories (archive.week()), or null when the week is too thin (fewer
 * than six stories or three days on air).
 */
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

export function writeWeekly(week, { presenters = { A: { name: 'Paco Pixel' }, B: { name: 'Lola Lumen' } }, people = {}, channelName = 'GLOBIT 24', title = 'SEVEN DAYS', seed = '', now = Date.now(), timeZone = 'UTC' } = {}) {
  const clusters = (week || []).filter((c) => c?.best?.text && words(c.best.text) >= 8);
  const daysOnAir = new Set(clusters.flatMap((c) => c.days));
  if (clusters.length < 6 || daysOnAir.size < 3) return null;
  const rand = rng(`${seed}|${new Date(now).toISOString().slice(0, 10)}`);
  const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
  const A = presenters.A?.name || 'Paco Pixel', B = presenters.B?.name || 'Lola Lumen';
  const firstName = (n) => String(n).split(' ')[0];
  const used = new Set();
  const take = (c) => (used.add(c.key), c);
  const story = (c, entry, anchor, text, extra = {}) => ({
    type: 'story', anchor, emotion: isGrave(c) ? 'sad' : entry.serious ? 'serious' : 'neutral', storyId: entry.id, headline: entry.headline || String(entry.title).slice(0, 56),
    source: entry.source, category: entry.category, hasImage: !!entry.image, text, cues: [],
    ...(entry.location ? { location: entry.location } : {}), ...extra,
  });

  // the story of the week: the most told one that is not the lighter story
  const sotw = take(clusters.find((c) => !isLighter(c)) || clusters[0]);
  // the lighter story to close on (one the channel itself closed a programme with, else none)
  const lighter = clusters.find((c) => !used.has(c.key) && isLighter(c) && !isGrave(c));
  if (lighter) take(lighter);
  // the quote of the week: a story whose aired words carry a public figure's quote
  const quoted = clusters.find((c) => !used.has(c.key) && c.entries.some((e) => e.quote?.by && String(e.text).includes(String(e.quote.text).slice(0, 24))));
  if (quoted) take(quoted);
  // the week's desks: the next biggest, one per section first, three or four
  const desks = [];
  for (const c of clusters) {
    if (desks.length >= 5) break;
    if (used.has(c.key) || c.best.roundup) continue;
    if (desks.length < 3 && desks.some((d) => d.category === c.category)) continue;
    if (desks.filter((d) => d.category === c.category).length >= 2) continue;
    desks.push(take(c));
  }
  // the week in sixty seconds: one story a day, oldest day first (from the rest), with a picture where there is one
  const dayStories = new Map();
  for (const c of clusters) {
    if (used.has(c.key)) continue;
    // the day of the telling it retells (its own "today" is that day); a telling that names another weekday ("on
    // Wednesday", aired on Monday) would read "Monday: ... on Wednesday": it is not a day's story
    const d = new Date(c.best.at).toISOString().slice(0, 10);
    const named = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.exec(sentencesOf(cleanAired(c.best.text))[0] || '');
    if (named && named[1] !== weekdayOf(c.best.at, timeZone)) continue;
    const cur = dayStories.get(d);
    if (!cur || (!!c.best.image && !cur.best.image) || (!!c.best.image === !!cur.best.image && c.score > cur.score)) dayStories.set(d, c);
  }
  const days = [...dayStories.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([, c]) => take(c));

  const segments = [];
  // ---- intro: three teasers (the montage), then the greeting
  const teased = [sotw, ...desks].slice(0, 3);
  // a teaser is the story's aired headline as a line ("Canal reopens after fog lifts."): its words come again in full
  // in the programme, never twice the same sentence
  const teaser = (c) => `${String(c.best.headline || c.best.title).replace(/[.!?]*$/, '')}.`;
  const teaserLines = teased.map(teaser);
  segments.push({
    type: 'intro', anchor: 'A', emotion: 'neutral', cues: [],
    text: `${teaserLines.join(' ')} ${pick([`Hello, I'm ${A}, with ${B}, and this is ${title}: the week on ${channelName}.`, `Hello and welcome to ${title}, the week on ${channelName}. I'm ${A}, with ${B}.`, `This is ${title}, the week on ${channelName}. I'm ${A}, and with me is ${B}.`])}`,
    teases: [...teased.map((c) => c.best.id), null],
  });

  // ---- the story of the week
  const sb = sotw.best;
  const timeline = unfolding(sotw, timeZone);
  segments.push(story(sotw, sb, 'A', `${pick(['Our story of the week. ', 'First, our story of the week. ', 'The story of the week. '])}${retell(sb, 4, timeZone)}`, {
    kicker: 'STORY OF THE WEEK',
    ...(timeline ? { timeline } : sb.known?.length >= 2 ? { known: sb.known } : {}),
    ...(sb.numbers?.length && !timeline ? { numbers: sb.numbers } : {}),
  }));
  // our own coverage, a fact of the archive: how many days the channel came back to it
  const nDays = COUNT[sotw.days.length] || String(sotw.days.length);
  if (sotw.days.length >= 3) segments.push({ type: 'chat', anchor: 'B', emotion: 'neutral', cues: [], text: pick([`We came back to that story on ${nDays} days this week.`, `A story we followed on ${nDays} days this week.`, `That one was on our screens on ${nDays} days this week.`]) });
  // the latest word, when the story moved on after its fullest telling
  const latest = sotw.latest;
  if (latest && latest !== sb && latest.at - sb.at > 6 * 3600_000 && latest.text && sentencesOf(latest.text)[0] !== sentencesOf(sb.text)[0]) {
    const day = weekdayOf(latest.at, timeZone);
    segments.push(story(sotw, latest, 'B', `${pick([`By ${day}, the story had moved on. `, `The latest, from ${day}: `, `Then, on ${day}: `])}${retell(latest, 2, timeZone)}`, { kicker: 'THE LATEST' }));
  }

  // the expert's view, as it aired: the channel's analyst who explained the story this week, their first answer again
  const analysed = sotw.entries.filter((e) => e.analysis?.text && people[e.analysis.expert]).at(-1);
  let correspondents = null;
  if (analysed) {
    const ex = people[analysed.analysis.expert];
    const day = weekdayOf(analysed.at, timeZone);
    const role = String(ex.role || 'analyst').replace(/^(?:our|the)\s+/i, '');
    const answer = sentencesOf(relabelTime(cleanAired(analysed.analysis.text), day)).filter((t) => !/^(?:the key detail|what stands out|here is what matters|the thing to note|put simply|the important part)\b[^:]*:\s*$/i.test(t)).join(' ');
    if (words(answer) >= 12) {
      const host = segments[segments.length - 1].anchor === 'A' ? 'B' : 'A';
      segments.push(story(sotw, analysed, host, pick([`On ${day}, our ${role}, ${ex.name}, explained what was behind it.`, `Our ${role}, ${ex.name}, took us through it on ${day}.`, `On ${day}, we asked our ${role}, ${ex.name}, what it meant.`]), { link: 'R1', linkKind: 'expert' }));
      segments.push({
        type: 'cross', part: 'piece', kind: 'expert', anchor: 'R1', reporter: analysed.analysis.expert, emotion: 'neutral', cues: [], text: answer,
        storyId: analysed.id, headline: analysed.headline, source: analysed.source, category: analysed.category, hasImage: !!analysed.image,
        desk: analysed.analysis.desk || String(ex.role || '').toUpperCase(), backdrop: analysed.analysis.backdrop || 'neutral', place: '',
      });
      correspondents = { R1: analysed.analysis.expert };
    }
  }

  // ---- the week in sixty seconds
  if (days.length >= 3) {
    days.forEach((c, i) => {
      const e = c.best;
      const day = weekdayOf(e.at, timeZone);
      // "Wednesday: ... on Wednesday" says the day once
      const line = (sentencesOf(retell(e, 1, timeZone))[0] || '').replace(new RegExp(`,? on ${day}\\b`), '');
      if (!line) return;
      const body = `${day}: ${lowerUnlessName(line)}`;
      segments.push(story(c, e, 'B', i === 0 ? `${pick(['Now, the week in sixty seconds.', 'Next, the whole week in a minute.', 'Now, seven days in sixty seconds.'])} ${body}` : body, { feature: 'roundup', roundup: true, kicker: day.toUpperCase(), shot: 'full' }));
    });
  }

  // ---- the week's desks
  const leads = new Set();
  desks.forEach((c, i) => {
    const e = c.best;
    const fresh = (SECTION[c.category] || []).filter((x) => !leads.has(x));
    const lead = fresh.length ? pick(fresh) : 'Also this week';
    leads.add(lead);
    const anchor = i % 2 === 0 ? 'A' : 'B';
    const text = `${lead}, ${lowerUnlessName(retell(e, 3, timeZone))}`;
    segments.push(story(c, e, anchor, text, { ...(e.numbers?.length ? { numbers: e.numbers } : {}), ...(e.known?.length >= 2 ? { known: e.known } : {}) }));
  });

  // ---- the week in numbers: three figures the channel reported, each in the sentence it aired in, on one board
  const figures = [];
  const said = segments.map((x) => x.text).join(' ');
  // a figure's sentence must stand alone (the first sentence of its story, or one naming who or where) and must not
  // have been said already in this programme; the stories not told yet first
  const fresh = [...clusters].sort((a, b) => Number(used.has(a.key)) - Number(used.has(b.key)));
  for (const c of fresh) {
    if (figures.length >= 3) break;
    if (c.key === sotw.key || !c.best.numbers?.length) continue;
    const n = c.best.numbers[0];
    const digits = String(n.value || '').replace(/[^\d.]/g, '');
    const all = sentencesOf(retell(c.best, 6, timeZone));
    const k = digits ? all.findIndex((t) => t.replace(/,/g, '').includes(digits)) : -1;
    const sentence = k >= 0 ? all[k] : null;
    const standsAlone = k === 0 || /\s[A-Z][a-z]/.test(String(sentence).slice(1));
    if (!sentence || !standsAlone || words(sentence) > 26 || said.includes(sentence) || figures.some((f) => f.sentence === sentence)) continue;
    figures.push({ c, n, sentence });
  }
  if (figures.length >= 2) {
    const first = figures[0].c.best;
    segments.push(story(figures[0].c, first, 'A', `${pick(['The week in numbers.', 'Now, the week in numbers.', 'Our numbers of the week.'])} ${figures.map((f) => f.sentence).join(' ')}`, { kicker: 'THE WEEK IN NUMBERS', numbers: figures.map((f) => f.n) }));
  }

  // ---- the quote of the week (the guests stage may re-stage it: the person says the words)
  if (quoted) {
    const e = quoted.entries.find((x) => x.quote?.by && String(x.text).includes(String(x.quote.text).slice(0, 24)));
    segments.push(story(quoted, e, 'A', `${pick(['Our words of the week. ', 'The quote of the week. ', 'Now, the words of the week. '])}${retell(e, 3, timeZone)}`, { quote: e.quote, kicker: 'WORDS OF THE WEEK' }));
  }

  // ---- and finally
  if (lighter) {
    const e = lighter.best;
    const t = retell(e, 3, timeZone);
    segments.push(story(lighter, e, 'B', `${pick(['And finally this week, ', 'And to end the week, ', 'And finally, '])}${lowerUnlessName(t)}`, { feature: 'lighter', emotion: 'happy' }));
  }

  // ---- outro
  segments.push({
    type: 'outro', anchor: 'A', emotion: 'neutral', cues: [],
    text: pick([`That was the week. I'm ${A}.`, `And that was the week on ${channelName}. I'm ${A}.`, `That's our week. I'm ${A}.`]) + ' ' + pick([`From ${firstName(B)} and me, thanks for watching.`, `${firstName(B)} and I will see you next week.`, `Thanks for spending the week with us.`]),
  });

  const storyIds = [...new Set(segments.filter((s) => s.storyId).map((s) => s.storyId))];
  const rundown = storyIds.map((id) => {
    const s = segments.find((x) => x.storyId === id);
    return { storyId: id, headline: s.headline, source: s.source, category: s.category, hasImage: s.hasImage, ...(s.kicker ? { kicker: s.kicker } : {}) };
  });
  return {
    title,
    segments,
    storyIds,
    rundown,
    ...(correspondents ? { correspondents } : {}),
    weekly: { from: Math.min(...clusters.map((c) => c.first)), to: Math.max(...clusters.map((c) => c.last)), stories: clusters.length, days: daysOnAir.size },
  };
}
