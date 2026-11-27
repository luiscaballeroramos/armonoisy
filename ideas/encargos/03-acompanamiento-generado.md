# Entrega 3 de 4: acompanamiento generado por acordes

## Encargo y dependencia

Sobre el reproductor de las entregas
[1: metronomo](01-metronomo.md) y [2: melodia guia](02-melodia-guia.md),
anade una base sencilla de piano y bajo generada a partir de acordes revisados.
Debe permitir tocar la armonica con acompanamiento, con o sin melodia guia.

Este documento es un encargo pendiente. Verifica primero las entregas anteriores
y reutiliza su reloj, instrumentos y modelo temporal.

## Contexto y lectura inicial

Lee el [README](../../README.md), [la pagina](../../pages/practica_libre.py),
el [esquema v3](../../partituras/schema/armonoisy-score-v3.schema.json) y los modulos
y pruebas creados previamente. El formato v3 ya permite `chord` por compas.
No presupongas que las canciones existentes tienen acordes completos o revisados.

## Alcance funcional

- Ofrece los modos Sin base y Base por acordes, conservando los controles
  independientes de metronomo y melodia guia.
- Incluye un unico patron sencillo en 4/4: piano con acordes sostenidos y bajo
  con la fundamental al principio del compas. Prioriza claridad para practicar,
  no riqueza de arreglo.
- Define y valida una notacion inicial explicita para acordes mayores y menores
  con fundamentales naturales, sostenidas o bemoles. No interpretes simbolos
  desconocidos por aproximacion.
- Usa disposiciones de notas en registros adecuados para piano y bajo, evitando
  invadir innecesariamente el registro de la melodia.
- Ofrece volumen y silencio independientes para piano y bajo; conserva los de
  guia y metronomo. Incluye volumen general sin saturar la mezcla a los valores
  predeterminados.
- La base respeta A-B, entrada, pausa, Stop y cambios de tempo de las entregas
  anteriores. Durante la cuenta de entrada solo suena el metronomo.
- Si falta o no se admite un acorde en el bucle seleccionado, indica que compas
  necesita revision y no actives la base para ese bucle. La guia y el metronomo
  deben seguir disponibles. No heredes acordes ni inventes armonias en silencio.
- Durante reproduccion, aplica un cambio de bucle o base en el siguiente limite
  de vuelta; silenciar y ajustar volumen tiene efecto inmediato.
- No confundas tonalidad de armonica con tonalidad de cancion. No transpongas
  automaticamente la musica por el hecho de que la armonica sea de otra tonalidad.

## Datos y estructura

- Reutiliza `chord` por compas del formato actual. No crees un formato nuevo
  para esta entrega ni anadas aun cambios de acorde dentro de un compas.
- Implementa un generador separado de la interfaz: acordes y posiciones
  musicales entran; eventos de piano y bajo salen.
- Esos eventos deben usar el mismo formato temporal y reloj que la guia,
  no otro reproductor ni archivos de audio generados por cada tempo.
- Reutiliza la carga de instrumentos y la gestion de voces. Declara procedencia
  y licencias de los nuevos recursos de sonido.
- Incluye una progresion sintetica de prueba, original y claramente identificada,
  para demostrar la funcion. No atribuyas acordes inventados a una cancion real.
  Para completar una cancion existente, usa acordes revisados o pide ese material.
- Mantiene el codigo de biblioteca y ajustes en Streamlit; no conviertas esta
  tarea en un editor completo de arreglos.

## Criterios de aceptacion y pruebas

1. Una progresion sintetica con acordes mayores y menores produce las alturas,
   registros y duraciones esperados. Verifica tambien alteraciones admitidas.
2. Un bucle que empieza en un compas intermedio comienza con su acorde correcto,
   sin depender de haber reproducido los compases anteriores.
3. Piano, bajo, guia y metronomo comparten los tiempos de inicio: diferencia
   programada inferior a 1 ms para eventos simultaneos tras 100 vueltas.
4. Duplicar el tempo reduce a la mitad las duraciones sin alterar alturas.
5. Silenciar un instrumento no detiene ni cambia la posicion de los demas.
   Stop cancela todas las voces activas y programadas.
6. Acordes ausentes, simbolos no admitidos y compases no compatibles muestran
   errores concretos, sin tocar una base incorrecta ni inutilizar el metronomo.
7. Comprueba auditivamente la base y mide que la mezcla sintetica de prueba no
   supera el rango digital permitido con los valores predeterminados.

Ejecuta pruebas focalizadas y regresiones de transporte y guia. Actualiza el
README con la sintaxis de acordes admitida y las limitaciones del patron.

## Fuera de alcance y cierre

Sin percusion en esta entrega, estilos multiples, IA generativa, deduccion
automatica de acordes, transposicion, editor de armonia, pistas externas ni
separacion de instrumentos. Percusion y patrones mas elaborados seran mejoras
posteriores, no requisitos ocultos de esta base inicial.

Entrega codigo funcional, demostracion sintetica, pruebas y documentacion.
La siguiente entrega es [audio externo](04-pistas-externas.md).
