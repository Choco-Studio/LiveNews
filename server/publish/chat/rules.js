// What the live chat's moderator removes, and why (docs/publishing/chat-moderation.md). Pure functions: a message in,
// a verdict out; the moderator (moderator.js) decides what to do with it, the process (tools/publish/chatmod.mjs) does it.
//
// The line it holds (owner, 25 Oct: "añade el moderador de chat del directo"): what harms viewers or the channel goes,
// opinions stay. Removed:
//   link            a web address, a link shortener, an address spelt out ("site dot com"): the first tool of scams
//   contact         a phone number or an e-mail address: scams, and other people's details
//   scam            "DM me on WhatsApp", giveaways, "double your bitcoin", "check my bio", sugar daddies (a score of
//                   phrases, so a viewer talking about Bitcoin or Telegram in the news is not one)
//   selfpromo       "sub to my channel", sub4sub
//   sexual          sexual spam
//   hate            slurs (config/chat-blocklist.json), whole words only
//   threat          "I will kill you", "kys", "te voy a matar", and the like
//   impersonation   a name that passes for the channel, YouTube's staff or a moderator
//   flood           the same message again and again, or a burst (judged by the moderator, which has the history)
//   chars           a wall of one character or emoji
// Never removed for itself: disagreement, criticism of the channel or its presenters, politics, swearing that is not a
// slur, shouting in capitals, another language.
//
//   normalize(text)              lower case, no accents, no zero-width tricks, fancy letters made plain
//   classify(message, opts)      -> [{ rule, severity: 'high'|'medium'|'low', reason }] (empty: it stays)
//   message: { text, author: { name, owner, moderator } }; opts: { blocklist, allowDomains }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BLOCKLIST_FILE = path.join(ROOT, 'config', 'chat-blocklist.json');

/** Lower case, accents off, zero-width characters out, and the "fancy" letters of 𝐟𝐨𝐧𝐭 generators made plain. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[​-‏⁠-⁤﻿­]/g, '')
    .toLowerCase();
}
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };
/**
 * The words of a text, spaced, for whole-word phrase matching: leetspeak read back inside a word that has letters
 * ("n1gg3r", "sub4sub"; never a number, nor the "!!" that ends a word), a letter said 3+ times twice ("freeee" is
 * "free"; "xxx" stays "xx", never the letter X).
 */
const wordsOf = (t) =>
  ` ${t
    .split(/\s+/)
    .map((tok) => tok.replace(/[!?.,;:]+$/, ''))
    .map((tok) => (/[a-z]/.test(tok) ? tok.replace(/[0134579@$!|]/g, (c) => LEET[c] || c) : tok))
    .join(' ')
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
/** A phrase of the lists, read the way a message is (so "sub4sub" matches "sub4sub"). */
const phrase = (p) => wordsOf(normalize(p)).trim();
const has = (words, phrase) => words.includes(` ${phrase} `);

// ---------------------------------------------------------------- links and contact details

const TLDS = 'com|net|org|io|co|me|ly|gg|xyz|info|biz|ru|cn|tk|top|site|online|link|click|live|shop|store|app|dev|tv|us|uk|es|de|fr|nl|ca|au|in|br|club|vip|win|bet|cc|ws|to|sh|pw|su|one|pro|fun|space|website|cloud|ai|icu|cfd|sbs|lol|today|life|world|news';
const URL_RE = /\b(?:https?:\/\/|www\s*\.)\S+/i;
const DOMAIN_RE = new RegExp(`\\b([a-z0-9][a-z0-9-]{1,62})\\s*(?:\\.|\\(dot\\)|\\[dot\\]|\\{dot\\}|\\s+dot\\s+|\\s+punto\\s+)\\s*(${TLDS})\\b(?![.-]?[a-z0-9])`, 'i');
const SHORTENERS = /\b(?:bit\s*\.\s*ly|t\s*\.\s*me|wa\s*\.\s*me|discord\s*\.\s*gg|tinyurl|goo\s*\.\s*gl|linktr\s*\.\s*ee|rb\s*\.\s*gy|cutt\s*\.\s*ly|is\s*\.\s*gd|shorturl)\b/i;
// an address written plainly, or spelt out whole ("john at gmail dot com": "look at site.com" is a link, not an address)
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}|[a-z0-9._%+-]+\s*(?:\(at\)|\[at\]|\s+at\s+|\s+arroba\s+)\s*[a-z0-9-]+\s*(?:\(dot\)|\[dot\]|\s+dot\s+|\s+punto\s+)\s*[a-z]{2,6}\b/i;
// where a scam sends people without a link: a messaging app
const MESSENGER = /\b(?:whatsapp|telegram|signal|snapchat|snap|instagram|insta|wechat|kik|viber)\b/;
const CALL_WORDS = /(?:call|ring|text|phone|tel|mobile|cell|whatsapp|contact|number|llama|llamame|llamar|telefono|movil|numero|contacto|escribe)\W{0,3}(?:\w+\W{1,3}){0,3}$/;

// names that look like addresses and are not (".NET", the "dot com" of the bubble), and the small words a spelt-out
// "the dot com" begins with
const NOT_ADDRESSES = new Set(['asp.net', 'ado.net', 'vb.net', 'dot.net']);
const SMALL_WORDS = new Set(['the', 'a', 'an', 'this', 'that', 'its', 'of', 'in', 'on', 'at', 'to', 'era', 'old', 'big', 'first', 'second']);

/** The web addresses in a text (written plainly or spelt out), each as host + tld; [] if none. */
export function linksIn(t) {
  const out = [];
  const url = URL_RE.exec(t);
  if (url) out.push(url[0]);
  const short = SHORTENERS.exec(t);
  if (short) out.push(short[0]);
  for (const dom of t.matchAll(new RegExp(DOMAIN_RE.source, 'gi'))) {
    const host = `${dom[1]}.${dom[2]}`.toLowerCase();
    const spelt = !/^\s*\.\s*$/.test(dom[0].slice(dom[1].length, dom[0].length - dom[2].length));
    if (NOT_ADDRESSES.has(host) || (spelt && SMALL_WORDS.has(dom[1].toLowerCase()))) continue;
    out.push(host);
    break;
  }
  return out;
}

/**
 * A phone number: 9 to 15 digits in groups (a "+" counts). A figure written with thousands separators (1.250.000,
 * 1 250 000) is one only after a word that asks to call ("call 612 345 678") or with an international prefix.
 */
export function phoneIn(t) {
  for (const m of t.matchAll(/\+?\d[\d\s.()\-]{7,}\d/g)) {
    const s = m[0].trim();
    const digits = s.replace(/\D/g, '').length;
    if (digits < 9 || digits > 15) continue;
    if (/^\d+[.,]\d+$/.test(s)) continue; // 3.14159265: a decimal
    if (/^\d{1,3}([.,\s]\d{3})+$/.test(s) && !CALL_WORDS.test(t.slice(Math.max(0, m.index - 40), m.index))) continue;
    if (/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(s)) continue; // a span of years
    return s;
  }
  return null;
}

// ---------------------------------------------------------------- scams and spam (phrases, weighted)

// weight 3: a scam or spam by itself; 1: only with others (each alone is a word of the news)
const SCAM = [
  ...['dm me', 'pm me', 'inbox me'].map((p) => [p, 2]),
  ...['message me on', 'text me on', 'whatsapp me', 'contact me on', 'contact him on', 'contact her on', 'reach me on', 'add me on', 'click my profile', 'check my profile', 'check my bio', 'link in bio', 'link in my bio', 'claim your prize', 'claim your reward', 'you have won', 'you won a', 'seed phrase', 'recovery phrase', 'recover your account', 'sugar daddy', 'sugar mommy', 'double your', 'free crypto', 'free bitcoin', 'free btc', 'free usdt', 'crypto giveaway', 'bitcoin giveaway', 'airdrop', 'investment platform', 'trading signals', 'account manager', 'earn money from home', 'make money from home', 'work from home and earn', 'escribeme al', 'escribeme por', 'mandame un mensaje', 'contactame por', 'contactame al', 'agregame en', 'has ganado', 'reclama tu premio', 'gana dinero desde casa', 'dinero facil', 'invierte con'].map((p) => [p, 3]),
  ...['passive income', 'financial freedom', 'gift card', 'steam card', 'cash app', 'cashapp', 'paypal me', 'free robux', 'free vbucks', 'free followers', 'buy followers', 'ingresos pasivos', 'libertad financiera', 'tarjeta regalo'].map((p) => [p, 2]),
  ...['bitcoin', 'btc', 'crypto', 'cryptocurrency', 'ethereum', 'usdt', 'forex', 'invest', 'investment', 'investing', 'profit', 'profits', 'wallet', 'telegram', 'whatsapp', 'signal', 'winner', 'prize', 'giveaway', 'earn', 'trader', 'inversion', 'criptomonedas', 'cripto', 'premio', 'sorteo', 'ganancias'].map((p) => [p, 1]),
].map(([p, wt]) => [phrase(p), wt]);
const EARN_AMOUNT = /\b(?:earn|make|gana|ganar|ganas)\s+(?:up\s+to\s+)?[$€£]\s?\d[\d,.]*\s*k?\b|\b[$€£]\s?\d[\d,.]*\s*k?\s+(?:a|per|each|every|al|por)\s+(?:day|week|hour|dia|semana|hora)\b/i;
const SELFPROMO_RAW = ['sub to my channel', 'subscribe to my channel', 'check out my channel', 'check my channel', 'visit my channel', 'go to my channel', 'watch my channel', 'watch my video', 'check my video', 'sub4sub', 'sub 4 sub', 'sub for sub', 'subs for subs', 'follow me on', 'follow my', 'suscribete a mi canal', 'pasate por mi canal', 'mira mi canal', 'mira mi video', 'sigueme en'];
const SEXUAL_RAW = ['send nudes', 'nudes', 'porn', 'porno', 'xxx', 'onlyfans', 'only fans', 'sex chat', 'sexchat', 'hot singles', 'horny', 'hookup', 'nsfw', 'desnudos', 'packs'];
const SELFPROMO = SELFPROMO_RAW.map(phrase);
const SEXUAL = SEXUAL_RAW.map(phrase);
const THREAT_RE = [
  /\b(?:i\s*will|i\s*'?ll|im\s+going\s+to|i\s+am\s+going\s+to|gonna|we\s*will|we\s*'?ll)\s+(?:kill|shoot|stab|murder|hurt|find|rape|behead)\s+(?:you|u|ya|him|her|them|y'?all|everyone|the\s+(?:presenters?|anchors?|host))\b/,
  /\b(?:kill|hang|shoot)\s+(?:yo)?urself\b/,
  /\bkys\b/,
  /\b(?:bomb|shoot\s+up|blow\s+up)\s+(?:the|your|ur|this)\s+(?:studio|office|house|building|school)\b/,
  /\b(?:te|os|les|lo|la)\s+voy\s+a\s+(?:matar|reventar|apunalar|disparar)\b/,
  /\b(?:muerete|ojala\s+te\s+mueras|deberias\s+morir|matate|suicidate)\b/,
  /\b(?:i\s+know\s+where\s+you\s+live|se\s+donde\s+vives)\b/,
];

/** The blocklist (config/chat-blocklist.json: hate terms and extra words of the owner's), read once. */
let cached = null;
export function loadBlocklist(file = BLOCKLIST_FILE) {
  if (cached && cached.file === file) return cached.list;
  let list = { hate: [], extra: [] };
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    list = { hate: (j.hate || []).map(phrase).filter(Boolean), extra: (j.extra || []).map(phrase).filter(Boolean) };
  } catch {
    /* no list: the other rules still hold */
  }
  cached = { file, list };
  return list;
}

// ---------------------------------------------------------------- the verdict

/**
 * Every rule a message breaks, most severe first. `opts.allowDomains`: hosts never removed as links (the channel's
 * own site). The channel's owner and its moderators are never judged.
 */
export function classify(message, { blocklist = loadBlocklist(), allowDomains = [] } = {}) {
  const author = message?.author || {};
  if (author.owner || author.moderator) return [];
  const raw = String(message?.text ?? '');
  const t = normalize(raw);
  const w = wordsOf(t);
  const out = [];
  const hit = (rule, severity, reason) => out.push({ rule, severity, reason });

  for (const re of THREAT_RE) {
    const m = re.exec(t) || re.exec(w);
    if (m) {
      hit('threat', 'high', `threat: "${m[0].trim()}"`);
      break;
    }
  }
  const slur = blocklist.hate.find((term) => has(w, term));
  if (slur) hit('hate', 'high', 'a slur');
  const extra = blocklist.extra.find((term) => has(w, term));
  if (extra) hit('blocked-word', 'medium', `a blocked word ("${extra}")`);

  const name = normalize(author.name || '');
  const nameWords = wordsOf(name);
  if (/globit/.test(name.replace(/[^a-z0-9]+/g, ''))) hit('impersonation', 'high', `the name "${author.name}" passes for the channel`);
  else if (/\b(?:youtube|yt)\s*(?:team|support|staff|official)\b/.test(nameWords) || has(nameWords, 'admin') || has(nameWords, 'moderator') || has(nameWords, 'moderador')) hit('impersonation', 'medium', `the name "${author.name}" passes for staff`);

  const allowed = (l) => allowDomains.some((d) => normalize(l).replace(/\s+/g, '').includes(normalize(d)));
  const links = linksIn(t).filter((l) => !allowed(l));
  const phone = phoneIn(t);
  const email = EMAIL_RE.exec(t)?.[0] || null;
  const scamScore = SCAM.reduce((n, [p, wt]) => n + (has(w, p) ? wt : 0), 0) + (EARN_AMOUNT.test(t) ? 3 : 0);
  // a scam with somewhere to go (a link, a number, an address) is a bot's: the moderator bans it
  const messenger = MESSENGER.exec(w)?.[0] || null;
  if (scamScore >= 3 && (links.length || phone || email || messenger)) hit('scam', 'high', `scam with ${links.length ? `a link (${links[0]})` : phone ? 'a phone number' : email ? 'an e-mail address' : `a messaging app (${messenger})`}`);
  else if (scamScore >= 3) hit('scam', 'medium', 'scam or spam phrases');
  if (links.length) hit('link', 'medium', `a link (${links[0]})`);
  if (phone || email) hit('contact', 'medium', phone ? 'a phone number' : 'an e-mail address');
  if (SEXUAL.some((p) => has(w, p))) hit('sexual', 'medium', 'sexual spam');
  if (SELFPROMO.some((p) => has(w, p))) hit('selfpromo', 'low', 'self-promotion');
  // a wall of one character, or of emoji (a few are fine)
  const emoji = (raw.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (/(.)\1{24,}/u.test(raw.replace(/\s+/g, '')) || emoji > 15) hit('chars', 'low', emoji > 15 ? `${emoji} emoji` : 'a wall of one character');

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** The words of a message as the flood rule compares them (the same message reworded by case or spacing is the same). */
export const floodKey = (text) => wordsOf(normalize(text)).trim();
