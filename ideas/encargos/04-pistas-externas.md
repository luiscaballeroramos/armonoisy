# Entrega 4 de 4: pistas externas sincronizadas

## Encargo y dependencia

Sobre las entregas [1: metronomo](01-metronomo.md),
[2: melodia guia](02-melodia-guia.md) y
[3: acompanamiento generado](03-acompanamiento-generado.md), incorpora una pista
propia o autorizada para practicar con audio grabado, bucle A-B y cambio de tempo
sin cambiar la afinacion.

Este documento es un encargo pendiente. Reutiliza el transporte existente: no
anadas un reproductor de audio independiente sin sincronizacion con la partitura.

## Contexto y lectura inicial

Lee el [README](../../README.md), [la pagina](../../pages/practica_libre.py),
el [esquema](../../partituras/schema/armonoisy-score-v3.schema.json) y el motor y
las pruebas de las entregas anteriores. Conserva el modo Base por acordes y las
funciones existentes; inspecciona los cambios locales antes de editar.

## Alcance funcional

- Anade Mi audio como alternativa a Sin base y Base por acordes. Solo una base
  puede estar activa; metronomo y guia siguen siendo capas independientes.
- Permite cargar un archivo WAV o MP3 propio o autorizado. Valida el contenido,
  los errores de decodificacion y unos limites de tamano/duracion documentados,
  justificados por pruebas de memoria en los dispositivos objetivo.
- No subas audio a servicios externos. No anadas separacion de voces ni promesas
  de silenciar instrumentos dentro de una mezcla. La pista tiene un unico volumen.
- Primera version: grabaciones de tempo constante. El usuario indica el BPM
  original y el instante, en segundos, del comienzo del primer compas de la
  partitura. Permite ajustar y preescuchar esa alineacion.
- Explica que una grabacion con variaciones de tempo requiere un mapa de marcas
  adicional, fuera de esta entrega. No prometas sincronizacion de esas pistas.
- Traduce los limites de A-B a posiciones del audio original mediante la
  alineacion y las duraciones musicales. Valida que el fragmento existe dentro
  de la pista; informa de intervalos fuera de rango, sin recortarlos en silencio.
- Aplica ralentizacion/aceleracion conservando afinacion. Mantiene 40-160 BPM
  del transporte, pero restringe la relacion respecto al BPM original al
  intervalo cuya calidad se haya verificado. Explica las restricciones antes
  de reproducir; no cambies el tempo solicitado silenciosamente.
- Cuenta de entrada sin pista; Pause conserva posicion; Stop vuelve a A.
  Los cambios de tempo y bucle durante reproduccion se aplican en la siguiente
  vuelta. Gestiona la transicion sin notas duplicadas ni huecos musicales.
- Conserva archivo y alineacion al abrir/cerrar ajustes dentro de la sesion.
  No prometas recuperacion despues de recargar o cerrar la app.

## Validacion tecnica previa obligatoria

Antes de integrar toda la interfaz, realiza una prueba pequena del procesamiento
de audio con una senal de prueba original. Escoge una implementacion mantenible
y compatible con el navegador, con licencia adecuada, sin servicios privados.

No basta con cambiar `playbackRate` de un buffer: eso cambia tambien la altura.
Verifica realmente el procesamiento que mantiene la afinacion. Puede requerir
AudioWorklet/WASM u otra solucion local justificada; documenta dependencias,
latencia, memoria y soporte antes de extender el motor.

Si no se alcanza la calidad o precision necesaria, informa del resultado concreto
y de las opciones. No des por terminada la entrega con reproduccion a velocidad
original ni con un control de tempo que no actua sobre la pista.

## Estructura y decisiones tecnicas

- Separa decodificacion, alineacion y procesamiento de tempo de los controles.
- Conserva un unico reloj maestro y una correspondencia explicita entre tiempo
  de la partitura, posicion del audio original y tiempo de salida procesado.
- Compensa la latencia del procesamiento al sincronizar metronomo, guia y cursor.
  No ajustes visualmente el cursor dejando el metronomo desfasado.
- Guarda la alineacion como metadatos de sesion asociados al archivo y cancion;
  no reescribas el audio original ni incrustes audio binario en la partitura.
- Al reemplazar un archivo, libera buffers y recursos anteriores. Los errores
  de carga no deben destruir la configuracion de la cancion.
- Gestiona suavemente los bordes del bucle, sin que los fundidos desplacen sus
  limites musicales o oculten ataques importantes.

## Criterios de aceptacion y pruebas

1. Con una pista sintetica de pulsos, a 120 BPM originales y un inicio a 2 s,
   el compas 3 de una partitura regular en 4/4 empieza en el segundo 6 del archivo.
   Comprueba tambien un final B y un intervalo fuera de rango.
2. Con una senal estable de 440 Hz, verifica error de afinacion inferior a
   10 cents a velocidad 0.75x, 1x y 1.25x, y duracion de salida con error
   inferior al 1%, descontando latencia/relleno documentados del procesador.
3. Con audio de pulsos y metronomo mezclados, comprueba un desfase inferior a
   20 ms al principio y tras 20 vueltas, compensando la latencia del procesador.
   Usa captura o analisis de audio, no solo observacion del cursor.
4. Comprueba auditivamente un fragmento original con contenido musical en esos
   tres factores. Declara los artefactos perceptibles y el rango util resultante.
5. No hay chasquidos notorios, duplicaciones o huecos en A-B, Pause/Play,
   Stop/Play ni cambios de tempo. Silenciar pista no detiene el transporte.
6. Archivos invalidos, demasiado grandes, errores del procesador y alineaciones
   imposibles generan mensajes accionables. No hay exito aparente sin audio.
7. Valida ordenador y movil horizontal en navegadores disponibles, registra
   cuales se probaron y deja explicitos los que queden sin verificar.

Ejecuta pruebas focalizadas y regresiones de las tres entregas anteriores.
Actualiza el README con formatos, limites, alineacion, rango de tempo,
dependencias y restricciones de calidad.

## Fuera de alcance y cierre

Sin mapa de tempo variable, deteccion automatica de compases, separacion de
instrumentos, descargas de terceros, microfono, grabacion ni biblioteca
persistente de audios.

Entrega implementacion, pruebas objetivas de duracion/afinacion/sincronizacion,
documentacion y resumen de limitaciones. No presentes criterios pendientes como
verificados.
