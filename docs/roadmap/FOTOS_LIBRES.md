# Imágenes libres que encajan — diseño (borrador para el dueño, 7 oct)

Objetivo: que cada noticia tenga en antena una imagen **real, pertinente y legalmente publicable en YouTube**
(monetizado), sin fotos de agencia, y que la falta de foto del suceso deje de notarse. Fase 2: el mismo sistema
para **vídeo de fondo** de los corresponsales, de modo que parezcan estar en el lugar.

Este documento se critica a sí mismo (§9) con el método de QUALITY_LOOP.md: no se da por bueno por debajo de 9,7,
y una nota de diseño en papel solo vale lo que luego confirme el banco de pruebas (§7).

---

## 1. Qué hay hoy y por qué no basta

| Pieza | Qué hace | Problema para YouTube |
|---|---|---|
| `server/pictures.js` | foto del feed y de la página del artículo (og:image, JSON-LD…) | casi siempre es de Reuters/AP/Getty o del propio medio: **no publicable** |
| `server/imagesearch.js` | foto de ARCHIVO del lugar en Commons (o Google/Bing con filtro CC), crédito «FILE · autor · licencia» | correcta legalmente, pero solo entra cuando no hay foto del medio, busca solo por lugar y no comprueba que la foto encaje |
| `server/footage.js` | vídeo libre del lugar en Commons, pixelado en el cliente, para los corresponsales; nunca en noticias graves | Commons tiene poco vídeo de calle y limita a pocas peticiones por minuto |

La idea de fondo es buena (archivo del lugar, licencias libres, crédito en pantalla). Lo que falta: **más fuentes,
entender de qué va la noticia, verificar con los ojos que la imagen encaja y una biblioteca que mejore sola**.

---

## 2. La idea que quita importancia al problema

Las fotos de agencia valen por mostrar **el suceso**. Este sistema renuncia a eso, salvo donde existe imagen libre
del suceso, y lo compensa con cuatro cosas:

1. **La mayoría de las noticias tratan de entidades conocidas, no de instantes**: un país, una ciudad, un
   presidente, una empresa, una institución, un edificio, un fenómeno. Wikidata identifica cada entidad sin
   ambigüedad (Q-ID) y apunta a su imagen canónica en Commons (propiedad P18), a su categoría de Commons (P373) y
   a sus coordenadas (P625). Eso es imagen libre, de calidad y que **sí es lo que la noticia nombra**.
2. **Hay imagen libre y legal del suceso en un caso importante: la vista desde el espacio.** Huracanes, incendios,
   inundaciones, volcanes, deshielo, humo: NASA (GIBS/Worldview, imágenes de dominio público) y Copernicus Sentinel
   (uso libre, también comercial, con la atribución «contiene datos modificados de Copernicus Sentinel») publican
   la imagen **de ese día y de ese sitio**. Para los desastres, que es donde más se echaría de menos la foto de
   agencia, es la mejor imagen posible.
3. **Hay organismos que publican fotos de dominio público o con CC BY**: el Gobierno federal de EE. UU. (Casa
   Blanca, NASA, NOAA, USGS, FEMA, DVIDS), el Parlamento Europeo y el Consejo de la UE (Flickr, CC BY),
   Kremlin.ru (CC BY 4.0), varias presidencias y ministerios. Para política e instituciones dan la foto **oficial**
   del acto.
4. **La gramática visual del canal hace que el archivo parezca intencionado**: si no hay imagen libre que encaje, la
   noticia no lleva una foto floja. Lleva el mapa de localización, la tarjeta de cifras o la cita, que el canal ya
   tiene y que en los episodios de prueba quedaban bien. Nunca un hueco, nunca una foto que no corresponde.

Con eso, la pregunta deja de ser «¿tenemos la foto del suceso?» y pasa a ser «¿qué es lo más verdadero y bonito
que podemos enseñar?». Esa pregunta siempre tiene respuesta.

---

## 3. Arquitectura (8 etapas)

```
noticia ─► 1 FICHA VISUAL ─► 2 ENTIDADES ─► 3 CANDIDATAS ─► 4 PUERTA LEGAL ─► 5 PROCEDENCIA
                                                                                   │
              8 CRÉDITOS / REGISTRO ◄─ 7 VERIFICACIÓN VISUAL (luna) ◄─ 6 RANKING ◄──┘
                       │
                       └─► biblioteca propia (aprende) ─► vuelve a 3 como fuente nº 1
```

### 3.1 Ficha visual (sin llamada extra)

Luna ya escribe el programa; se le pide además, en el mismo JSON, una ficha por noticia:

```json
{ "visual": {
    "subjects": [ { "name": "Panama Canal", "kind": "structure", "role": "main" },
                  { "name": "Panama", "kind": "country", "role": "place" } ],
    "event": { "kind": "reopening", "visible_from_space": false },
    "show": "the canal's locks or ships in transit",
    "never": ["a different canal", "a storm", "people's faces"],
    "tone": "neutral",            // neutral | grave | light
    "date": "2026-10-07" } }
```

`kind`: country, city, place, structure, person, organisation, product, phenomenon, species, artwork… `never`
recoge lo que engañaría (otra inundación, otra persona, una foto alegre bajo una tragedia).

### 3.2 Entidades (Wikidata, sin clave)

- Búsqueda `wbsearchentities` por nombre, desambiguada con el contexto: tipo esperado (P31), país (P17) y
  descripción frente al texto de la noticia. Si la duda persiste, la entidad se descarta en vez de adivinar.
- De cada entidad se guarda: Q-ID, P18 (imagen), P373 (categoría Commons), P625 (coordenadas), P242 (mapa),
  P154 (logo, solo para noticias de la propia empresa), P569/P570 (fechas, para descartar retratos de otra época).
- Caché por Q-ID durante 30 días (las entidades cambian poco).

### 3.3 Candidatas: fuentes por niveles

| Nivel | Fuente | Para qué | Licencia | Clave | Límite / nota |
|---|---|---|---|---|---|
| 0 | **Biblioteca propia** (§3.8) | entidades ya resueltas | registrada | — | instantáneo |
| 1 | **Wikidata P18 + categoría Commons** | personas públicas, lugares, edificios, empresas | CC0/PD/BY/BY-SA | no | Commons limita: peticiones agrupadas y espaciadas |
| 2 | **Satélite del día**: NASA GIBS (WMS), Copernicus Sentinel Hub / Copernicus Browser | huracanes, incendios, inundaciones, volcanes, hielo | PD / libre con atribución | GIBS no; Sentinel Hub sí (gratuita) | solo sucesos grandes; nubes |
| 3 | **Organismos oficiales**: NASA Images API, NOAA, USGS, DVIDS, Flickr de instituciones (licencia filtrada) | política, defensa, ciencia, espacio | PD / CC BY | NASA no; DVIDS y Flickr sí | Flickr: filtro `license=4,5,7,8,9,10` (BY, BY-SA, sin copyright conocido, Gob. EE. UU., CC0, PDM) |
| 4 | **Openverse** (índice de ~800 M obras CC de Flickr, Commons y otras) | todo lo demás | filtro `license_type=commercial,modification` | opcional | anónimo con límite bajo; registrar la app |
| 5 | **Stock libre**: Pexels, Pixabay, Unsplash | escenas genéricas (una central solar, un tren de alta velocidad, una consulta médica) | licencias propias (uso comercial permitido, sin atribución obligatoria) | sí (gratis) | sin cesión de derechos de imagen: **nunca primeros planos de personas** |
| 6 | **Respaldo gráfico** | cuando nada de lo anterior encaja | propio | — | mapa, cifras, cita: siempre disponible |

Cada noticia busca en paralelo con un presupuesto de tiempo (p. ej., 25 s) y de peticiones por fuente.

### 3.4 Puerta legal (reglas duras, con perfiles)

- **Perfil `youtube`** (para lo que se publica): solo CC0, PDM, dominio público del Gobierno de EE. UU., CC BY y
  licencias de stock con uso comercial. **CC BY-SA** solo si el perfil lo permite (ver §9, ronda 2). Fuera: NC
  (no comercial), ND (sin derivadas, porque pixelar ya es derivar), «todos los derechos reservados», sin licencia
  declarada, marcas de agua.
- **Perfil `emision`** (directo privado): igual, más las fotos del medio si el dueño lo decide.
- Una candidata sin licencia legible por máquina **no entra**, aunque parezca libre.

### 3.5 Procedencia (contra el «libre» falso)

Commons y Flickr tienen subidas que no son de quien las sube. Señales de riesgo que restan o descartan:
plantillas de borrado o «copyvio» abiertas, subida de hace menos de 30 días por una cuenta nueva, resolución de
miniatura con un EXIF de agencia (Reuters/AP/AFP/Getty en `Artist` o `Copyright`), texto «©» o nombre de agencia en
la descripción. Suman: revisión de licencia de Flickr superada, archivo antiguo y estable, autor con historial,
fuente institucional. **Las sospechosas no entran.**

### 3.6 Ranking (barato, sin IA)

Puntúa cada candidata con:
- **Pertinencia**: coincidencia del título, la descripción y las categorías con la ficha (sujeto principal >
  lugar); distancia en km entre sus coordenadas y las del lugar; P18 directo de la entidad = máxima.
- **Época**: para personas, retrato posterior a hace 5 años; para edificios, sin años de reconstrucción por medio.
- **Tono**: en noticias graves, nada festivo ni turístico (palabras como «fiesta» o «playa» en los metadatos
  descartan).
- **Calidad en pixel art**: se pixela la candidata a 104×62 y 192×108 con el pipeline real del cliente y se
  mide: contraste, sujeto grande (saliencia central), poca textura fina (que en pixel art se vuelve ruido),
  horizonte legible. **Una foto preciosa que pixelada es una mancha no sirve**, y solo así se sabe.
- **Técnica**: ancho ≥ 1000 px, proporción cercana a 16:9 o recortable, sin texto grande ni logotipos ajenos.

Pasan las 4 mejores por noticia.

### 3.7 Verificación visual con luna (1 llamada por programa)

Las 4 finalistas de cada noticia se montan en **una hoja de contactos numerada**, ya pixeladas como saldrían en
antena, con la ficha visual al lado. Una sola llamada a luna por programa (Codex admite adjuntar imágenes, pendiente
de confirmar) responde por noticia: la elegida o «ninguna», con puntuación 0-10 de encaje y motivo, y marca
cualquier engaño (otro suceso, otra persona, tono equivocado), cara identificable de un particular, menor, texto o
marca de agua. Si luna no puede (cuota, error), se usa la nº 1 del ranking solo si su pertinencia es alta; si no,
el respaldo gráfico.

### 3.8 Biblioteca propia (el sistema aprende)

Cada imagen aprobada se guarda con su Q-ID, su ficha, su licencia completa (título, autor, fuente, licencia,
enlace: TASL), su versión pixelada y su nota. La próxima noticia sobre la misma entidad empieza por ahí. Con las
semanas, los temas recurrentes (capitales, jefes de Estado, bancos centrales, grandes empresas, agencias
espaciales) quedan cubiertos al instante y sin red. Un panel opcional deja al dueño aprobar o vetar imágenes («no
volver a usar»).

### 3.9 Créditos y cumplimiento

- En pantalla, como ahora: «FILE · autor · licencia» (o «NASA», «Copernicus Sentinel»…).
- **Descripción de YouTube generada**: por noticia, la imagen, su autor, licencia con enlace, fuente y «modificada:
  pixelada y recortada». Cumple la atribución de CC BY y las exigencias de Copernicus.
- **Registro por vídeo publicado** (JSON en `data/published/`): qué imagen salió, dónde, con qué licencia y la
  captura de la página de licencia de ese día. Si llega una reclamación, en minutos se sabe qué se usó y con qué
  derecho, y se puede sustituir y resubir.

---

## 4. Fase 2: vídeo para los corresponsales («que parezca que están allí»)

Se amplía `footage.js` con la misma arquitectura (ficha → entidades → candidatas → puerta → ranking →
verificación → biblioteca):

- **Fuentes**: Commons (como ahora); **Pexels Videos y Pixabay Videos** (mucho metraje de calles, puertos,
  skylines; uso comercial permitido); NASA, ESA y DVIDS para ciencia y defensa; satélite animado de GIBS (bucles
  de días) para los grandes sucesos.
- **Qué es un buen fondo**: plano fijo o con movimiento lento; 10 s o más; nada de primeros planos de caras;
  ningún logotipo dominante; ningún suceso filmado en otro sitio; **hora y clima coherentes** con la noticia y con
  la hora local del lugar (de noche en Nairobi, metraje nocturno; con lluvia, nada de sol radiante); en noticias
  graves, solo planos generales neutros o el respaldo del plató, como ahora.
- **Procesado**: estabilizar, bucle sin salto (fundido cruzado entre el final y el principio), detección local de
  caras en fotogramas clave (modelo pequeño en Python, que ya está en la máquina) para descartar o desenfocar,
  pixelado a la paleta del canal a 192×108, como ahora.
- **Composición** («está allí»): el fondo levemente desenfocado (profundidad de campo), la luz de contorno del
  corresponsal teñida con el color medio del fondo, un leve balanceo de cámara en mano compartido por fondo y
  corresponsal, y el rótulo de lugar. Opcional: ambiente sonoro libre (Freesound CC0) muy bajo.
- **Honestidad**: rótulo «FILE FOOTAGE» visible mientras dura el fondo (ver §9, ronda 3).

---

## 5. Coste y tiempo

- **Llamadas a luna**: la ficha visual va en la llamada de escritura (coste marginal); la verificación es **1
  llamada por programa** con una imagen (hoja de contactos). Unas 20-25 llamadas más al día en 24/7.
- **Tiempo**: la búsqueda arranca con las entidades del titular **en paralelo** con la escritura (no espera a la
  ficha) y la ficha solo reordena. Objetivo: +30 s como máximo sobre los ~4 min actuales de producción.
- **Red**: Commons es el cuello de botella (429 con pocas peticiones por minuto); se agrupa (una consulta trae la
  categoría con las URL e info de licencia) y se cachea todo. Con claves gratuitas de Flickr, Pexels, Pixabay y
  Openverse sobra capacidad.

---

## 6. Plan por fases

| Fase | Contenido | Hecho cuando |
|---|---|---|
| 0 | Confirmar que `codex exec` acepta imágenes; banco de 200 noticias reales de los feeds (§7) | luna responde sobre una hoja de contactos |
| 1 | Ficha visual + Wikidata + puerta legal + procedencia + perfil `youtube` + respaldo gráfico | 0 imágenes no libres en el banco |
| 2 | Fuentes 2-5 (satélite, oficiales, Openverse, stock) + ranking con prueba pixelada | cobertura y encaje medidos |
| 3 | Verificación visual con luna + biblioteca + créditos para YouTube + registro | objetivos de §7 cumplidos |
| 4 | Vídeo de corresponsales (§4) | banco de 50 conexiones |
| 5 | Panel del dueño para aprobar/vetar y métricas diarias | — |

---

## 7. Cómo se mide (lo que de verdad decide el 9,7)

**Banco**: 200 noticias reales de los feeds, de todas las secciones y con un 25 % de graves, más 50 conexiones de
corresponsal. Para cada noticia, el sistema elige imagen (o respaldo) y se juzga con ojos humanos (el dueño, sobre
una muestra) y con un juez separado (luna con otras instrucciones, sobre todo el banco).

| Métrica | Objetivo |
|---|---|
| Imágenes que no son libres o cuya procedencia falla en auditoría | **0** |
| Imágenes engañosas (otro suceso, otra persona, tono equivocado) | **0** |
| Encaje «claramente relacionada y buena en pantalla» (nota ≥ 8) entre las que salen | ≥ 90 % |
| Noticias con imagen libre real (resto con respaldo gráfico digno) | ≥ 70 % (≥ 85 % con biblioteca a 4 semanas) |
| Fotos que pixeladas no se leen | ≤ 3 % |
| Tiempo añadido a la producción | ≤ 30 s |
| Llamadas extra a luna | ≤ 1 por programa |

---

## 8. Decisiones del dueño

1. **Personas**: hoy nunca se buscan fotos de personas. Propuesta: permitir solo el **retrato canónico de figuras
   públicas** (Wikidata P18, o foto oficial del organismo), con Q-ID inequívoco y retrato reciente; nunca
   particulares, víctimas ni menores; nunca junto a una acusación sin la palabra «presunto» en la noticia.
2. **CC BY-SA**: incluirlo (mucha más cobertura en Commons, con aviso en la descripción) o dejarlo fuera (más
   simple y más seguro).
3. **Fotos del medio en la emisión privada**: mantenerlas o pasar ya todo al perfil libre.
4. **Claves gratuitas**: Flickr, Pexels, Pixabay, Openverse y Sentinel Hub (todas gratis; hay que crearlas con tu
   cuenta).

---

## 8b. Decisiones tomadas (7 oct, el dueño delegó: «escoge lo mejor»)

1. **Retratos**: sí, solo el P18 de Wikidata de una figura pública (cargo en la descripción y ≥ 10 Wikipedias),
   confirmada por las palabras de la noticia o el *hint* del brief; nunca en una noticia que la acuse de algo.
2. **CC BY-SA**: sí en `PICTURES=free`; `PICTURES=free-strict` lo deja fuera.
3. **Fotos del medio**: se mantienen por defecto (`PICTURES=outlet`). El modo libre se activa a mano.
4. **Claves**: se piden al llegar a la fase 2.

---

## 9. Crítica dura (rondas)

Panel: un abogado de propiedad intelectual de una cadena, un editor gráfico de agencia y un espectador
desconfiado. Por ronda, al menos 10 defectos; la nota de la ronda es la de la peor categoría.

### Ronda 1: primer borrador (solo Commons + Openverse + stock, ranking por texto)

1. Sin entender la noticia, buscar por palabras devuelve fotos de otra cosa («Apple» → manzanas).
2. Sin ojos, una foto con buenos metadatos puede ser otra persona, otro puente u otro año.
3. Para desastres, una foto de archivo del lugar soleado es engañosa: no hay imagen del suceso.
4. Commons y Flickr tienen subidas que no son libres de verdad: la etiqueta de licencia miente a veces.
5. El stock (Pexels/Unsplash) no tiene derechos de imagen de las personas que salen.
6. CC BY-SA: la versión pixelada es una obra derivada que hereda la licencia; sin aviso, es incumplimiento.
7. CC ND prohíbe modificar, y pixelar es modificar: el primer borrador lo dejaba pasar.
8. Fotos bonitas que pixeladas son ruido.
9. Commons corta con pocas peticiones por minuto: el sistema se quedaría sin fotos en hora punta.
10. Si llega una reclamación no hay forma de saber qué se usó.
11. Retratos de hace 20 años de un político en activo.
12. Una foto alegre de la ciudad bajo una noticia trágica.

Notas: legal 6 · pertinencia 5 · calidad en pantalla 6 · cobertura 6 · robustez 5 · coste 8 · evolución 6.
**Ronda: 5.**

**Cambios**: ficha visual de luna (1); Wikidata con Q-ID y desambiguación (1, 2, 11); verificación visual en hoja
de contactos (2, 12); satélite del día para desastres (3); procedencia (4); stock solo sin primeros planos (5);
puerta legal con ND fuera (7); prueba pixelada en el ranking (8); caché y agrupado de peticiones (9); registro por
vídeo (10); tono y época en el ranking (11, 12).

### Ronda 2

1. **CC BY-SA sigue siendo ambiguo**: si la imagen pixelada es derivada, ¿qué parte del vídeo queda bajo BY-SA?
   Corrección: la obligación cae sobre la imagen adaptada, no sobre todo el vídeo; se cumple declarando en la
   descripción esa imagen adaptada bajo BY-SA con enlace. Se deja como decisión del dueño (§8.2), con «fuera» como
   opción segura.
2. **Verificar con luna cada noticia por separado son 14 llamadas por programa.** Corrección: una hoja de contactos
   por programa = 1 llamada.
3. **La verificación puede alucinar** («sí, es el canal de Panamá»). Corrección: la elección final exige además
   pertinencia alta en el ranking (metadatos); luna puede vetar, pero no salvar sola una candidata floja.
4. **Retrasa la producción**: la búsqueda empezaba tras la ficha. Corrección: búsqueda en paralelo con la
   escritura, con las entidades del titular.
5. **El satélite tiene nubes o una resolución que no dice nada.** Corrección: GIBS y Sentinel dan cobertura de nubes;
   la imagen pasa por la misma prueba pixelada y por la verificación; si no se lee, el mapa.
6. **Las fotos oficiales son propaganda** (el gobierno elige su mejor foto). Corrección: crédito explícito de la
   institución en pantalla («Foto: Casa Blanca»), nunca como única imagen de una noticia que critica a esa
   institución (regla en la ficha: `never`).
7. **Logotipos**: P154 en una noticia negativa de la empresa sugiere aval. Corrección: logotipo solo como apoyo
   neutral y nunca en noticias graves sobre la empresa.
8. **Las caras de particulares en Commons/Openverse** (manifestaciones, calle). Corrección: la verificación las
   marca; con particulares identificables, descartada.
9. **Coste de mantenimiento: 7 fuentes = 7 cosas que se rompen.** Corrección: cada fuente es un adaptador con
   test de contrato y una fuente rota se salta sola (como la cadena de proveedores de IA).
10. **Sin medir, todo esto es opinión.** Corrección: banco de §7 antes de dar nada por bueno.

Notas: legal 8,5 · pertinencia 8 · calidad 8 · cobertura 7,5 · robustez 8 · coste 9 · evolución 8. **Ronda: 7,5.**

### Ronda 3

1. **Cobertura de última hora**: una noticia nueva sobre un sitio pequeño no tiene nada libre. Corrección
   aceptada como límite: respaldo gráfico digno, y medir que no pase de un 30 %. Para que el respaldo no sea
   repetitivo: mapa con relieve y ubicación animada, tarjeta de cifra o cita, según la noticia.
2. **El vídeo «está allí» puede engañar al espectador**: hace creer que hay alguien en el lugar. Es el riesgo ético
   más serio del diseño. Corrección: rótulo «FILE FOOTAGE» mientras dura el fondo, el corresponsal presentado como
   «desde nuestra mesa de…» cuando no hay metraje del día, y nada de fondos en noticias graves (ya era regla).
3. **Hora y clima del vídeo**: mostrar sol en una ciudad donde es de noche delata el montaje. Corrección: hora
   local del lugar (P625 + huso) y clima actual (Open-Meteo, ya integrado en el canal) en el ranking del vídeo.
4. **Stock genérico repetido**: la misma central solar en cinco noticias. Corrección: memoria de uso; una imagen no
   se repite en 7 días salvo que sea la P18 de la entidad.
5. **Detección de caras local** puede fallar con caras pequeñas. Corrección: preferir planos generales por la
   descripción del clip, más la verificación de luna sobre fotogramas clave.
6. **La biblioteca puede fijar errores**: una mala elección aprobada se repite. Corrección: veto del dueño y
   caducidad de las aprobaciones automáticas a los 60 días.
7. **Openverse anónimo** tiene un límite bajo. Corrección: registrar la aplicación (gratis).
8. **Copernicus y NASA** piden la atribución exacta. Corrección: cadenas de crédito fijas por fuente, con test.
9. **Retirada**: si una imagen resulta no ser libre, hay que cambiarla en los vídeos ya subidos. Corrección: el
   registro permite volver a montar el episodio con otra imagen; el proceso queda escrito.
10. **El 9,7 de diseño no garantiza el 9,7 en pantalla.** Corrección: el banco de §7 es el que lo decide.

Notas: legal 9,5 · pertinencia 9 · calidad 9 · cobertura 8,5 · robustez 9 · coste 9 · evolución 9.
**Ronda: 8,5.**

### Dónde se queda y qué falta para el 9,7

La categoría más baja es la **cobertura**: cuántas noticias tienen una imagen libre real y buena. Eso no lo resuelve
ningún diseño en papel; depende de lo que haya libre en el mundo y de lo bien que lo encontremos. El diseño hace
tres cosas para subirla con el tiempo: la biblioteca que crece, el satélite para los desastres y el respaldo
gráfico para que lo que falta no se note. El 9,7 se puede alcanzar en **legal, pertinencia y calidad** (objetivos 0 %
y ≥ 90 % de §7) y se mide en la fase 3. En cobertura, el techo realista a 4 semanas es ~85 %, y ahí la nota depende
de que el respaldo gráfico sea tan bueno que el espectador no eche nada de menos.

---

## 10. Fase 0-1 hecha (7 oct): código y banco

**Código** (`server/freepics/`, todo con tests: `test/freepics-*.test.js`):

| Módulo | Qué hace |
|---|---|
| `licence.js` | lectura estricta de la licencia (lista blanca) y perfiles `youtube` / `youtube-strict` / `emision`. Corrigió un fallo real: el patrón viejo de `imagesearch.js` y `footage.js` dejaba pasar **CC BY-NC y CC BY-ND** |
| `wikidata.js` | nombre → un único ítem, o ninguno: tipo, contexto, margen; nunca un homónimo («Trump» → «trumpeter», «Meloni» → pintor del s. XV, «Mistral» → buque) |
| `commons.js` | detalles de archivos en lote y búsqueda en categoría, con cola, pausa y reintento ante 429 |
| `provenance.js` | blanqueo de licencias: agencias en autor/crédito, plantillas de borrado, «©» sin licencia libre, subidas recientes sin revisión |
| `subjects.js`, `brief.js` | de qué trata la noticia: el brief visual de luna (en el mismo JSON del guion) o, sin brief, los nombres del titular; un sujeto que la noticia no nombra se descarta |
| `desk.js` | candidatas (P18 de la entidad, búsqueda en su categoría, lugar), puertas y ranking |

**En el canal**: `PICTURES=outlet` (por defecto, como siempre) · `free` · `free-strict`. En modo libre, `news.js`
solo deja en antena imágenes del escritorio libre (también en `/api/img`, aunque una recarga de feeds preste otra),
el escritor añade el brief `visual` y el productor vuelve a buscar con él tras escribir. Los retratos llevan
`imageFocus` y el cliente recorta alrededor de la cara (`pixelate.js`). Ninguna foto se repite en un programa.

**Banco** (`tools/pictures/`: `build-bench.mjs`, `briefs.mjs`, `run-bench.mjs`, `sheet.mjs`): 200 noticias reales
(50 graves), briefs de gpt-6-luna (10 llamadas, ~20 s cada una), auditoría de licencia y procedencia releyendo
Commons sin caché, y hoja de contactos con cada imagen pixelada como sale en antena. La revisión de encaje es a ojo,
imagen por imagen, con el panel del §9.

| Ronda | Cobertura | No libres (auditoría) | Encaje (a ojo) | Defectos que la siguiente corrigió |
|---|---|---|---|---|
| sin brief | 38 % | 0 | — | base de comparación |
| 1 | 61,5 % | 0 | ~82 % (22 malas de 123) | búsquedas en categoría devuelven personas (un sindicato bajo «Amazon», niños bajo «School», la selección inglesa bajo «England»); imágenes de guerra y daños; fotos de archivo de 1917; la reserva del nomenclátor elige un país del resumen («USA» bajo Reform UK); playa bajo noticia política; capturas de pantalla |
| 2 | 45 % | 0 | ~93 % (6 de 90) | concepto genérico («School») con búsqueda en categoría; gráfico bajo «Google»; puesta de sol bajo «la devastación de Gaza» |
| 3 | 45 % | 0 | ~96 % (3 de 90, con causa) | el nombre del lugar contaba como prueba de vista («Gaza City»); un PNG buscado era una captura; «structure» sin coordenadas |
| 4 | 43,5 % | 0 | ~98 % (1 engañosa de 87: un puerto de Gaza al atardecer bajo «la devastación de Gaza»; 1 discutible: París al atardecer bajo «brutalidad policial», tono neutral según luna) | la engañosa tenía marca de agua: regla nueva (Commons las etiqueta). El tono de una imagen sin descripción solo se ve mirándola: verificación visual de la fase 3 |

**Nota de la ronda 4 (panel del §9, la peor categoría manda):** legal 9,5 (0 no libres en 4 auditorías, procedencia
estricta; falta el registro por vídeo, fase 3) · pertinencia 9,5 (~98 %, 0 engañosas tras la regla de marcas de
agua) · calidad en pantalla 8,5 (sin prueba de legibilidad pixelada todavía: algunas aéreas se leen como ruido) ·
**cobertura 6** (43,5 % frente al 70 % objetivo) · robustez 9 · coste 9 (0 llamadas extra: el brief va en la del
guion; mediana 3,1 s por noticia, 3 en paralelo) · evolución 8. **Ronda: 6.** La precisión ya está; lo que falta
es cobertura, y sale de las fuentes de la fase 2, no de relajar puertas.

Tests de regresión con cada caso real del banco (`freepics-desk.test.js`, rondas 1-3).

**Por qué la cobertura es del 45 % y no del 70 %**: de las 110 sin imagen, 51 no tienen ninguna entidad con imagen
en Wikidata (fenómenos, productos, organizaciones sin sede fotografiada) y 9 no tienen sujeto que fotografiar. Eso
no se arregla relajando puertas (cada relajación del banco metió imágenes engañosas), sino con las fuentes de la
fase 2: NASA/NOAA/ESA (ciencia y espacio), Openverse y stock libre (productos, escenas genéricas sin personas),
satélite del día (desastres) y la biblioteca que aprende.

---

## 11. Fase 2 en marcha (8 oct): Pixabay y NASA

**Claves**: Pexels tiene la emisión de claves nuevas en pausa y Flickr solo las da a cuentas PRO (comprobado en sus
páginas el 8 oct); el dueño consiguió la de **Pixabay** (`PIXABAY_API_KEY`). La biblioteca de **NASA** no necesita
clave. Openverse y Copernicus quedan pendientes (el registro de Openverse es una orden `curl` que hace el dueño).

**Código** (`server/freepics/stock.js`, tests en `test/freepics-stock.test.js`):
- Pixabay: nunca una imagen generada por IA (`isAiGenerated`) ni de baja calidad; caché de 24 h, como piden sus condiciones.
- NASA: solo con crédito que diga NASA/JPL (la biblioteca guarda imágenes de socios que no son de dominio público: una de
  «ESA/ATG medialab» pasó en la ronda 5), nunca una ilustración ni un *artist's concept*, y solo en noticias del espacio.
- El brief de luna tiene un campo nuevo, **`stock`**: 2-3 palabras genéricas, sin nombres, o `null` cuando una foto
  genérica engañaría. La auditoría (`tools/pictures/audit.mjs`) relee cada imagen en su propia fuente.

| Ronda | Cobertura | No libres | Encaje (a ojo) | Defectos que la siguiente corrigió |
|---|---|---|---|---|
| 5 | 62 % | 0 (124 releídas) | ~80 % en stock: la mitad mal | la búsqueda de stock salía de `show` (la foto real): el Parlamento de **Budapest** bajo el presupuesto de Guernsey, el Shard de Londres bajo un consulado en Jerusalén, piedras apiladas bajo un remolque «Pebble», una textura bajo el portátil «Surface»; NASA: un Titán dibujado por ESA bajo leones de zoo |
| 6 | 52,5 % | 0 | ~98 % (2 engañosas de 105) | un **león marino** bajo «leones de zoo» (en «sea lion» el núcleo es otro animal); un yardang del desierto terrestre bajo una noticia de Curiosity en **Marte**; stock etiquetado con un lugar (Varsovia) bajo una noticia de la NASA |

Reglas nuevas tras la ronda 6, con su test: una etiqueta de stock cuenta solo si nada ajeno a la consulta modifica la
palabra; el stock etiquetado con un lugar es ese lugar; en una noticia del espacio, la imagen de un concepto genérico
solo vale si dice mostrar el espacio.
| 7 | 50 % | 0 | ~99 % | luna escribe nombres como títulos de Wikipedia, «Curiosity (rover)»: ninguna búsqueda encuentra el paréntesis (el nombre se busca sin él y el paréntesis pasa a la pista) |
| 8 | 50 % | 0 | ~99 % | tiempos de espera de Wikidata que costaban la foto («Ukraine», «Canada», «China»); vocabulario de personas solo en inglés (una «Reunión con Vicepresidenta…» pasó) |
| 9 | 51,5 % | 0 (103 releídas) | ~99 % (0 engañosas vistas) | — |

**Nota de la ronda 9 (panel del §9):** legal 9,5 · pertinencia 9,5 · calidad en pantalla 8,5 (sin prueba de
legibilidad pixelada) · **cobertura 6,5** (51,5 % frente al 70 %) · robustez 9 · coste 9 · evolución 8,5.
**Ronda: 6,5.** Lo que falta para la cobertura: Openverse (registro con `curl`, lo hace el dueño), Copernicus (el
dueño inicia sesión y crea el cliente OAuth), el satélite NASA GIBS (sin clave) y la biblioteca que aprende (fase 3).
