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
    - ✅ Risas (10 oct): una risita suave con la propia voz del presentador, antes de la frase y por debajo de su volumen, con sonrisa de boca cerrada y un pequeño movimiento de hombros. Una como máximo por programa, solo en charla ligera (WORLD NOW y TECH BYTES, también los expertos); nunca en COSMOS, NEWS IN 60 ni MONEY MINUTE, nunca UNIT-8 ni tras una noticia grave. Hay muestra con tres sonidos (A, B y C) para que elijas; ahora suena la A.
    - ✅ Voces más naturales, tipo presentador real (10 oct): cada noticia empieza arriba, baja frase a frase y cierra abajo; las preguntas suben; "según fuentes…" va más bajo y suave; las cifras y los "no" se marcan; el ritmo también cambia (el arranque algo más pausado). Cada presentador con su estilo (Max y Lola más vivos, Paco más sobrio, UNIT-8 plano porque es una máquina; noticias graves más contenidas). Medido: la melodía entre frases ahora sigue el plan y se mueve el doble o el triple; la voz, la duración y el volumen no cambian. Hay muestra antes/después. Se quita con una línea (`MELODY` en server/voice/plan.js).
15. ✅ UNIT-8: voz de robot más suave (elegiste la A, ya puesta).

## D. Programas, contenido y ritmo
16. 🟡 **Programas más largos.** Hecho el dossier: el servidor lee el texto completo del artículo de cada noticia principal y el guionista escribe con él (con IA real llegará a 8-10 min; la demo sin conexión llega a ~4,6 min porque el texto de prueba es corto). Falta: duraciones por partes (decisión 1).
    - ✅ **Parrilla por horas** (10 oct): NEWS IN 60 a las :00 y las :30 (hora de Londres). La emisora planifica los programas de antes para que el boletín caiga en su hora: si sobra un poco, la pausa termina con un **reloj de cuenta atrás** (anillo de 60 puntos, "NEWS IN 60 · AT 10:00", hasta 90 s; no se alargan los anuncios). MONEY MINUTE solo de 06 a 22 entre semana. Medido en 24 h simuladas: con duraciones previstas, 42 de 48 boletines a menos de 90 s de su hora (la mayoría exactos); con duraciones ±25 % distintas, 40 de 48 a menos de 2 min. Se quita con `STATION_CLOCK=0`.
17. 🟡 **Más tipos de diapositivas** (15 plantillas: cronologías, comparativas, cifras, citas…). (10 oct: dos nuevas, **DE → A** —una cifra que cambió, "de 4,5 % a 4,75 %", con flecha y SUBE/BAJA— y **HOW WE GOT HERE** —cronología de 2-3 pasos con fecha de la fuente—, en WORLD NOW, TECH BYTES, COSMOS y MONEY MINUTE. Ya había BY THE NUMBERS, WHAT WE KNOW, IN PLAIN ENGLISH, IN BRIEF, QUICK BYTES y la cita.)
18. ✅ **Expertos del canal** (8 fijos, ficticios). Dan vida al programa y se ciñen a los hechos de la fuente. Hecho (9 oct):
    - Omar Ledger (economía), Clara Meridian (diplomacia), Dev Isobar (clima), Dr Tomas Albedo (espacio), June Kernel (tecnología), Dra. Amara Pulse (salud), Leo Sepia (cultura) e Ines Clause (justicia);
    - el presentador lee la noticia, presenta al experto y le pregunta; el experto la explica solo con datos de la fuente (nunca "estuve allí", nunca consejos financieros ni médicos), le hace una pregunta más y le da las gracias;
    - cada uno con su apariencia, su voz y su propio estudio animado (mercados al anochecer, despacho con mapa antiguo, ventana con montañas y molinos, observatorio, sala de servidores, consulta con radiografía, galería y biblioteca jurídica);
    - salen en WORLD NOW, TECH BYTES, COSMOS DESK y MONEY MINUTE;
    - pulido (10 oct): un experto descansa 2 h antes de volver al mismo programa (salvo el fijo de MONEY MINUTE, TECH BYTES y COSMOS DESK); las frases del presentador van rotando sin repetirse; la pantalla partida entra con la presentación y la respuesta va a pantalla completa; ya no se corta el pelo en las cajas; con las noticias de prueba salen los 8.

    Falta: tu visto bueno a nombres, caras y voces (WAVE3 §13). Las risas esperan a la decisión 7. Detalle en docs/programmes/guests-and-experts.md.
19. **Entrevistas reales "IN THEIR WORDS".** La persona aparece en la pantalla o en el plató diciendo solo palabras de declaraciones públicas, con la etiqueta RECREACIÓN. Nunca víctimas, menores, particulares ni noticias graves.
20. **Invitados.** Personalización del personaje por IA y cara esculpida preparada con antelación.
21. ✅ **Nuevo programa WORLD WEATHER (≈5 min).** Hecho:
    - mapa del mundo (el mismo de las noticias) por 6 zonas, con la tierra coloreada por temperatura, iconos animados (sol, nubes, lluvia, tormenta, nieve, niebla) y la máxima de cada ciudad;
    - Sam de pie que camina de zona en zona con la cámara siguiéndole, y señala cada ciudad cuando la nombra;
    - segundo panel de avisos (huracán girando en el mapa, nivel de alerta, vientos, fuente);
    - datos reales de Open-Meteo y avisos oficiales de GDACS, citando la fuente; el guion sale solo de los datos (ninguna cifra inventada);
    - cabecera propia (sol y nube) y música suave.

    Probado con datos reales (4 oct): 44 ciudades, avisos de GDACS y mapa de calor de 841 puntos. Arreglado con los datos reales: tormentas ya terminadas que seguían saliendo, listas de países cortadas, etiquetas pisadas y el límite de peticiones de Open-Meteo. Falta: las decisiones 8 y 12 (presentador del tiempo). Detalle en docs/programmes/world-weather.md.
22. **Ritmo.** Transiciones, pausas entre bloques y tiempos de espera (el equipo de ritmo estaba a mitad).
23. 🟡 **Textos.** Hecho (4 oct, con noticias reales):
    - las frases de transcripción de los vídeos de los medios ("Here's Jennie Shin with more…", saludos, despedidas) ya no llegan al guion;
    - el menú de páginas copiado en los resúmenes (la foto del día de la NASA) se descarta;
    - etiquetas nuevas (CONFLICT, ELECTIONS, PROTESTS, POLITICS) y corregidas (los ataques de Yemen ya no salen como INDUSTRY).

    - ✅ Repaso del 10 oct (dos pasadas con todos los programas y noticias de ese día, redactor sin IA): los **titulares** ya no se cortan a media frase ni cambian el sentido (antes salía "Ex-Deutsche Bank trader jailed" cuando le anulaban la condena; "…deals may not"; comillas abiertas; nombres partidos como "Nikon Small World"; "…advocates say" quitado de una opinión); si no hay un corte limpio, el titular va entero en dos líneas. Fuera **frases sin sujeto o sin verbo principal** ("Documented how…", "But criticised…", "A man who lives in a log cabin."), frases recortadas que dejaban colgando "possibly", "let alone figuring out" o media lista; la misma cifra dicha dos veces seguidas; respuestas de corresponsal que empezaban por "Instead,"; aperturas que dependían del titular ("…said the tip was…"). **Una noticia, un hueco**: el mismo huracán contado por varios medios o actualizaciones del mismo medio, y el movimiento "Cockroach" de India (salía 3 veces en WORLD NOW), ya cuentan como una. Tablero WHAT WE KNOW sin rangos partidos ("entre 50 y 100"), sin cifras rotas ("30 -ERA MAC MINIS"), páginas de programas de la BBC (Money Box, Tech Now) y listas de productos fuera, y el resumen de la NASA que se quedaba en "11." arreglado.

    Falta: más variedad 24/7, que no se cuele una foto de otra noticia y verificación de cifras.

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
27. Cámara: gramática de planos por programa y movimientos suaves.

## F. Anuncios
28. BitFizz: persona y vaso ya corregidos; falta que tú lo veas.
29. 🟡 Grand Buffer y HiResGym (10 oct): en Grand Buffer la mesa del plato ya está puesta (pan, copa, servilleta, salero, mantel con textura, velas que parpadean). Hi-Res Gym: en curso (gimnasio de verdad detrás del atleta y del cierre).
30. ✅ Corners (10 oct): las patatas caen como patatas (resistencia del aire, giro que se frena, aleteo, un bote pequeño y se asientan) desde el cazo que sujeta la mano de Ian, y en el plano de la sal los dedos de Ian espolvorean un chorro visible que brilla en la luz. SafeSector y ScreechNet revisados: planos llenos, sin cambios.
31. ✅ La música de los anuncios debe bajar bajo la voz. (Medido en el vídeo de correcciones: entre frases la música va 25-38 dB por debajo de la voz y baja 14 dB más cuando la voz habla.)

## G. Música y sonido
32. ✅ Música de fondo suave por programa y momento. (Ahora suena también en el canal en directo, no solo en los vídeos grabados: cambia con cada programa y momento, baja sola bajo la voz, calla en las noticias graves y deja paso a la sintonía y a los anuncios. Se apaga con `?beds=0`.)

## H. Tiempo real y 24/7
33. 🟡 Prueba larga: 2 h seguidas en tiempo real con voces reales (3 oct): 60 fps de mediana (mínimo 57), memoria estable (22→26 MB), 0 errores, el servidor siempre con programas preparados por delante. Las 6 h necesitan tu ordenador: aquí un proceso en segundo plano dura como mucho 2 h (`tools/soak.mjs`).
34. Emisión a YouTube o Twitch (navegador sin pantalla y un codificador de vídeo funcionando a la vez). Sin probar todavía.
35. Conectar gpt6luna como orquestador real y medir su coste y lo que tarda en responder.

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
3. Noticias graves: sin respuesta; por ahora solo tarjetas con la cita.
4. ✅ Políticos y jefes de Estado: se recrean (con regla de equilibrio).
5. ✅ Expertos: varios; pueden reírse en las charlas.
6. Presupuesto de IA: pendiente de medir con gpt-6-luna.
7. ✅ Respiraciones NO; risas SÍ y naturales.
8. ✅ Datos: los mejores (mercados, tiempo, espacio), todo preparado para poner las claves.
9. Voces en tu ordenador: pendiente.
10. Resumen semanal: pendiente.
11. ✅ Idioma en pantalla: inglés.
12. Presentador del tiempo: sin respuesta (sigue Sam); pulido extremo hasta nota > 9,7.
13. ✅ Red: abierta en este entorno (4 oct).
