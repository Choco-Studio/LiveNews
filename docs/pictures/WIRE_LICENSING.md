# Paid wire photos: research for a later upgrade (nothing bought)

Cleared open-licence pictures (docs/pictures/RIGHTS.md) show a story's subject, never the event itself: no picture of
today's flood, of today's summit handshake, of today's launch (bar NASA's own). Event photos come from the wires. This
is what the four big agencies offer for a broadcast and online-video channel, what it would roughly cost, and what
their terms say on the two points that decide it for GLOBIT 24: **alteration** (every picture is pixelated: owner, 17
Oct) and **AI-assisted production**. Read on 17 Oct 2026 from this machine; where a page could not be reached it says
so. Prices are what the agencies publish; most broadcast and online-video licences are **by quote only**.

## The volume a 24/7 channel would need

The real archive (12–17 Oct, 5 days) aired 1,320 unique real stories, about 265 a day, each retold several times a day.
Buying an event photo only for each programme's lead and its top three would be about 40 pictures a day, **~1,200 a
month**, each aired several times and on five platforms. That is subscription territory, not single images.

## The agencies

| | what is on offer for us | price (published) | alteration (pixelation) | AI | other terms that bite |
| --- | --- | --- | --- | --- | --- |
| **Getty Images** (gettyimages.com/eula, /plans-and-pricing) | Editorial subscription; UltraPacks; Enterprise (video, unlimited seats, custom downloads) | **Editorial plan $167/month for 10 downloads** (single user; $16.66 an image on the annual plan); UltraPack shown at **$1,400 for 5 ($280 a download)**, "for a limited time"; **Enterprise by quote** (needed for ~1,200/month and for video) | EULA s.3.2: editorial content "may be cropped or otherwise edited for technical quality, provided that the editorial integrity of the content is not compromised"; "you may not otherwise alter the content" → **pixelation needs Getty's written permission** | s.3.11: no use "for any machine learning and/or artificial intelligence purposes" without authorisation (the channel's pixelation is not ML, and pictures are never sent to a model: confirm in the order) | editorial only (s.3.7); credit adjacent or in production credits (s.6); no claiming platform revenue for the content (s.6); rights end if a platform claims rights to the content (s.8) |
| **Reuters** (reutersconnect.com: plans-and-pricing, transactional-license-terms) | Reuters Connect: **single asset licensing** by card or invoice (pictures and archive video), **metered or unlimited subscriptions** (Reuters + 100+ partners, pictures, video, text) | single assets: price shown at checkout (not on the public page); subscriptions **by quote** | §2.2(b): "provided that you do not alter or distort the editorial meaning … you may adapt and modify … as necessary … (which may include … slightly cropping or resizing still photographs)" → **a stylistic pixelation is beyond that: needs Reuters' written agreement** | §2.5: no use for training or tuning AI/ML (our use is not training) | editorial use only (§2.3); **each item may be broadcast once** in the property unless the order says otherwise (§2.2(c)): a 24/7 channel retelling stories needs that changed; on social media the content "must be labelled with appropriate watermark(s) … identifying the ownership … as belonging to Reuters" (§3.2); withdrawals must be honoured (§2.7) |
| **AP** (newsroom.ap.org; ap.org licensing pages returned 404 from here) | AP Newsroom (photos, video, text) for members and subscribers; AP Images for single editorial and commercial licences | **by quote** (no public price; AP's broadcast services are priced per member/market) | AP's photo ethics: no element "digitally added to or subtracted from any photograph"; AP's site terms forbid redistribution without the separate licence → **expect the licence to forbid alteration; pixelation needs written agreement** | AP licenses its archive to AI companies, but its licence terms for subscribers were not reachable here | membership/subscription contracts; credit "AP Photo/<photographer>" |
| **AFP** (afp.com terms of use; AFP Forum, the B2B platform) | AFP Forum subscriptions (photos, video, graphics) for media clients | **by quote** | site terms: any "modification … of the Content … without AFP's prior written consent is strictly prohibited" → **pixelation needs written consent** | AFP states its express opposition to text and data mining for AI (French IP Code L.122-5-3), and licenses to AI companies separately | credit "AFP"; B2B contract terms not public |
| **UN Photo** (for comparison, an official source) | single photos by request | **US$70 a photo for film/video** (US$25 for reuse) | "cannot be altered … or used to create derivative works" | — | prior written permission |

## What this means

1. **None of the four licenses a pixelated picture by default.** Every licence allows cropping and technical edits at
   most; the channel's pixel style is a deliberate alteration. Any deal must say in writing that the agency's pictures
   may be "rendered in the channel's pixel-art style (downscaled to 416×234, reduced to 24 colours, ordered dithering)"
   without distorting their editorial meaning, with the credit kept on screen.
2. **AI-assisted is a disclosure, not a deal-breaker.** All four forbid training AI on their content; none of the terms
   read forbids an AI-assisted channel from airing licensed pictures. The station never sends a picture to a model
   (pictures go from the agency to the image cache to the viewer's pixelation). Say so in the order.
3. **Retelling and platforms.** Reuters' "broadcast once" clause and the per-platform pricing some agencies use (a
   YouTube upload counted as another site) must be negotiated for a 24/7 channel on five platforms.
4. **Cost.** Getty's published plans (10 pictures a month) cannot serve ~1,200 a month; an Enterprise or a Reuters
   metered subscription is the realistic route, both by quote. A first request should name: editorial only, ~1,200
   stills a month, broadcast + online video on five platforms, retelling within 24 h, the pixel treatment, on-screen
   credit, AI-assisted production, no AI training.
5. **How it would plug in.** A wire picture would be a fourth cleared source with its own licence id in
   `server/rights.js` (named terms: "Reuters Connect order #…", cleared only with `derivative: true` in the order), a
   label `EVENT` when it is of the event itself, and the agency's credit format; the desk would put it first for a
   story's lead, before the FILE pictures.
