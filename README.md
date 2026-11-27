# Armonoisy

Primera interfaz de practica libre para armonica, construida con Streamlit.
Solo incluye esta pagina; las demas propuestas permanecen en [ideas/](ideas/).

## Ejecutar en Windows

Desde la carpeta del proyecto, con Python 3.10 o posterior y Git instalado:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

Abre la direccion que muestre Streamlit. Detenlo con Ctrl+C.
La instalacion descarga la plantilla publica desde GitHub. La aplicacion no
requiere credenciales ni servicios externos para ejecutarse.

## Alcance actual

- Carga [Stand by Me](partituras/formateadas/stand-by-me.json) en formato JSON v3;
  muestra sus compases, partitura, tablatura y duraciones.
- Las notas y tablaturas se centran en fondos de anchura proporcional a su
  duracion, que cubren cada compas sin huecos: dentro del bucle, naranjas para
  soplar, azules para aspirar y grises para silencios o notas sin tablatura.
  Los compases fuera del bucle se muestran en escala de grises. La tablatura muestra solo
  el numero de agujero y la flecha.
  Las cabeceras de compas muestran solo el numero y la linea divisoria;
  el estado del bucle se conserva en los colores y las etiquetas accesibles.
  Los fondos se pueden ocultar desde Visualizacion. Compases, partitura y
  tablatura se desplazan juntos y estan alineados. La partitura se dibuja como una
  sola secuencia, con ligaduras continuas entre compases. El boton fijo a la
  izquierda vuelve al inicio del bucle.
  Desplazar la cinta no modifica
  el bucle. La cinta tambien admite teclado:
  selecciona la zona de musica y usa las flechas.
- Al mostrar la partitura, una celda fija a la izquierda indica la clave de sol
  y el compas de la cancion mientras se desplaza la cinta.
- El bucle inicial abarca toda la cancion. Bucle A-B editable pulsando el mapa:
  fuera se amplia, dentro se mueve el
  extremo mas cercano (en empate, A); pulsar un extremo lo retira del bucle.
  El ultimo compas seleccionado se mantiene al pulsarlo.
  El boton para repetir el compas actual esta junto al de volver al inicio.
  Se activa al reproducir o pausar y selecciona el compas actual como bucle.
  Si se pulsa mientras suena, el cambio se aplica al siguiente limite del bucle.
- Reproduccion real con Web Audio y metronomo en una fila compacta: Play
  comienza en A, Pause silencia y conserva la posicion, Stop vuelve a A, y el
  bucle A-B se repite sin limite. Se puede activar una cuenta de entrada de
  cuatro pulsos; solo suena al iniciar desde Stop, no al reanudar ni al repetir
  el bucle. Pausar durante la cuenta y reanudar empieza directamente en A.
  El primer pulso del compas lleva un acento;
  la fila muestra los botones y el tempo, sin indicadores de pausa o posicion.
  La melodia guia reproduce las notas de la partitura sincronizadas con el mismo
  reloj y respeta el bucle A-B.
  Los cambios de tempo y de bucle durante la reproduccion se aplican en la
  siguiente vuelta; se muestra un aviso con los valores pendientes.
  Se admite 4/4 con BPM de negra; para otros compases Play queda desactivado y
  se muestra la limitacion. La fila distribuye los controles y el tempo
  proporcionalmente al espacio disponible; en pantallas muy estrechas se
  desplaza horizontalmente. Partitura y tablatura se pueden ocultar por separado.
  El boton «Probar» recorre los diez agujeros, primero aspirando y despues
  soplando, y marca cada nota en la guia. Stop interrumpe la preescucha.
  Las sopladas son grabaciones de una Hohner Special 20 afinada en C, de la
  [Versilian Community Sample
  Library](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e),
  publicadas bajo CC0 1.0. Las aspiradas proceden de grabaciones naturales en
  una armonica en si bemol de [Gabriel Cabral y Pedro Carvalho
  Brom](https://doi.org/10.5281/zenodo.24377165), bajo CC BY 4.0: se recortan
  y transponen a las alturas escritas, por lo que aproximan, pero no reproducen
  exactamente, las aspiradas de una armonica en C. La direccion se elige con
  la tablatura; una nota sin tablatura usa una muestra soplada. Las muestras
  se cargan solo al solicitar la preescucha o activar la melodia guia; su
  procedencia y modificaciones estan en `static/harmonica/SOURCE.txt`.
- El tempo inicial usa `tempoBpm` de la partitura si esta entre 40 y 160 BPM,
  incluidos valores decimales: Stand by Me tiene 120 BPM y Noche de Paz conserva
  72 BPM. Si falta, usa 72 BPM. Si esta fuera del intervalo, pide elegir un
  tempo para la sesion, sin modificar la partitura. Los botones
  cambian 1 BPM; el deslizador se adapta a los decimales del valor inicial.
  Con muchos decimales, el navegador puede limitar la precision del deslizador;
  el tempo mostrado se conserva hasta que se modifica. En 4/4, BPM cuenta negras.
- Durante la reproduccion, un rectangulo discreto marca el evento actual en
  partitura y tablatura, y una linea vertical tenue permanece en el centro
  mientras la cinta avanza de derecha a izquierda al tempo del reloj. Al repetir,
  la cinta vuelve a A. Pausar congela los indicadores; detener los oculta y
  vuelve al inicio del bucle.
  La guia de armonica, centrada y proporcionada bajo la partitura, tiene diez
  agujeros numerados. Con la melodia activa se ilumina el agujero
  correspondiente en naranja para soplar o azul para aspirar, y se indican
  la nota y la direccion.
  Los numeros mantienen su altura y las casillas su tamano durante las notas
  y los silencios, sin saltos al cambiar el resaltado.
- Por defecto, las cintas muestran solo los compases del bucle seleccionado,
  que inicialmente abarca toda la cancion. En los ajustes se puede mostrar
  toda la cancion o incluir un compas adyacente a cada lado; en los limites
  solo se incluye el contexto disponible.
- En Sonidos el metronomo esta desactivado inicialmente; se puede activar y
  regular su volumen entre 0% y 100% (75% inicial). Silenciarlo no detiene el
  reloj ni el seguimiento visual. La cuenta de entrada esta desactivada
  inicialmente. La melodia guia esta activada inicialmente
  y tiene volumen propio (60% inicial). Si no se pueden cargar sus muestras,
  se puede continuar sin melodia y activar el metronomo en los ajustes.
- Piano y bajo son pistas opcionales con volumen independiente (60% inicial),
  desactivadas por defecto. Se pueden usar por separado o junto con la armonica.
  Ambos tocan la melodia de la partitura; el bajo la reproduce tres octavas mas
  grave. No generan acordes ni una linea de bajo distinta. Comparten el bucle y
  el reloj de la melodia; las muestras se cargan al activar cada instrumento.
  Si falla una carga, se puede continuar sin ese instrumento o desactivarlo y
  volver a activarlo para reintentar.
  El piano procede de [VCSL](https://github.com/sgossner/VCSL) y el bajo
  electrico de [FreePats](https://github.com/freepats/electric-bass-YR), ambos
  bajo CC0 1.0. Las fuentes y sus alturas reales se detallan en
  [piano](static/piano/SOURCE.txt) y [bajo](static/bass/SOURCE.txt).
- La cabecera tiene un boton para alternar entre la practica y una pantalla
  completa de ajustes. Volver conserva bucle, tempo, opciones y la posicion
  horizontal durante la sesion, dentro del recorrido disponible si cambia el
  contenido. Ajustes y Sonidos aparecen lado a lado, sin desplegables ni
  controles de distribucion. Las opciones pueden desplazarse si falta espacio.
- El modo `screen` de la plantilla dedica todo el marco a la vista activa.
  El titulo aparece en la barra superior; en pantallas estrechas se oculta el
  resumen para dejar espacio al boton y a los controles de Streamlit.
- Dentro de musica, la vista compacta reparte el alto en selector (15%),
  partitura/tablatura (50%), guia (15%) y controles (20%), sin scroll vertical.
  La guia reserva al menos un 15%, tambien en sesiones abiertas con repartos
  anteriores; el espacio adicional se resta de la partitura. Se conservan
  los otros porcentajes guardados y las guias que ya tenian mas espacio.
  La armonica mantiene su proporcion dentro del ancho y alto de su fila,
  con margen para la sombra, sin invadir la partitura ni los controles.
  Los numeros se centran en los agujeros y la nota activa usa la banda inferior.
  El contenido llena el alto asignado, sin los antiguos topes de 200/44 px,
  y los margenes exteriores e interiores son reducidos.
  Textos, figuras y controles se reducen cuando falta alto. Las zonas mantienen
  el desplazamiento horizontal para recorrer la cancion o controles que no caben
  a lo ancho. La clave y el compas permanecen fijos al desplazar la partitura.
- Estado durante la sesion de Streamlit, no guardado persistente en disco.

El planificador se comprueba con un reloj simulado durante 100 vueltas de tres
compases, a 60, 120 y 83,3 BPM, con una desviacion menor de 1 ms. Esta prueba
no mide la latencia real del dispositivo.
Pendiente: comprobacion auditiva de los limites del bucle en movil y ordenador.
La preescucha solo demuestra el timbre de armonica; no reproduce la cancion
completa. La aplicacion lee la partitura sin modificar el JSON original.

## Estructura minima

- [app.py](app.py): entrada y registro de paginas con `st.navigation`.
- [pages/practica_libre.py](pages/practica_libre.py): interfaz y estado de esta pagina.
- `streamlit_template`: dependencia externa; no se copia en esta app.
- [assets/practica.css](assets/practica.css): estilos propios de practica.
- `static/harmonica/`: muestras CC0 y CC BY 4.0 de armonica para la guia y la preescucha.
- `static/piano/` y `static/bass/`: muestras CC0 para las pistas de piano y bajo.
- [.streamlit/config.toml](.streamlit/config.toml): tema.
- [tests/test_practica.py](tests/test_practica.py): pruebas de los controles.

Para ampliar, anade un archivo en `pages/` y registra otro `st.Page` en `app.py`.
No hace falta crear paginas vacias ni un sistema de rutas propio.

Base: [streamlit-template](https://github.com/luiscaballeroramos/streamlit-template).
`requirements.txt` instala la plantilla desde GitHub, tambien en Streamlit
Community Cloud. La pagina importa `Layout` y `render_layout` desde
`streamlit_template`, sin duplicar su codigo.
Para desarrollar con una copia local editable de la plantilla en la carpeta
hermana `..\streamlit-template`, instalala despues de las dependencias:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ..\streamlit-template
```

Los cambios en esa copia se aprovechan al reiniciar Streamlit.
El layout usa `height="screen"` con dos zonas superpuestas, de las que solo se
muestra la vista activa, en ambas orientaciones. La app anula el minimo de
600 px de la plantilla para que el marco quepa tambien en ventanas bajas.
Musica usa una cuadricula interior con pesos porcentuales y escala su contenido
segun el alto asignado.
Los estilos de contenedores dependen del DOM de Streamlit; revisarlos al actualizarlo.

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test .\tests\test_practice_player_audio.cjs
```
