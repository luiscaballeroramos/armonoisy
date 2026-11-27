# Entrega 1 de 4: reproductor de practica con metronomo

## Encargo

Implementa en Armonoisy la primera reproduccion real, exclusivamente con
metronomo. El resultado debe permitir practicar un bucle libre con pulso audible,
tempo regulable y seguimiento visual de compas y pulso. No reproduzcas melodias.

Este documento es un encargo pendiente, no una descripcion de funciones ya
implementadas. No requiere las entregas siguientes.

## Contexto y lectura inicial

- Lee [README](../../README.md), [la pagina de practica](../../pages/practica_libre.py),
  [sus pruebas](../../tests/test_practica.py) y
  [las ideas de producto](../ideas.txt).
- Inspecciona el estado real del repositorio antes de implementar. No reviertas
  cambios existentes ni sustituyas el diseno de practica y ajustes.
- La interfaz actual tiene bucle y tempo, pero los controles de sonido estan
  desactivados. El [formato v3](../../partituras/schema/armonoisy-score-v3.schema.json)
  admite `tempoBpm`; el lector actual no lo incorpora al estado de reproduccion.

## Alcance funcional

- Play inicia desde A; Pause conserva posicion y silencia el audio; Play reanuda;
  Stop cancela lo programado y vuelve al principio de A.
- Repite A-B sin limite. Conserva la seleccion libre del usuario: nunca avances
  automaticamente al siguiente fragmento.
- Ofrece metronomo activable y volumen. Silenciarlo no detiene el reloj ni el
  seguimiento visual.
- Distingue el primer pulso del compas con un acento moderado.
- Incluye cuenta de entrada opcional de un compas, al iniciar desde Stop, no al
  reanudar desde Pause ni en cada vuelta.
- Conserva el intervalo actual de tempo, 40-160 BPM. Usa `tempoBpm` si existe y
  es compatible; si falta, conserva el valor inicial actual de 72 BPM.
  Si queda fuera del intervalo, informa y pide un valor compatible, sin recortarlo
  silenciosamente ni modificar la partitura.
- Con reproduccion parada o pausada, el cambio de tempo es inmediato. Durante
  reproduccion, aplicalo al comienzo de la siguiente vuelta y muestra el valor
  pendiente. Los cambios de A-B durante reproduccion se aplican tambien en ese
  limite, sin alterar a mitad la vuelta que ya esta sonando.
- Muestra compas y pulso actuales. No es necesario resaltar notas ni agujeros.
- Implementa el control ya previsto para repetir el compas actual: selecciona ese
  compas como bucle, usando la misma politica de cambios en reproduccion.

## Estructura y decisiones tecnicas

- Mantiene Streamlit como interfaz y configuracion; crea un componente web
  pequeno para el reloj y el sonido. Usa Web Audio o una biblioteca justificada.
- Un unico reloj de audio gobierna transporte, bucle y visualizacion. Programa
  audio por adelantado: no uses reejecuciones de Python, `sleep` o temporizadores
  de interfaz como fuente de precision musical.
- Separa el adaptador Python del componente y su motor JavaScript. Extrae un
  modelo temporal compartido solo donde haga falta; no dupliques el parser.
- Representa posiciones musicales separadas de segundos y pixeles. Documenta la
  unidad de BPM. En esta primera entrega garantiza 4/4 con BPM de negra; para
  otros compases implementa y prueba su interpretacion o muestra una limitacion
  explicita, sin asumir que todos son 4/4.
- Evita duplicar reproductores por reejecuciones. Mantiene el motor vivo al abrir
  ajustes y volver; libera recursos al abandonar realmente la practica.
- El primer Play debe habilitar audio mediante una interaccion del usuario en el
  navegador. Presenta errores y estados de carga o suspension de forma visible.
- Si el navegador suspende el audio, no recuperes el tiempo perdido disparando
  clics en rafaga; informa y permite reanudar coherentemente.
- No anadas aun instrumentos, muestras, microfono ni infraestructura para ellos.

## Criterios de aceptacion y pruebas

1. En 4/4, a 60 BPM hay un segundo entre pulsos; un bucle de tres compases
   dura 12 segundos, sin contar la entrada. A 120 BPM dura 6 segundos.
2. En una prueba del planificador de 100 vueltas, la posicion programada del
   comienzo de cada vuelta difiere menos de 1 ms de la esperada. Comprueba
   ademas en navegador que no hay clics dobles o ausentes en los limites.
3. Pause/Play, Stop/Play y cambios pendientes no duplican clics ni pierden el
   acento. Stop cancela tambien los sonidos programados por adelantado.
4. Cambiar volumen, visualizacion o abrir ajustes no reinicia la reproduccion.
5. La entrada dura exactamente un compas al tempo elegido. No se cuenta como
   parte de A-B.
6. Valida controles y sincronizacion visual en ordenador y movil horizontal.
   Distingue precision del planificador de latencia real de altavoces/Bluetooth.

Anade pruebas focalizadas y ejecuta las existentes que cubran lo modificado.
Documenta los pasos de comprobacion auditiva y cualquier limitacion no verificada.
Actualiza el README para distinguir las funciones reales de las pendientes.

## Fuera de alcance y cierre

Sin melodia guia, acompanamiento, pistas externas, grabacion, evaluacion,
descansos configurables ni subida automatica de tempo.

Entrega codigo funcional, pruebas, documentacion y un resumen de la interfaz
del reproductor que reutilizara la
[entrega 2: melodia guia](02-melodia-guia.md). No implementes esa entrega.
