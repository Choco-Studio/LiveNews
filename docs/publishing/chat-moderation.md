# The live chat's moderator (25 Oct)

The owner, 25 Oct: "añade el moderador de chat del directo". A 24-hour live stream with a chat and nobody watching
it gets spam, scams, insults and links to malware, and the channel answers for what stays up. Two layers do the work:

1. **YouTube's own filters**, set once by the owner in YouTube Studio (§5). They are free and hold most spam before
   anyone sees it.
2. **Our moderator** (`tools/publish/chatmod.mjs`) reads the chat as it comes. It removes what the filters let
   through, and it times out or bans the authors who keep at it.

TikTok LIVE has no API for moderation, so its chat is moderated with TikTok's own settings (§6).

## 1. The line it holds

Removed (`server/publish/chat/rules.js`):

| Rule | What | Examples |
|---|---|---|
| link | a web address, a link shortener, an address spelt out | `www.x.xyz`, `bit.ly/…`, "site dot com" |
| contact | a phone number or an e-mail address | "call 612 345 678", "john at gmail dot com" |
| scam | phrases that add up to a scam (a score: one word of the news is never enough) | "DM me on WhatsApp for crypto signals", "contact him on Telegram, I earn $5000 a week" |
| selfpromo | "sub to my channel", sub4sub | |
| sexual | sexual spam | |
| hate | slurs, as whole words (`config/chat-blocklist.json`) | |
| threat | threats of violence, "kys" | "I will kill you", "te voy a matar" |
| impersonation | a name that passes for the channel, YouTube's staff or a moderator | "GLOBIT 24 Official", "YouTube Support Team" |
| flood | the same message 3 times in 2 minutes, or 7 messages in 30 seconds | |
| chars | a wall of one character, or more than 15 emoji | |

**Never removed** for itself: disagreement, criticism of the channel or its presenters, politics, swearing that is not
a slur, capitals, another language. The rules read text the way a spammer writes it (accents off, "fancy" letters,
leetspeak inside a word: "n1gg3r"). They never change a number or an everyday word ("the dot com bubble", "pi is
3.14159", "I would kill for a coffee"). On 25 Oct, 82 everyday messages went through them and none was caught; the test
keeps the ones that once were (`test/chatmod.test.js`).

The channel's owner and the chat's moderators are never judged. `CHAT_ALLOW_DOMAINS` lists hosts that are never removed
as links (the channel's own site).

## 2. What happens (`server/publish/chat/moderator.js`)

- **A scam bot** (a scam with a link, a number, an address or a messaging app): removed and **banned for good**. At
  most 4 a day; after that, 24 hours out.
- **A threat, a slur, a name passing for the channel**: removed, **24 hours out**, and flagged for the owner.
- **Anything else**: removed. A second strike within 30 minutes means 5 minutes out, a third an hour, a fourth and later
  24 hours.
- **Once per broadcast** (each block of the rotation), it posts one line of the rules: "Welcome to GLOBIT 24:
  AI-produced news, 24 hours a day. This chat is moderated automatically: links, spam, contact details, threats and hate
  are removed. Be kind." (`CHAT_ANNOUNCE=0` for none.)
- It never replies to anyone and never writes anything else.

## 3. The quota

YouTube Data API costs, read 25 Oct 2026 ([quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)):

| Call | Units |
|---|---|
| reading the chat: one stream connection (held open), or one poll | 5 |
| looking up the live broadcast | 1 |
| removing a message | 20 |
| a timeout or a ban | 200 |
| the rules message | 20 |

The project has 10,000 units a day, shared with the live title (up to 60 updates of 50), the block rotation (about 300
three times a day) and the uploads. Reading the chat every few seconds would cost more than the whole day. So:

- **It streams.** `liveChatMessages.streamList` over gRPC ([Streaming Live Chat](https://developers.google.com/youtube/data/live/streaming-live-chat);
  the proto is `server/publish/chat/stream_list.proto`) holds one call open and gets each message as it is posted. If
  the stream keeps closing early, it is opened again no more often than the reading share allows for the rest of the
  day. When the stream cannot be had at all (gRPC refused), it polls for an hour, as often as the reading share allows.
- **Its own share**: `CHAT_QUOTA_UNITS` (3,000 a day). Reading may use 40 % of it; the rest is for acting.
- **The worst first.** A low-severity removal (self-promotion, flood) may use 60 % of the day's share, a medium one
  85 %, a threat, a slur or a scam bot all of it. A ban the quota cannot pay becomes a removal. What it cannot remove at
  all is logged ("habría quitado"), and YouTube's own filters still stand.
- The ledger (`data/publish/chatmod-quota.json`) turns over at midnight Pacific time, as YouTube's quota does.
- **More quota**: if the chat grows, the owner can ask Google for a quota extension with the YouTube API Services form.
  Never through a second project: YouTube's developer policies forbid getting more quota that way.

## 4. Running it

- **A dry run first**: `node tools/publish/chatmod.mjs` reads the live chat and logs what it would do, touching
  nothing. A day of that, then the owner reads the summary.
- **On the owner's word**: `PUBLISH_LIVE=1 CHAT_MOD=1` (in its systemd unit, `server-setup.md` §11). It follows the
  live broadcast from block to block. With YouTube's dual format, the horizontal and the vertical feed share one chat.
- **The summary**, in Spanish: `node tools/publish/chatmod.mjs --summary [--day 2026-10-25]`. It gives:
  - what was removed and why;
  - who was timed out or banned;
  - **the messages for the owner to look at** (threats, slurs, impersonation);
  - the quota used.
- **The state**: `--status` (`data/publish/chatmod-status.json`): the chat, stream or poll, today's counts, the quota.
- **What it keeps**: `data/publish/chatmod.jsonl`, one line for each message it removed or would have. Each line has
  the author's channel and name, the words, the rule and what was done. Lines are kept for 30 days, for the owner's
  review and for appeals. Nothing is kept of the messages it leaves alone.
- **An appeal**: the owner lifts a ban or a timeout by hand in YouTube Studio (the chat's hidden users); the moderator
  never lifts one by itself.
- **Needs**: the channel's OAuth token (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, scope
  `youtube`: the owner's account, which can moderate its own chat), and `npm install` for `@grpc/grpc-js` and
  `@grpc/proto-loader`.

## 5. YouTube's own filters (the owner, once, in YouTube Studio)

The wording below is YouTube's English; the Spanish screens may name them a little differently.

1. **Settings > Community > Automated filters**:
   - **Blocked words**: paste the words of `config/chat-blocklist.json` and any of the owner's own. Messages containing
     them are held from the chat.
   - **Block links**: on. Messages with links are held (the channel and its moderators are exempt).
2. **Settings > Community > Defaults**: **hold potentially inappropriate messages for review** in live chat: on
   (YouTube's own classifier, which catches what word lists cannot).
3. **In the live broadcast's settings** (Live Control Room, or set on the stream key's defaults):
   - live chat on;
   - **slow mode** of 10 to 30 seconds (one message per person per interval: floods stop);
   - the participants left as "anyone". "Subscribers only" is a switch for a bad night.
4. **A human moderator** is still worth having: anyone the owner trusts can be added under Settings > Community >
   Moderators.

## 6. TikTok LIVE (no API)

TikTok offers no API to moderate a LIVE's comments. In TikTok's LIVE settings, the owner:

- turns on the comment filter;
- adds the same blocked words;
- names moderators.

The labels could not be read from here: check them on the first LIVE (`playout.md` §13.6 has TikTok's other unknowns).
