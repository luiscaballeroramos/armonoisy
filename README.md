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
- Las notas, tablaturas y barras comparten una escala proporcional al tiempo.
  Los compases estrechos se pueden desplazar horizontalmente.
- Bucle A-B ampliable, reducible a un compas y desplazable sin salir de la cancion.
- Tempo mediante deslizador y botones; partitura/tablatura ocultables por separado.
- Guia de armonica para la segunda nota con tablatura del compas de referencia;
  si solo hay una, muestra esa nota.
- Ordenador con ajustes laterales; en pantallas pequenas, controles debajo de
  la musica y solo los compases del bucle visibles.
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
