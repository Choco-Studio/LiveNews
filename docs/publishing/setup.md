# Guía para el dueño: publicar GLOBIT 24 en las redes

Esta guía explica, paso a paso y sin tecnicismos, qué hay que preparar para que el canal publique clips, el directo y
textos en las redes. **Ahora mismo todo funciona en modo de prueba**: el canal prepara cada publicación, te la enseña y
la guarda, pero no sube nada a ninguna red hasta que tú lo decidas (apartado 7).

> **Lo más importante.** Las claves y contraseñas de las redes **nunca** se pegan en un chat (ni conmigo, ni con nadie),
> nunca se escriben en un documento del proyecto y nunca se envían por correo. Solo se guardan en las «variables de
> entorno» del ordenador que emite (apartado 4). Si alguna vez pegas una clave donde no debías, cámbiala en esa red
> enseguida.

## 1. Qué hace el sistema

Cada programa que emite el canal puede dar cuatro cosas:

1. **El directo** de 24 horas en YouTube.
2. **El programa entero**, cuando merece la pena (a partir del segundo mes).
3. **Clips** de sus mejores momentos: una pregunta del concurso, el tiempo, un resultado, una buena historia.
4. **Textos** sobre las noticias más importantes del día, con el titular, una línea de lo nuevo y el enlace al medio que
   la publicó.

Cada clip se hace en dos formatos: **vertical** para YouTube Shorts, TikTok e Instagram, y **horizontal** para Facebook
y X. Los dos llevan subtítulos grandes, un título al principio, la marca «AI» junto al logo y una cortinilla final que
dice que los presentadores son personajes generados por IA.

## 2. Lo que necesitas

- **Un ordenador o servidor encendido día y noche**, con buena conexión (para el directo: al menos 10 Mbit/s de subida).
  Es el mismo que ya emite el canal.
- **Una cuenta en cada red** que quieras usar (apartado 3). En el primer mes solo se usan **YouTube, TikTok e
  Instagram**.
- **Unos 15 minutos al día** para revisar y aprobar lo que el canal prepara (apartado 6).

## 3. Las cuentas, red por red

| Red | Qué cuenta necesitas | Qué hay que pedir o revisar | Cuándo |
|---|---|---|---|
| **YouTube** | Tu canal de YouTube, y un «proyecto» en Google Cloud (gratis) con la «YouTube Data API v3» activada y unas credenciales OAuth | Publica la pantalla de consentimiento en modo «Producción» (en modo «Prueba» la clave caduca a los 7 días). Si los vídeos subidos salen «privados», pide la auditoría de YouTube API Services. | Mes 1 |
| **TikTok** | Una cuenta de TikTok y una app en developers.tiktok.com con «Content Posting API» | Hasta que TikTok audite la app, lo que se sube **solo lo ves tú** (cuenta privada). Por eso, al principio, el vídeo llega a tu **bandeja de TikTok** y tú lo terminas en la app, con la etiqueta «Contenido generado por IA» activada. | Mes 1 |
| **Instagram** | Una cuenta **profesional** (Empresa o Creador) unida a una página de Facebook, y una app de Meta con el permiso `instagram_business_content_publish` | Instagram descarga el vídeo desde una dirección web pública: hace falta una carpeta pública (por ejemplo un almacenamiento en la nube) y su dirección en `PUBLIC_MEDIA_BASE_URL`. | Mes 1 |
| **Facebook** | Una página de Facebook y un «token de página» con `pages_manage_posts` | Facebook no tiene casilla de IA por API: si un clip contiene una recreación, la etiqueta se pone a mano o ese clip no va a Facebook. | Mes 2 |
| **X** | Una cuenta de desarrollador con pago por uso, y una app con permiso de lectura y escritura | Cuesta dinero: unos 0,015 $ por mensaje y **0,20 $ si lleva enlace**. Por eso X solo recibe las 3–8 noticias principales del día. | Mes 2 |
| **Threads** | Tu perfil de Threads y una app de Meta con `threads_content_publish` | — | Mes 4 |
| **Bluesky** | Tu cuenta y una **contraseña de aplicación** (Ajustes > Privacidad y seguridad > Contraseñas de aplicación) | Nada: no hay revisión. | Mes 4 |
| **Telegram** | Un canal y un bot creado con @BotFather, añadido como administrador del canal | — | Mes 4 |
| **WhatsApp** | — | No hay forma oficial de publicar en un Canal de WhatsApp. Se deja fuera a propósito. | — |

## 4. Las claves: dónde se guardan

Cada red te da unas claves cuando creas tu app. El sistema las lee de las **variables de entorno** del ordenador que
emite, y de ningún otro sitio. Quien te ayude con el servidor sabrá ponerlas en su panel o en el servicio que arranca el
canal. Nunca deben ir dentro de la carpeta del proyecto.

| Red | Variables (los nombres exactos) |
|---|---|
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`; para el directo, `YOUTUBE_STREAM_KEY` y `YOUTUBE_LIVE_VIDEO_ID` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` (y `TIKTOK_MODE=direct` solo cuando TikTok haya auditado la app) |
| Instagram | `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`, `PUBLIC_MEDIA_BASE_URL` |
| Facebook | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` |
| X | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` |
| Threads | `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` |
| Bluesky | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| El canal | `CHANNEL_LIVE_URL` (la dirección del directo, para ponerla en las descripciones) |
| Quién responde | `EDITORIAL_CONTACT` y `EDITORIAL_RESPONSIBLE`: el correo y el nombre de quien responde del canal. El módulo de cumplimiento los pone en cada descripción y no deja publicar nada sin ellos (ver `docs/publishing/compliance.md`). |

Para comprobar qué falta sin enseñar ninguna clave: la página de aprobación (apartado 6) y las pruebas del sistema solo
dicen **qué nombres faltan**, nunca su valor.

### Cuándo caducan

| Red | Caduca | Qué hacer |
|---|---|---|
| YouTube | No caduca, si la app está en «Producción» (en «Prueba», a los 7 días) | Pon la app en Producción |
| TikTok | La clave de renovación dura un año | Renuévala antes de que pase un año |
| Instagram, Threads | El token largo dura 60 días | Renuévalo cada mes y medio |
| Facebook | El token de página que sale de un token largo de usuario no caduca, salvo que cambies la contraseña o quites permisos | Si deja de funcionar, genera otro |
| X, Bluesky, Telegram | No caducan | Cámbialos si sospechas que alguien los ha visto |

## 5. Cómo trabaja el canal cada día

1. Cada programa que se emite se graba entero, en vertical y en horizontal (la grabación es exacta, siempre igual).
2. El sistema busca sus mejores momentos: una pregunta del concurso de principio a fin, el tiempo de los próximos tres
   días, un resultado, dos o tres noticias ligeras seguidas, un comentario de UNIT-8 con la noticia a la que responde.
3. Corta cada momento en frases completas (nunca a mitad de una frase ni de una cita), le pone subtítulos, el título del
   principio y la cortinilla final.
4. Escribe el texto para cada red, con el medio citado y su enlace.
5. Pasa el control de cumplimiento (la etiqueta de IA, los créditos, que no haya datos de prueba). Lo que no lo pasa se
   queda **retenido** y no se publica nunca.
6. Lo deja en la **cola**, esperando tu aprobación.

Para hacerlo a mano con un programa ya emitido:
`node tools/publish/factory.mjs --episode <programa.json> --out <carpeta>`. Los textos del día se hacen con
`node tools/publish/posts.mjs --day 2026-10-17`.

## 6. La página de aprobación (tus 15 minutos al día)

En el ordenador del canal, escribe:

    node tools/publish/approve.mjs

y abre en el navegador de ese mismo ordenador **http://127.0.0.1:8740/**. Solo se abre desde ese ordenador; nadie más
puede entrar. Para cerrarla, pulsa Ctrl+C.

En la página verás una tarjeta por publicación, con:

- el vídeo (dale al play), el título y el texto, que puedes cambiar;
- la red, el formato y la duración;
- el enlace al medio;
- si pasó el control de cumplimiento;
- la hoja de contactos, con los fotogramas del clip de un vistazo.

Los botones:

- **Aprobar**: queda listo para salir.
- **Aprobar en 3 redes**: el mismo clip suele esperar en YouTube, TikTok e Instagram. Este botón lo aprueba en todas
  de una vez (salvo en la que el control de cumplimiento lo haya retenido).
- **Rechazar**: no sale. Puedes decir por qué.
- **Guardar cambios**: si has cambiado el título o el texto. El aviso «AI-generated:» de los textos no se puede quitar.
- **Programar lo aprobado**, arriba: da a cada publicación aprobada su hora, respetando las horas de cada red, el
  espacio entre publicaciones y el máximo diario.
- **Ajustes**, arriba: elige qué redes se usan y si cada una es **Manual** (todo espera tu aprobación) o **Apagada**.
  «Muestra» y «Automático» solo existen a partir del cuarto mes.

Lo que el control de cumplimiento ha retenido no se puede aprobar: la tarjeta dice por qué, en castellano, y debajo
el mensaje original del control. Hoy el motivo más frecuente es «Copia palabras del medio»: la noticia se emitió con
frases del medio casi literales, y un clip o una publicación con esas frases no sale hasta que el canal la cuente con
sus propias palabras.

**Lo que espera se vuelve a revisar.** Antes de cada ronda de publicación, el sistema vuelve a pasar el control a todo
lo que espera (por aprobar, aprobado o programado), porque mientras espera pueden cambiar cosas:
- puede llegar una reclamación o una retirada;
- el permiso de una foto puede dejar de valer;
- puede empezar un periodo electoral.

Lo que ya no pasa queda **retenido**, y su tarjeta dice «Retenido al revisarlo otra vez antes de publicar (algo cambió
mientras esperaba)» y el motivo en castellano. Si el problema se resuelve, vuelve a «Por aprobar» y lo decides tú otra
vez: nunca sale solo. Se puede lanzar a mano con `node tools/publish/recheck.mjs`, que no publica nada.

**Fotos.** Un clip que enseña una foto sin permiso de uso confirmado no llega nunca a la página: el sistema ni lo
prepara para publicar. Tampoco nada de una prueba privada con fotos de los medios (`PICTURE_RIGHTS=preview`). En los
clips verticales, cada foto lleva su crédito tal como lo pide su licencia («FILE · autor · licencia · PIXELATED»).

**Las tarjetas de TikTok** tienen un recuadro más, porque TikTok exige que elijas tú, publicación por publicación:

- **quién puede verlo**: Todo el mundo, Amigos, Seguidores o Solo yo. No viene ninguna marcada: TikTok no permite un
  valor por defecto. Mientras TikTok no haya auditado la app, todo sale como «Solo yo», elijas lo que elijas;
- si se permiten **comentarios**, **dúos** y **stitch** (vienen sin marcar);
- la **confirmación de uso de música** de TikTok (Music Usage Confirmation), que tienes que aceptar tú.

Al principio (modo bandeja) el vídeo llega a tu bandeja de TikTok y allí eliges la privacidad, así que el recuadro solo
guarda tus preferencias. Cuando TikTok haya auditado la app y pongas `TIKTOK_MODE=direct`, el botón **Aprobar** de una
tarjeta de TikTok no se activa hasta que hayas elegido quién puede verlo y aceptado la confirmación; «Aprobar en 3
redes» deja esa tarjeta esperando hasta entonces. Contenido de marca: no (el canal no publica contenido pagado). La
etiqueta «Contenido generado por IA» va siempre puesta.

## 7. Publicar de verdad: los cinco interruptores

Nada sale del ordenador mientras no estén encendidos **los cinco**, a propósito:

1. La variable `PUBLISH_LIVE=1` en el ordenador del canal.
2. En `data/publish/settings.json`, `"dryRun": false`.
3. En ese mismo archivo, la red encendida: por ejemplo `"live": { "youtube": true }`.
4. El módulo de cumplimiento definitivo instalado (no el provisional), con su firma C2PA preparada: cada vídeo sale
   firmado como hecho con IA, y uno que no se puede firmar no sale. La página indica arriba si el módulo todavía es el
   provisional.
5. Las claves de esa red puestas (apartado 4).

Y además, cada publicación tiene que estar **aprobada por ti**. Si falta cualquiera de estas cosas, el sistema hace la
prueba en lugar de publicar, y apunta qué faltaba en `data/publish/outbox.jsonl`. La publicación diaria se lanza con
`node tools/publish/run.mjs`, que primero vuelve a revisar todo lo que espera (apartado 6).

**Consejo:** enciende una sola red al principio (YouTube), mira una semana cómo va y luego añade la siguiente.

## 8. El directo de 24 horas

El vigilante del directo arranca la emisión, comprueba cada pocos segundos que sigue enviando imagen y la reinicia
sola si se cae o se congela. Además pone en el título del directo el programa que está en antena.

- **Prueba primero** (graba en archivos, no emite):

      node tools/publish/live.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=tts" --out /tmp/prueba-{n}.flv --for 300

- **Emitir de verdad**, solo cuando la prueba vaya bien, con la clave de emisión de YouTube en la variable
  `YOUTUBE_STREAM_KEY`:

      PUBLISH_LIVE=1 node tools/publish/live.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=tts" --rtmp rtmp://a.rtmp.youtube.com/live2 --key-env YOUTUBE_STREAM_KEY

Su estado (si emite, cuántas veces se ha reiniciado, el título puesto) se guarda en `data/publish/live-status.json`.

**Emisión pregrabada (tu decisión del 17 de octubre).** El canal también puede preparar cada programa con una hora de
antelación y emitir lo ya hecho: el ordenador trabaja con calma, los programas se comprueban antes de salir, y la imagen
y el sonido van siempre sincronizados. Las noticias llegan con una hora de retraso. Como no es en directo, en pantalla
y en el título del directo nunca pone «LIVE» (pone «24/7»). Lo que no pasa el control no se emite: lo verás en la página
de aprobación, en la pestaña «Retenidos del aire». Si algún momento no hay nada preparado, sale una cortinilla
(«BACK SHORTLY»), nunca negro. Se arranca con:

    PORT=8080 node tools/playout/run.mjs --out data/prueba/air-%03d.ts --segment 3600

(prueba en archivos; para emitir de verdad hace falta lo mismo que arriba: `PUBLISH_LIVE=1` y la clave). Los detalles,
para quien te ayude: `docs/publishing/playout.md`.

## 9. Si algo va mal

- **Un clip tiene un error** (una palabra mal en los subtítulos, un corte raro): recházalo. Dime qué clip era y qué
  fallaba, y lo corrijo.
- **Una red dice que la clave no vale**: mira la tabla de caducidad (apartado 4) y genera una nueva en esa red. No me la
  pegues: ponla tú en las variables de entorno.
- **Alguien pide que se retire algo**: retíralo en la red y apúntalo en el registro de cumplimiento (lo explica
  `docs/publishing/compliance.md`).
- **`run.mjs` dice «another publisher is running»**: ya hay una ronda de publicación en marcha, y solo puede haber
  una a la vez. Espera a que termine. Si el ordenador se apagó a medias, no hace falta hacer nada: el sistema ve que
  aquella ronda ya no existe y sigue.
- **El directo se ha parado**: mira `data/publish/live-status.json`. Si pone «cooling», el vigilante se ha dado un
  descanso de 10 minutos tras muchos reinicios: algo falla en el canal y hay que mirarlo.
