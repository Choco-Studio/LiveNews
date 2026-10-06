# 📺 LiveNews

Un informativo en directo 24/7 generado por IA, hecho entero en pixel art. Un servidor lee noticias de feeds RSS en español, un modelo de lenguaje escribe el guion del boletín y el navegador lo emite con voz, planos de cámara, rótulos, subtítulos y teletipo, sobre un lienzo de **384x216 píxeles** escalado con zoom entero para que los píxeles se vean siempre nítidos.

## Qué hace

- **Dos presentadores dibujados por código**: Paco Píxel (veterano, sereno, humor seco) y Lola Byte (enérgica y curiosa). Parpadean, gesticulan, cambian de expresión según el guion y mueven la boca al ritmo de la voz.
- **Guion escrito por IA, pegado al texto de los feeds**: el modelo solo puede usar el titular y el resumen de cada noticia, y debe citar la fuente.
- **Voz y sonido**: síntesis de voz del navegador en español (`tts`), voces de bips al estilo de los videojuegos (`blips`) o silencio (`mute`, sin sonido alguno, aunque los presentadores siguen moviendo los labios). Si el navegador no tiene voces en español, `tts` cae solo a `blips`. Cabecera, despedida, cortes de plano y alertas llevan jingles y efectos generados con WebAudio.
- **Realización completa**: planos `wide`, `close` y `full` (con paneo lento sobre la foto), rótulos con fuente y titular, subtítulos, teletipo «AL MINUTO», banners de **ÚLTIMA HORA**, reloj con la hora de Madrid y una ciudad al fondo que cambia entre día, atardecer y noche.
- **Fotos de las noticias en pixel art**: el navegador las convierte con una paleta adaptativa (k-means) y tramado ordenado Bayer. Si una noticia no tiene imagen, el videowall muestra una tarjeta con la fuente y la sección.
- **Boletines preparados por adelantado**: hay una cola de boletines ya escritos. Si no hay noticias frescas, se repite uno reciente marcado como **REPETICIÓN**.
- **Cadena de proveedores con respaldo**: Codex (plan de ChatGPT) → API de OpenAI → DeepSeek → `mock` (sin IA), para que la emisión no se pare.
- **Panel de control** (tecla `D`) con la cola, los proveedores, el uso mensual en tokens y el estado de cada feed.

## Requisitos

- **Node.js 20 o superior**.
- Un navegador moderno (Chrome o Edge recomendados para las voces `tts`).
- Conexión a internet para descargar los feeds, las fotos de las noticias y los datos de WORLD WEATHER (`api.open-meteo.com` y `www.gdacs.org`).
  - Detrás de un proxy HTTPS (variable `HTTPS_PROXY`), arranca Node con `NODE_USE_ENV_PROXY=1` (Node 22.21 o superior). Sin esa variable, `fetch` no usa el proxy y las peticiones fallan.
- Opcional, para que el guion lo escriba una IA (sin ello funciona en modo demo):
  - [Codex CLI](https://github.com/openai/codex) con sesión iniciada con un plan de ChatGPT, **o**
  - una clave de API de OpenAI y/o de DeepSeek.

## Inicio rápido

```bash
npm install
cp .env.example .env
npm run demo
```

`npm run demo` arranca con el proveedor `mock`: **no usa IA** ni necesita cuentas ni claves. Se limita a leer en voz alta el texto de los feeds: «Según *fuente*: *titular*» más las dos primeras frases del resumen, alternando presentadores. No hay redacción propia, así que suena más robótico; sirve para comprobar que todo funciona.

Para usar la cadena de proveedores configurada en `.env`:

```bash
npm start
```

Abre <http://127.0.0.1:8080> y **haz clic** en la pantalla (o pulsa `Enter`) para empezar: los navegadores solo permiten reproducir audio tras un gesto del usuario. Durante los primeros segundos verás la carta de ajuste «ENSEGUIDA VOLVEMOS» mientras se descargan los feeds y se escribe el primer boletín.

Si no has configurado nada, `npm start` también funciona: Codex fallará por no estar instalado, OpenAI y DeepSeek se omiten por no tener clave, y el boletín lo genera `mock`.

> En Windows (PowerShell o cmd) la sintaxis `PROVIDERS=mock node ...` de `npm run demo` no funciona. Pon `PROVIDERS=mock` en tu `.env` y usa `npm start`.

### Scripts

| Comando | Qué hace |
| --- | --- |
| `npm start` | Arranca el servidor (`node server/index.js`). |
| `npm run dev` | Igual, pero reinicia al cambiar el código (`node --watch`). |
| `npm run demo` | Arranca solo con el proveedor `mock` (sin IA). |
| `npm test` | Ejecuta los tests. |

### Parámetros de la URL

| Parámetro | Efecto |
| --- | --- |
| `?autostart=1` | Empieza sin esperar al clic (pensado para OBS). |
| `?voice=tts\|blips\|mute` | Modo de voz inicial. Por defecto, `tts`. |
| `?subs=0` | Oculta los subtítulos. |
| `?debug=1` | Abre el panel de control al cargar. |
| `?volume=0.5` | Volumen inicial, entre 0 y 1 (por defecto, 0,8). |

Se pueden combinar: `http://127.0.0.1:8080/?autostart=1&voice=blips&subs=0`.

## Proveedores de IA

Se configuran en `PROVIDERS`, una lista separada por comas con los nombres `codex`, `openai`, `deepseek` y `mock` (los nombres desconocidos se ignoran):

```env
PROVIDERS=codex,openai,deepseek,mock
```

| Proveedor | Qué usa | Cuándo está activo |
| --- | --- | --- |
| `codex` | `codex exec` de Codex CLI, con tu plan de ChatGPT | Siempre se intenta; si falta el ejecutable, falla y se pasa al siguiente. |
| `openai` | API de OpenAI (Chat Completions) | Solo si hay `OPENAI_API_KEY`. |
| `deepseek` | API de DeepSeek (Chat Completions) | Solo si hay `DEEPSEEK_API_KEY`. |
| `mock` | Sin IA: lee el texto de los feeds | Siempre. |

### Cómo funciona la cadena de respaldo

1. Para cada boletín se prueban los proveedores **en orden**. Se saltan los que no están disponibles (sin clave) o están en pausa.
2. Cuenta como fallo cualquier error, un tiempo agotado o una respuesta que no sea un boletín válido (JSON roto o sin ninguna noticia reconocible). Entonces se pasa al siguiente proveedor.
3. El proveedor que falla entra en **pausa** (cooldown):
   - **30 minutos** si el error parece de cuota o límite de uso: código HTTP 429 o un mensaje que contenga `quota`, `limit`, `cuota` o `rate`.
   - Si no, una pausa **creciente**: 30 s, 1 min, 2 min... hasta un máximo de 15 min. Un éxito reinicia el contador.
4. Si fallan todos, no se genera boletín nuevo y la emisión repite uno reciente (o muestra la carta de ajuste si aún no había ninguno).

Deja `mock` al final de la cadena si quieres que la emisión nunca se quede sin boletines.

### Codex (suscripción de ChatGPT)

1. Instala Codex CLI siguiendo la documentación oficial de OpenAI (por ejemplo, `npm install -g @openai/codex`).
2. Inicia sesión con tu cuenta de ChatGPT:

   ```bash
   codex login
   ```

3. Comprueba que el ejecutable está en el `PATH` (`codex --version`) o indica su ruta en `CODEX_BIN`.

Para cada boletín, el servidor ejecuta `codex exec --json --skip-git-repo-check --sandbox read-only -m <CODEX_MODEL> ...` en un **directorio temporal vacío** (que borra después) y con el sandbox en **solo lectura**, así que el agente no tiene nada que tocar. El prompt viaja por la entrada estándar y además le pide que no ejecute comandos ni lea archivos.

```env
CODEX_MODEL=gpt-6-luna
# Argumentos extra para `codex exec`, separados por espacios (no admite argumentos con espacios dentro)
CODEX_EXTRA_ARGS=
CODEX_TIMEOUT_MS=240000
```

> **Aviso importante sobre el plan de ChatGPT.** Usar Codex con un plan de ChatGPT está sujeto a los **límites de uso del plan** (ventanas de 5 horas y límite semanal) y a los **términos de OpenAI**. Antes de dejar LiveNews funcionando 24/7, comprueba que un uso automatizado y continuo encaja en esos límites y en esas condiciones. Para que la emisión no se pare cuando se agote la cuota, existe el respaldo con la API de pago (`openai`, `deepseek`) y, en último término, `mock`.

### API de OpenAI y DeepSeek

Ambos usan el endpoint `POST {BASE_URL}/chat/completions` con respuesta en JSON y un tiempo máximo de 120 s. Se activan al poner la clave:

```env
OPENAI_API_KEY=tu-clave
OPENAI_MODEL=gpt-6-luna
OPENAI_BASE_URL=https://api.openai.com/v1

DEEPSEEK_API_KEY=tu-clave
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

Cambiando `*_BASE_URL` y `*_MODEL` puedes apuntar a otro servicio compatible con Chat Completions. El archivo `.env` está en `.gitignore`: no subas nunca tus claves al repositorio.

Algunos ejemplos de cadena:

```env
PROVIDERS=codex,openai,mock     # plan de ChatGPT, API de pago de respaldo y demo como último recurso
PROVIDERS=deepseek,mock         # solo DeepSeek
PROVIDERS=mock                  # sin IA
```

## Configuración

Las variables se leen de `.env` al arrancar (reinicia el servidor tras cambiarlas). Las variables de entorno reales tienen prioridad sobre `.env`, y un valor vacío equivale al valor por defecto.

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interfaz en la que escucha el servidor. |
| `PORT` | `8080` | Puerto del servidor. |
| `PROVIDERS` | `codex,openai,deepseek,mock` | Orden de la cadena de proveedores de IA. |
| `CODEX_BIN` | `codex` | Ejecutable de Codex CLI (ruta completa si no está en el `PATH`). |
| `CODEX_MODEL` | `gpt-6-luna` | Modelo que se pasa a `codex exec -m`. |
| `CODEX_EXTRA_ARGS` | *(vacío)* | Argumentos extra para `codex exec`, separados por espacios. |
| `CODEX_TIMEOUT_MS` | `240000` | Tiempo máximo por llamada a Codex (4 minutos). |
| `OPENAI_API_KEY` | *(vacío)* | Clave de la API de OpenAI. Sin ella, `openai` se omite. |
| `OPENAI_MODEL` | `gpt-6-luna` | Modelo de OpenAI. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | URL base de la API. |
| `DEEPSEEK_API_KEY` | *(vacío)* | Clave de la API de DeepSeek. Sin ella, `deepseek` se omite. |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Modelo de DeepSeek. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | URL base de la API. |
| `CHANNEL_NAME` | `LIVENEWS` | Nombre del canal: logotipo, mesa, cartelas y guion. Mejor corto. |
| `STORIES_PER_BULLETIN` | `5` | Número máximo de noticias por boletín. |
| `QUEUE_SIZE` | `2` | Boletines que se preparan por adelantado. |
| `MIN_NEW_STORIES` | `3` | Noticias nuevas (sin cubrir) necesarias para generar un boletín nuevo; si no las hay, se repite uno reciente. |
| `MAX_STORY_AGE_HOURS` | `36` | Antigüedad máxima de las noticias, en horas. |
| `FEED_REFRESH_MINUTES` | `10` | Cada cuántos minutos se vuelven a leer los feeds. |

Por seguridad, `HOST` escucha solo en local. El servidor no tiene autenticación (incluido `POST /api/refresh`): si lo expones a la red, ponlo detrás de un proxy inverso con control de acceso.

### Fuentes de noticias (`config/feeds.json`)

Es una lista de fuentes. Admite RSS 2.0, RSS 1.0 y Atom:

```json
[
  { "name": "BBC Mundo", "url": "https://feeds.bbci.co.uk/mundo/rss.xml", "category": "mundo" },
  { "name": "Xataka", "url": "https://www.xataka.com/feedburner.xml", "category": "tecnologia" }
]
```

| Campo | Descripción |
| --- | --- |
| `name` | Nombre de la fuente. Aparece en rótulos, teletipo y tarjetas, y es el que cita el guion. |
| `url` | URL del feed. |
| `category` | `general`, `mundo` o `tecnologia` (por defecto, `general`). Cambia el color de la tarjeta del videowall cuando la noticia **no tiene imagen** y se envía al modelo como sección. Cualquier otro valor se pinta como `general`. |

El fichero se relee en cada actualización, así que no hace falta reiniciar: los cambios se aplican en la siguiente lectura (o al instante con `curl -X POST http://127.0.0.1:8080/api/refresh`). Las URL de los medios cambian con el tiempo; el panel `D` muestra qué feeds fallan y con qué error.

### Cómo se decide qué emitir

- Cada minuto, el servidor comprueba si toca releer los feeds (`FEED_REFRESH_MINUTES`) y rellena la cola hasta `QUEUE_SIZE`.
- Se descartan las noticias más antiguas de `MAX_STORY_AGE_HOURS` y las duplicadas (mismo enlace o titular casi idéntico en otra fuente).
- Un boletín nuevo necesita `MIN_NEW_STORIES` noticias sin cubrir (el primero tras arrancar, solo una) y usa hasta `STORIES_PER_BULLETIN`, repartidas por turnos entre fuentes y priorizando las más recientes. Las que tienen foto van primero en la escaleta.
- Si una noticia no trae imagen en el feed, el servidor intenta leer `og:image` o `twitter:image` de la página del artículo.
- Si no hay boletín nuevo, se repite uno reciente (el servidor guarda los últimos 20 emitidos).
- Si un titular contiene «última hora» (y tiene menos de 3 horas), salta el banner de **ÚLTIMA HORA**.
- La cola y el historial viven en memoria: al reiniciar el servidor se pierden. Solo persiste `data/usage.json`.
- Todos los espectadores siguen la misma secuencia de boletines; no se genera uno por espectador.

## Controles de teclado

Funcionan una vez iniciada la emisión.

| Tecla | Acción |
| --- | --- |
| `V` | Cambia el modo de voz: `tts` → `blips` → `mute` (en `mute` tampoco suenan los efectos). |
| `S` | Activa o desactiva los subtítulos. |
| `N` | Salta al siguiente segmento. |
| `F` | Pantalla completa. |
| `↑` / `↓` | Sube o baja el volumen un 10 %. |
| `D` | Abre o cierra el panel de control: cola, emitidos y noticias, proveedores (con su pausa), uso mensual en tokens por proveedor y estado de cada feed. Se actualiza cada 5 s. |

## Emitir en directo (YouTube, Twitch...)

La forma más sencilla es **OBS** con una fuente de tipo *Navegador* (Browser Source):

1. Deja el servidor en marcha (`npm start`).
2. En OBS, añade una fuente **Navegador** con la URL `http://127.0.0.1:8080/?autostart=1`.
3. Ponle **anchura 1920 y altura 1080**. Es exactamente 5 veces el lienzo de 384x216, así que cada píxel del juego ocupa 5x5 píxeles reales y todo se ve nítido.
4. Marca **«Controlar audio mediante OBS»** (*Control audio via OBS*) para que el sonido de la fuente llegue al mezclador.
5. Configura el destino (YouTube, Twitch...) como siempre en OBS.

Si tu lienzo de OBS no es de 1920x1080 y OBS tiene que redimensionar la fuente, haz clic derecho sobre ella y elige **Filtro de escalado: Punto** (*Scale Filtering: Point*) para que el escalado sea por vecino más cercano y no se desenfoque el pixel art. Con otros tamaños, el zoom entero deja bandas oscuras (por ejemplo, 1280x720 se emite a 3x, es decir, 1152x648).

> **Ojo con la voz en OBS.** La Web Speech API (`speechSynthesis`) puede no estar disponible en el navegador embebido de OBS (o no tener voces en español). En ese caso, la emisión cambia sola a las voces **«blips»**. Si quieres voces sintéticas reales, abre la emisión en una ventana normal de Chrome o Edge y captúrala con **Captura de ventana** (*Window Capture*) en OBS. Para forzar los bips y evitar sorpresas, usa `?autostart=1&voice=blips`.

Consejos para la captura de ventana:

- Abre la página como aplicación, sin barras (`chrome --app=http://127.0.0.1:8080`), o pulsa `F` para pantalla completa.
- Un navegador normal puede bloquear el audio con `?autostart=1` hasta que hagas clic una vez en la página.
- Tendrás que capturar también el audio de esa ventana (en Windows, la fuente *Captura de audio de aplicación*; en otros sistemas, un dispositivo de audio virtual).

La página se recupera sola si el servidor se reinicia: reconecta los eventos en directo cada 5 s y, mientras no hay boletín, muestra la carta de ajuste y vuelve a pedirlo cada 8 s.

## Costes aproximados

Las cifras son **estimaciones**, no mediciones.

- **Con el plan de Codex/ChatGPT**: ~0 € extra, dentro de los límites del plan (ver el aviso de arriba).
- **Con la API de pago de GPT-6 Luna**: 0,10 $ por millón de tokens de entrada y 0,50 $ por millón de salida (precios a septiembre de 2026; **verifica los precios vigentes**).
  - Un boletín de 5 noticias ronda unos 2.500 tokens de entrada y 1.500 de salida (más si el modelo razona), es decir, del orden de **0,001 $ por boletín**.
  - Con noticias frescas se genera un boletín cada pocos minutos (lo que dura en antena el anterior). Como techo, con boletines continuos las 24 horas, saldrían unos 0,4 $ al día, del orden de **10 $ al mes**. Si hay menos noticias nuevas y se repiten boletines, baja.

Para ver el gasto real, abre el panel `D` («Uso este mes») o consulta `data/usage.json`, que guarda por proveedor y día las llamadas, errores y tokens (de entrada, de salida y en caché) de los últimos ~60 días.

## Arquitectura

```text
LiveNews/
├── config/feeds.json         Fuentes RSS (nombre, url, categoría)
├── data/usage.json           Uso por proveedor y día (se genera solo; ignorado por git)
├── server/
│   ├── index.js              Servidor HTTP: API, SSE y estáticos; bucle de actualización cada 60 s
│   ├── config.js             Carga de .env y variables de entorno
│   ├── news.js               NewsDesk: lee RSS/Atom, deduplica, elige noticias, busca og:image
│   ├── images.js             Caché de imágenes de noticias (solo URLs que vienen de los feeds)
│   ├── writer.js             Prompt del guionista, extracción de JSON y normalizeBulletin
│   ├── station.js            Station: cola de boletines, historial, repeticiones y eventos en vivo
│   ├── usage.js              Contadores de llamadas y tokens (data/usage.json)
│   └── providers/
│       ├── index.js          createProviders y ProviderChain (orden, pausas)
│       ├── codexExec.js      Proveedor Codex CLI (`codex exec`)
│       ├── openaiCompat.js   Proveedor OpenAI y DeepSeek (Chat Completions)
│       └── mock.js           Proveedor sin IA
├── public/
│   ├── index.html            Lienzo, aviso (toast) y panel de control
│   ├── css/style.css         Estilos de la página y del panel
│   └── js/
│       ├── main.js           Arranque, escalado entero, eventos SSE, teclado y panel D
│       ├── player.js         El realizador: reproduce boletines, planos, rótulos y subtítulos
│       ├── studio.js         Renderer: plató, planos, tarjetas, rótulos, teletipo y banners
│       ├── anchors.js        Presentadores dibujados por código (Paco Píxel y Lola Byte)
│       ├── audio.js          AudioEngine: voz (tts, blips, mute), volumen, jingles y efectos (WebAudio)
│       ├── pixelate.js       Foto a pixel art: recorte, k-means y tramado Bayer
│       ├── palette.js        Paleta del canal (basada en ENDESGA 32)
│       └── font.js           Fuente bitmap 5x7 con acentos del español
└── test/                     Tests (node --test)
```

Flujo de datos:

```text
  Feeds RSS (config/feeds.json)
        |   cada FEED_REFRESH_MINUTES
        v
  NewsDesk ............ deduplica, filtra por antigüedad, elige noticias
        |
        v
  Station (cola) ...... buildPrompt(noticias)
        |
        v
  ProviderChain ....... codex -> openai -> deepseek -> mock
        |   texto de la respuesta
        v
  writer.extractJson + writer.normalizeBulletin   (valida y recorta)
        |
        v   boletín en cola
  GET /api/next ---> Player ---> Renderer (canvas 384x216) + AudioEngine (voz y efectos)
                       ^
  GET /api/events -----+   (SSE: ticker, breaking, status)
```

### API

| Endpoint | Descripción |
| --- | --- |
| `GET /api/next?after=<id>` | Siguiente boletín tras el indicado. Responde 200 con el boletín (con `replay: true` si es una repetición) o 202 con `{ "standby": true }` si aún no hay ninguno. |
| `GET /api/events` | Flujo SSE con los eventos `ticker` (últimos 18 titulares), `breaking` (última hora) y `status`. |
| `GET /api/status` | Estado de la emisora: cola, emitidos, noticias, feeds, proveedores y uso (hoy y mes). |
| `GET /api/config` | Configuración pública para el cliente (`{ "channel": ... }`). |
| `GET /api/img/:storyId` | Imagen de una noticia (`s` + 10 caracteres hexadecimales). Hace de proxy **solo** de imágenes que vienen de los feeds: no acepta URLs arbitrarias. Admite JPEG, PNG, WebP, GIF y AVIF de hasta 6 MB. |
| `POST /api/refresh` | Fuerza la lectura de los feeds y rellena la cola. Devuelve el estado. |

El servidor descarga las imágenes por su cuenta para que el navegador pueda pixelarlas en un canvas sin problemas de CORS.

## Veracidad y derechos

**Veracidad.** El prompt obliga al modelo a:

- usar **solo** los hechos del titular y el resumen de cada noticia, sin inventar cifras, nombres, citas, fechas ni consecuencias (si el resumen es escueto, cuenta menos);
- **citar la fuente** con naturalidad («según BBC Mundo»);
- evitar opiniones políticas y juicios sobre personas reales;
- usar un **tono sobrio** (emoción `serious` o `sad`, sin bromas) con noticias graves.

Después, `normalizeBulletin` valida la respuesta: descarta los segmentos con identificadores de noticia desconocidos o repetidos, limita las longitudes (texto, rótulo y título), limpia el formato Markdown, admite como mucho 3 segmentos de charla, garantiza una intro y una despedida y rechaza el boletín si no queda ninguna noticia válida. Son salvaguardas, no una garantía: un modelo puede malinterpretar un resumen, así que si vas a emitir públicamente conviene supervisar la emisión de vez en cuando.

**Derechos.** Los titulares y las imágenes pertenecen a sus medios. LiveNews resume y cita la fuente, pero las fotos pixeladas siguen siendo imágenes de esos medios. Antes de una emisión pública, **revisa los derechos y los términos de uso de cada fuente** (también para la lectura de sus feeds y de las páginas de artículo, de donde se obtiene `og:image` cuando el feed no trae imagen). Puedes quitar o cambiar fuentes en `config/feeds.json`. Ahora mismo no hay un interruptor para desactivar solo las imágenes de una fuente: tendrías que quitar la fuente.

## Tests

```bash
npm test
```

Los tests (con el ejecutor integrado de Node, sin dependencias extra) cubren por ahora el lector de feeds y la selección de noticias (`server/news.js`) y el prompt y el normalizador del guion (`server/writer.js`). Algunos están marcados como `todo`: documentan fallos conocidos que aún no se han corregido, y no hacen fallar la ejecución.

> En versiones recientes de Node (comprobado en la 22), `npm test` (`node --test test/`) falla con `Cannot find module '.../test'` porque trata `test/` como un archivo. Si te pasa, ejecuta directamente `node --test`.

## Ideas siguientes

- Voz generada en el servidor (Piper, Kokoro...) para tener voces reales también dentro de OBS.
- Más presentadores y más decorados.
- Sección del tiempo con datos de una API real.
- Traducciones a otros idiomas.
- Un ajuste por fuente para desactivar sus imágenes.

## Licencia

MIT, según declara `package.json`.
