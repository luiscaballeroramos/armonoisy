# Prompt para procesar partituras de armónica

Procesa únicamente partituras propias, de dominio público o que tengas
autorización para editar y transcribir. No supongas que una foto permite
identificar sus derechos de uso; registra si la condición de dominio público
es una afirmación del usuario aún pendiente de verificar.

A partir de las fotos de `raw`, transcribe al formato compacto definido en
`schema/armonoisy-score-v3.schema.json`. Guarda cada compás con sus eventos en
orden, usando alturas, figuras y tablatura breves; no dupliques posiciones que
se puedan calcular a partir de las duraciones. Conserva los datos necesarios
para MusicXML: armadura, compás, alturas, figuras, puntillos, silencios,
ligaduras, acordes y los datos de armónica.

Conserva lo visible: compases, notas, duraciones, silencios, ligaduras, acordes
y tablatura. No inventes datos ausentes ni resuelvas símbolos dudosos sin
indicarlo. Asigna el estado `needs-review` si hace falta una comprobación manual;
usa `verified` solo tras revisar la transcripción frente al original.

Elimina marcas de agua y mejora la legibilidad solo cuando esté autorizado, sin
alterar el contenido musical. Señala cualquier información tapada o incierta
para su revisión manual; no presentes la transcripción como verificada hasta
que se haya revisado frente al original.

Guarda el JSON y, si procede, la imagen formateada en `formateadas`. Conserva
intactos los originales en `raw` y asocia cada resultado con su fuente.
