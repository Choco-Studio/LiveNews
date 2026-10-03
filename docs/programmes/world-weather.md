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
- **Music:** WORLD NOW's light "and finally" song in its sparse arrangement under the forecast, and silence under the warnings.
- **Open:** a sun with turning rays and a cloud that drifts in front of it, in the network's open package. The accent is blue.

## 4. Configuration

- `WEATHER`: `auto` (default), `open-meteo`, `fixture` or `off`.
- `WEATHER_WARNINGS`: `gdacs` (default) or `off`.
- `WEATHER_TTL_MIN`: default 30.
- `ROTATION_START=world-weather` starts the channel on this programme (demos, recordings).
- `GET /api/tools/weather` (dev views) returns the report and the script.
- `public/lab/weather.html` plays the weather centre without the playout.

## 5. Still open (owner's decisions)

- **Decision 12:** the presenter is Sam Night by default; a dedicated weather presenter can be cast in `config/channel.json`.
- **Decision 8:** live data needs the network open to `api.open-meteo.com` and `www.gdacs.org`.
- **Decision 1:** duration and schedule. The programme airs once per rotation, after COSMOS.
