# GLOBIT 24 — lista de todo lo que hay que corregir o modificar

Estado (4 oct): trabajando punto por punto. ✅ = hecho y subido; 🟡 = hecho a falta de algo tuyo. Ordenado por prioridad. Detalle en OWNER_FEEDBACK.md, BACKLOG.md, WAVE3.md y STATUS.md.

## A. Prioridad máxima (lo que más se nota)
1. ✅ **Fotos reales en antena.** (Probado con la red abierta el 4 oct: las 24 noticias de las dos primeras ediciones preparadas, WORLD NOW y TECH BYTES, salen con la foto de su medio y su crédito; titulares, pantalla completa y pantalla del plató.) Nada dibujado al aire. Hace falta abrir el acceso a las webs de noticias e imágenes (o usar tu ordenador), un buscador de fotos (Wikimedia Commons por defecto; Google o Bing con clave opcional) y una demo grabada con fotos reales.
2. ✅ **Pantalla del plató.** Fotos fieles, sin franjas de color ni "filtro mal puesto", y llenando la pantalla entera (también en NEWS IN 60).
3. ✅ **El canal arranca "en frío".** (El primer programa espera a tener todas sus voces.) Los primeros programas salen peores que desde COSMOS. Comparar los dos WORLD NOW del vídeo de 18 minutos y que el canal empiece ya "caliente".
4. ✅ **Resumen de titulares.** (Sin foto: mapa del lugar; el corte va con la voz.) A veces sale en negro o con la foto anterior porque el audio se adelanta: arreglo robusto y una prueba automática.
5. ✅ **Aviso de anuncios.** (Cartel BACK IN 1 MINUTE, voz de continuidad, etiqueta con cuenta atrás.) "Volvemos en un minuto", cartel con cuenta atrás, etiqueta fija "ADVERTISING" en la esquina y cartel de vuelta.
6. ✅ **Hacer la versión nueva (v2) la de por defecto** (ahora va detrás de `?v2=1`).

## B. Presentadores
7. ✅ Max: los cascos están mal dibujados (eran del dibujo antiguo; ahora es el mismo muñeco en todos los planos; pelo de Lola y Penny igual de lejos y de cerca). Cada presentador debe verse igual de lejos y de cerca.
8. ✅ UNIT-8: rediseño del "instrumento" de la cara (los críticos lo marcaron como bloqueante) y un indicador de en directo.
9. ✅ Nova y Max: pelo, piel y acabado (10 oct: pómulo de Nova). Ada: comprobada.
10. ✅ Paco, Lola, Sam y Penny: acabado final (ropa, pelo, joyas).
11. ✅ Caras: parpadeos que saltan, tamaño de ojos, mirada, brillo de cejas y gafas.
12. ✅ Gestos en el momento justo (en la palabra que toca), sin abusar; Nova es la referencia. Averiguar por qué el primer episodio los usa peor.
13. 🟡 Manos: detalles pendientes (golpecito al juntar dedos, deslizar gafas, nudillos, mano relajada) y rendimiento.

## C. Voces
14. 🟡 Siguiente nivel: risas suaves, respiraciones y pausas naturales, sin exagerar. (Respiraciones quitadas, decisión 7.)
    - ❌ Risas (12 oct): probé tres risitas hechas con la voz del presentador (A, B y C) y las tres sonaban mal; quitadas del canal. Nadie se ríe en antena hasta tener un sonido de verdad natural (la voz que usamos no sabe reír).
    - ✅ Voces más naturales, tipo presentador real (10 oct): cada noticia empieza arriba, baja frase a frase y cierra abajo; las preguntas suben; "según fuentes…" va más bajo y suave; las cifras y los "no" se marcan; el ritmo también cambia (el arranque algo más pausado). Cada presentador con su estilo (Max y Lola más vivos, Paco más sobrio, UNIT-8 plano porque es una máquina; noticias graves más contenidas). Medido: la melodía entre frases ahora sigue el plan y se mueve el doble o el triple; la voz, la duración y el volumen no cambian. Hay muestra antes/después. Se quita con una línea (`MELODY` en server/voice/plan.js).
15. ✅ UNIT-8: voz de robot más suave (elegiste la A, ya puesta).

    - 🟡 **Ronda de voces (16 oct, tú: "las voces nuevas suenan artificiales").** Trece personajes con voces nuevas en inglés de buena calidad (la presentadora del concurso, Kai, Rosa, los expertos y corresponsales), tres candidatas nuevas para el concurso, la voz de la continuidad y de los invitados recreados, y quitado el retoque de tono que sonaba procesado en todos. Nota prevista de escucha de 4,15 a 4,43 sobre 5. Falta tu oído: te mandé las muestras de antes y después; cualquier voz que no te guste vuelve atrás al momento.
## D. Programas, contenido y ritmo
16. 🟡 **Programas más largos.** Hecho el dossier: el servidor lee el texto completo del artículo de cada noticia principal y el guionista escribe con él (con IA real llegará a 8-10 min; la demo sin conexión llega a ~4,6 min porque el texto de prueba es corto). Falta: duraciones por partes (decisión 1).
    - ✅ **Parrilla por horas** (10 oct): NEWS IN 60 a las :00 y las :30 (hora de Londres). La emisora planifica los programas de antes para que el boletín caiga en su hora: si sobra un poco, la pausa termina con un **reloj de cuenta atrás** (anillo de 60 puntos, "NEWS IN 60 · AT 10:00", hasta 90 s; no se alargan los anuncios). MONEY MINUTE solo de 06 a 22 entre semana. Medido en 24 h simuladas: con duraciones previstas, 42 de 48 boletines a menos de 90 s de su hora (la mayoría exactos); con duraciones ±25 % distintas, 40 de 48 a menos de 2 min. Se quita con `STATION_CLOCK=0`.
17. 🟡 **Más tipos de diapositivas** (15 plantillas: cronologías, comparativas, cifras, citas…). (10 oct: dos nuevas, **DE → A** —una cifra que cambió, "de 4,5 % a 4,75 %", con flecha y SUBE/BAJA— y **HOW WE GOT HERE** —cronología de 2-3 pasos con fecha de la fuente—, en WORLD NOW, TECH BYTES, COSMOS y MONEY MINUTE. Ya había BY THE NUMBERS, WHAT WE KNOW, IN PLAIN ENGLISH, IN BRIEF, QUICK BYTES y la cita.)
    - ✅ (13 oct) Tres tableros más en antena en WORLD NOW, TECH BYTES, COSMOS y MONEY MINUTE: **EN PROPORCIÓN** («uno de cada cuatro»), **QUÉ PASA AHORA** (la próxima fecha que da la noticia) y **QUIÉN ES QUIÉN** (dos o tres personas con su cargo). Si una noticia tiene más de un tablero, nunca se repite el tipo del tablero anterior.
18. ✅ **Expertos del canal** (8 fijos, ficticios). Dan vida al programa y se ciñen a los hechos de la fuente. Hecho (9 oct):
    - Omar Ledger (economía), Clara Meridian (diplomacia), Dev Isobar (clima), Dr Tomas Albedo (espacio), June Kernel (tecnología), Dra. Amara Pulse (salud), Leo Sepia (cultura) e Ines Clause (justicia);
    - el presentador lee la noticia, presenta al experto y le pregunta; el experto la explica solo con datos de la fuente (nunca "estuve allí", nunca consejos financieros ni médicos), le hace una pregunta más y le da las gracias;
    - cada uno con su apariencia, su voz y su propio estudio animado (mercados al anochecer, despacho con mapa antiguo, ventana con montañas y molinos, observatorio, sala de servidores, consulta con radiografía, galería y biblioteca jurídica);
    - salen en WORLD NOW, TECH BYTES, COSMOS DESK y MONEY MINUTE;
    - pulido (10 oct): un experto descansa 2 h antes de volver al mismo programa (salvo el fijo de MONEY MINUTE, TECH BYTES y COSMOS DESK); las frases del presentador van rotando sin repetirse; la pantalla partida entra con la presentación y la respuesta va a pantalla completa; ya no se corta el pelo en las cajas; con las noticias de prueba salen los 8.

    - pelo propio (12 oct, lo pediste): ningún experto repite el peinado de un presentador ni de otro experto (Omar con entradas y canas, Clara con pixie plateado, Dev con twists altos, Tomás calvo con mechones blancos, June con undercut magenta, Amara con trenzas, Leo con rizos pelirrojos, Ines con ondas castañas); Omar ya no viste como Paco e Ines lleva chaqueta ciruela. También Vic y Mika (corresponsales) tienen pelo propio. Arreglado además un fallo que, tras horas en antena, pintaba algunas caras con colores de otros.

    Falta: tu visto bueno a nombres, caras y voces (WAVE3 §13). Sin risas por ahora (las tres probadas sonaban mal). Detalle en docs/programmes/guests-and-experts.md.
19. ✅ **Entrevistas reales "IN THEIR WORDS".** La persona aparece diciendo solo palabras de declaraciones públicas, con la etiqueta RECREACIÓN. Nunca víctimas, familiares, testigos, menores, particulares ni acusados.
    - Hecho (12 oct, parte del servidor): cuando una noticia trae una cita literal de un cargo público (político, portavoz, directivo, científico), esa persona aparece en una sala de prensa y dice exactamente esas palabras. El presentador dice antes de dónde salen ("Esto es lo que dijo la alcaldesa, según Reuters"). Lleva la etiqueta RECREACIÓN y la fuente, una voz sintética genérica (nunca imita la suya) y un aspecto respetuoso. Si hay dos partidos en la noticia y solo tenemos la cita de uno, no se recrea (regla de equilibrio). Se comprueba en Wikidata que es una persona pública, adulta y viva. Cada recreación queda apuntada en un registro.
    - En noticias graves (decisión 3): solo cargos públicos hablando en su papel, con tono serio.
    - ✅ Hecha la parte visual (12 oct) y **encendido en antena** en WORLD NOW, TECH BYTES, COSMOS DESK y MONEY MINUTE (una recreación por programa como mucho). Lo que verás:
        - el presentador termina la noticia diciendo de dónde salen las palabras y, a continuación, la persona aparece a pantalla completa en una **sala de prensa**: tras un atril con un ramo de micrófonos, una pared de paneles azul grisáceo con un emblema sin letras (ninguna bandera ni logotipo real). Dice sus palabras exactas, que salen también en los subtítulos, y se vuelve al plató. Sin preguntas ni "gracias";
        - mientras se la ve, siempre arriba a la derecha **RECREATION — WORDS FROM PUBLIC STATEMENTS** (RECREATION sobre amarillo) y debajo **SOURCE: el medio**; abajo, su cargo y su nombre, como cualquier rótulo del canal. Están desde el primer fotograma hasta el último;
        - cada persona tiene su aspecto (peinado, color de piel, gafas, barba, traje), siempre el mismo para la misma persona, sobrio y respetuoso, nunca una caricatura. Nunca se parece a un presentador, corresponsal o experto: si saldría con el mismo pelo y el mismo color que uno de ellos, se cambia;
        - gesto neutro (serio en noticias graves), solo pequeños asentimientos, sin sonrisas, sin manos (quedan tras el atril). En noticias graves la sala es más oscura y fría.
    - Se apaga con `RESTAGE=0` (vuelve la tarjeta de cita). Para verlos sin esperar: public/lab/guests.html. Falta: tu visto bueno a la sala y a unas cuantas caras. Detalle en docs/programmes/guests-and-experts.md §9.
20. **Invitados.** Personalización del personaje por IA y cara esculpida preparada con antelación.
21. ✅ **Nuevo programa WORLD WEATHER (≈5 min).** Hecho:
    - mapa del mundo (el mismo de las noticias) por 6 zonas, con la tierra coloreada por temperatura, iconos animados (sol, nubes, lluvia, tormenta, nieve, niebla) y la máxima de cada ciudad;
    - Sam de pie que camina de zona en zona con la cámara siguiéndole, y señala cada ciudad cuando la nombra;
    - segundo panel de avisos (huracán girando en el mapa, nivel de alerta, vientos, fuente);
    - datos reales de Open-Meteo y avisos oficiales de GDACS, citando la fuente; el guion sale solo de los datos (ninguna cifra inventada);
    - cabecera propia (sol y nube) y música suave.

    Probado con datos reales (4 oct): 44 ciudades, avisos de GDACS y mapa de calor de 841 puntos. Arreglado con los datos reales: tormentas ya terminadas que seguían saliendo, listas de países cortadas, etiquetas pisadas y el límite de peticiones de Open-Meteo. Falta: las decisiones 8 y 12 (presentador del tiempo). Detalle en docs/programmes/world-weather.md.

    - ✅ **Ronda 3 (12 oct, tú: "el programa del tiempo necesita mejoras enormes"):**
      - un centro del tiempo de verdad: primer plano de Sam, el mundo a pantalla completa y la pared con las zonas;
      - el cielo se mueve: nubes, lluvia, isobaras y las borrascas y anticiclones de las próximas 24 horas con su reloj ("TUE 14:00");
      - el reloj espera a la voz: cuando Sam nombra un anticiclón, se ve donde dice y se marca;
      - 70 ciudades (antes 44);
      - tableros nuevos: HOT & COLD (cuenta atrás de los lugares más calurosos y más fríos del planeta) y THE NEXT THREE DAYS (tres días de cinco ciudades);
      - el panel de avisos con el mapa al lado.

    - ✅ **Ronda 4 (12 oct):** las nubes conservan su forma las 24 horas (antes se estiraban en franjas), las tormentas tropicales tienen su espiral de nubes en el mapa con su nombre, Sam hace gestos de presentador del tiempo en el primer plano (mano abierta hacia la pared, las dos palmas para "todo el mundo", un barrido para el movimiento) sobre las palabras, y las ciudades de cada zona aparecen cuando él llega.

      Falta pulir: la tormenta no se desplaza durante las 24 horas (no hay previsión de su trayectoria) y algunos bordes de nubes muy densas salen escalonados.
22. **Ritmo.** Transiciones, pausas entre bloques y tiempos de espera (el equipo de ritmo estaba a mitad).
23. 🟡 **Textos.** Hecho (4 oct, con noticias reales):
    - las frases de transcripción de los vídeos de los medios ("Here's Jennie Shin with more…", saludos, despedidas) ya no llegan al guion;
    - el menú de páginas copiado en los resúmenes (la foto del día de la NASA) se descarta;
    - etiquetas nuevas (CONFLICT, ELECTIONS, PROTESTS, POLITICS) y corregidas (los ataques de Yemen ya no salen como INDUSTRY).

    - ✅ Repaso del 10 oct (dos pasadas con todos los programas y noticias de ese día, redactor sin IA): los **titulares** ya no se cortan a media frase ni cambian el sentido (antes salía "Ex-Deutsche Bank trader jailed" cuando le anulaban la condena; "…deals may not"; comillas abiertas; nombres partidos como "Nikon Small World"; "…advocates say" quitado de una opinión); si no hay un corte limpio, el titular va entero en dos líneas. Fuera **frases sin sujeto o sin verbo principal** ("Documented how…", "But criticised…", "A man who lives in a log cabin."), frases recortadas que dejaban colgando "possibly", "let alone figuring out" o media lista; la misma cifra dicha dos veces seguidas; respuestas de corresponsal que empezaban por "Instead,"; aperturas que dependían del titular ("…said the tip was…"). **Una noticia, un hueco**: el mismo huracán contado por varios medios o actualizaciones del mismo medio, y el movimiento "Cockroach" de India (salía 3 veces en WORLD NOW), ya cuentan como una. Tablero WHAT WE KNOW sin rangos partidos ("entre 50 y 100"), sin cifras rotas ("30 -ERA MAC MINIS"), páginas de programas de la BBC (Money Box, Tech Now) y listas de productos fuera, y el resumen de la NASA que se quedaba en "11." arreglado.

    - ✅ Repaso del 12 oct (los cinco programas con las noticias de ese día, tres pasadas):
      - una noticia contada por dos medios con la misma expresión entre comillas ("energy ceasefire") ya sale una sola vez;
      - se corrige la errata de un medio en un nombre del titular ("Woodfood" pasa a "Woodford");
      - fuera las frases de relleno de los medios ("Elitsa Gadeva explica…", "The BBC has not seen the letter", el subtítulo del Guardian sin punto);
      - ninguna frase cortada antes de su verbo o a mitad de expresión ("…likelihood of wetter.", "Ticket sales for the satirical black comedy.");
      - si la primera frase del resumen es de fondo o habla de otra cosa ("The facility…", "Bergs had lost…"), la noticia empieza por el titular dicho como frase ("A Saudi minister has vowed…", "Thales is to open…");
      - en la cifra del día, primero la frase con la cifra; ninguna noticia empieza por "it"/"they".
    - ✅ NEWS IN 60 (12 oct): cada noticia empieza por lo que ha pasado, y la línea amarilla del rótulo por fin avanza con el minuto (antes estaba siempre llena).

    Falta: más variedad 24/7, que no se cuele una foto de otra noticia y verificación de cifras.

37. 🟡 **Nuevo programa FULL TIME (deportes, 5-7 min, Kai y Rosa).** Hecho de punta a punta. Aún no está en la parrilla: falta tu visto bueno y el paso 2.
    - ✅ Paso 1, la mesa de deportes: lee los medios de deportes y descarta rumores, apuestas, columnas de opinión y vídeos. Solo lee resultados y fechas cuando son seguros.
    - 🟡 Paso 2, el guion: 9,0. Le faltan noticias de un fin de semana (hay comprobaciones programadas para el 17, 18 y 19 de octubre) y el redactor con IA (falta tu clave).
    - ✅ Paso 3, los gráficos: 9,8. Marcador del partido, tablero de resultados del estadio, calendario «COMING UP», pizarra con la distancia del gol y 11 iconos de deporte.
    - ✅ Paso 4, la dirección: 9,8. El tablero de resultados crece al ritmo de la voz y nunca se repite el mismo tipo de tablero dos veces seguidas.
    - ✅ Paso 5, el plató junto al campo (9,8), la cabecera con focos y silbato (9,8) y la música (9,8).
    - ✅ Paso 6, las caras de Kai y Rosa: 9,75. Hay tres candidatas para cada uno.
    - ✅ Paso 7, dos ediciones grabadas con sonido (una de jornada y otra de día tranquilo): 9,8 en todo.
    - **Falta de ti:**
      - la cara y la voz de cada uno (te las mandé);
      - el golpe sonoro del resultado: público o metales con timbal;
      - tu visto bueno para meterlo en la parrilla (después de WORLD WEATHER).
    - Para verlo antes: modo de prueba `DRAFTS_ON_AIR=full-time@world-weather`.

38. 🟡 **Nuevo programa PAY ATTENTION (concurso con las noticias de la semana, unos 5 min).** Diseño aprobado por la autocrítica (9,75, a la séptima ronda), ahora en construcción.
    - Dos presentadores del canal juegan; el espectador juega desde casa.
    - Las preguntas salen solo de noticias que el canal ya emitió: nada falso en pantalla.
    - Cinco tipos de ronda:
      - una foto que se va enfocando;
      - un titular que se rellena letra a letra;
      - un mapa con tres chinchetas;
      - "¿hoy o no hoy?";
      - "¿cuántos?", solo cuando hay cifras.
    - Nunca pregunta por muertes, sucesos, guerras ni política. Los días de noticias graves no se emite.
    - **Falta de ti, más adelante:** la cara, la voz y el nombre del presentador nuevo, y el nombre del programa.
    - 🟡 Paso 1, la mesa de preguntas: revisada a mano el 16 oct con las noticias reales. Encontré cuatro fugas (despidos en Netflix, un "¿dónde?" que era un lanzamiento de producto, un titular cortado y un pódcast) y las arreglé; aún no pasa (9,6): falta un día más leído a mano sin ninguna fuga (17 oct).
    - ✅ Paso 2, el guion (9,75): leído en antena con titulares reales de "¿hoy o no hoy?", y Max y Ada ya juegan.
    - Ya conectado al canal como programa de tipo concurso; aún no está en la parrilla.
    - ✅ Paso 3, los gráficos (9,75). ✅ Paso 6, los tres candidatos a presentador (9,75): falta que elijas uno.
    - ✅ Paso 5: el plató (9,75), la cabecera (9,75, a la octava ronda: cada lámpara se enciende con su foco cayendo sobre la mesa del jugador) y la música y los efectos.
    - ✅ Paso 4, la dirección (9,75, tras devolverla una vez): la cinta de noticias nunca lleva una noticia de las preguntas; las caras de los jugadores salen en cada pregunta y nunca hay más de 34 s seguidos de pizarras.
    - ✅ Paso 7, en antena (9,75, a la ronda 15): tres ediciones grabadas con voz y noticias reales, dos de noche y una de tarde. La clasificación hablada coincide con el cartel, la cinta no lleva nada que el concurso no preguntaría, la edición de tarde cabe en su tiempo y la ronda final ya no repite la de fotos. Queda por mejorar: las preguntas tiran mucho a tecnología y ciencia, porque el archivo es joven y las noticias del mundo suelen quedar fuera por las reglas (guerras, política, sucesos).

39. 🟡 **Nuevo programa PRESS START (videojuegos, nombre provisional).** Diseño en 9,0, aún no pasa (hace falta más de 9,7). Lee 30 medios de videojuegos; solo cuenta una historia si la publican al menos dos medios distintos y uno serio, lo que deja fuera guías, opiniones, merchandising y rumores. Sale una edición los días laborables hacia las 19:00 y un resumen el fin de semana. Falta demostrar que acierta el 97 % con unas 100 noticias nuevas (unos cinco días laborables de lectura, ya en marcha cada hora). Preguntas para ti cuando pase: presentadores, nombre y clave gratuita de Steam para los jugadores en directo.

## E. Plató, gráficos y cámara
24. Plató:
    - cifras cortadas en la pantalla y paneles vacíos;
    - bandas de color;
    - halo detrás de la cabeza;
    - luces de MONEY MINUTE;
    - coste del primer corte a un plano nuevo.
25. 🟡 Gráficos (£ y ¥ ya añadidos):
    - velocidad del rótulo inferior (la "última hora");
    - símbolos £ y ¥;
    - gráficos propios de cada programa;
    - subtítulos que cambian demasiado.
26. ✅ Cabeceras y cortinillas: segunda ronda hecha (10 oct: nebulosa de COSMOS sin parpadeo, TECH BYTES con fondo que se despeja, MONEY MINUTE con oficinas variadas y brillo, NEWS IN 60 con pulsos en el dial, WORLD WEATHER más amplio).
27. 🟡 Cámara: gramática de planos por programa y movimientos suaves.
    - Ronda de pulido (13 oct): ningún corte cae a mitad de palabra ni en la última palabra de una frase; ningún plano dura más de su máximo (queda una excepción en MONEY MINUTE); los movimientos de cámara ya no saltan; la foto a pantalla completa se desliza en un solo eje.
    - Los fallos marcados bajaron de 56 a 18, pero ningún programa llegó a 9,7: las notas van de 8,8 a 9,4.
    - Falta tu decisión: varios programas pasan un poco de su límite de cortes por minuto, y ese límite choca con la duración media de plano que pediste (de 5 a 7 s). Hay que mover uno de los dos.

## F. Anuncios
28. ✅ BitFizz: persona y vaso corregidos; aprobado por ti (12 oct: "el anuncio está perfecto").
29. ✅ Grand Buffer y HiResGym (10 oct): en Grand Buffer la mesa del plato ya está puesta (pan, copa, servilleta, salero, mantel con textura, velas que parpadean). Hi-Res Gym: cada plano en un sitio de verdad y con luz (vestuario con ducha y vapor, ciudad con grúas y un tren, gimnasio con ventanas, polvo de magnesio y otra persona entrenando al fondo, y el cierre sobre el gimnasio desenfocado); los planos de baja resolución se siguen leyendo como tales.
30. ✅ Corners (10 oct): las patatas caen como patatas (resistencia del aire, giro que se frena, aleteo, un bote pequeño y se asientan) desde el cazo que sujeta la mano de Ian, y en el plano de la sal los dedos de Ian espolvorean un chorro visible que brilla en la luz. SafeSector y ScreechNet revisados: planos llenos, sin cambios.
31. ✅ La música de los anuncios debe bajar bajo la voz. (Medido en el vídeo de correcciones: entre frases la música va 25-38 dB por debajo de la voz y baja 14 dB más cuando la voz habla.)

## G. Música y sonido
32. ✅ Música de fondo suave por programa y momento. (Ahora suena también en el canal en directo, no solo en los vídeos grabados: cambia con cada programa y momento, baja sola bajo la voz, calla en las noticias graves y deja paso a la sintonía y a los anuncios. Se apaga con `?beds=0`.)

## H. Tiempo real y 24/7
33. ✅ Prueba larga de 6 horas (12 oct, con todo integrado: el tiempo nuevo, SEVEN DAYS, EN SUS PALABRAS, noticias reales y voces reales): **superada**.
    - 60 fotogramas por segundo de mediana (nunca menos de 54), memoria estable (unos 40 MB, el navegador la libera), ningún bloqueo y solo 2 avisos de red en 6 horas.
    - Encontró un fallo real: a las 2 horas el canal se quedaba sin noticias nuevas y dejaba de preparar programas (emitía anuncios y repeticiones). Arreglado: si faltan noticias nuevas, vuelve a contar las de hace 2 horas o más (nunca de los últimos 6 programas), como las cadenas de noticias. Con el arreglo, en las últimas 2 horas siempre hubo programas preparados.
    - Ajustado también: TECH BYTES y COSMOS pueden salir con menos noticias (5 y 4) cuando hay pocas de su tema, para que de noche no se repita tanto WORLD NOW.
    - La anterior (3 oct): 2 h, 60 fps, memoria estable, 0 errores.
34. 🟡 Emisión a YouTube o Twitch (navegador sin pantalla y un codificador de vídeo funcionando a la vez).
    - Hecho (12 oct): `tools/stream.mjs` emite el canal sin OBS ni pantalla, en 1080p a 30 fps con su sonido (probado grabando a un archivo: imagen nítida y sonido a volumen de emisión). La clave se guarda en una variable de entorno, nunca en el repositorio. Instrucciones en el README.
    - Falta: tu clave de YouTube y un ordenador o servidor que esté encendido siempre (este entorno de trabajo se apaga solo).
35. 🟡 Conectar gpt6luna como orquestador real y medir su coste y lo que tarda en responder.
    - Listo (12 oct): el canal ya sabe usarlo (elige las noticias y escribe; si falla, entra el redactor de respaldo) y hay una herramienta que lo mide de verdad: coste por programa, por hora, por día y por mes, y cuánto tarda (`tools/ai-bench.mjs`).
    - Falta: la clave `OPENAI_API_KEY` guardada en la configuración del entorno (nunca en el chat ni en el repositorio).
36. ✅ **SEVEN DAYS, el resumen de la semana (12 oct, tú: "sí, pero cúrratelo").** Sale los sábados y domingos con Paco y Lola. Cuenta solo lo que el canal ya contó esa semana, con las palabras ya comprobadas y el día en que salieron (sin IA y sin inventar nada):
    - la historia de la semana con su tablero HOW THE WEEK UNFOLDED (cómo avanzó día a día) y lo último;
    - el análisis de un experto, otra vez en su estudio;
    - THE WEEK IN 60 SECONDS (una noticia por día, de lunes a domingo);
    - las secciones de la semana, las cifras de la semana, las palabras de la semana y el AND FINALLY.

    Tiene su propio plató (el de WORLD NOW con luz cálida de fin de semana, color coral, lámparas y la barra de los siete días), su ritmo tranquilo, su cabecera (los días de la semana en tarjetas que giran hasta quedar en un 7) y su música. Falta pulir: con una semana floja dura unos 4 minutos (el objetivo es 5,5–8) y la cabecera es más sencilla que la de WORLD NOW.

## No tocar (te gusta así)
- El mapa que señala dónde ocurren las noticias.
- El anuncio de Cloudbrella.
- El tono de WORLD NOW.
- Los movimientos naturales de los presentadores.
- La mirada de la copresentadora al compañero solo al empezar a hablar.
- COSMOS como referencia de nivel.

## Decisiones (respondidas el 5 oct)
1. ✅ Parrilla por horas: sí, y preparada para programas que no son informativos.
2. ✅ IN THEIR WORDS: sí.
3. ✅ Noticias graves (12 oct): "se presentan con respeto pero bien"; tratamiento completo, no solo tarjetas.
4. ✅ Políticos y jefes de Estado: se recrean (con regla de equilibrio).
5. ✅ Expertos: varios; pueden reírse en las charlas.
6. Presupuesto de IA: pendiente de medir con gpt-6-luna.
7. ✅ Respiraciones NO; risas SÍ y naturales. (12 oct: las tres risas probadas sonaban mal; quitadas hasta tener una natural.)
8. ✅ Datos: los mejores (mercados, tiempo, espacio), todo preparado para poner las claves.
9. ✅ Voces en tu ordenador y prueba de 6 horas (12 oct): a mi criterio, solo si no es una pérdida de tiempo.
10. ✅ Resumen semanal (12 oct): sí, muy trabajado. Hecho: SEVEN DAYS (punto 36).
11. ✅ Idioma en pantalla: inglés.
12. Presentador del tiempo: sin respuesta (sigue Sam); pulido extremo hasta nota > 9,7.
13. ✅ Red: abierta en este entorno (4 oct).
