# WORLD WEATHER — style bible

The world's weather in about five minutes, presented by Sam Night standing at a wall-sized world map. It was built from the owner's note of 3 October: "un programa del tiempo a nivel mundial, el mapamundi por zonas con la temperatura, lluvia, sol… el hombre se mueve por el plató y la cámara junto a él mientras va señalando… avisos de huracanes con un segundo panel… algo realmente trabajado". This file builds on `docs/ART_DIRECTION.md` and states only the differences.

## 1. Data: real, cited, never invented

- **Forecast: Open-Meteo** (`api.open-meteo.com`, no key).
  - One request covers the 44 cities of the six zones (`server/weather.js` ZONES).
  - For today and tomorrow it gives the WMO weather code, the high and low, the precipitation total, the rain chance, the wind and the gusts. It also gives the current hour.
- **Warnings: GDACS** (`www.gdacs.org`, the UN/EC Global Disaster Alert and Coordination System).
  - Covers weather hazards on orange or red alert: tropical cyclones, floods, droughts and wildfires.
  - Uses GDACS's official names, levels and wind figures. Earthquakes and volcanoes are not weather and are left out.
- **Heat map (round 2, owner: "colores reales, un script que saque la temperatura de muchos sitios"):** the land's colours come from real temperatures sampled at many places, not from the 44 cities (`server/weatherfield.js`).
  - Live: Open-Meteo's high for today and tomorrow at the 841 land points of `config/weather-grid.json` (a point every 5 degrees, `tools/weather/make-grid.mjs`), in batches of 120, every 3 hours (the free tier's daily budget), spread onto a 1-degree grid.
  - Offline: the ERA-Interim reanalysis (ECMWF), the October mean of 2 m temperature on a 1-degree grid (`config/fixtures/weather-field.json`, built by `tools/weather/make-demo-field.py` from NCAR's GeoCAT example data). It is real data, but a monthly mean.
  - Either way the field is then tied to the forecast's cities, so the colour under a chip agrees with the chip.
- **Offline:** `WEATHER=auto` uses the demo data in `config/fixtures/weather.json` while the news desk runs on the fixture feeds.
  - The screen says **DEMO DATA · NOT A REAL FORECAST**.
  - The demo's storm, ORLA, is fictional.
- **Live data notes (first run, 4 Oct):**
  - GDACS keeps an event in its list after it ends. Each hazard therefore has its own limit after GDACS's last update: a cyclone 1.5 days (it is advised every 6 h), a flood or a fire 4 days, a drought 21 days.
  - A hazard spread over more than three countries is named by the region at its point ("parts of central Europe"), never by GDACS's alphabetical list. The panel adds how many countries and since when.
  - Open-Meteo's free tier counts every place as a call (600 a minute). The grid is paced at 120 places every 15 s and fetched in the background, so the forecast waits at most 2 s for it and the map joins the report when it lands. After a 429 the batch is asked again. A batch that never answers is left out.
  - Hung or dropped connections are tried again, each try with its own timeout.
- **A failed live fetch never falls back to the demo data.** There is no programme, and the slot is skipped and retried after 10 minutes. A report up to 3 hours old may still air.
- **The script is written from the data alone** (`server/weatherwriter.js`).
  - Every figure said is a figure of the forecast, and every warning is GDACS's own (checked by `test/weather.test.js`).
  - No AI writes this programme, so it cannot invent a storm or a temperature.

## 2. Running order (≈ 4.5–6 min)

1. **Intro** (the world): the greeting, then the day's three headlines (the hottest city, the wettest or stormiest, and the cyclone to watch or the coldest start).
2. **Six zones, west to east:** North America, South America, Europe, Africa & the Middle East, Asia, Oceania. Each zone has:
   - an opener;
   - the spread of the highs;
   - the cities in groups (heat, sunshine, storms, rain, cool, grey);
   - the rest of the cities;
   - the coldest (or warmest) night;
   - the wind.

   Every city on the map is read out.
3. **Warnings** (up to two, serious tone):
   - the alert level and the source;
   - the winds and the storm category (Saffir-Simpson, from the sustained wind);
   - where it is;
   - advice to follow the national weather service and the local authorities.
4. **Tomorrow, round the world:** one city per zone where the weather turns.
5. **Sign-off**, then the end card.

Phrasing varies with the date and the edition, and no turn of phrase is repeated within a bulletin. The programme never airs twice in a row: a news drought falls back to filler breaks and replays, not to the same forecast every slot.

## 3. The weather centre (`public/js/scenes/weather/`)

Round 2 as built. Round 3 (below) replaces the single shot with a studio and its shots; the walk, the points, the city markers and the warnings panel carry over.

- **One continuous shot. The camera follows the presenter along the wall.**
  - A new segment sends him to his mark (left or right of the zone, alternating) over 2.1 s with a side-step.
  - The map slides and zooms under him at the same time. A long hop pulls out a little on the way, as the news locator's pans do.
- **The map is the news locator's map** (the owner likes it), in view mode.
  - The land is coloured by the day's highs with a palette ramp, from purple to dark red, with ordered dither between neighbouring steps.
  - The field is interpolated from the cities and eased toward a latitude climate where no city is near.
- **Cities:**
  - Each city has a weather symbol: sun, partly cloudy, cloud, fog, drizzle, rain, showers, snow or storm. Symbols are animated (rays twinkle, rain falls, a bolt flashes).
  - Beside the symbol is the high on a black chip with a temperature-coloured foot, and the name in micro type in zone views.
  - **When the voice reaches a city's name, white brackets frame it, its chip inverts, and the presenter points at it.** He points at most one gesture every 4 s, never while walking.
- **The warnings panel** is a second screen that slides in on the right. It shows the alert colour, the cyclone's name, its category, its maximum winds, the region and the source. The cyclone itself turns at its place on the wall.
- **Graphics:**
  - the zone tab and the temperature scale on the map's side, clear of the presenter;
  - the source (DATA: OPEN-METEO · GDACS, or DEMO DATA) at the foot of the map;
  - the channel's bug, clock and captions as on every programme;
  - the ticker shows one calm UP NEXT plate.
- **The presenter moves (round 2, `scenes/weather/presenter.js`):**
  - Side-steps along the wall with planted feet: the lead foot steps out, the weight goes over it, the other closes. The body dips as the feet open and sways over the foot that carries it.
  - The head turns toward where he is going.
  - The weight shifts between his feet now and then while he talks.
  - A step toward a city far across his zone before he points at it.
- **The presenter points at the city itself:** the point is aimed on the line from his shoulder to the city on the wall, with the nearer arm. The eyes lead, the head follows, the arm rises with a little overshoot and holds, the look comes back to the lens while the hand stays. A zone starts with an open hand offered to the map.
- **Symbols are always on the map:** on the world views, every city that has room shows its symbol and temperature (the named ones and the day's extremes first).
- **The presenter stands** (`v2/canvas25d/runtime/standing.js`).
  - The rig's upper body is drawn with the rest of the suit: the jacket's skirt in the jacket's own group, trouser legs lit from camera-left, and shoes.
  - Framed head to mid-shin.
- **Music:** its own bed in the open's key (`music/proposals/lofi/palettes.js` `'world-weather'`), so the open hands over without a key change (it was WORLD NOW's D major song after a C major open).
  - 92 BPM, C major, the 7th as its colour: a soft pluck drifting in eighths over long Rhodes chords, a warm pad and triangle roots, a few soft triangle notes between sentences.
  - Under the intro and the zones; a little brighter for tomorrow; keys, pad and bass for the sign-off.
  - Silence under the warnings (a storm is not a jingle).
  - About 20 LU under the voice (median under speech, measured with the lab's 3 s method).
- **Open:** the title sequence below, ending on the network's open package: a sun with turning rays and a cloud that settles in front of it. The accent is blue.
- **Open theme** (`themes.js` `'world-weather'`): C major, 88–96 BPM, its colour the major 7th (the open sky).
  - The motif is on an airy pulse12 over Cmaj7, then Fmaj7/C.
  - The colour (B) sounds over the C pedal and resolves to C on a Cmaj9 hit.
  - Its breaking, sign-off and promo cues are in C too.

### The title sequence (owner, 9 Oct: as crafted as WORLD NOW's)

9.9 s at 92 BPM on the cue sheet in `public/js/scenes/opens/cues.js`. The pictures (`opens/weathertitles.js`) and the theme (`themes.js` `weatherTitles`) read the same beats: up through the weather.

| Beats (s) | Pictures | Music |
|---|---|---|
| 0–4 (0–2.6) | Inside a storm, rising: banks of cumulus (rounded heads on flat bases) slide down past the camera in three depths, dark against the murk, their heads catching what light there is; rain slants through them. Lightning strikes on beat 2 (a forked bolt, the banks lit from within), and a distant sheet flickers high on the right on beat 3.5. | A minor: low strings in a long hall and a dark pad, rain on a soft, uneven hat. A timpani roll swells into the strike; a timpani stroke on a felt thump for it, the strings swelling after it, and a softer stroke for the sheet |
| 4–7 (2.6–4.6) | The rain stops; the banks pale as the camera climbs toward the cloud deck above, which comes down over the frame, light coming through it under the sun. Pale banks keep passing under the deck at every depth, so the lower frame never empties. | The rain stops. Fmaj7, then G6; a bell line rising and the strings climbing as the cloud pales, an air swell cresting on the breakout |
| 7 (4.6) | The sky clears from the top down, and the sun comes up over the heads of the sea of cloud | Cmaj7 with a timpani stroke and a felt thump; the strings high (E G B), the low strings under them, bells (B, E, G) |
| 7–11.5 (4.6–7.5) | The sea falls away and the sky deepens to the night above the weather. The sun's rays come out. One cloud rises from the sea and settles in front of the sun: the emblem's. The bit pops from the sun's shoulder on the package's clock. | Cmaj7 over the C pedal, two bells as the cloud rises, then the signature on the airy pulse over Cmaj9, Fmaj7/C and C add9 (the colour, B, over the pedal) |
| 11.5–14 (7.5–9.1) | The package's reveal | Into Cmaj9 on the hit |
| 14–15.2 | Still for the cut | The button |

**The sun and the last cloud are the emblem's own** (`weather.js` `drawSun` and `drawCloud`, drawn pixel by pixel at any centre). From the breakout on, they stand where the emblem has them, and the rays turn on the package's clock, so the hand-over never pops (tested; 0 px in the lab).

**Motion rules:**
- Through the cloud, the middle depth rises at most 3 px a frame (tested).
- Each pixel samples a bank at its own fixed instant within the frame (its place in the screen's matrix), so it meets the bank's bands in order.
- A bank's thin bands (its lit heads, its shadowed base) widen to twice its motion, so no edge lights a pixel for a single frame.
- The rain steps 15 times a second.
- Each flash steps down over a quarter second and never brightens again.


## Round 3 (owner, 12 Oct: "el programa del tiempo necesita mejoras enormes")

The owner also asked that programmes entertain, not only inform: "No solo informativos ya que eso no causa retención".

### What was wrong with round 2 (recorded on air, 12 Oct)

- **One shot for five minutes.** The presenter stood, very large and flat, beside a flat blue map. There was no studio, no depth, no light and no cut.
- **Nothing moved but the presenter.** The map's colours were fixed for the whole programme. A real bulletin shows the weather moving: cloud drifting and building, rain bands, highs and lows.
- **A list, not a story.** Every one of 44 cities was read out with its figures: 237 s of numbers. There was no big story, no line for the viewer, no countdown and no outlook beyond tomorrow.

### The new programme (≈ 3.5 min of speech)

Every segment carries `shot`: the camera the weather centre gives it.

| Segment | Shot | What it says (written from the data alone, `server/weatherwriter.js`) |
|---|---|---|
| `headline` | `mcu` | The greeting, the day's big weather story (a cyclone, a flood, extreme heat, a deluge, real cold, or the planet's contrast) and what is coming |
| `world` | `graphic` | The next 24 hours round the planet as a time-lapse: the deepest low near people and where it goes, the strongest high, the wettest area. Each high or low named is a `pin` |
| `zone` ×6 | `wall` | Two or three standouts per zone (not every city). The rest stay on the map. Then a comparison when a zone has one, and one line for the people who live there: an umbrella, the shade, a coat, a terrace. Odd zones use the short form |
| `hotcold` | `board` | HOT & COLD: the third, second and hottest place, then the cold side to the coldest, then the gap between the two ends. It draws on the 70 places (the zones' cities and 26 famous hot and cold places, `EXTRA`) |
| `warning` | `warning` | As round 2: GDACS's orange and red alerts, a serious tone, silence under it |
| `outlook` | `board` | THE NEXT THREE DAYS for five cities (the most changeable of each zone, west to east): tomorrow, then by the third day, and the high |
| `outro` | `mcu` | A last line from the day's figures ("I hope you get Tokyo's sunshine, not Mexico City's rain"), then the sign-off |

### The data (server)

- **The moving sky** (`server/weathersky.js`):
  - Open-Meteo's hourly cloud cover, precipitation, wind and sea-level pressure.
  - Places: the heat map's 841 land points plus 261 open-sea points every 10 degrees (`config/weather-grid.json` `sea`).
  - The same requests as the heat map, every 6 hours: about 4,400 calls a day with the cities, within the free tier's 10,000.
  - It is spread onto a 3-degree grid (120 × 60): 9 frames, one every 3 hours from the next whole UTC hour.
  - Highs and lows are found in the pressure: a low under 1006 hPa lowest within 12 degrees, a high over 1020 hPa highest within 15.
  - Offline: a recorded real forecast (`config/fixtures/weather-sky.json`, `tools/weather/record-sky.mjs`).
- **The forecast:** four days per place (`outlook`), and 70 places (`PLACES` = `CITIES` + `EXTRA`).
  - The extra places are not on the zone maps. They compete for HOT & COLD (`report.hotCold`: the five highest highs and the five lowest lows).
  - The city forecast's time to live is now 60 min, to stay in the free tier.

### The contract (what the client receives)

`episode.weather`:
- `zones`, with each city's `today`, `tomorrow`, `outlook` (3 days), `now`
- `extra`: the 26 places with `today`
- `warnings`
- `hotCold`: `{ hot: [{ id, name, say, lat, lon, value, kind, zone? }], cold }`
- `field`: the heat map, as round 2
- `sky`: `{ w: 120, h: 60, lat0: 88.5, lon0: -178.5, step: 3, start, hours: [0, 3, ... 24], cloud: [b64 u8 %], rain: [b64 u8 tenths of mm/h], u: [b64 i8 m/s], v: [b64 i8 m/s], mslp: [b64 u8 hPa − 940], systems: [{ kind: 'H'|'L', lat, lon, hPa, frame }], source, places, demo? }`, or `null`. Rows run north to south.

Each segment adds:
- `shot`: `'mcu' | 'wall' | 'graphic' | 'board' | 'warning'`
- `marks`: `[{ char, city }]`. The city is a zone city (the map lights it) or any place on a board (the board lights its row).
- `pins`: `[{ char, kind, lat, lon }]`. A high or low named at that character.
- `gestures` (round 4, the close-up's): `[{ char, kind: 'place' | 'world' | 'sweep' | 'count' | 'nod', lat?, lon?, variant?, from?, to?, toward?, n? }]`. Each is placed at the start of the phrase whose stressed word its stroke lands on.
- `timelapse`: `{ from, to }` in hours of the sky (the world: 0 to 24; a zone: 0 to 12).
- `board`:
  - HOT & COLD: `{ kind: 'hotcold', hot, cold }`
  - outlook: `{ kind: 'outlook', days: [{ date, name: 'WED' }], cities: [{ id, name, zone, today, days: [3 days] }] }`

### The weather centre (client, `public/js/scenes/weather/`)

The picture is built in the frame's own pixels (palette colours only, Bayer 4×4 dither, no blends), then the text and the presenter go on top.

- **The studio** (`studio.js`):
  - A curved LED wall in a dark set. The wall is concave, so its ends are nearer the lens: its top edge bows up from y 28 at the centre to about y 22 at the frame's edges, and its foot bows down the same way. The picture is mapped onto the curve column by column, one step darker in a dither toward the ends (an LED wall seen off axis).
  - Above the wall: a lighting rig with six lamps, their light falling down the backdrop between the top row's graphics.
  - Below it: the bezel, a plinth with a cyan LED line (orange under a warning), then a black glossy floor that mirrors the wall: two steps darker, in streaks along the floor's grain, thinning with distance.
  - **The light on the presenter** (`lightFigure`): the wall behind him rims his silhouette (the edge facing the wall and the top go one step up their ramp), and its cool light lifts dark cloth one step in a dither that thins over 2–3 px in from that edge. Skin keeps its warmth.
- **The shots** (`seg.shot`; an older script's kinds map to them):

  | Shot | Picture |
  |---|---|
  | `mcu` | The presenter waist-up (1.9 px/cm), a third in from the side (left for the opening, right for the sign-off), talking to camera. Behind him the wall out of focus: a 64 × 36 picture of the map with its sky, blurred and enlarged 6× with an ordered dither between texels, so the map's colours are big soft shapes and the clouds still drift. On the far side the wall's end turns away into the dark set, with an LED strip out of focus. Small open-hand beats on alternate sentences. The opening names him with a WEATHER strap for a few seconds |
  | `graphic` | The wall's picture full frame: the world with the heat map, isobars, the highs and lows, cloud and rain playing the next 24 hours, the time-lapse's clock top left, the source under the channel's clock. A city lights up (chip and brackets) when the voice names it |
  | `wall` | The presenter knee-up (1.0 px/cm) beside the wall, which fills most of the frame. Round 2's walk and aimed points stay. The camera follows a tenth of his walk, so the wall slides the other way behind him. From the world graphic the wall flies in from a wider view of the zone. Along the zones he side-steps across while the wall flies to the next zone; the last zone's tab, scale and source hold until the wall is halfway there |
  | `board` | HOT & COLD or THE NEXT THREE DAYS full frame, over the wall's picture out of focus and two steps darker |
  | `warning` | The wall shot held on the storm: the presenter still beside it (one aimed point at the storm, then nothing), the cyclone turning at its place, the warnings panel on the wall's free side, the LED line orange |

  - A new shot cuts on the segment's first word.
  - Into a board, and from the opening close-up to the world, the old picture wipes off behind an accent bar (0.42 s).
- **The moving sky** (`sky.js`, null-safe: without a sky the map plays still, as in round 2):
  - **Time:** the layers between frames are tweened with Catmull-Rom (no kink at each frame), and clamped to each layer's range.
  - **Cloud:** the cover says how much of a place is cloud; a texture says where.
    - The texture is a tileable fBm (six octaves, lightly domain-warped so the heads round off), equalised so that a 60 % cover leaves 60 % of the area cloud, with equalised mips for every zoom.
    - It is anchored to the Earth and advected by the forecast's wind (1.8× the 10 m wind, as cloud rides the flow aloft). A feature therefore travels downwind through the time-lapse while the cover builds and clears it, and around a deep low the shear winds it into a spiral.
    - Cover under 32 % is left clear.
    - Thickness comes in four veils: each palette colour mixed toward white in linear light and snapped to the nearest palette colour (navy → steel → fog → silver → white). Thin cloud therefore dithers between two close colours instead of spattering white dots, and it is lit from the west along each row.
    - The chips and labels are drawn over it.
  - **Rain** is drawn over the cloud in radar colours by intensity: cyan from 0.35 mm/h, blue 0.8, green 1.6, yellow 3, red 5.5. The bands are crisp, with a short dithered edge, and the layer's mean is shaped into cells by the same texture at twice the frequency (0.35–1.85×).
  - **Isobars:** every 4 hPa, 1 px of fog, on the world graphic, under the cloud.
  - **Highs and lows:** a blue H and a red L at 2×, the hPa small under them.
    - Each centre is refined to a fraction of a cell with a parabola through the pressure, matched frame to frame (the nearest of its kind within 12 degrees), smoothed 1-2-1 along its track and moved on an eased line between frames.
    - They never sit under the wall's graphics or at the presenter.
    - A pin (`seg.pins`, delivered by the director like the marks) rings twice in yellow, and the system then sits on a black plate in brackets while it is said. One that has dissolved by then is held at its last place.
  - **The time-lapse:** the world plays its 24 hours over 84 % of the segment (eased), and it waits for the voice. The clock never runs past the last hour a high or low still to be named is on screen, nor away from one while it is named (2.8 s). Once named, the clock catches up at up to twice its mean speed, so "high pressure over Siberia" rings the high where it is, never after it has faded. The writer names, where it can, highs and lows the picture keeps all day: a track from the first frame to the last, matched as the picture matches them (`sky.js` `matchTracks`). A zone plays its 12 hours in 4.6 s once the wall has arrived, holds 0.7 s, then settles back on now over 1 s: the layers morph while the texture keeps drifting forward, so nothing runs backwards. The clock ("TUE 14:00", London time, with a small turning dial and a progress rule) shows while it runs.
  - The sky is recomposed 15 times a second while the view holds still. The set is redrawn only when the wall's picture or the camera changed.
- **The boards** (`boards.js`, the cards' language: black plates, 2× white figures, eased wipes, nothing counts up):
  - **HOT & COLD:** two columns under their colour plates, HOT (highest highs) and COLD (lowest lows), with five rows each: rank, place, symbol, and the temperature at 2× on a chip of its colour.
    - The voice counts down 3, 2, 1 on each side. A row wipes in when its place is named, and it is framed (its rank in the side's accent, its plate lit) while it is said.
    - Ranks 4 and 5 are not said: they wait dimmed from the start and light up when the last place has been said, with the gap between the two ends ("53° BETWEEN THE TWO ENDS") in the title row.
  - **THE NEXT THREE DAYS:** five cities by three weekday columns. Each cell has the animated symbol, the high on its chip and the low. The city being said is lit and framed; a city already said keeps an accent edge.
- **Cost** (the lab's `window.perfWeather(index, seconds)`, headless Chromium with software GL, 4 cores, mean over 240 frames, 12 Oct):
  - the close-up 2.8 ms, the sign-off 3.2;
  - the world graphic 3.8 during its time-lapse;
  - a zone 3.0 settled, 5.2 while the wall flies and he walks;
  - the warning 4.2;
  - the boards 1.1–2.7.

  Round 2's single shot measured 2.9–7.3 ms in the same run. The sky compositor alone costs about 4 ms for a full 384 × 216 frame in node (the recorded sky); the 15-per-second recompose halves it on average. `window.flickerWeather(index, seconds)` counts the pixels that flip and flip back within two frames: none to five per frame on every shot.

### Round 4 (12 Oct): to broadcast standard

What still fell short after round 3, and what replaced it:

- **The cloud drew out into streaks late in the world's time-lapse.** The texture was carried by the wind for the whole run (`p − wind × 24 h`), so wherever the wind shears (the westerlies at 45–65°, the Southern Ocean, the North Pacific) it was stretched into long fibres by hour 15.
  - Now a **flow map** (`sky.js` `flowPhases`): the texture is carried in two phases half a period (8 sky hours) apart. Each is displaced at most 3 hours of wind either side of its own start, travels downwind, fades out, and starts again elsewhere on the texture while the other carries the picture. No shape is carried long enough to be drawn out.
  - The cross-fade (half of each half-period, eased) blends the two phases in the normal space of the texture's ranks, over their true spread (the texture's correlation with itself at the two samples' shift, tabulated per mip), then maps the blend through the picture's own distributions (`matchedPhi`, soft histograms of the node grid), so the cover in view is exactly the two phases' covers mixed by their weights. A linear mix would swell or thin the cloud halfway through every fade.
  - Consecutive runs start 0.38 × 0.32 tiles apart, where the texture is uncorrelated on every mip. One phase alone reads the uniform texture as before.
  - The west light acts on the slopes over about two pixels and spares the thick cores (a step on every texel's slope drew vertical strokes across an overcast).
  - The cloud's wind clock now runs on through the programme instead of restarting at each segment.
  - What remains: in a zone's window of two or three texture tiles, each run places different shapes over the cover field, so a crossfade can move the cloud's share of the view by 2–3 % over about a second of the zone's time-lapse (17 s once settled). That is the cloud evolving, not a pulse; over the world it is under 1 %.
- **The storm had no cloud.** The 3-degree sky has no cyclone of its own. `storm.js` draws a **symbol in the cloud's veils**:
  - a clear eye, the densest eyewall, a central dense overcast, and two bands on a logarithmic spiral that trail the turn, thin outward and feather out over a faint haze;
  - sized by category (a tropical storm 3.5°, about one degree more per category; at least 10 px on the world graphic, 9 on the wall) and turning once every 22 s, anticlockwise in the north and clockwise in the south;
  - drawn into the wall's picture after the sky, so it rides the curve, the dimming and the floor's reflection. Inside its disc the forecast's cloud gives way to the symbol; the forecast's rain stays on top.
  - It replaces the spinning icon on the warning shot, appears on the world and the zones when in view (its core kept clear of highs, lows and chips, its name under it on a black plate), and shows out of focus on the opening close-up's wall.
  - It is a graphic, not observed data: clean bands, GDACS's place, the category's size.
- **The close-up reused the seated desk beats**, which read as small hand movements at the waist. The writer now cues the close-up's gestures on their words (`seg.gestures`, delivered by the director like marks and pins), and the presenter has a weather presenter's own gestures (`presenter.js`):
  - **place:** an open hand offered toward the place on the out-of-focus wall, with the arm well out, the palm up, the eyes there first;
  - **world:** both palms up and out at chest height for the big picture;
  - **sweep:** the open hand drawn along a movement, the eyes with it;
  - **count:** the rig's finger count;
  - **nod:** a nod with his name.
  - The big story's place gets a hand as it is named (a contrast gets a sweep from one end to the other). "Round the world" gets a sweep, both palms or a count, by edition. The sign-off's "wherever you are" gets both palms, then a hand to the sunshine's city.
  - Arm gestures are at least 1.6 s apart, each played a touch faster or slower (0.92–1.08). Between cues there is only a rare small beat in a long quiet stretch.
- **Walking between zones he crossed the new zone's chips.** They now come in once he has arrived beside them, wiped down west to east, and they stay in place through his later steps.
- **The wall's rim light ran down his legs** against the black plinth. It now thins out below the glass's foot (`lightFigure` `litTo`).

**Cost after round 4**, in the same lab:
- The world graphic, by the lab's `perfWeather` (its voice gate holds the clock): 3.5–3.6 ms (3.0–3.1 before), with no flips.
- Over the whole world segment, with the marks and pins firing at 15 characters a second (the time-lapse at full speed, half its recomposes in a cross-fade): 4.2–4.6 ms (3.3–3.5).
- The zone: 3.7 by `perfWeather` (3.4); 4.4–4.9 over the segment (3.4–4.2).
- The warning and the close-up are unchanged within noise.
- Each cross-fade's compose costs a second texture read per pixel, about 2 ms of a 4 ms compose.

## 4. Configuration

- `WEATHER`: `auto` (default), `open-meteo`, `fixture` or `off`.
- `WEATHER_WARNINGS`: `gdacs` (default) or `off`.
- `WEATHER_TTL_MIN`: default 30.
- `ROTATION_START=world-weather` starts the channel on this programme (demos, recordings).
- `GET /api/tools/weather` (dev views) returns the report and the script.
- `public/lab/weather.html` plays the weather centre without the playout.

## 5. Still open (owner's decisions)

- **Decision 12:** the presenter is Sam Night by default; a dedicated weather presenter can be cast in `config/channel.json`.
- **Decision 8 (network):** open since 4 Oct. The first live run is recorded in section 1 (live data notes).
- **Decision 1:** duration and schedule. The programme airs once per rotation, after COSMOS.
