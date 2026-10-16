// The length gate's reader before the human one: the faults a fallback writer's edition must never air, found by rule
// in every edition a replay wrote (tools/lengths/replay.mjs), so each fix is measured over hundreds of real editions
// before the editions are read line by line (docs/roadmap/critique/fallback-lengths.md). A rule here flags; it never
// rewrites. A flag can be wrong (a reader decides): the counts show the trend.
//
//   node tools/lengths/lint.mjs <replay dir> [programme] [--show class] [--max 20]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { isFragment, hasFiniteVerb, SENTENCE_WORDS } = await import(path.join(here, '../../server/writer.js'));
const { sentencesOfText, kindOf } = await import(path.join(here, 'measure.mjs'));

// a verb a sentence of news has: an auxiliary, a past form (regular, or one of the common irregular ones), a present
// form in -s after its first word
const IRREGULAR = /^(?:said|told|spoke|won|lost|made|took|gave|came|went|saw|found|kept|became|brought|built|sold|paid|spent|set|put|ran|drew|flew|held|met|led|sent|wrote|fought|caught|thought|sought|stood|chose|froze|got|knew|meant|felt|heard|left|began|rose|fell|grew|hit|cut|shut|spread|hurt|cost|let|quit|struck|stuck|swept|fled|dug|hung|threw|wore|broke|ate|bought|taught|bound|forbade|forgave|overtook|withdrew|undertook|arose|awoke)$/i;
const AUX = /^(?:is|are|was|were|be|been|has|have|had|will|would|can|could|may|might|must|should|shall|does|do|did|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|hasn['’]t|haven['’]t|won['’]t|can['’]t|didn['’]t|doesn['’]t)$/i;
function hasVerbLoose(t) {
  const w = String(t).split(/\s+/).map((x) => x.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '')).filter(Boolean);
  return w.some((x, i) => AUX.test(x) || IRREGULAR.test(x) || (/^[a-z]{2,}ed$/.test(x)) || (i > 0 && /^[a-z]{3,}(?:s|es)$/.test(x) && !/(?:ss|us|is|ics|ness|ings)$/.test(x)));
}
const plain = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => plain(t).split(/\s+/).filter(Boolean).length;
// an outlet's furniture read as news
const BOILERPLATE = /\bBREAKING NEWS UPDATE\b|^(?:Photos?|Watch|Video|Listen|Live|Gallery|In pictures)\s*:|\b(?:click here|subscribe|newsletter|sign up|sign-up)\b|\bdoes(?:n['’]t| not) (?:name|identify) (?:victims|people)\b|\bcontributed to this report\b|\b(?:this|the) (?:story|article|report) (?:has been|was) updated\b|^Updated?\b|\bis seen\b|\bare seen\b|\bpictured\b|\bin this (?:photo|picture|image|handout)\b/i;
// someone's view in the channel's own voice (outside a quotation, with no one saying it)
const MODAL = /\b(?:should|must|ought to|needs? to|has to|have to)\b/i;
const SAYS = /\b(?:said|says|say|told|warned|warns|added|according to|argued|argues|believes?|claims?|claimed|insisted|urged|urges|called for|calls for|wants?|asked|wrote|recommend\w*|suggest\w*)\b/i;
// a sentence that leans on one not heard: a pronoun or a demonstrative first
const LEANS = /^(?:It|Its|They|Their|Them|He|She|His|Her|This|These|Those|That|Such)\b(?!\s+(?:is|was)\s+(?:expected|thought|believed|understood|reported|unclear|not clear|likely)\b)/;
const STRANGER_REF = /^(?:The\s+(?:child|boy|girl|man|woman|men|women|suspect|victim|victims|couple|pair|group|move|decision|deal|plan|attack|incident|announcement|measure|move|bill|law|report|study|ruling)\b)/;

// The sentences inside a source's quotations of several sentences (after the first): the speaker's words, never the
// outlet's. A paragraph starts outside any quotation. As keys: lower case, letters and digits.
const keyOf = (t) => String(t).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function quoteInterior(text) {
  const out = [];
  for (const para of String(text || '').split(/\n+/)) {
    let curly = 0;
    let straight = false;
    for (const t of para.match(/[^.!?…]+(?:[.!?…]+["”’]*|$)/g) || []) {
      const s = t.trim();
      if ((curly > 0 || straight) && keyOf(s).length > 25) out.push(keyOf(s));
      curly = Math.max(0, curly + (s.match(/“/g) || []).length - (s.match(/”/g) || []).length);
      if ((s.match(/"/g) || []).length % 2) straight = !straight;
    }
  }
  return out;
}

/**
 * The faults of one edition: [{ cls, seg, text }]. `src(id)` is the story's source { title, summary, body };
 * `inside`, the edition's sources' quotation interiors (quoteInterior), for the speaker's words told as ours.
 */
export function lintEdition(ep, src = () => null, inside = []) {
  const out = [];
  const segs = ep?.segments || [];
  const pid = ep?.program?.id;
  const max = (SENTENCE_WORDS[pid] || 22) + 2;
  const add = (cls, i, text) => out.push({ cls, seg: i, text: String(text).slice(0, 220) });
  const storySegs = segs.map((s, i) => ({ s, i })).filter((x) => x.s.type === 'story');
  segs.forEach((s, i) => {
    const kind = kindOf(s, i, segs);
    if (kind === 'intro' || kind === 'outro') return;
    const lines = sentencesOfText(s.text);
    lines.forEach((t, j) => {
      const p = plain(t);
      if (BOILERPLATE.test(p)) add('boilerplate', i, p);
      if (/\s[,.;:!?](?:\s|$)/.test(p) || /\b(\w{3,}(?:-\w+)?)\s+\1\b/i.test(p)) add('typography', i, p);
      // (a line the presenter prefixes, "And finally:", "As … put it:", "Worth adding:", "A developing story:", a frame
      // before an expert's answer, may run four words past the bible's sentence; a plain one two, the validator's tolerance)
      const saidLede = /,\s+(?:[\w’'-]+\s+){0,3}(?:said|says|say|have said|has said|warned|added)\.?["”]?$/.test(p);
      const prefixed = saidLede || /^(?:And finally:|As .{3,60} put it:|A developing story:|Breaking news\.|Still to come|Worth adding:|And one more thing:|Also worth knowing:|One more detail:|What stands out|The key point|What matters|In short|Put simply|The context|For context|Behind this)/.test(p) || /^\S+(?: \S+){0,4}:\s/.test(p) || (s.type === 'cross' && s.kind === 'analysis');
      if (words(p) > max + (prefixed ? 2 : 0) && kind !== 'in-their-words') add('long', i, `${words(p)} words: ${p}`);
      const unq = p.replace(/[“"][^”"]*[”"]/g, ' ').replace(/‘[^’]*’/g, ' ');
      const quoteOnly = /^[“"‘]/.test(p);
      // (the presenters' formulae are no news sentences: "Now to Peru.", "Our number of the day: 40,000.", a prompt, a
      // thanks, an introduction)
      const formula = (s.type === 'cross' && (s.part === 'ask' || s.part === 'thanks')) || /^(?:Now,? around the world|Now to |First, |Our number of the day|Thanks|Thank you|Still to come|Let's (?:bring in|hear)|Joining us|We're joined|I'm joined|With us is|Our [A-Z][\w ]+, [A-Z]|[A-Z][\w ]+, our )/.test(p) || words(p) < 5;
      if (!formula && !quoteOnly && kind !== 'in-their-words' && (isFragment(p) || !hasVerbLoose(unq) || /^(?:\p{Lu}[\p{L}’'.-]*\s+){1,4}\p{Lu}[\p{L}’'.-]*,\s+(?:the|a|an)\s[^,]*\.$/u.test(p))) add('fragment', i, p);
      if (/^(?:While|Although|Though|Because|If|Whereas|Unless|Since|Once)\b/.test(p) && !/,\s/.test(p)) add('fragment', i, p);
      if (MODAL.test(unq) && !SAYS.test(p) && !quoteOnly && (s.type !== 'cross' || s.kind !== 'restage')) add('opinion', i, p);
      if ((p.match(/\b(?:reports|according to|said|says|figures show)\b/gi) || []).length >= 2 && /,\s*[^,]+ reports\.$/.test(p)) add('double-attribution', i, p);
      // a segment's first sentence that leans on what the viewer never heard (a story opener, a correspondent's first
      // line, an exchange): its pronoun or "those officials" have nothing to point at
      const first = j === 0 || (s.type === 'story' && j === 1 && /^(?:Thanks|Breaking news|Our number of the day|Now,? around|First,|Now to)/i.test(lines[0]));
      const opener = first && (s.type === 'story' || (s.type === 'cross' && s.part !== 'ask' && s.part !== 'thanks') || kind === 'exchange');
      const body = p.replace(/^(?:And finally:|And the context here:|And one detail worth adding:|Worth adding:|One more line from the report:|And this matters too:|The key detail is this:|What stands out is this:|Here is what matters:|The thing to note is this:|Put simply:|The important part is this:|What we know is this:|The background is this:)\s*/i, '');
      // (a correspondent's or an expert's answer goes on from their own piece: "He" after a piece that named him is heard)
      const prior = s.type === 'cross' && s.part === 'answer' ? plain(segs.slice(Math.max(0, i - 3), i).filter((x) => x.type === 'cross' && x.part !== 'ask' && x.storyId === s.storyId).map((x) => x.text).join(' ')) : '';
      const heard = prior && /(?<=[\p{Ll},;:]\s)\p{Lu}\p{Ll}+/u.test(prior);
      if (opener && kind !== 'in-their-words' && !heard && (LEANS.test(body) || STRANGER_REF.test(body))) add('leans', i, p);
      if (s.type === 'cross' && s.kind === 'restage' && /^(?:I agree|Yes|No|That|This|It|They|He|She|We did|Absolutely)\b/.test(p)) add('quote-context', i, p);
    });
    // a speaker's words in a presenter's voice: a sentence from inside a quotation, its quotation marks gone
    // ("It’s one of the biggest commitments in history for anything, ABC News reports.", Trump's words, 14 Oct); judged on
    // the whole segment, so a quotation of two sentences the presenter reads with its marks ("As Trump put it: “…. …”")
    // is no flag
    if (kind !== 'in-their-words' && kind !== 'intro' && kind !== 'outro' && !(s.type === 'cross' && s.kind === 'restage') && inside.length) {
      const said = keyOf(plain(s.text).replace(/“[^”]*”|"[^"]*"/g, ' | '));
      for (const x of inside) if (said.includes(x.slice(0, 60))) add('speaker-words', i, x);
    }
    // the lead told in one sentence, with no link to carry it
    if (kind === 'lead' && lines.length < 2 && !s.link) add('thin-lead', i, plain(s.text));
    // a story's own headline read out as its first sentence when the headline is no sentence (no verb said as one)
    if (s.type === 'story' && lines[0] && s.storyId) {
      const title = plain(src(s.storyId)?.title || '').replace(/[.!?]$/, '');
      const first = plain(lines[0]).replace(/^(?:Breaking news\.|A developing story:|And finally:|Thanks, \w+\.)\s*/i, '').replace(/[.!?]$/, '');
      if (title && first === title && !/\b(?:is|are|was|were|has|have|had|will|says|said)\b/.test(title)) add('headlinese', i, first);
    }
  });
  // the same event twice in one edition: two stories sharing two names and most of a headline
  const names = (t) => new Set((plain(t).match(/\b\p{Lu}[\p{L}’'-]{2,}\b/gu) || []).filter((w) => !/^(?:The|A|An|In|On|At|After|Before|Now|First|And|But|UK|US|EU)$/.test(w)));
  const content = (t) => new Set(plain(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3));
  for (let a = 0; a < storySegs.length; a++) {
    for (let b = a + 1; b < storySegs.length; b++) {
      const A = storySegs[a].s;
      const B = storySegs[b].s;
      if (A.storyId === B.storyId) continue;
      const ta = `${src(A.storyId)?.title || A.headline} ${src(A.storyId)?.summary || ''}`;
      const tb = `${src(B.storyId)?.title || B.headline} ${src(B.storyId)?.summary || ''}`;
      const na = names(ta);
      const shared = [...names(tb)].filter((n) => na.has(n));
      const ca = content(src(A.storyId)?.title || A.headline);
      const cb = content(src(B.storyId)?.title || B.headline);
      const overlap = [...cb].filter((w) => ca.has(w)).length / Math.max(1, Math.min(ca.size, cb.size));
      if (shared.length >= 2 && overlap >= 0.4) add('same-event', storySegs[b].i, `«${A.headline}» / «${B.headline}»`);
    }
  }
  return out;
}

async function cli() {
  const args = process.argv.slice(2);
  const opt = (k) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args.splice(i, 2)[1] : null;
  };
  const show = opt('show');
  const maxShow = Number(opt('max') || 20);
  const [dir, only] = args;
  const files = fs.readdirSync(dir).filter((f) => /^\d+-[a-z0-9-]+\.json$/.test(f) && (!only || f.endsWith(`-${only}.json`))).sort();
  const counts = {};
  const shown = [];
  let editions = 0;
  for (const f of files) {
    const ep = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    // the sources the edition was written from (.src.txt) for the headline checks
    const srcFile = path.join(dir, f.replace('.json', '.src.txt'));
    const srcs = new Map();
    if (fs.existsSync(srcFile)) {
      for (const block of fs.readFileSync(srcFile, 'utf8').split(/^## /m).slice(1)) {
        const id = block.split(' ')[0];
        srcs.set(id, { title: (block.match(/^TITLE: (.*)$/m) || [])[1] || '', summary: (block.match(/^SUMMARY: (.*)$/m) || [])[1] || '', body: (block.match(/^BODY \([^)]*\):\n([\s\S]*)$/m) || [])[1] || '' });
      }
    }
    editions++;
    const inside = [...srcs.values()].flatMap((x) => quoteInterior(`${x.summary}\n${x.body}`));
    for (const x of lintEdition(ep, (id) => srcs.get(id), inside)) {
      counts[x.cls] = (counts[x.cls] || 0) + 1;
      if (show && x.cls === show && shown.length < maxShow) shown.push(`${f} [${x.seg}] ${x.text}`);
    }
  }
  console.log(`${editions} editions: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'no flags'}`);
  for (const s of shown) console.log(`  ${s}`);
}
if (import.meta.url === `file://${process.argv[1]}`) cli();
