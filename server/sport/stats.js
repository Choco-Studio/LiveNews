// FULL TIME's table and form boards (the visual-variety round, owner 18 Oct; docs/programmes/full-time.md §5): what a
// story's own aired words state about a side's place in its table or its run of results, read with certainty or not at
// all. Never a table, a fixture list or a result the story does not state (§3.6): a board shows the story's own words,
// and the side only when the same sentence names it (one of the story's scoreline's two teams), never a nickname read
// as a team ("the Steelmen"), never a run that ended ("ended Swansea's four-match winning streak"), was chased or is
// still to come ("chasing a third consecutive crown", "aim to secure a fourth consecutive league win").
//
//   standingOf(text, score)   { text: 'OFF THE BOTTOM OF THE SCOTTISH PREMIERSHIP', team: 'KILMARNOCK' } | null
//   formOf(text, score)       { count: 5, label: 'SUCCESSIVE LEAGUE DEFEATS', cells: 'LLLLL' | '', team: 'NORWICH' } | null
// (the team is required: one of the story's scoreline's two, named in the sentence)

const NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20 };
/** A count as written ("five", "5", "fifth", "5th", "13th"), or NaN. */
export function countOf(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^\d+$/.test(w)) return Number(w);
  const m = /^(\d+)(?:st|nd|rd|th)$/.exec(w);
  if (m) return Number(m[1]);
  return NUMBER[w] ?? ORDINAL[w] ?? NaN;
}

/** The sentences of an aired text (cue marks off). */
function sentences(text) {
  return String(text || '')
    .replace(/\[[^\]]*\]\s*/g, '')
    .split(/(?<=[.!?])\s+(?=[A-Z"'‘“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// a run or a place that is not a fact of today: hoped for, chased, ended, or someone else's words of the future
const NOT_A_FACT = /\b(?:would|could|might|may|chasing|chase|aim(?:s|ing)? to|bid(?:ding)? for|hope|hopes|hoping|look(?:s)? likely|seeking|seek|try(?:ing)? to|eye(?:s|ing)?|if|unless|ended|end|ends|snapped|snap|halted|halt|broke|break|breaks|stopped|stop)\b/i;
const NEGATED = /\b(?:no longer|not|never|failed to)\b/i;

/**
 * The scoreline team the sentence says it of, upper case, or null: the last of the two the sentence names before the
 * phrase ("lift Kilmarnock off the bottom"), else one right after it with "for" ("a fifth successive defeat for Norwich").
 */
function teamIn(sentence, at, score, end = at) {
  if (!score) return null;
  const head = sentence.slice(0, at);
  let best = null;
  for (const t of [score.a, score.b]) {
    if (typeof t !== 'string' || !t) continue;
    const i = head.lastIndexOf(t);
    if (i >= 0 && (!best || i > best.i)) best = { i, t };
  }
  if (best) return best.t.toUpperCase();
  const tail = sentence.slice(end);
  for (const t of [score.a, score.b]) if (typeof t === 'string' && t && new RegExp(`^\\s+(?:for|by) ${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(tail)) return t.toUpperCase();
  return null;
}

// a competition's name: capitalised words only ("the Scottish Premiership", "the Sky Bet Championship")
const NAME = "[A-Z][\\w'’]*(?: [A-Z][\\w'’]*){0,4}";
const TABLE = `(?:table|league|standings)\\b(?![-'’])`;
const PLACE = [
  // "six points clear at the top of the table", "two points clear of Arsenal" (a named rival stays the source's words)
  new RegExp(`\\b((?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) points? clear(?: at the top| of ${NAME})?(?: of the (?:${TABLE}|${NAME}))?)`),
  // "off the bottom of the Scottish Premiership", "off the bottom"
  new RegExp(`\\b(off the bottom(?: of the (?:${TABLE}|${NAME}))?)`),
  // "top of the table", "bottom of the Championship"
  new RegExp(`\\b((?:top|bottom) of the (?:${TABLE}|${NAME}))`),
  // "into the relegation zone", "out of the relegation zone", "in the bottom three"
  /\b((?:in|into|out of|clear of) the (?:relegation zone|bottom (?:two|three|four)|top (?:two|three|four|six)))\b/,
];

/**
 * A side's place in its table as the story's own words state it, or null: { text (the phrase, upper case, as said),
 * team (the scoreline team the same sentence names before it, else null) }.
 */
export function standingOf(text, score = null) {
  for (const s of sentences(text)) {
    if (/^["'‘“]/.test(s) || NOT_A_FACT.test(s) || NEGATED.test(s)) continue;
    for (const re of PLACE) {
      const m = re.exec(s);
      if (!m) continue;
      const phrase = m[1].replace(/\s+/g, ' ').replace(/[\s,;:'’-]+$/, '').trim();
      // (a phrase cut at a team's possessive or a stray word is no place: whole words, at most 48 characters)
      if (phrase.length < 6 || phrase.length > 48) continue;
      const team = teamIn(s, m.index, score, m.index + m[0].length);
      // (whose place it is must be said: a phrase about "the Steelmen" or "their side" stays off the board)
      if (!team) continue;
      return { text: phrase.toUpperCase(), team };
    }
  }
  return null;
}

const RUNS = [
  // "a fifth consecutive defeat", "six consecutive games", "a fifth successive league defeat", "two straight wins"
  { re: /\b(\d+(?:st|nd|rd|th)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth) (consecutive|successive|straight) ((?:league |home |away )?)(defeats?|losses|loss|wins?|victories|victory|draws?|games|matches|clean sheets?)\b/i, kind: 'run' },
  // "unbeaten in six games", "41 games unbeaten"
  { re: /\bunbeaten in (\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty) ((?:league )?)(games|matches)\b/i, kind: 'unbeaten' },
  { re: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty) ((?:league )?)(games|matches) unbeaten\b/i, kind: 'unbeaten' },
  // "lost five league games in a row", "won seven in a row"
  { re: /\b(won|lost|drawn|drew) (\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) ((?:league )?(?:games|matches) )?in a row\b/i, kind: 'row' },
];
const CELL = (word) => (/^(?:defeat|loss|losses|lost)/i.test(word) ? 'L' : /^(?:win|victor|won)/i.test(word) ? 'W' : /^(?:draw|drawn|drew)/i.test(word) ? 'D' : '');

/**
 * A side's run of results as the story's own words state it, or null: { count, label (upper case), cells ('LLLLL', 'WWW',
 * '' for a run of games or an unbeaten one: never an outcome the words do not give), team (as standingOf) }.
 */
export function formOf(text, score = null) {
  for (const s of sentences(text)) {
    if (/^["'‘“]/.test(s) || NOT_A_FACT.test(s) || NEGATED.test(s)) continue;
    for (const { re, kind } of RUNS) {
      const m = re.exec(s);
      if (!m) continue;
      let count;
      let label;
      let cells = '';
      if (kind === 'run') {
        count = countOf(m[1]);
        const what = m[4].toLowerCase();
        const plural = /s$/.test(what) || /ies$/.test(what) ? what : what === 'victory' ? 'victories' : what === 'loss' ? 'losses' : `${what}s`;
        label = `${m[2]} ${m[3]}${plural}`.toUpperCase().replace(/\s+/g, ' ');
        // ("won six consecutive games": the outcome is the verb's, said just before the count)
        const verb = /\b(won|lost|drawn|drew)\s+(?:a\s+|an\s+|their\s+|its\s+)?$/i.exec(s.slice(0, m.index))?.[1] || '';
        if (verb && /^(?:games|matches)$/.test(what)) label = `${label} ${verb.toLowerCase() === 'won' ? 'WON' : verb.toLowerCase() === 'lost' ? 'LOST' : 'DRAWN'}`;
        const c = CELL(what) || CELL(verb);
        if (c) cells = c.repeat(count);
      } else if (kind === 'unbeaten') {
        // (an unbeaten run the same sentence ends is no run: "have lost a rugby game after four years and 41 games
        // unbeaten")
        if (/\b(?:lost|lose|loses|losing|defeat|defeated|beaten by|after)\b/i.test(s)) continue;
        count = countOf(m[1]);
        label = `${m[2] || ''}${m[3]} UNBEATEN`.toUpperCase().replace(/\s+/g, ' ');
      } else {
        count = countOf(m[2]);
        const verb = m[1].toLowerCase();
        label = `${(m[3] || 'games ').trim()} ${verb === 'won' ? 'won' : verb === 'lost' ? 'lost' : 'drawn'} in a row`.toUpperCase();
        cells = CELL(verb).repeat(count);
      }
      if (!(count >= 2 && count <= 60)) continue;
      // (a run of more than ten results is a number, not ten cells)
      if (cells.length > 10) cells = '';
      const team = teamIn(s, m.index, score, m.index + m[0].length);
      if (!team) continue;
      return { count, label: label.trim(), cells, team };
    }
  }
  return null;
}
