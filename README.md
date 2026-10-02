# Sistema de Convalidaciones - versión 19.1

Actualización construida sobre el archivo funcional entregado por el usuario.

## Uso

1. Abra `index.html` en un servidor web estático o publique toda esta carpeta en GitHub Pages o Vercel.
2. El estudiante puede trabajar manualmente sin subir ningún PDF.
3. Si tiene un historial, debe pulsar `SUBIR HISTORIAL EN PDF (SI TIENE)` para mostrar el lector opcional.
4. El PDF puede cargarse antes o después de seleccionar las dos menciones. Si se carga primero, queda preparado y se procesa cuando ambas menciones estén seleccionadas.

## Correcciones realizadas

- Ejemplo del nombre en mayúsculas: `EJ. QUISPE MAMANI ANDREA`.
- Logo de Kardex como icono de la pestaña del navegador.
- Lector del historial oculto inicialmente para no ocupar espacio innecesario.
- Semestres del plan 2023 separados de los semestres del plan 2023 ajustado.
- Encabezados independientes para cada plan al generar el PDF.
- Corrección de Inteligencia Artificial y Ciencia de Datos: `EST-133 ESTADÍSTICA I` convalida a `INF-124 ESTADÍSTICA I`, ubicada en segundo semestre; `EST-145 ESTADÍSTICA II` permanece como `INF-134`, en tercer semestre.
- Validación de las siete menciones contra las matrices de convalidación, la malla 2023 y los planes 2023 ajustados.

## Archivos principales

- `index.html`: interfaz.
- `app.js`: convalidaciones, guardado local y generación del PDF.
- `history-reader.mjs`: lectura del historial PDF, OCR y manejo del archivo pendiente.
- `data.js`: planes y equivalencias.
- `styles.css` y `print.css`: diseño de pantalla e impresión.
- `assets/`: logotipos.
- `scripts/build_data.py`: utilidad usada para reconstruir los datos.

No requiere base de datos. El progreso se conserva en el navegador mediante almacenamiento local.
