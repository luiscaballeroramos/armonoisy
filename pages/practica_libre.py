from base64 import b64encode
from fractions import Fraction
import json
import math
from pathlib import Path
import re
from typing import NamedTuple

import streamlit as st

from streamlit_template import Layout, render_layout


class Event(NamedTuple):
    pitch: str | None
    tab_value: str | None
    figure: str
    dots: int
    beats: Fraction
    tuplet: tuple[int, int, str] | None
    tie: str | None
    bend: int

    @property
    def hole(self) -> int | None:
        return int(self.tab_value.lstrip("+")) if self.tab_value else None

    @property
    def blow(self) -> bool:
        return bool(self.tab_value and self.tab_value.startswith("+"))

    @property
    def tab(self) -> str:
        return f"{self.hole}{'↑' if self.blow else '↓'}" if self.hole else "—"


FIGURES = {
    "whole": (Fraction(4), "𝅝"),
    "half": (Fraction(2), "𝅗𝅥"),
    "quarter": (Fraction(1), "♩"),
    "eighth": (Fraction(1, 2), "♪"),
    "16th": (Fraction(1, 4), "𝅘𝅥𝅯"),
    "32nd": (Fraction(1, 8), "𝅘𝅥𝅰"),
    "64th": (Fraction(1, 16), "𝅘𝅥𝅱"),
}
RESTS = {
    "whole": "𝄻", "half": "𝄼", "quarter": "𝄽", "eighth": "𝄾",
    "16th": "𝄿", "32nd": "𝅀", "64th": "𝅁",
}


def parse_event(raw: dict) -> Event:
    if "slur" in raw:
        raise ValueError("Las ligaduras de expresión aún no están disponibles en esta vista.")
    duration = raw["duration"]
    if isinstance(duration, str):
        dots = int(duration.startswith("dotted-"))
        figure = duration.removeprefix("dotted-")
    else:
        figure = duration["figure"]
        dots = duration["dots"]
    if figure not in FIGURES or not isinstance(dots, int) or not 0 <= dots <= 3:
        raise ValueError(f"Figura no admitida: {duration!r}")
    beats = FIGURES[figure][0] * sum((Fraction(1, 2**i) for i in range(dots + 1)), Fraction())
    tuplet = None
    if "tuplet" in raw:
        group = raw["tuplet"]
        actual, normal, boundary = group["actual"], group["normal"], group["boundary"]
        if (not isinstance(actual, int) or not isinstance(normal, int)
                or actual < 2 or normal < 1 or boundary not in ("start", "continue", "stop")):
            raise ValueError("Tresillo o grupo irregular inválido.")
        beats *= Fraction(normal, actual)
        tuplet = (actual, normal, boundary)
    pitch = raw.get("pitch")
    tab = raw.get("tab")
    if raw.get("rest") is True:
        if pitch is not None or tab is not None:
            raise ValueError("Un silencio no puede tener altura o tablatura.")
    elif not isinstance(pitch, str) or not re.fullmatch(r"[A-G](?:#|b)?[0-9]", pitch):
        raise ValueError(f"Altura inválida: {pitch!r}")
    if tab is not None and (not isinstance(tab, str) or not re.fullmatch(r"\+?(?:10|[1-9])", tab)):
        raise ValueError(f"Tablatura inválida: {tab!r}")
    tie = raw.get("tie")
    if tie is not None and (pitch is None or tie not in ("start", "stop")):
        raise ValueError("Ligadura inválida.")
    bend = raw.get("bendSemitones", 0)
    if not isinstance(bend, int) or not 0 <= bend <= 3:
        raise ValueError("Bend inválido.")
    return Event(pitch, tab, figure, dots, beats, tuplet, tie, bend)


def load_score(path: Path) -> tuple[str, str, str, tuple[tuple[Event, ...], ...]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data["version"] != 3:
        raise ValueError("La partitura debe usar el formato JSON v3.")
    title = data["title"]
    instrument = data["instrument"]["key"]
    meter = data["timeSignature"]
    if not all(isinstance(value, str) and value for value in (title, instrument, meter)):
        raise ValueError("Faltan el título, la armónica o el compás.")
    measures = []
    for number, measure in enumerate(data["measures"], 1):
        if measure["number"] != number or not measure["events"]:
            raise ValueError("Los compases deben estar numerados consecutivamente y contener eventos.")
        measures.append(tuple(parse_event(event) for event in measure["events"]))
    if not measures:
        raise ValueError("La partitura no contiene compases.")
    return title, instrument, meter, tuple(measures)


try:
    TITLE, INSTRUMENT, METER, MEASURES = load_score(
        Path(__file__).resolve().parents[1] / "partituras" / "formateadas" / "stand-by-me.json"
    )
except (OSError, ValueError, KeyError, TypeError) as exc:
    st.error(f"No se pudo cargar la partitura: {exc}")
    st.stop()

HORIZONTAL = Layout(
    (("music", "settings"), ("transport", "settings")), (3, 1), (4, 1), min_height=0,
)
VERTICAL = Layout(
    (("music",), ("transport",), ("settings",)), (1,), (3, 1, 2), min_height=0,
)


def initialise_state() -> None:
    start = min(3, len(MEASURES))
    end = min(5, len(MEASURES))
    defaults = {
        "practice_loop": (start, end),
        "practice_measure": min(4, end),
        "practice_tempo": 72,
        "practice_score": True,
        "practice_tabs": True,
        "practice_duration": True,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def adjust_reference() -> None:
    start, end = st.session_state.practice_loop
    st.session_state.practice_measure = min(end, max(start, st.session_state.practice_measure))


def move_loop(offset: int) -> None:
    start, end = st.session_state.practice_loop
    if not 1 <= start + offset <= end + offset <= len(MEASURES):
        raise ValueError("El bucle debe permanecer dentro de la canción.")
    st.session_state.practice_loop = (start + offset, end + offset)
    st.session_state.practice_measure += offset


def change_tempo(offset: int) -> None:
    tempo = st.session_state.practice_tempo + offset
    if not 40 <= tempo <= 160:
        raise ValueError("El tempo debe estar entre 40 y 160 BPM.")
    st.session_state.practice_tempo = tempo


def pitch_y(pitch: str) -> int:
    step = "CDEFGAB".index(pitch[0])
    return 95 - 5 * ((int(pitch[-1]) * 7 + step) - (4 * 7 + 2))


def event_timing(events: tuple[Event, ...]) -> tuple[tuple[float, float], ...]:
    total = sum((event.beats for event in events), Fraction())
    elapsed = Fraction()
    result = []
    for event in events:
        result.append((float(70 + 210 * elapsed / total), float(210 * event.beats / total)))
        elapsed += event.beats
    return tuple(result)


def score(events: tuple[Event, ...], number: int) -> str:
    glyphs = []
    positions = [start for start, _ in event_timing(events)]
    tuplet_start = None
    for index, event in enumerate(events):
        x = positions[index]
        if event.tuplet:
            if event.tuplet[2] == "start":
                tuplet_start = x
            elif event.tuplet[2] == "stop" and tuplet_start is not None:
                middle = (tuplet_start + x) / 2
                glyphs.append(
                    f'<path d="M{tuplet_start:.1f} 22v-4h{x - tuplet_start:.1f}v4" '
                    f'stroke="currentColor" fill="none"/>'
                    f'<text x="{middle:.1f}" y="15" text-anchor="middle" '
                    f'font-size="12">{event.tuplet[0]}</text>'
                )
                tuplet_start = None
        if event.pitch is None:
            dots = "".join(
                f'<circle cx="{x + 10 + dot * 5:.1f}" cy="75" r="1.5" '
                f'fill="currentColor"/>' for dot in range(event.dots)
            )
            glyphs.append(
                f'<text x="{x:.1f}" y="79" text-anchor="middle" '
                f'font-family="Segoe UI Symbol" font-size="28">{RESTS[event.figure]}</text>{dots}'
            )
            continue
        y = pitch_y(event.pitch)
        ledgers = list(range(45, y - 1, -10)) if y <= 45 else list(range(105, y + 1, 10))
        ledger = "".join(f'<path d="M{x - 11:.1f} {line}h22"/>' for line in ledgers)
        accidental = ""
        if len(event.pitch) == 3:
            symbol = "♯" if event.pitch[1] == "#" else "♭"
            accidental = f'<text x="{x - 20:.1f}" y="{y + 4}" font-size="18">{symbol}</text>'
        fill = 'fill="white"' if event.figure in ("whole", "half") else ""
        stem = ""
        if event.figure != "whole":
            down = y < 70
            stem_x = x - 6 if down else x + 6
            end_y = y + 34 if down else y - 34
            stem = f'<path d="M{stem_x:.1f} {y}V{end_y}"/>'
            flags = {"eighth": 1, "16th": 2, "32nd": 3, "64th": 4}.get(event.figure, 0)
            for flag in range(flags):
                offset = flag * (5 if down else -5)
                stem += (
                    f'<path d="M{stem_x:.1f} {end_y + offset}q12 '
                    f'{-5 if down else 5} 8 {12 if down else -12}" fill="none"/>'
                )
        dots = "".join(
            f'<circle cx="{x + 10 + dot * 5:.1f}" cy="{y - 2}" r="1.5"/>'
            for dot in range(event.dots)
        )
        glyphs.append(f"""
            <g stroke="currentColor" fill="currentColor" stroke-width="1.5">
              {ledger}<ellipse cx="{x:.1f}" cy="{y}" rx="6" ry="4"
                transform="rotate(-20 {x:.1f} {y})" {fill}/>
              {stem}{dots}{accidental}
            </g>
        """)
        if event.tie == "start":
            end = 290
            for later in range(index + 1, len(events)):
                if events[later].pitch == event.pitch and events[later].tie == "stop":
                    end = positions[later] - 6
                    break
            glyphs.append(
                f'<path d="M{x + 6:.1f} {y + 8} Q{(x + end) / 2:.1f} {y + 20} '
                f'{end:.1f} {y + 8}" stroke="currentColor" fill="none"/>'
            )
        elif event.tie == "stop" and not any(
            earlier.pitch == event.pitch and earlier.tie == "start" for earlier in events[:index]
        ):
            glyphs.append(
                f'<path d="M12 {y + 8} Q{(12 + x) / 2:.1f} {y + 20} '
                f'{x - 6:.1f} {y + 8}" stroke="currentColor" fill="none"/>'
            )
    svg = f"""
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 135" color="#365950">
          <path stroke="currentColor" stroke-width="1" opacity=".3" fill="none"
            d="M12 55H288 M12 65H288 M12 75H288 M12 85H288
            M12 95H288 M12 55V95 M288 55V95"/>
          <text x="20" y="97" fill="currentColor" font-family="Segoe UI Symbol" font-size="38">𝄞</text>
          {''.join(glyphs)}
        </svg>
    """
    # st.html sanitizes inline SVG; an SVG image preserves the notation safely.
    encoded = b64encode(svg.encode("utf-8")).decode("ascii")
    return (
        f'<img class="staff-image" src="data:image/svg+xml;base64,{encoded}" '
        f'alt="Compás {number}: {len(events)} eventos">'
    )


def render_music() -> None:
    start, end = st.session_state.practice_loop
    reference = st.session_state.practice_measure
    st.subheader(TITLE)
    st.caption(f"Armónica {INSTRUMENT} · {METER} · Bucle {start}–{end} · Repetición sin límite")
    cards = []
    for number, events in enumerate(MEASURES, 1):
        timing = event_timing(events)
        minimum_width = (
            math.ceil(30 * 300 / min(width for _, width in timing[:-1]))
            if len(events) > 1 else 0
        )
        selected = start <= number <= end
        label = "Referencia" if number == reference else "En bucle" if selected else "Contexto"
        classes = "current" if number == reference else "selected" if selected else "context"
        notation = score(events, number) if st.session_state.practice_score else ""
        tabs = ""
        if st.session_state.practice_tabs:
            symbols = []
            for event, (position, _) in zip(events, timing):
                colour = "blow" if event.tab_value and event.blow else "draw" if event.tab_value else "rest"
                rhythm = (RESTS[event.figure] if event.pitch is None else FIGURES[event.figure][1])
                rhythm += "." * event.dots
                if event.tuplet:
                    rhythm += f" ({event.tuplet[0]}:{event.tuplet[1]})"
                symbols.append(
                    f'<span class="{colour}" style="left: {position / 3:.6f}%">{event.tab}'
                    + (f"<small>⤵ −{event.bend} st</small>" if event.bend else "")
                    + f"<small>{rhythm}</small></span>"
                )
            tabs = f'<div class="tabs">{"".join(symbols)}</div>'
        duration = (
            '<div class="duration" aria-label="Duraciones proporcionales">'
            + "".join(
                f'<span class="{"rest" if event.pitch is None else ""}" '
                f'style="left: {position / 3:.6f}%; width: {width / 3:.6f}%"></span>'
                for event, (position, width) in zip(events, timing)
            ) + "</div>"
            if st.session_state.practice_duration else ""
        )
        cards.append(f"""
            <article class="measure {classes}">
              <div class="measure-heading"><span>Compás {number}</span><span>{label}</span></div>
              <div class="measure-viewport">
                <div class="measure-content" style="min-width: {minimum_width}px">
                  {notation}{tabs}{duration}
                </div>
              </div>
            </article>
        """)
    st.html(f'<div class="practice-score">{"".join(cards)}</div>')
    st.caption("↑ Soplar · ↓ Aspirar · ⤵ Bend · Barras proporcionales a la duración")


def render_transport() -> None:
    playback, tempo = st.columns([1.2, 1])
    with playback:
        with st.container(key="practice-playback"):
            play, pause, stop = st.columns(3)
            play.button("▶ Play", type="primary", disabled=True, use_container_width=True)
            pause.button("Ⅱ Pause", disabled=True, use_container_width=True)
            stop.button("■ Stop", disabled=True, use_container_width=True)
    with tempo:
        with st.container(key="practice-tempo"):
            lower, value, higher = st.columns([1, 3, 1])
            lower.button(
                "−", key="tempo_down", on_click=change_tempo, args=(-1,),
                disabled=st.session_state.practice_tempo == 40, help="Bajar 1 BPM",
            )
            value.markdown(f"**{st.session_state.practice_tempo} BPM**")
            higher.button(
                "＋", key="tempo_up", on_click=change_tempo, args=(1,),
                disabled=st.session_state.practice_tempo == 160, help="Subir 1 BPM",
            )
            st.slider("Tempo", 40, 160, key="practice_tempo", label_visibility="collapsed")
    st.caption("Audio pendiente. Play reanudará; Pause conservará la posición; Stop volverá al inicio del bucle.")


def render_settings() -> None:
    st.subheader("Tu bucle")
    st.slider(
        "Compases A–B", 1, len(MEASURES), key="practice_loop", on_change=adjust_reference,
        help="Arrastra los dos extremos para ampliar o reducir. Pueden coincidir para repetir un solo compás.",
    )
    start, end = st.session_state.practice_loop
    left, right = st.columns(2)
    left.button(
        "← Mover", key="loop_left", on_click=move_loop, args=(-1,),
        disabled=start == 1, use_container_width=True,
    )
    right.button(
        "Mover →", key="loop_right", on_click=move_loop, args=(1,),
        disabled=end == len(MEASURES), use_container_width=True,
    )
    st.select_slider(
        "Compás de referencia", options=list(range(start, end + 1)), key="practice_measure",
        help="Inspecciona un compás manualmente; todavía no hay avance automático.",
    )
    notes = [event for event in MEASURES[st.session_state.practice_measure - 1] if event.tab_value]
    note = notes[min(1, len(notes) - 1)] if notes else None
    st.markdown(f"**Guía · armónica {INSTRUMENT}**")
    holes = "".join(
        f'<span class="{"active" if note and hole == note.hole else ""}">{hole}</span>'
        for hole in range(1, 11)
    )
    label = f"Agujero {note.hole}" if note else "Sin tablatura en este compás"
    st.html(f'<div class="practice-holes" aria-label="{label}">{holes}</div>')
    if note:
        instruction = "Sopla" if note.blow else "Aspira"
        bend = f" · ⤵ baja {note.bend} semitono" if note.bend else ""
        position = "Segunda nota" if len(notes) > 1 else "Única nota"
        st.caption(f"{position} con tablatura del compás: {note.tab} · {instruction}{bend}")
    else:
        st.caption("No hay notas con tablatura en este compás.")
    with st.expander("Visualización"):
        st.checkbox("Partitura", key="practice_score", disabled=not st.session_state.practice_tabs)
        st.checkbox("Tablatura", key="practice_tabs", disabled=not st.session_state.practice_score)
        st.checkbox("Barras de duración", key="practice_duration")
    with st.expander("Sonido y aviso · próximamente"):
        st.caption("Estos controles se activarán al incorporar audio y timer.")
        st.toggle("Metrónomo", disabled=True)
        st.slider("Volumen", 0, 100, 75, disabled=True)
        st.number_input("Aviso (minutos)", min_value=1, value=15, disabled=True)


def render() -> None:
    initialise_state()
    stylesheet = Path(__file__).resolve().parents[1] / "assets" / "practica.css"
    st.html(f"<style>{stylesheet.read_text(encoding='utf-8')}</style>")
    st.title("Práctica libre")
    st.caption("ARMONOISY · Primera interfaz · Sin reproducción de audio")
    render_layout(
        key="practice",
        horizontal=HORIZONTAL,
        vertical=VERTICAL,
        regions={"music": render_music, "transport": render_transport, "settings": render_settings},
        height="fluid",
    )


render()
