# The networks: what their APIs take (verified 17 Oct 2026)

The publishing desk's adapters (`server/publish/adapters/`) are written against these pages, read through the proxy on
17 October 2026. Each network's numbers also live in code, in `server/publish/platforms.js`, which the scheduler and the
tests use. When a page changes, change that file and this one together. Where a page could not be read, it is marked.
Nothing here was tested against a live account, because nothing is ever sent from this repository without the owner
switching it on (`setup.md` §7).

## One interface

Every adapter takes the same item from the queue and does one of two things. In a dry run, which is the default and is
always used until the owner switches a network on, it returns the exact documented requests with secrets replaced. Live,
it makes those requests, within a rate limit and with retries.

| Method | What it does |
|---|---|
| `configured()`, `missing()` | Whether every credential variable is set. Only the names are reported, never the values. |
| `plan(item)` | The requests in order: `{ step, method, url, headers, body, file }`, with every credential shown as `<NAME>`. |
| `publish(item)` | Returns `{ ok, dryRun, requests, remoteId, url, error, retryable }`. It never throws. |
| Retries | `withRetries` retries network errors, 429 and 5xx after 2, 4 and 8 s. The network's own `Retry-After` wins. Any other 4xx fails at once. |
| Rate limits | `RateLimiter` caps requests a minute and publishes in a rolling day, per adapter (the numbers below). |
| Redaction | `redact()` runs over everything an adapter logs or returns: each credential's value, any `Bearer` or `OAuth` token, any Telegram `/bot<token>`, and every field named like a credential. |

## The table

| Network | What we publish | API, as documented | AI label | Limits we keep | Account and review needed |
|---|---|---|---|---|---|
| **YouTube** | Shorts: vertical clips. Whole programmes (Phase 2). The live title. | `videos.insert` with resumable upload (`uploadType=resumable`, `part=snippet,status`), then `thumbnails.set` (programmes). The live title goes through `videos.update` (`part=snippet`). | `status.containsSyntheticMedia = true` on every upload | `videos.insert` has its own bucket of **100 calls a day** at 1 unit each. The 10,000-unit pool pays for `videos.update` (50), `thumbnails.set` (50), `captions.insert` (400) and `liveBroadcasts.update` (1). Title ≤ 100 characters, description ≤ 5,000 bytes, tags ≤ 500 characters. A vertical or square upload of 3 minutes or less is a Short. | A Google Cloud project with the YouTube Data API v3 and an OAuth client. The refresh token comes from the owner's own consent. The `videos.insert` page did not state the old rule that unaudited projects upload private only; if uploads arrive private, request the YouTube API Services audit. The live title also needs the live video's id. |
| **TikTok** | Vertical clips, some over a minute (the Creator Rewards Program pays for those). | Content Posting API. **Inbox** (the default): `POST /v2/post/publish/inbox/video/init/` (scope `video.upload`); the video lands in the owner's TikTok inbox and he finishes the post in the app (at most 5 pending a day). **Direct post**: `POST /v2/post/publish/video/init/` (scope `video.publish`) with `post_info`. Both use `FILE_UPLOAD` to the returned `upload_url` (valid one hour), then `status/fetch`. `creator_info/query` comes first. | `post_info.is_aigc = true`. In the inbox route, the owner switches the AI-generated label on in the app. | 6 requests a minute per user token. About 15 direct posts a day per creator, shared by every app. | A TikTok developer app with Content Posting. **Unaudited clients post SELF_ONLY to a private account**: the audit is needed before anything is public. TikTok's guidelines require the user's express consent and a preview, and `privacy_level` must be chosen by the user, with no default. The approval page is that preview: each TikTok card asks for the privacy (no radio checked), comments, duets and stitches (all off until ticked) and the Music Usage Confirmation, saved as `item.tiktok` (`POST /api/tiktok`). With `TIKTOK_MODE=direct` an item cannot be approved until the privacy is chosen and the consent given; the adapter re-checks both against `creator_info`'s options. |
| **Instagram** | Reels (vertical). | `POST /<IG_ID>/media` with `media_type=REELS` and a **public** `video_url`, then `POST /<IG_ID>/media_publish` once the container is `FINISHED`. | `is_ai_generated=true` (documented as "a self-disclosure of AI usage in the post") | 100 API-published posts in a moving 24 hours. Caption ≤ 2,200 characters, ≤ 30 hashtags. | An Instagram professional account (Business or Creator) linked to a Facebook Page, and a Meta app with `instagram_business_content_publish` (App Review for other users' accounts; the owner's own account works in development mode). The video must be at a public HTTPS URL: `PUBLIC_MEDIA_BASE_URL`. |
| **Facebook** | Reels, 3 to 90 s (Phase 2). Text posts with a link. | Reels: `POST /{page-id}/video_reels` (`upload_phase=start`), upload to `rupload.facebook.com`, then `upload_phase=finish` with `video_state=PUBLISHED`. Text: `POST /{page-id}/feed` (`message`, `link`). | **No API field.** The real compliance module returns `flag-unavailable` for a recreation: the AI label is set by hand, or Facebook is left out. | 30 Reels a day per Page. | A Facebook Page and a Page access token with `pages_manage_posts` and `pages_read_engagement` (App Review for public use). |
| **X** | Text posts with the article's link. Horizontal clips later. | `POST /2/tweets`. Media: `POST /2/media/upload/initialize`, `/{id}/append`, `/{id}/finalize`, then `GET ?command=STATUS` until processed (`media_category=tweet_video`). Signed with OAuth 1.0a (HMAC-SHA1). | None. The text opens "AI-generated:". | **Pay per use**: a post costs $0.015, and a post **with a URL** costs **$0.20**. Text ≤ 280 characters, with a link counted as 23. | A developer account with pay-per-use billing, and an app with read-and-write user access: four keys (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`). |
| **Threads** | Text posts (Phase 3). | `POST /{user}/threads` (`media_type=TEXT`, `text`, `link_attachment`), then `POST /{user}/threads_publish`. | None by API. Text opens "AI-generated:". | 500 characters. 250 API posts in 24 hours. At most 5 links a post. | A Threads profile and a Meta app with `threads_basic` and `threads_content_publish`. |
| **Bluesky** | Text posts with a link card (Phase 3). | `com.atproto.server.createSession` with an app password, then `com.atproto.repo.createRecord` (`app.bsky.feed.post`). Links are facets over their **UTF-8 byte ranges**; the article goes in `app.bsky.embed.external`. | None. Text opens "AI-generated:". | 300 graphemes (3,000 bytes) per the lexicon. The docs page on posts did not state limits when read (docs.bsky.app has moved to bsky.network). | An account and an **app password** (Settings > Privacy and security > App passwords). No review. |
| **Telegram** | Channel posts (Phase 3). | Bot API `sendMessage` (`parse_mode=HTML`) or `sendVideo` (caption ≤ 1,024). **Not re-verified**: core.telegram.org returned 502 through the proxy on 17 Oct 2026. The adapter follows the long-standing Bot API. | None. Text opens "AI-generated:". | Message ≤ 4,096 characters. A bot uploads at most 50 MB. | A bot from @BotFather, added as an administrator of the channel. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. |
| **WhatsApp Channels** | Not supported. | **No official API for posting to a Channel** (the Business Platform sends messages to people, not to Channels). | — | — | Left out on purpose. Posting would need unofficial automation, which breaks WhatsApp's terms. |

## What each network is for (`plan.md` §3)

- **YouTube** carries the live stream, the Shorts and the best whole programmes.
- **TikTok** and **Instagram** take the vertical clips.
- **X**, **Threads**, **Bluesky**, **Facebook** and **Telegram** take the text posts, each linking the outlet's article, and later the horizontal clips (Facebook, X).

## Sources (read 17 Oct 2026)

- YouTube:
  - developers.google.com/youtube/v3/docs/videos/insert, `/docs/videos` (status fields) and `/docs/thumbnails/set`
  - developers.google.com/youtube/data/determine_quota_cost (the quota table quoted above, re-read on the same day)
  - support.google.com/youtube (Shorts up to three minutes, square or vertical)
- TikTok:
  - developers.tiktok.com/doc/content-posting-api-reference-direct-post and `…-upload-video` (inbox)
  - developers.tiktok.com/doc/content-sharing-guidelines (consent, preview, privacy chosen by the user, the audit)
- Instagram:
  - developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media (`is_ai_generated`, REELS)
  - developers.facebook.com/docs/instagram-platform/content-publishing (publishing, the 100-post limit)
- Facebook: developers.facebook.com/docs/video-api/guides/reels-publishing
- X: docs.x.com (posts, media upload v2, pay-per-use pricing)
- Threads: developers.facebook.com/docs/threads/posts and `/troubleshooting` (limits)
- Bluesky: docs.bsky.app (posts and facets) and the `app.bsky.feed.post` lexicon
- Telegram: core.telegram.org/bots/api (not reachable that day)
