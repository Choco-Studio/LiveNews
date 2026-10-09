# GLOBIT 24 en YouTube: logo y banner (8 oct)

| Archivo | Uso |
|---|---|
| `globit24-avatar-800.png` | Foto del canal (800×800; YouTube la recorta en círculo y la muestra hasta 48 px) |
| `globit24-banner-2560x1440.png` | Banner (zona segura del móvil: el centro 1546×423) |
| `review-avatar.png`, `review-banner.png` | Hojas de revisión: el círculo a 176/98/48/32 px sobre fondo claro y oscuro; los recortes de TV, escritorio y móvil |

Se dibujan como pixel art a una rejilla baja (100×100 y 640×360) ampliada por píxeles enteros, con la marca de
`public/js/logo.js` (globo rojo con costuras de luz, el «bit» amarillo, el rótulo cromado, el «24» rojo, el lema) y la
paleta del canal. Código: `public/lab/brand.js` (página `/lab/brand.html`); exportar con el servidor en marcha:
`node tools/brand/export.mjs --port <puerto>`.

## Crítica (panel: diseñador de marca, pixel artist, espectador que pasa de largo)

Rúbrica: legibilidad a 48 px · coherencia con la marca en antena · oficio de píxel · composición y zonas seguras ·
personalidad · tono de informativo serio · versatilidad (fondos claro y oscuro, recortes). La nota de la ronda es la
de la peor categoría.

**Logo**
| Ronda | Nota | Defecto principal → arreglo |
|---|---|---|
| 0 (marca de antena) | — | el globo con dos costuras se lee como una pelota a 48 px; no hay versión cuadrada |
| 1 | 5,5 | inclinación invertida (polo sur, rayas); continentes irreconocibles; rejilla densa; bit suelto; halo con anillos |
| 2 | 6,5 | el círculo cortaba el «24»; bit con hueco; tramado en diagonal a 8×; sombra granate |
| 3 | 7,0 | terminador en línea recta; brillo suelto; anillo tramado |
| 4 | 8,0 | tierra crema: el globo rojo se volvía beige |
| 5 | 8,5 | tierra clara sobre mar rojo sin contraste → costa de 1 px |
| 6-7 | 8,8 | píxeles huérfanos; líneas dentadas → contornos de 1 px continuos |
| 8 | 9,4 | ecuador fino (es la firma) → 2 px; casquete crema con borde tramado |
| 9-11 | 9,6 | contraste a 48 px → mar granate oscuro; rejilla de un solo tono y discreta |
| 12 | 9,7 | ecuador blanco también en la sombra; insignia plana |
| **13** | **9,8** | ecuador blanco/plata como en antena; insignia con luz arriba a la izquierda. Solo quedan minucias |

**Banner v2** (dueño, 8 oct: «un globo mundi a la izquierda con un degradado»): globo grande a la izquierda iluminado
hacia el nombre, atmósfera y degradado suave del azul al negro del espacio (el degradado a resolución completa; el
globo, las estrellas y el rótulo en pixel art ×4 encima); el rótulo continúa el ecuador del globo.
| Ronda | Nota | Defecto principal → arreglo |
|---|---|---|
| 1 | 8,8 | el bit se cortaba en el móvil; el nombre no seguía el ecuador; borde de atmósfera con huecos |
| 2 | 9,3 | el degradado tramado entre los pocos azules oscuros de la paleta se leía como una textura de puntos a 4× |
| 3 | 9,6 | puntitos de tramado en las costas del globo |
| **4** | **9,8** | sin defectos más allá de minucias; los tres recortes limpios |

**Banner v1** (sustituido)
| Ronda | Nota | Defecto principal → arreglo |
|---|---|---|
| 1 | 5,0 | se salía de la zona segura (bit cortado en móvil); globo antiguo; 70 % vacío; sin mensaje |
| 2 | 7,5 | presentadores a los lados; hombros asomando en el recorte del móvil; pared vacía en TV |
| 3 | 8,4 | recortes rectos en los hombros; puntos del mapa detrás del texto |
| 4 | 9,0 | tercio inferior muerto en TV → frente de la mesa de noticias |
| 5 | 9,4 | costuras de la mesa cruzando el texto → pantalla empotrada |
| 6 | 9,7 | frente negro pesado → módulos en tinta con su luz |
| **7** | **9,8** | los tres recortes limpios; la marca manda; el estudio entero en TV |
