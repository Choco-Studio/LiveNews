// Broadcast transcript lines in feed text. Some outlets' feeds and article pages carry the script of their own
// video (France 24's summaries: "… Here's Jennie Shin with more on the situation."). On our channel such a line
// hands over to someone who is not there, so it never reaches a script: it is dropped from summaries and article
// text at the desk (server/news.js, server/article.js), whichever writer reads them, and the offline writer
// checks its sentences again (server/providers/mock.js). First seen on the first live run, 4 Oct (LISTA D23).
//
// Conservative on purpose: a hand-off, a sign-off or a greeting addressed to viewers, never a report that merely
// mentions a correspondent.

// at the start of a sentence: hand-offs, greetings, sign-offs
const OPENERS = /^["“'‘]?(?:here(?:'|’)?s|here is|over to|back to you|let(?:'|’)?s (?:go|cross|head|turn)\b|we (?:go|cross|turn|head)(?: now)?(?: live)? to\b|for more(?: on (?:this|that|the story))?,? (?:we|let(?:'|’)?s|here)|joining (?:us|me)\b|we(?:'|’)?re (?:now )?joined\b|thank you,|thanks,|you(?:'|’)?re watching\b|stay with us\b|welcome back\b|good (?:morning|afternoon|evening)(?:,| and| to)|i(?:'|’)?m [A-Z][a-z]+ [A-Z][a-z]+(?:,| and| in| with| for|\.|$))/i;
// anywhere: a named person "with more", "joins us", "takes up the story", "has the details"
const HANDOFFS = /\b(?:[A-Z][a-z]+ ){1,3}(?:is here |joins us |has the details|has more|takes up the story|reports(?: now)?(?: from [A-Z]| for us|\.|$))|\bwith (?:more|the latest|the details)(?: on| from)? (?:the situation|that|this|the story|what happened|the scene)\b|\bjoins us (?:now|live)\b/;

/** Is this sentence a broadcast hand-off, greeting or sign-off rather than part of the story? */
export function isTranscriptLine(sentence) {
  const s = String(sentence ?? '').trim();
  if (!s) return false;
  return OPENERS.test(s) || HANDOFFS.test(s);
}

/** The text without its transcript sentences (sentences split on . ! ? followed by a space). */
export function dropTranscriptLines(text) {
  const t = String(text ?? '');
  if (!t) return t;
  const parts = t.match(/[^.!?…]+(?:[.!?…]+["”'’)]*|$)\s*/g);
  if (!parts) return t;
  const kept = parts.filter((p) => !isTranscriptLine(p));
  return kept.length === parts.length ? t : kept.join('').trim();
}

// Page furniture scraped into a feed's summary (NASA's feed, 4 Oct: "APOD Science APOD APOD: 2026 October 4 –…
// Today's APOD Archive Submissions Index Search Calendar RSS Education About Discuss APOD Astronomy Picture of the
// Day Discover the cosmos!"): a run of capitalised menu words is not a sentence, a site's standing tagline is not
// news, and a teaser cut off mid-phrase ("Supernumerary Rainbows over […]") says nothing.
const FUNCTION_WORDS = /^(?:a|an|the|of|in|on|at|to|for|and|or|but|is|are|was|were|has|have|had|will|would|said|says|with|from|by|as|that|this|it|its|their|after|before|over|into)$/i;
const TAGLINES = /^(?:each day a different image|discover the cosmos|astronomy picture of the day)\b/i;

/** Is this sentence a run of menu words (most words capitalised, almost no function words)? */
export function isNavRun(sentence) {
  const words = String(sentence ?? '').replace(/[^\p{L}\p{N}'’ -]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  const caps = words.filter((w) => /^[\p{Lu}\p{N}]/u.test(w)).length;
  const fn = words.filter((w) => FUNCTION_WORDS.test(w)).length;
  return caps / words.length >= 0.6 && fn / words.length < 0.2;
}

/** A summary without page furniture: menu runs, standing taglines, a teaser cut off with "[…]" or "…". */
export function dropPageFurniture(text) {
  const t = String(text ?? '');
  if (!t) return t;
  const parts = t.match(/[^.!?…]+(?:[.!?…]+["”'’)\]]*|$)\s*/g);
  if (!parts) return t;
  const kept = parts.filter((p, i) => {
    const s = p.trim();
    if (isNavRun(s) || TAGLINES.test(s)) return false;
    // the last fragment cut off by the feed with a bracketed ellipsis ("… over […]"), after a sentence: a teaser
    // (a lone fragment, or one ending in a plain "…", stays: it is all the summary there is)
    if (i === parts.length - 1 && parts.length > 1 && /\[\s*(?:…|\.\.\.|&#8230;)\s*\]\s*$/.test(s) && s.split(/\s+/).length < 12) return false;
    return true;
  });
  return kept.length === parts.length ? t : kept.join('').trim();
}
