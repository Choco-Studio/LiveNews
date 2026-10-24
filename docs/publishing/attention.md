# What draws a stranger's attention, within the story

A study of what the research says brings people to a video and keeps them there, and how the channel applies it
without leaving the story (24 Oct 2026). The owner's line: more views, never off the thread. Truthful packaging is not
a constraint on this: it is part of it (§1.6). Where the evidence is weak it says so.

## 1. What the research says

### 1.1 The first seconds decide, mostly without sound

- Facebook's research found that 47 % of a video ad's value (recall, awareness, intent) comes in its first three
  seconds and 74 % in the first ten; industry guides put the in-feed watch-or-skip decision at 1.5–3 seconds, TikTok
  and Reels under two (second-hand; the Facebook figures are relayed from Facebook IQ and Nielsen reports) [1].
- Verizon Media and Publicis (2019, 5,616 US adults): 69 % watch video with the sound off in public, 25 % even in
  private; 80 % say captions make them more likely to watch to the end (self-reported, not a measured rise) [2].

So: the first frame and the first spoken words carry the story, and the picture carries it without sound.

### 1.2 Faces, and where they look

- A face's gaze moves the viewer's attention where it looks, even when it predicts nothing (Friesen & Kingstone 1998,
  the gaze-cueing effect; it holds for schematic faces too) [3]. A presenter looking toward the words leads the eye to
  them.

### 1.3 Arousal and emotion

- Berger & Milkman (2012, *Journal of Marketing Research*, every New York Times article over three months): content
  that evokes high-arousal emotions spreads more, awe on the positive side, anger and anxiety on the negative;
  low-arousal sadness spreads less. The effect holds controlling for how surprising, interesting or useful the content
  is [4].
- Robertson et al. (2023, *Nature Human Behaviour*, 105,000 Upworthy headline tests, 370 million impressions): each
  extra negative word in a headline raised the click-through rate by about 2.3 %, each positive word lowered it by
  about 1 % [5].

So: awe and surprise are the channel's honest levers (science, space, technology, records, firsts). Negativity works
but is the one lever the channel will not pull beyond the facts: a grave story is told plainly (§1.6).

### 1.4 Curiosity

- Loewenstein (1994, *Psychological Bulletin*): curiosity is a felt gap in what one knows; it needs a gap that feels
  closeable and a little prior knowledge to grip [6].

So: a cover can show the stake or the striking figure and leave the "how" for the clip, and only when the clip closes
the gap. A gap the clip never closes is bait.

### 1.5 How people scan words

- Nielsen Norman Group: for 35 % of links, users who saw only the first 11 characters could not tell where they led;
  front-load the meaningful words, numbers as numerals [7].

So: the first two words of a title or a hook name the topic; numbers in digits.

### 1.6 Why the thread matters to the views

- YouTube ranks by "valued watch time": time watching videos viewers rate four or five stars in surveys it sends by
  the millions each month, with a model predicting the rest; likes and shares feed the same prediction [8]. A click
  that disappoints costs recommendations.
- Clickbait's cost to credibility is suggestive rather than settled: question headlines were rated lower in quality
  (small effects, Molyneux & Coddington), and readers engaged more with non-clickbait headlines in Scacco & Muddiman,
  though other studies found clickbait drew more engagement [9].

So: the channel's rules against bait, copying and exaggeration are also its growth strategy.

## 2. What the channel does with it

| Finding | Applied | Where |
|---|---|---|
| The first seconds decide (§1.1) | A clip starts on the news, never on a running-order label: "And finally:", "Our number of the day:", "Now," and "Around the world in 30 seconds." are left out (a label alone is never the first sentence; the attribution "From X:" is never cut) | `server/publish/moments.js` `placeRun`, `leadIn` |
| Sound off (§1.1) | The title band holds the clip's own big words from its first frame (the packaging's first cover text, checked for bait, labels and copying) instead of the programme's name; the captions are burned in, word by word | `tools/publish/factory.mjs`, `clip/captions.js` |
| Faces and gaze (§1.2) | The cover's presenter is a cut-out with the story's expression; on a 16:9 thumbnail the face turns toward the words | `clip/sprite.js` (`yaw`), `lab/thumb.html` |
| Arousal (§1.3) | A striking figure's cover shows a surprised presenter, a lighter story a happy one; the writer is told to say what is new or surprising, and the wonder of science and technology when the facts carry it | `packager.mjs coverCast`, `packaging.js` prompt |
| Negativity (§1.3) | Not pulled beyond the facts: grave news plain and respectful (serious face, white words, no plate); "never make it sound worse or better than the facts" in the prompt | `packaging.js` |
| Curiosity (§1.4) | The cover shows the stake or the figure, the title the news; a gap only when the clip closes it | `packaging.js` prompt |
| Scanning (§1.5) | The first two words of a title and of the hook name the topic; a title opening on a filler ("Here's", "So,", "There is") is refused; numbers in digits | `packaging.js checkTitle`, prompt |
| Self-relevance | When the facts say how the story touches ordinary people (prices, health, their phone, their weather), say it; never invent the link. (No study was checked for this one: it is editorial judgement, not evidence.) | `packaging.js` prompt |
| Valued watch time (§1.6) | Unchanged and kept: no bait, no copying, no exaggeration, the AI label and the disclosure | everywhere |

Already in place before this study and consistent with it: the covers' full-frame look with heavy type (24 Oct), the
pacing rules in programmes (no shot over 15 s, three kinds of shot a minute, `public/js/variety.js`), and STILL TO
COME teases that the programme pays off.

## 3. What would tell us it works

YouTube Studio shows impressions click-through rate and average view duration per video; TikTok and Instagram show
the share of viewers past the first seconds. The three covers and titles per video are made for YouTube's Test &
Compare, which measures them on real viewers. Read those numbers after the first weeks of the beta, keep what wins,
and bring the numbers back here.

## Sources

1. Facebook IQ / Nielsen figures as relayed by Marketing Dive, "Facebook offers tips for converting TV ads to mobile",
   https://www.marketingdive.com/news/facebook-offers-tips-for-converting-tv-ads-to-mobile/448510/ ; and
   https://for.you.com/posts/meta-ad-hook-rules-clash-over-3-seconds-vs-7-seconds-1b7a4958 (secondary)
2. Verizon Media and Publicis Media (2019), as reported by 3Play Media,
   https://www.3playmedia.com/blog/verizon-media-and-publicis-media-find-viewers-want-captions/ and Streaming Media,
   https://www.streamingmedia.com/Articles/News/Online-Video-News/80-of-Video-Caption-Users-Arent-Hearing-Impaired-Finds-Verizon-131860.aspx
3. Friesen & Kingstone (1998), reviewed in Frontiers in Psychology,
   https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.00708/pdf
4. Berger & Milkman (2012), "What Makes Online Content Viral?", Journal of Marketing Research 49(2),
   https://faculty.wharton.upenn.edu/wp-content/uploads/2011/11/Virality.pdf
5. Robertson et al. (2023), "Negativity drives online news consumption", Nature Human Behaviour 7, 812–822,
   https://pmc.ncbi.nlm.nih.gov/articles/PMC10202797/
6. Loewenstein (1994), "The psychology of curiosity", Psychological Bulletin 116, 75–98,
   https://stafforini.com/works/loewenstein-1994-psychology-curiosity-review/ ; PBS NOVA,
   https://www.pbs.org/wgbh/nova/article/how-to-stimulate-curiosity/
7. Nielsen Norman Group, "First 2 Words: A Signal for the Scanning Eye",
   https://nngroup.com/articles/first-2-words-a-signal-for-scanning
8. YouTube Official Blog, "On YouTube's recommendation system",
   https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/
9. Molyneux & Coddington, Journalism Practice (accepted manuscript),
   https://scholarshare.temple.edu/entities/publication/0f000984-ccd7-461a-881c-6b8df9539452 ; Molina et al., CHI '21,
   https://pike.psu.edu/publications/chi21.pdf
