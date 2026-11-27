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
- Bucle A-B editable pulsando el mapa: fuera se amplia, dentro se mueve el
  extremo mas cercano (en empate, A); pulsar un extremo lo retira del bucle.
  El ultimo compas seleccionado se mantiene al pulsarlo.
  El boton para repetir el compas actual esta junto al de volver al inicio y
  permanece desactivado hasta que exista reproduccion.
- Reproduccion real con Web Audio y metronomo en una fila compacta: Play
  comienza en A, Pause silencia y conserva la posicion, Stop vuelve a A, y el
  bucle A-B se repite sin limite. El primer pulso del compas lleva un acento;
  la posicion muestra compas y pulso. No reproduce melodias.
  Los cambios de tempo y de bucle durante la reproduccion se aplican en la
  siguiente vuelta; el tempo pendiente aparece en el estado del reproductor.
  Se admite 4/4 con BPM de negra; para otros compases Play queda desactivado y
  se muestra la limitacion. En pantallas estrechas la fila se desplaza
  horizontalmente. Partitura y tablatura se pueden ocultar por separado.
- El tempo inicial usa `tempoBpm` de la partitura si esta entre 40 y 160 BPM,
  incluidos valores decimales; si falta, usa 72 BPM. Si esta fuera del intervalo,
  pide elegir un tempo para la sesion, sin modificar la partitura. Los botones
  cambian 1 BPM; el deslizador se adapta a los decimales del valor inicial.
  Con muchos decimales, el navegador puede limitar la precision del deslizador;
  el tempo mostrado se conserva hasta que se modifica. En 4/4, BPM cuenta negras.
- Guia de armonica de frente con sus diez agujeros bajo la partitura; la
  indicacion de la nota actual esta pendiente de la reproduccion.
- Por defecto, las cintas muestran solo los compases del bucle seleccionado.
  En los ajustes se puede mostrar toda la cancion o incluir un compas adyacente
  a cada lado; en los limites solo se incluye el contexto disponible.
- En Sonido y avisos se puede activar o silenciar el metronomo y regular el
  volumen entre 0% y 100% (75% inicial). Silenciarlo no detiene el reloj ni el
  seguimiento visual.
- La cabecera tiene un boton para alternar entre la practica y una pantalla
  completa de ajustes. Volver conserva bucle, tempo, opciones y la posicion
  horizontal durante la sesion, dentro del recorrido disponible si cambia el
  contenido. Los ajustes pueden desplazarse independientemente.
- El modo `screen` de la plantilla dedica todo el marco a la vista activa.
  El titulo aparece en la barra superior; en pantallas estrechas se oculta el
  resumen para dejar espacio al boton y a los controles de Streamlit.
- Dentro de musica, la vista compacta reparte el alto en selector (15%),
  partitura/tablatura (55%), guia (10%) y controles (20%), sin scroll vertical.
  En Ajustes > Distribucion del bloque de musica se cambian tres porcentajes
  entre 10% y 25%; partitura/tablatura recibe el resto para sumar siempre 100%.
  El contenido llena el alto asignado, sin los antiguos topes de 200/44 px,
  y los margenes exteriores e interiores son reducidos.
  Textos, figuras y controles se reducen cuando falta alto. Las zonas mantienen
  el desplazamiento horizontal para recorrer la cancion o controles que no caben
  a lo ancho. La clave y el compas permanecen fijos al desplazar la partitura.
- Estado durante la sesion de Streamlit, no guardado persistente en disco.

Pendiente: cuenta de entrada, repetir el compas actual, pruebas cuantitativas
de 100 vueltas del planificador y comprobacion auditiva en movil y ordenador.
No se reproduce melodia guia ni acompanamiento. La aplicacion lee la partitura
sin modificar el JSON original.

## Estructura minima

- [app.py](app.py): entrada y registro de paginas con `st.navigation`.
- [pages/practica_libre.py](pages/practica_libre.py): interfaz y estado de esta pagina.
- `streamlit_template`: dependencia externa; no se copia en esta app.
- [assets/practica.css](assets/practica.css): estilos propios de practica.
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
```
