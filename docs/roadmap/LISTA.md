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
8. UNIT-8: rediseño del "instrumento" de la cara (los críticos lo marcaron como bloqueante) y un indicador de en directo.
9. Nova y Max: pelo, piel y acabado. Ada: comprobar.
10. Paco, Lola, Sam y Penny: acabado final (ropa, pelo, joyas).
11. Caras: parpadeos que saltan, tamaño de ojos, mirada, brillo de cejas y gafas.
12. ✅ Gestos en el momento justo (en la palabra que toca), sin abusar; Nova es la referencia. Averiguar por qué el primer episodio los usa peor.
13. 🟡 Manos: detalles pendientes (golpecito al juntar dedos, deslizar gafas, nudillos, mano relajada) y rendimiento.

## C. Voces
14. 🟡 Siguiente nivel: risas suaves, respiraciones y pausas naturales, sin exagerar. (Respiraciones hechas: una respiración suave, unos 30 dB por debajo de la voz, en las pausas largas antes de una frase larga; nunca en UNIT-8. Hay muestra antes/después. Las risas esperan a la decisión 7.)
15. ✅ UNIT-8: voz de robot más suave (elegiste la A, ya puesta).

## D. Programas, contenido y ritmo
16. 🟡 **Programas más largos.** Hecho el dossier: el servidor lee el texto completo del artículo de cada noticia principal y el guionista escribe con él (con IA real llegará a 8-10 min; la demo sin conexión llega a ~4,6 min porque el texto de prueba es corto). Falta: duraciones/parrilla por partes (decisión 1).
17. **Más tipos de diapositivas** (15 plantillas: cronologías, comparativas, cifras, citas…).
18. **Expertos del canal** (8 fijos, ficticios). Dan vida al programa y se ciñen a los hechos de la fuente.
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
23. **Textos.** Comprobar el arreglo de las frases rotas de NEWS IN 60, que no se repita la misma noticia, más variedad 24/7, que no se cuele una foto de otra noticia y verificación de cifras.

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
26. Cabeceras y cortinillas: pendientes de la segunda ronda de arreglos.
27. Cámara: gramática de planos por programa y movimientos suaves.

## F. Anuncios
28. BitFizz: persona y vaso ya corregidos; falta que tú lo veas.
29. Grand Buffer y HiResGym: ronda de arreglos pendiente.
30. Corners (patatas que caen raro), SafeSector y ScreechNet: ronda de arreglos pendiente.
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

## Decisiones que necesito de ti
1. Duraciones y parrilla por horas (punto D16). ¿Mantener el nombre MONEY MINUTE?
2. ¿Programa IN THEIR WORDS sí o no? Nombre, presentadora (propuesta: Lola) y frecuencia.
3. Noticias graves: ¿recrear las declaraciones de cargos públicos o solo tarjetas con la cita (propuesta)?
4. Políticos y jefes de Estado: ¿permitir recrearlos con regla de equilibrio (propuesta) o excluirlos al principio?
5. Expertos: ¿8 como se propone? ¿Pueden reírse un poco en las charlas?
6. Presupuesto de IA: unas 20-24 llamadas por hora con gpt6luna. ¿Edición ligera por la noche?
7. Risas y respiraciones activadas por defecto tras la prueba A/B (COSMOS y UNIT-8 sin risas).
8. ¿Datos reales de mercados, tiempo y espacio (necesitan red y claves) o solo las cifras de las noticias? El programa del tiempo los necesita.
9. ¿Voces en tu ordenador para el canal 24/7?
10. Fin de semana: ¿resumen de la semana en la tercera parte de WORLD NOW?
11. Idioma en pantalla: ¿inglés como ahora o español?
12. Presentador del tiempo: ¿Sam o uno nuevo?
13. ✅ Red: abierta en este entorno (4 oct).
