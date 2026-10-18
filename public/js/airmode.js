// What the channel may say about how it airs (docs/publishing/playout.md §5). Live (the default): the page renders in
// real time and the top row says LIVE. Pre-rendered playout (the station's PLAYOUT mode: every programme made and
// rendered about an hour ahead, then aired from files): nothing it shows or says may claim to be live, so the LIVE pip
// becomes the channel's 24/7 mark, the end card and the start screen say "24 hours a day", and a programme whose words
// claim to be live ("we're live", "live from the studio") is held at the gate (server/playout/gate.js).
//
//   airModeOf(x)            'recorded' for the playout's modes ('recorded', 'playout', 'prerecorded'), else 'live'
//   isRecorded(x)
//   onAirTag(mode)          the top row's tag: { text: 'LIVE', pip: true } or { text: '24/7', pip: false }
//   endCardLine(name, mode) the end card's second line
//   startTag(mode)          the start screen's tag
//   falseLive(text)         the first phrase in `text` that claims the programme is live, or null
//   FALSE_LIVE              the phrases (one regular expression)

const RECORDED = new Set(['recorded', 'playout', 'prerecorded', 'pre-recorded']);

export const airModeOf = (x) => (RECORDED.has(String(x ?? '').trim().toLowerCase()) ? 'recorded' : 'live');
export const isRecorded = (x) => airModeOf(x) === 'recorded';

const LIVE_TAG = Object.freeze({ text: 'LIVE', pip: true });
const MARK_TAG = Object.freeze({ text: '24/7', pip: false });
export const onAirTag = (mode) => (isRecorded(mode) ? MARK_TAG : LIVE_TAG);

export const endCardLine = (name, mode) => `${name} · ${isRecorded(mode) ? '24 HOURS A DAY' : 'LIVE 24 HOURS'}`;
export const startTag = (mode) => (isRecorded(mode) ? 'NEWS • 24 HOURS' : 'LIVE • 24 HOURS');

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
