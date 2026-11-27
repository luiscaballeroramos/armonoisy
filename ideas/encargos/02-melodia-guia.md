# Entrega 2 de 4: melodia guia y nota activa

## Encargo y dependencia

Sobre la [entrega 1: metronomo](01-metronomo.md), incorpora una melodia guia
generada a partir de las notas de la partitura, sincronizada con el bucle,
el metronomo y las ayudas visuales. No incorpores acompanamiento por acordes.

Este documento es un encargo pendiente. Antes de implementar, comprueba que la
entrega 1 funciona. Si falta su reloj o transporte, informa del bloqueo; no
construyas un segundo reproductor independiente.

## Contexto y lectura inicial

Lee el [README](../../README.md), [la pagina](../../pages/practica_libre.py),
el [esquema v3](../../partituras/schema/armonoisy-score-v3.schema.json),
las pruebas y el componente creado en la entrega 1. Reutiliza el parser y sus
duraciones, incluidos puntillos, silencios, grupos irregulares y ligaduras.
Inspecciona los cambios existentes y conserva la interfaz y sus ajustes.

## Alcance funcional

- Anade Melodia guia activable y su volumen independiente del metronomo.
- Usa un timbre suave y claro, preferentemente piano con muestras distribuidas
  con licencia adecuada. No hace falta imitar una armonica.
- Carga los recursos antes de iniciar la guia; muestra carga y errores. Si falla
  un instrumento, permite que el usuario elija continuar solo con metronomo,
  pero no presentes una guia silenciosa como si funcionara.
- Respeta las alturas escritas y sus duraciones. Cambiar tempo no cambia
  afinacion. Un silencio no dispara ninguna nota.
- Une notas ligadas dentro del recorrido reproducido sin volver a atacarlas.
  Una ligadura no equivale a una ligadura de expresion.
- Si A empieza en una continuacion ligada, reproduce desde A un nuevo ataque
  suave con la duracion restante dentro del bucle. Si una nota cruza B, corta
  su duracion musical en B con una envolvente breve para evitar chasquidos.
  No unas automaticamente el final del bucle con su principio.
- Pause silencia voces y conserva posicion; al reanudar dentro de una nota,
  vuelve a atacarla suavemente por su duracion restante. Stop cancela voces
  activas y futuras.
- Resalta nota o silencio actual en partitura/tablatura. En la guia de armonica,
  indica agujero, soplar/aspirar y bend cuando exista informacion valida.
  En silencios o notas sin tablatura, no dejes un agujero anterior activo.
- Usa `pitch` como altura sonora: no vuelvas a restar `bendSemitones` si el
  bend ya esta representado en esa altura. Verifica esta semantica con el formato.
- Mantiene el seguimiento visual aunque la guia este silenciada. El avance debe
  conservar visible la posicion actual sin cambiar A-B; el desplazamiento manual
  suspende el seguimiento hasta volver a activarlo.

## Estructura y decisiones tecnicas

- Extiende el mismo reloj del metronomo; no anadas un reloj por instrumento.
- Separa preparacion de eventos musicales, reproduccion del instrumento y
  actualizacion visual. Conserva identificadores de compas y evento para enlazar
  lo que suena con lo que se muestra.
- El parser y el modelo temporal deben poder probarse sin renderizar Streamlit.
  Extraelos si siguen acoplados a la pagina, sin duplicar logica.
- La parte visual dinamica debe leer la posicion del reloj en el navegador,
  no enviar cada nota o fotograma a Python.
- Reutiliza el marcado y los estilos actuales donde sea posible. No cambies el
  aspecto general de la practica como efecto secundario del componente.
- Incluye procedencia y licencia de muestras. No dependas de servicios privados
  ni de descargas externas no declaradas.

## Criterios de aceptacion y pruebas

1. Usa una partitura sintetica de prueba con silencio, puntillo, tresillo,
   alteracion y ligadura entre compases. Verifica inicios, duraciones y alturas.
2. Comprueba bucles de un compas y varios compases, con A y B cortando una
   ligadura, ademas de pausa/reanudacion dentro de una nota.
3. A 60 y 120 BPM se conserva la altura y se reduce a la mitad la duracion
   musical al duplicar el tempo.
4. En pruebas del motor, los inicios de notas que coinciden con pulsos comparten
   su tiempo programado con menos de 1 ms de diferencia, tambien tras 100 vueltas.
5. En navegador, el resaltado sigue el reloj sin desfase acumulativo. Registra
   el desfase observado y el dispositivo usado; no confundas la latencia de salida
   con un error del modelo temporal.
6. Stop no deja notas sostenidas; cambiar volumen no reinicia el bucle; los
   cambios de tempo conservan la politica de siguiente vuelta de la entrega 1.
7. Comprueba el fallo de carga de muestras y que el metronomo sigue utilizable
   tras la eleccion explicita del usuario.

Ejecuta pruebas focalizadas y las regresiones relacionadas de la entrega 1.
Actualiza el README y explica la politica de ligaduras y reanudacion.

## Fuera de alcance y cierre

Sin acordes de acompanamiento, bajo, percusion, audio externo, microfono,
evaluacion de afinacion ni imitacion expresiva de bends. La alternancia automatica
entre vueltas de escucha y ejecucion queda para una mejora posterior.

Entrega codigo, pruebas y documentacion. Deja preparada la reutilizacion del
motor de instrumentos para la
[entrega 3: acompanamiento](03-acompanamiento-generado.md), sin implementarla.
