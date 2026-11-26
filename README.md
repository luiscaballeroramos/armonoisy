# Armonoisy

Primera interfaz de practica libre para armonica, construida con Streamlit.
Solo incluye esta pagina; las demas propuestas permanecen en [ideas/](ideas/).

## Ejecutar en Windows

Desde la carpeta del proyecto, con Python 3.10 o posterior y el repositorio
`streamlit-template` en la carpeta hermana `..\streamlit-template`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

Abre la direccion que muestre Streamlit. Detenlo con Ctrl+C.
No requiere credenciales ni servicios externos.

## Alcance actual

- Carga [Stand by Me](partituras/formateadas/stand-by-me.json) en formato JSON v3;
  muestra sus compases, partitura, tablatura y duraciones.
- Las notas y tablaturas se centran en fondos de anchura proporcional a su
  duracion, que cubren cada compas sin huecos: dentro del bucle, naranjas para
  soplar, azules para aspirar y grises para silencios o notas sin tablatura.
  Los compases fuera del bucle se muestran en escala de grises. La tablatura muestra solo
  el numero de agujero y la flecha.
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
- Reproduccion y tempo en una fila compacta al final del bloque de musica;
  en pantallas estrechas la fila se desplaza horizontalmente. Partitura y
  tablatura ocultables por separado.
- Guia de armonica de frente con sus diez agujeros bajo la partitura; la
  indicacion de la nota actual esta pendiente de la reproduccion.
- En los ajustes se elige si las cintas muestran toda la cancion, el bucle con
  un compas adyacente a cada lado, o solo el bucle. En los limites solo se
  incluye el contexto disponible.
- Los ajustes estan en un desplegable de ancho completo al final, con opciones
  agrupadas horizontalmente; conservan sus valores durante la sesion.
- Estado durante la sesion de Streamlit, no guardado persistente en disco.

Play/Pause/Stop, metronomo, volumen y timer estan desactivados y etiquetados:
todavia no hay audio, avance automatico, sincronizacion ni avisos reales.
La aplicacion lee la partitura sin modificar el JSON original.

## Estructura minima

- [app.py](app.py): entrada y registro de paginas con `st.navigation`.
- [pages/practica_libre.py](pages/practica_libre.py): interfaz y estado de esta pagina.
- `streamlit_template`: dependencia externa editable; no se copia en esta app.
- [assets/practica.css](assets/practica.css): estilos propios de practica.
- [.streamlit/config.toml](.streamlit/config.toml): tema.
- [tests/test_practica.py](tests/test_practica.py): pruebas de los controles.

Para ampliar, anade un archivo en `pages/` y registra otro `st.Page` en `app.py`.
No hace falta crear paginas vacias ni un sistema de rutas propio.

Base: [streamlit-template](https://github.com/luiscaballeroramos/streamlit-template).
`requirements.txt` instala la copia local en modo editable. La pagina importa
`Layout` y `render_layout` desde `streamlit_template`, sin duplicar su codigo.
Los cambios en la plantilla se aprovechan al reiniciar Streamlit.
La instalacion requiere tener ambos repositorios; para desplegar en otro equipo
hay que proporcionar tambien la plantilla.
El layout se usa en modo fluido para no imponer el minimo de 600 px del modo
pantalla a un movil horizontal.
Los estilos de contenedores dependen del DOM de Streamlit; revisarlos al actualizarlo.

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
