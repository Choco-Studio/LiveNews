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
// an outlet's promo for its own interview or analysis ("…commentator Douglas Herbert shares further insights",
// "France 24's Gavin Lee speaks to Brazil analyst … about …"): it promises a guest our channel does not have
const PROMO = /\b(?:help us win|vote (?:for us|to help us))\b|\b(?:[Ss]ee|[Cc]lick|[Ff]ollow) (?:the link|here|this link)\b|\b[Ff]or more details,? see\b|\b[Yy]ou can (?:vote|listen|watch|sign up|subscribe|get access)\b|^[A-Z][a-z]+ [A-Z][a-z]+: |\b[Ii]f you['’]re an? [\w ]{1,30}subscriber\b|\b[Ii]n this week['’]s episode\b|\b[Kk]eep reading\b|\b[Rr]ead (?:on|more) (?:for|to)\b|\b[Ll]isten (?:to (?:the )?(?:full )?(?:episode|podcast)|now)\b|\b[Ss]ubscribe (?:to|now|for)\b|\b[Oo]n (?:this week['’]s |today['’]s )?(?:episode of )?[A-Z][\w’']+(?: podcast)?, we (?:discussed|talked|spoke|dug)\b|\b(?:shares|offers|gives|brings) (?:us )?(?:further |more |his |her |their |some )?(?:insights?|analysis|perspective|thoughts)\b|\bspeaks (?:to|with) [^.]{3,80}\babout\b|\b(?:editor|analyst|correspondent|commentator)(?: in chief)? [A-Z][a-z]+ [A-Z][a-z]+ explains\b/;
const HANDOFFS = /\b(?:[A-Z][a-z]+ ){1,3}(?:is here |joins us |has the details|has more|takes up the story|reports(?: now)?(?: from [A-Z]| for us|\.|$))|\bwith (?:more|the latest|the details)(?: on| from)? (?:the situation|that|this|the story|what happened|the scene)\b|\bjoins us (?:now|live)\b/;

/** Is this sentence a broadcast hand-off, greeting or sign-off rather than part of the story? */
export function isTranscriptLine(sentence) {
  const s = String(sentence ?? '').trim();
  if (!s) return false;
  return OPENERS.test(s) || HANDOFFS.test(s) || PROMO.test(s);
}

/**
 * A text's sentences with their trailing space (joined, they give the text back), split on . ! ? … but never
 * inside a figure: "more than 158.7 million" split at its point once lost "more than 158." as a menu run, and
 * "7 million Brazilians are eligible to vote" went to the writer (the BBC, 4 Oct).
 */
export function sentencePieces(text) {
  const t = String(text ?? '');
  const parts = t.replace(/(\d)\.(?=\d)/g, '$1\u2024').match(/[^.!?…]+(?:[.!?…]+["”'’)\]]*|$)\s*/g);
  return parts ? parts.map((p) => p.replace(/\u2024/g, '.')) : null;
}

/** The text without its transcript sentences (sentences split on . ! ? followed by a space). */
export function dropTranscriptLines(text) {
  const t = String(text ?? '');
  if (!t) return t;
  const parts = sentencePieces(t);
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
  const t = String(text ?? '').replace(/\s*\([^()]{1,30}\?\)/g, '');
  if (!t) return t;
  const parts = sentencePieces(t);
  if (!parts) return t;
  const CUT = /\[\s*(?:…|\.\.\.|&#8230;)\s*\]/;
  const kept = parts.filter((p, i) => {
    const s = p.trim();
    if (isNavRun(s) || TAGLINES.test(s)) return false;
    // "We were talking about this last week, because this is something [Trump has] been hinting at": a host's
    // talk, with an editor's insertion (a podcast transcript on the outlet's page)
    if (parts.length > 1 && (/^(?:We|We['’](?:re|ve))\s+(?:were|are|have|had|talked|discussed|spoke|asked|chatted)\b/.test(s) || /\[[A-Za-z][^\]]{0,30}\]/.test(s))) return false;
    // a bracketed ellipsis is the feed's cut, never read: the teaser it ends ("Supernumerary Rainbows over […]"),
    // the sentence it elides ("He said the report […] was false.", its rest included) or a bare "[…]" after a
    // sentence ("…during an interview on NJ PBS. […]", The Verge, 4 Oct). A lone fragment stays: it is all the
    // summary there is.
    if (parts.length > 1 && (CUT.test(s) || (i > 0 && CUT.test(parts[i - 1]) && /^[a-z]/.test(s)))) return false;
    return true;
  });
  return kept.length === parts.length ? t : kept.join('').trim();
}
