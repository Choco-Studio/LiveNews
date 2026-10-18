// What the channel may say about how it airs (docs/publishing/playout.md §5). Live (the default): the page renders in
// real time and the top row says LIVE. Pre-rendered playout (the station's PLAYOUT mode: every programme made and
// rendered about an hour ahead, then aired from files): nothing it shows or says may claim to be live, so the LIVE pip
// becomes the channel's 24/7 mark, the end card and the start screen say "24 hours a day", and a programme whose words
// claim to be live ("we're live", "live from the studio") is held at the gate (server/playout/gate.js).
//
//   airModeOf(x)            'recorded' for the playout's modes ('recorded', 'playout', 'prerecorded'), else 'live'
//   isRecorded(x)
//   onAirTag(mode)          the top row's tag: { text: 'LIVE', pip: true } or { text: '24/7', pip: false }
//   endCardLine(name, stream) a programme end card's second line: LIVE only for a live stream, no claim without one
//   startTag(mode)          the start screen's tag
//   streamOfChannel(channel)  the server's `stream` ('live', 'recorded', 'none'); an older server: from its airMode
//   pageMode(channel)       the page's labels: 'live' only when the channel streams live, else 'recorded' (never LIVE)
//   streamOf({ url, recorded })  what a clip may point to: 'live', 'recorded' or 'none' (no stream to watch)
//   watchLine(stream, { vertical })  a clip end card's line about where to watch, or null
//   falseLive(text)         the first phrase in `text` that claims the programme is live, or null
//   FALSE_LIVE              the phrases (one regular expression)

const RECORDED = new Set(['recorded', 'playout', 'prerecorded', 'pre-recorded']);

export const airModeOf = (x) => (RECORDED.has(String(x ?? '').trim().toLowerCase()) ? 'recorded' : 'live');
export const isRecorded = (x) => airModeOf(x) === 'recorded';

const LIVE_TAG = Object.freeze({ text: 'LIVE', pip: true });
const MARK_TAG = Object.freeze({ text: '24/7', pip: false });
export const onAirTag = (mode) => (isRecorded(mode) ? MARK_TAG : LIVE_TAG);

/**
 * A programme end card's second line ("STAY WITH US" above it): LIVE 24 HOURS only when the channel streams live, NEWS 24
 * HOURS A DAY for the pre-rendered stream, and the channel's name alone without a stream (the manual beta: a whole
 * programme uploaded from its recording must not promise a stream that does not exist). `stream`: streamOf's value
 * (the playout's own mode names count as recorded).
 */
export function endCardLine(name, stream) {
  if (stream === 'live') return `${name} · LIVE 24 HOURS`;
  if (isRecorded(stream)) return `${name} · NEWS 24 HOURS A DAY`;
  return name;
}
export const startTag = (mode) => (isRecorded(mode) ? 'NEWS • 24 HOURS' : 'LIVE • 24 HOURS');

/** The server's `stream` for this channel (/api/channel); a server that does not send one: from its airMode, no live. */
export function streamOfChannel(channel) {
  const s = channel?.stream;
  if (s === 'live' || s === 'recorded' || s === 'none') return s;
  return isRecorded(channel?.airMode) ? 'recorded' : 'none';
}

/** The page's labels (top row, opens, start screen, idle wall, tab): LIVE only when the channel streams live. */
export const pageMode = (channel) => (streamOfChannel(channel) === 'live' ? 'live' : 'recorded');

/**
 * What a clip published off the channel may point a viewer to (its end card, clip/cards.js drawEndCard): a stream only
 * when one exists. `url`: the stream's public address (CHANNEL_LIVE_URL, docs/publishing/setup.md: the same one the clip
 * descriptions link); `recorded`: the channel airs pre-rendered (playout.md §5). 'live' with an address and the channel
 * rendering in real time; 'recorded' with an address and pre-rendered playout (it airs around the clock, never "live");
 * 'none' without an address (the manual beta has no stream: docs/publishing/beta.md), so nothing is promised.
 */
export function streamOf({ url = null, recorded = false } = {}) {
  if (!String(url ?? '').trim()) return 'none';
  return recorded === true || (typeof recorded === 'string' && isRecorded(recorded)) ? 'recorded' : 'live';
}

/**
 * The end card's line about where to watch: WATCH LIVE only for a live stream; "24 hours a day" for a pre-rendered one
 * (the playout fills every minute with programming: playout.md §3); null without a stream (a claim with nothing behind
 * it would be false). Vertical cards are narrower: NEWS 24/7.
 */
export function watchLine(stream, { vertical = false } = {}) {
  if (stream === 'live') return vertical ? 'NEWS 24/7 · WATCH LIVE' : 'NEWS 24 HOURS A DAY · WATCH LIVE';
  if (stream === 'recorded') return vertical ? 'NEWS 24/7' : 'NEWS 24 HOURS A DAY';
  return null;
}

/**
 * Words that say the programme is going out as it happens. Not the word "live" itself (people live somewhere, a live
 * page or a launch's live stream is an outlet's, "live music" is music): only the broadcast's claims about itself, "we're
 * live", "coming to you live", "live from the studio", "live on GLOBIT", "this is live", and the LIVE label in capitals.
 */
export const FALSE_LIVE = new RegExp(
  [
    String.raw`\bwe(?:['’]re| are)\s+(?:still\s+)?live\b`,
    String.raw`\b(?:coming to you|broadcasting|speaking to you|joining you|talking to you|with you)\s+live\b`,
    String.raw`\blive\s+(?:from|in|at)\s+(?:the\s+|our\s+)?(?:studio|studios|newsroom|globit|weather centre|sports desk)\b`,
    String.raw`\blive\s+on\s+(?:globit|this channel|air)\b`,
    String.raw`\b(?:this|it)\s+is\s+live\b`,
    String.raw`\bon\s+air\s+live\b`,
  ].join('|'),
  'i'
);
/** The LIVE label: the word in capitals, standing alone (a tag, a title's "LIVE ·"). */
const LIVE_LABEL = /(?:^|[^\p{L}])LIVE(?![\p{L}])/u;

/** The first live claim in `text` (the matched words), or null. */
export function falseLive(text) {
  const s = String(text ?? '');
  const m = FALSE_LIVE.exec(s);
  if (m) return m[0].trim();
  return LIVE_LABEL.test(s) ? 'LIVE' : null;
}
