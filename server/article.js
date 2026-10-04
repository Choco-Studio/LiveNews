// Article text for the story dossier (wave 3 §3.1; owner: programmes "bastante más largos", up to 10 minutes,
// with depth, never padding). A feed gives a headline and a two-sentence summary; the article page has the
// story itself. This reads the main text of a page: the JSON-LD articleBody when the page has one, else the
// paragraphs inside <article> (or <main>), else the page's run of long paragraphs, without boilerplate
// (subscribe, cookies, newsletters, related links, captions, bylines).
//
//   extractArticle(html, { max }) -> { text, paragraphs, via } | null
// Linear scans only (pages are capped at 600 KB by the caller); never throws.

import { dropTranscriptLines, dropPageFurniture } from './transcript.js';
import { sentencesIn } from './facts.js';

const MAX_TEXT = 2400;
const MIN_PARA = 60; // characters: shorter runs are captions, bylines, buttons
// boilerplate a paragraph must not be (anywhere in it for the short ones, at its start for the long ones)
const BOILER = /\b(does not (?:offer|accept) (?:or accept )?money|for coverage or interviews|editorial independence|subscribe|subscription|sign up|newsletter|cookies?|privacy policy|terms of (use|service)|all rights reserved|follow us|read more|related (stories|articles|coverage)|advertisement|sponsored|share (this|on)|click here|download (our|the) app|copyright|©|getty images|reuters\/|ap photo|photograph:|image caption|watch:|listen:|most read|recommended)\b/i;
const SENTENCE = /[.!?]["'’”)]?\s*$/;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s) => decode(String(s).replace(/<[^>]{0,2000}>/g, ' ')).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ').replace(/\s+/g, ' ').replace(/ ([,.;:!?])/g, '$1').trim();

/** Paragraphs that read as article text (long enough, ending as a sentence, not boilerplate), deduplicated. */
function goodParagraphs(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    // a video page's script: its hand-offs and greetings go, the reporting stays; so does page furniture
    const p = dropPageFurniture(dropTranscriptLines(clean(raw)));
    if (p.length < MIN_PARA || !SENTENCE.test(p)) continue;
    if (BOILER.test(p.length < 200 ? p : p.slice(0, 80))) continue;
    const key = p.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** The <p> blocks of an html fragment (no nested parsing: a paragraph ends at the next </p> or <p>). */
function paragraphsOf(html) {
  const out = [];
  const re = /<p\b[^>]{0,500}>([\s\S]{0,4000}?)(?=<\/p>|<p\b|<\/article>|<\/div>|$)/gi;
  let m;
  let guard = 0;
  while ((m = re.exec(html)) && guard++ < 400) out.push(m[1]);
  return out;
}

/** The text of a JSON-LD articleBody (the first NewsArticle / Article / ReportageNewsArticle that has one). */
function jsonLdBody(html) {
  const re = /<script\b[^>]{0,200}type=["']application\/ld\+json["'][^>]{0,200}>([\s\S]{0,200000}?)<\/script>/gi;
  let m;
  let guard = 0;
  while ((m = re.exec(html)) && guard++ < 20) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [data];
    let steps = 0;
    while (stack.length && steps++ < 200) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      if (typeof node.articleBody === 'string' && node.articleBody.length >= MIN_PARA) return node.articleBody;
      if (node['@graph']) stack.push(node['@graph']);
    }
  }
  return null;
}

/** Join paragraphs up to `max` characters, whole sentences only. */
function fit(paragraphs, max) {
  const kept = [];
  let n = 0;
  for (const p of paragraphs) {
    if (n + p.length + 1 <= max) {
      kept.push(p);
      n += p.length + 1;
      continue;
    }
    // the last paragraph cut at a sentence end: a real one ("...crime related to U.S. bases" never ends at "U.S.")
    const room = max - n - 1;
    if (room > MIN_PARA) {
      let cut = '';
      for (const sentence of sentencesIn(p)) {
        const next = cut ? `${cut} ${sentence}` : sentence;
        if (next.length > room) break;
        cut = next;
      }
      if (cut.length > MIN_PARA) kept.push(cut);
    }
    break;
  }
  return kept;
}

/**
 * The main text of an article page, or null when the page has none worth reading (a video page, a live blog
 * shell, a paywall teaser): { text (≤ max characters, whole sentences), paragraphs, via: jsonld|article|page }.
 */
export function extractArticle(html, { max = MAX_TEXT } = {}) {
  try {
    const page = String(html ?? '');
    if (!page) return null;
    const ld = jsonLdBody(page);
    if (ld) {
      const paras = goodParagraphs(ld.split(/\n{1,}|(?<=[.!?])\s{2,}/));
      const kept = fit(paras.length ? paras : goodParagraphs([ld]), max);
      if (kept.join(' ').length >= 120) return { text: kept.join('\n'), paragraphs: kept, via: 'jsonld' };
    }
    const body = page.replace(/<(script|style|noscript|svg|figure|figcaption|aside|nav|footer|header|form)\b[\s\S]{0,200000}?<\/\1>/gi, ' ');
    for (const [tag, via] of [['article', 'article'], ['main', 'article']]) {
      const m = new RegExp(`<${tag}\\b[^>]{0,500}>([\\s\\S]*?)</${tag}>`, 'i').exec(body);
      if (!m) continue;
      const kept = fit(goodParagraphs(paragraphsOf(m[1])), max);
      if (kept.join(' ').length >= 120) return { text: kept.join('\n'), paragraphs: kept, via };
    }
    const kept = fit(goodParagraphs(paragraphsOf(body)), max);
    if (kept.length >= 2 && kept.join(' ').length >= 200) return { text: kept.join('\n'), paragraphs: kept, via: 'page' };
    return null;
  } catch {
    return null;
  }
}
