// Visual mockups only: navigation works; playback and settings do not control audio.
const device = document.body.dataset.device;
const vertical = device === "vertical";
const desktop = device === "ordenador";
const link = (text, target, classes = "") => `<a class="control ${classes}" href="#${target}">${text}</a>`;
const button = (text, classes = "") => `<button type="button" class="${classes}">${text}</button>`;
const header = (title, links, home = false) => `<header class="top">
  <a class="brand" href="#inicio"><b>≋</b>armonoisy</a>
  <div class="heading"><strong>${title}</strong>${home ? "" : '<span class="subtle">Armónica C · 4/4</span>'}</div>
  <nav class="links" aria-label="Navegación">${links}${link("Páginas", "galeria", "gallery-link")}</nav>
</header>`;
const footer = (text = "Diseño de ejemplo · sin audio") => `<footer class="foot"><span>${text}</span><span>${vertical ? "Móvil vertical · futuro" : "Maqueta"}</span></footer>`;
const transport = () => `<div class="transport">
  <div class="playback">${button("▶ Play", "primary")}${button("Ⅱ Pause")}${button("■ Stop")}</div>
  <span class="transport-note">Stop: vuelve al inicio del bucle</span>
  <div class="tempo">${button("−")}<strong>72 <small>BPM</small></strong>${button("+")}</div>
</div>`;
const measures = [
  { number: 3, label: "A", pitches: [65, 70, 60], tabs: ["4↓", "4↑", "5↑"] },
  { number: 4, label: "Ahora", pitches: [70, 65, 60], tabs: ["4↑", "4↓", "5↑"], bend: true },
  { number: 5, label: "B", pitches: [55, 60, 70], tabs: ["5↓", "5↑", "4↑"] }
];
function score(measure) {
  const notes = measure.pitches.map((y, index) => {
    const x = [82, 154, 226][index];
    return `<g fill="currentColor" stroke="currentColor" stroke-width="1.5">
      ${y === 70 ? `<path d="M${x - 11} 70h22"/>` : ""}
      <ellipse cx="${x}" cy="${y}" rx="6" ry="4" transform="rotate(-20 ${x} ${y})" ${index === 2 ? 'fill="none"' : ""}/>
      <path d="M${x + 6} ${y}V${y - 34}"/>
    </g>${measure.bend && index === 1 ? `<text x="${x - 22}" y="${y + 3}" fill="currentColor" font-size="19">♭</text>` : ""}`;
  }).join("");
  return `<svg class="score" viewBox="0 0 300 88" role="img" aria-label="Compás ${measure.number}: dos negras y una blanca">
    <path class="staff-lines" d="M12 20H288 M12 30H288 M12 40H288 M12 50H288 M12 60H288 M12 20V60 M288 20V60"/>
    <text x="20" y="61" fill="currentColor" font-family="Segoe UI Symbol" font-size="38">𝄞</text>${notes}
  </svg>`;
}
function music(context = false) {
  const visible = context ? [
    { number: 1, label: "Contexto", pitches: [70, 60, 55], tabs: ["4↑", "5↑", "5↓"] },
    { number: 2, label: "Contexto", pitches: [60, 65, 70], tabs: ["5↑", "4↓", "4↑"] },
    ...measures,
    { number: 6, label: "Contexto", pitches: [60, 65, 70], tabs: ["5↑", "4↓", "4↑"] }
  ] : measures;
  return `<div class="measures ${context ? "with-context" : ""}">${visible.map(m => `<article class="measure ${m.bend ? "current" : ""} ${m.label === "Contexto" ? "context" : ""}">
    <div class="measure-head"><span>Compás ${m.number}</span><span>${m.label}</span></div>
    ${score(m)}
    <div class="tabs">${m.tabs.map((note, i) => `<span class="${note.includes("↓") ? "draw" : ""}">${note}${m.bend && i === 1 ? "<small>⤵ −1 st</small>" : ""}</span>`).join("")}</div>
    <div class="duration" aria-label="Duraciones: 1, 1 y 2 pulsos"><span></span><span></span><span></span></div>
  </article>`).join("")}</div>`;
}
const range = (name, value) => `<div class="rangegroup"><input class="range" type="range" min="0" max="100" value="${value}" aria-label="${name} (ilustrativo)"><span class="value">${value} %</span></div>`;
const option = (name, value, description = "") => `<div class="option"><div><label>${name}</label>${description ? `<p class="description">${description}</p>` : ""}</div>${value}</div>`;
const toggle = (on = true) => `<span class="switch ${on ? "" : "off"}">${on ? "Activado" : "Desactivado"}</span>`;
const settingsNav = selected => `<nav class="settings-nav" aria-label="Opciones de práctica">${[
  ["acompanamiento", "Sonido"], ["vista", "Visualización"], ["ayudas", "Ayudas"], ["ajustes", "General"]
].map(([id, name]) => `<a href="#${id}" class="${id === selected ? "selected" : ""}">${name}</a>`).join("")}</nav>`;
const settings = (id, title, content) => `<section id="${id}" class="screen">
  ${header(title, link("← Práctica", "libre", "quiet"), true)}
  <main class="main"><div class="settings-layout">${settingsNav(id)}<div class="panel">${content}</div></div></main>
  ${id === "acompanamiento" && desktop ? transport() : ""}${footer("Ajustes ilustrativos · sin cambios reales")}
</section>`;
const holes = () => `<div class="holes">${Array.from({ length: 10 }, (_, i) => `<span class="hole ${i === 3 ? "active" : ""}">${i + 1}</span>`).join("")}</div>`;
const timeline = () => `<div class="timeline" aria-label="Bucle ilustrativo del compás 3 al 5">${Array.from({ length: 8 }, (_, i) => `<button type="button" class="${i >= 2 && i <= 4 ? "in-loop" : ""}"><span>${i + 1}</span>${i === 2 ? "<small>A</small>" : i === 4 ? "<small>B</small>" : ""}</button>`).join("")}</div>`;
const quickControls = () => `<aside class="practice-side" aria-label="Ajustes laterales de práctica">
  <div class="side-block"><div class="row"><h3>Tu bucle</h3>${link("Editar", "bucle", "quiet")}</div>
    ${timeline()}<p class="note">A–B: arrastra los extremos o mueve el bloque.</p>
    <div class="row">${button("← Mover")}${button("Mover →")}</div>
  </div>
  <div class="side-block"><div class="row"><h3>Sonido</h3>${link("Mezclar", "acompanamiento", "quiet")}</div>
    ${option("Metrónomo", toggle())}${option("Volumen", range("Volumen rápido", 75))}
  </div>
  <div class="side-block"><div class="row"><h3>Guía · armónica C</h3>${link("Ayudas", "ayudas", "quiet")}</div>
    ${holes()}<p class="bend-explanation"><strong>4↓ ⤵ −1 st</strong> · Aspira.</p>
    <div class="row side-timer"><span>◷ Aviso · 15 min</span>${link("Ajustar", "ayudas", "quiet")}</div>
  </div>
</aside>`;
function practice(focus = false) {
  return `<section id="${focus ? "atril" : "libre"}" class="screen ${focus ? "focus" : ""}">
    ${header("Paseo de tarde", focus
      ? link("Salir del atril", "libre", "quiet")
      : (desktop ? link("Cancionero", "cancionero", "quiet") : "") + link("Sonido", "acompanamiento", "quiet") + link("Vista", "vista", "quiet") + link("Atril", "atril", "quiet"))}
    <main class="main ${desktop && !focus ? "practice-layout" : ""}"><div class="practice-music">
      <div class="row loopbar"><div><strong>Compases 3–5 · ↻ sin límite</strong><p>Elige tu fragmento; tú decides cuándo avanzar.</p></div>${link("Cambiar bucle", "bucle", "quiet")}</div>
      ${music(desktop && !focus)}
      <div class="legend"><span>↑ soplar · ↓ aspirar · ⤵ bend</span><span>Longitud de las barras = duración</span></div>
      <div class="practice-bottom"><span class="subtle">Partitura y tablatura · ejemplo inventado</span><div class="links">${link("Grabación", "grabacion", "quiet")}${link("Mi progreso", "progreso", "quiet")}</div></div>
    </div>${desktop && !focus ? quickControls() : ""}</main>
    ${transport()}${footer("Maqueta sin audio · Stop vuelve al inicio del bucle")}
  </section>`;
}
const home = `<section id="inicio" class="screen">
  ${header("Inicio", link("Ajustes", "ajustes", "quiet"), true)}
  <main class="main"><div class="home ${desktop ? "home-desktop" : ""}">
    <div class="intro"><h1>¿Qué quieres tocar?</h1><p>Continúa donde lo dejaste o elige otra canción.</p></div>
    <div class="resume"><div class="label">Última canción</div><h2>Paseo de tarde</h2><p>Armónica C · Compases 3–5 · 72 BPM</p>${link("▶ Continuar", "libre", "primary")}</div>
    <div class="home-actions">${link("Mi cancionero →", "cancionero")}${link("＋ Añadir canción", "nueva")}</div>
    ${desktop ? `<div class="recent"><h3>A mano para tu próxima práctica</h3><div class="recent-grid"><div><strong>Último fragmento</strong><p>Compases 3–5 · Casi</p>${link("Ver progreso →", "progreso", "quiet")}</div><div><strong>Preparar la práctica</strong><p>Guía de armónica y timer de aviso.</p>${link("Ver ayudas →", "ayudas", "quiet")}</div></div></div>` : ""}
  </div></main>${footer()}
</section>`;
const sound = settings("acompanamiento", "Sonido", `
  <h2>Solo lo que necesitas oír</h2>
  <div class="sound-columns"><div>
  ${option("Volumen", range("Volumen general", 75))}
  ${option("Metrónomo", toggle())}
  ${option("Acompañamiento", '<select aria-label="Acompañamiento"><option>Base por acordes</option><option>Sin base</option><option>Mi audio</option></select>')}
  ${option("Tempo", '<span class="chip">72 BPM · original 96</span>')}
  ${desktop ? `<details><summary>Base y sincronización</summary><p>C · 4/4 · acordes C / F / G. Carga audio propio o autorizado y alinea su comienzo con los compases.</p>${button("Cargar pista")}${button("Alinear compases")}</details>` : ""}
  </div><details class="mixer" ${desktop ? "open" : ""}><summary>Mezclar instrumentos</summary>
    ${option("Melodía guía", range("Melodía guía", 30))}
    ${option("Piano", range("Piano", 65))}
    ${option("Bajo", range("Bajo", 45))}
    ${option("Percusión", range("Percusión", 25))}
    <p class="note">Solo con pistas separadas o generadas. Un MP3 mezclado tiene un volumen común.</p>
    ${desktop ? "" : `<details><summary>Base y sincronización</summary><p>C · 4/4 · acordes C / F / G. Carga audio propio o autorizado y alinea sus compases.</p>${button("Cargar pista")}${button("Alinear compases")}</details>`}
  </details></div>
  <p class="note">Cambios de tempo en la siguiente vuelta; ralentizar sin cambiar afinación, con límites de calidad.</p>
`);
const view = settings("vista", "Visualización", `
  <h2>Elige qué ver al tocar</h2>
  ${option("Partitura", toggle(), "Pentagrama y figuras rítmicas")}
  ${option("Tablatura", toggle(), "Agujero, aire y bend")}
  ${option("Barras de duración", toggle(), "Longitud proporcional a los pulsos")}
  ${option("Guía de armónica", link("Ver guía →", "ayudas"), "Ayuda aparte para no tapar la música")}
  ${desktop ? `<div class="notation-preview"><h3>Vista previa · compás 4</h3>${score(measures[1])}<div class="tabs"><span>4↑</span><span class="draw">4↓ <small>⤵ −1 st</small></span><span>5↑</span></div></div>` : ""}
  <p class="note">Puedes dejar solo partitura, solo tablatura o ambas.</p>
`);
const helps = settings("ayudas", "Ayudas", `
  <h2>Armónica en C</h2>
  ${holes()}
  <p class="bend-explanation"><strong>4↓ ⤵ −1 st</strong> · Aspira y baja un semitono.</p>
  <p class="note">↑ soplar · ↓ aspirar. La guía sigue la nota actual; ejemplo estático.</p>
  ${option("Timer de aviso", '<span class="chip">15 min</span>', "Avisa sin interrumpir")}
  <details ${desktop ? "open" : ""}><summary>Preparación del bucle</summary>
    ${option("Cuenta de entrada", '<span class="chip">1 compás</span>')}
    ${option("Descanso entre vueltas", '<span class="chip">2 pulsos</span>')}
    ${option("Compás previo de contexto", toggle(false))}
  </details>
`);
const general = settings("ajustes", "Configuración", `
  <h2>A tu gusto</h2>
  ${option("Tema", '<select aria-label="Tema"><option>Claro</option><option>Oscuro</option></select>')}
  ${option("Tamaño", '<select aria-label="Tamaño"><option>Normal</option><option>Grande</option></select>')}
  ${option("Color", '<select aria-label="Color"><option>Verde</option><option>Azul</option><option>Violeta</option></select>')}
  <details ${desktop ? "open" : ""}><summary>Valores para canciones nuevas</summary><p>BPM: usar los guardados en la canción. Armónica: C. Metrónomo: desactivado.</p></details>
  ${button("Restaurar valores por defecto", "quiet")}
`);
const loop = `<section id="bucle" class="screen">${header("Elegir bucle", link("← Volver", "libre", "quiet"), true)}
  <main class="main"><div class="home"><div class="intro"><h1>¿Qué compases quieres repetir?</h1><p>Toca el primero y el último, o arrastra sobre la partitura.</p></div>
    <div class="panel">${timeline()}<div class="row"><label>Desde <input class="number" aria-label="Primer compás" type="number" value="3" min="1"></label><label>Hasta <input class="number" aria-label="Último compás" type="number" value="5" min="1"></label></div>
    <div class="row" style="margin-top:16px">${button("← Mover")}${button("Mover →")}</div><p class="note">Repetición sin límite · puedes ampliar, reducir o solapar.</p></div>
    <div style="margin-top:16px">${link("Volver a practicar", "libre", "primary")}</div>
  </div></main>${footer("Selección ilustrativa · no modifica el bucle")}</section>`;
const progress = settings("progreso", "Mi progreso", `<h2>¿Cómo te sale este fragmento?</h2><p>Paseo de tarde · Compases 3–5</p><div class="status-buttons">${button("No me sale")}${button("Casi", "primary")}${button("Lo tengo")}</div>
  ${option("Tempo cómodo", '<label><input class="number" type="number" value="72" aria-label="Tempo cómodo"> BPM</label>')}
  ${desktop ? `<div class="fragment-list"><h3>Otros fragmentos de esta canción</h3>${option("Compases 1–2", '<span class="chip">Lo tengo · 88 BPM</span>')}${option("Compases 6–8", '<span class="chip">No me sale · 60 BPM</span>')}</div>` : ""}
  <div class="row">${link("Volver a practicar", "libre", "primary")}${link("Escuchar tomas", "grabacion", "quiet")}</div><p class="note">Marca tú el nivel. Sin evaluación automática ni pasos obligatorios.</p>`);
const library = `<section id="cancionero" class="screen">${header("Mi cancionero", link("← Inicio", "inicio", "quiet"), true)}<main class="main"><div class="library">
  <div class="row"><h1>Mi cancionero</h1>${link("＋ Añadir", "nueva")}</div>
  <div class="library-filters"><input class="text-input" type="search" placeholder="Buscar canción" aria-label="Buscar canción (ilustrativo)"><select aria-label="Filtrar por armónica (ilustrativo)"><option>Armónica C</option><option>Todas</option></select></div>
  <div class="song-list">${["Paseo de tarde", "Brisa del río", "Camino de vuelta"].map((name, i) => `<article class="song-row"><div><h3>${name}</h3><p>C · ${[96, 80, 104][i]} BPM ${desktop ? "· Partitura + tablatura guardadas" : ""}</p></div><span class="chip">${["Casi", "Por empezar", "Lo tengo"][i]}</span>${i === 0 ? link("Abrir", "libre", "primary") : button("Abrir")}</article>`).join("")}</div>
  <p class="note">Canciones inventadas de ejemplo · búsqueda y filtros ilustrativos.</p>
</div></main>${footer()}</section>`;
const newSong = `<section id="nueva" class="screen">${header("Añadir canción", link("← Cancionero", "cancionero", "quiet"), true)}<main class="main"><div class="editor-layout">
  <div class="panel"><h2>1. Datos de la canción</h2><label class="field">Nombre<input class="text-input" value="Mi nueva canción"></label><div class="form-pair"><label class="field">Armónica<select><option>Diatónica C</option></select></label><label class="field">Tempo inicial<input class="number" type="number" value="96" aria-label="BPM predeterminados"></label></div>
    <h3>2. Partitura y tablatura</h3><div class="import-box"><p>Importa MusicXML / MIDI o escribe las notas.</p><div class="links">${button("Elegir archivo")}${button("Introducir notas")}</div></div>
  </div><div class="panel review-panel"><h2>3. Revisar y guardar</h2><p>Comprueba notas, duración y compatibilidad con tu armónica antes de guardar.</p>${desktop ? score(measures[0]) + '<p class="preview-tab">4↓　4↑　5↑</p>' : ""}<p class="note">Partitura y tablatura quedarán asociadas a la canción.</p>${button("Guardar canción", "primary")}</div>
</div></main>${footer("Importación y guardado ilustrativos · sin cambios reales")}</section>`;
const recording = `<section id="grabacion" class="screen">${header("Grabación", link("← Práctica", "libre", "quiet"), true)}<main class="main"><div class="record-layout"><div class="panel"><h2>Escúchate sin puntuaciones</h2><p>Paseo de tarde · Compases 3–5 · 72 BPM</p>
  <div class="waveform" aria-label="Forma de onda de ejemplo">${[18,32,55,26,70,42,30,62,86,44,22,58,77,32,48,62,28,40,67,84,38,22,52,30].map(height => `<span style="height:${height}%"></span>`).join("")}</div>
  <div class="links">${button("● Grabar", "primary")}${button("■ Detener")}${button("▶ Escuchar")}</div><p class="note">Propuesta para después del núcleo inicial; sin acceso al micrófono.</p></div>
  <div class="panel"><h2>Mis tomas</h2>${option("Toma 1 · 00:18", button("▶ Escuchar"))}${option("Toma 2 · 00:21", button("▶ Escuchar"))}<details ${desktop ? "open" : ""}><summary>Afinación de nota sostenida</summary><p>Explorar una guía de afinación y estabilidad, sin evaluar automáticamente la canción.</p></details></div>
</div></main>${footer("Grabación y tomas simuladas · sin audio")}</section>`;
const pages = [
  ["libre", "Práctica libre", "01-practica-libre.png", "Bucle libre y música; ajustes laterales en ordenador."],
  ["acompanamiento", "Acompañamiento y tempo", "02-acompanamiento-y-tempo.png", "Base, metrónomo, volumen y mezcla por pistas."],
  ["atril", "Modo atril", "03-modo-atril.png", "Notas grandes y controles mínimos."],
  ["inicio", "Inicio", "04-inicio.png", "Continuar, elegir o añadir una canción."],
  ["vista", "Visualización", "05-visualizacion.png", "Elegir partitura, tablatura y duración."],
  ["ayudas", "Guía y timer", "06-guia-y-timer.png", "Armónica en C, preparación y aviso."],
  ["ajustes", "Configuración general", "07-configuracion-general.png", "Apariencia, valores iniciales y restauración."],
  ["bucle", "Selección del bucle", "08-seleccion-del-bucle.png", "Elegir, ampliar, reducir o mover compases."],
  ["progreso", "Mi progreso", "09-progreso.png", "Tres niveles y tempo cómodo, sin obligaciones."],
  ["cancionero", "Mi cancionero", "10-cancionero.png", "Buscar y recuperar canciones guardadas."],
  ["nueva", "Añadir canción", "11-anadir-cancion.png", "Importar, revisar y guardar partitura y tablatura."],
  ["grabacion", "Grabación y escucha", "12-grabacion-y-escucha.png", "Propuesta posterior: grabarte y comparar tomas."]
];
const gallery = `<section id="galeria" class="screen catalogue"><header class="catalogue-heading"><div><h1>Todas las páginas</h1><p>${desktop ? "Ordenador · más contexto y ajustes a mano" : vertical ? "Móvil vertical · propuesta futura" : "Móvil horizontal · controles compactos"} · 12 maquetas</p></div><p>Elige una imagen para abrir su página.</p></header>
  <nav class="catalogue-grid" aria-label="Galería completa">${pages.map(([id, title, file, description], i) => `<a class="gallery-card" href="#${id}"><img src="${file}" alt="${title}" loading="lazy"><div><h2>${String(i + 1).padStart(2, "0")} · ${title}</h2><p>${description}</p></div></a>`).join("")}</nav>
  <p class="note">Navegación real entre maquetas. Música, controles y datos simulados; no es una aplicación funcional.</p></section>`;
document.body.innerHTML = practice() + sound + practice(true) + home + view + helps + general + loop + progress + library + newSong + recording + gallery;
function showView() {
  const id = location.hash.slice(1) || "galeria";
  const target = document.getElementById(id) || document.getElementById("galeria");
  document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("active", screen === target));
  document.body.classList.toggle("has-hash", Boolean(location.hash));
}
addEventListener("hashchange", showView);
showView();
