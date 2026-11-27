from base64 import b64encode
from decimal import Decimal
from fractions import Fraction
from html import escape
import json
import math
from pathlib import Path
import re
from typing import NamedTuple

import streamlit as st

from components.practice_player import render_player
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
STAFF_WIDTH = 300
MIN_EVENT_SPACING = 32
TEMPO_MIN = 40
TEMPO_MAX = 160
TEMPO_DEFAULT = 72
PRACTICE_SETTING_DEFAULTS = {
    "practice_score": True,
    "practice_tabs": True,
    "practice_duration": True,
    "practice_visibility": "Todos",
    "practice_height_map": 15,
    "practice_height_guide": 10,
    "practice_height_transport": 20,
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


def load_score(path: Path) -> tuple[str, str, str, tuple[tuple[Event, ...], ...], int | float]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data["version"] != 3:
        raise ValueError("La partitura debe usar el formato JSON v3.")
    title = data["title"]
    instrument = data["instrument"]["key"]
    meter = data["timeSignature"]
    tempo = data.get("tempoBpm", TEMPO_DEFAULT)
    if not all(isinstance(value, str) and value for value in (title, instrument, meter)):
        raise ValueError("Faltan el título, la armónica o el compás.")
    if (isinstance(tempo, bool) or not isinstance(tempo, (int, float))
            or isinstance(tempo, float) and not math.isfinite(tempo)):
        raise ValueError("El tempo de la partitura debe ser un número válido.")
    measures = []
    for number, measure in enumerate(data["measures"], 1):
        if measure["number"] != number or not measure["events"]:
            raise ValueError("Los compases deben estar numerados consecutivamente y contener eventos.")
        measures.append(tuple(parse_event(event) for event in measure["events"]))
    if not measures:
        raise ValueError("La partitura no contiene compases.")
    events = [event for measure in measures for event in measure]
    for index, event in enumerate(events):
        if event.tie == "start" and (
            index + 1 == len(events) or events[index + 1].tie != "stop"
            or events[index + 1].pitch != event.pitch
        ):
            raise ValueError("La ligadura debe terminar en la siguiente nota de la misma altura.")
        if event.tie == "stop" and (
            index == 0 or events[index - 1].tie != "start" or events[index - 1].pitch != event.pitch
        ):
            raise ValueError("La ligadura no tiene una nota inicial válida.")
    return title, instrument, meter, tuple(measures), tempo


try:
    TITLE, INSTRUMENT, METER, MEASURES, SCORE_TEMPO = load_score(
        Path(__file__).resolve().parents[1] / "partituras" / "formateadas" / "stand-by-me.json"
    )
except (OSError, ValueError, KeyError, TypeError) as exc:
    st.error(f"No se pudo cargar la partitura: {exc}")
    st.stop()

PRACTICE_LAYOUT = Layout(
    (("music", "settings"),), (1, 1), (1,), min_height=0,
)

def initialise_state() -> None:
    start = min(3, len(MEASURES))
    end = min(5, len(MEASURES))
    defaults = {
        "practice_loop_bounds": st.session_state.get("practice_loop", (start, end)),
        "practice_screen": "practice",
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value
    if "practice_tempo_saved" not in st.session_state:
        st.session_state.practice_tempo_saved = st.session_state.get("practice_tempo", SCORE_TEMPO)
    if "practice_tempo" not in st.session_state:
        st.session_state.practice_tempo = st.session_state.practice_tempo_saved
    if "practice_tempo_precision" not in st.session_state:
        fraction = str(float(st.session_state.practice_tempo_saved)).partition(".")[2].rstrip("0")
        st.session_state.practice_tempo_precision = len(fraction)
    for key, value in PRACTICE_SETTING_DEFAULTS.items():
        saved_key = f"{key}_saved"
        if saved_key not in st.session_state:
            st.session_state[saved_key] = st.session_state.get(key, value)
        if key not in st.session_state:
            st.session_state[key] = st.session_state[saved_key]


def save_practice_setting(key: str) -> None:
    st.session_state[f"{key}_saved"] = st.session_state[key]
    if key == "practice_tempo":
        fraction = str(float(st.session_state.practice_tempo)).partition(".")[2].rstrip("0")
        st.session_state.practice_tempo_precision = len(fraction)


def save_player_tempo() -> None:
    tempo = st.session_state["practice_player"].tempo
    if (isinstance(tempo, bool) or not isinstance(tempo, (int, float))
            or not math.isfinite(tempo) or not TEMPO_MIN <= tempo <= TEMPO_MAX):
        raise ValueError("El reproductor envió un tempo no válido.")
    st.session_state.practice_tempo = tempo
    st.session_state.practice_tempo_saved = tempo
    fraction = str(float(tempo)).partition(".")[2].rstrip("0")
    st.session_state.practice_tempo_precision = len(fraction)


def select_loop_measure(number: int) -> None:
    start, end = st.session_state.practice_loop_bounds
    if not 1 <= number <= len(MEASURES):
        raise ValueError("El compás debe pertenecer a la canción.")
    if number < start:
        start = number
    elif number > end:
        end = number
    elif start < end and number == start:
        start += 1
    elif start < end and number == end:
        end -= 1
    elif start < number < end:
        if number - start <= end - number:
            start = number
        else:
            end = number
    st.session_state.practice_loop_bounds = (start, end)


def change_tempo(offset: int) -> None:
    tempo = float(Decimal(str(st.session_state.practice_tempo_saved)) + offset)
    if not TEMPO_MIN <= tempo <= TEMPO_MAX:
        raise ValueError("El tempo debe estar entre 40 y 160 BPM.")
    st.session_state.practice_tempo = tempo
    st.session_state.practice_tempo_saved = tempo


def accept_score_tempo() -> None:
    tempo = st.session_state.practice_tempo_choice
    st.session_state.practice_tempo = tempo
    st.session_state.practice_tempo_saved = tempo
    st.session_state.practice_tempo_confirmed_source = SCORE_TEMPO


def request_compatible_tempo() -> bool:
    if TEMPO_MIN <= SCORE_TEMPO <= TEMPO_MAX:
        st.session_state.pop("practice_tempo_confirmed_source", None)
        return True
    if st.session_state.get("practice_tempo_confirmed_source") == SCORE_TEMPO:
        return True
    st.warning(
        f"La partitura indica {SCORE_TEMPO} BPM, fuera del intervalo "
        f"{TEMPO_MIN}–{TEMPO_MAX} BPM. Elige un tempo para esta práctica; "
        "la partitura no se modificará."
    )
    st.number_input(
        "Tempo para esta práctica (BPM)", min_value=TEMPO_MIN, max_value=TEMPO_MAX,
        value=TEMPO_DEFAULT, key="practice_tempo_choice",
    )
    st.button("Usar este tempo", key="confirm_score_tempo", on_click=accept_score_tempo)
    return False


def toggle_practice_screen() -> None:
    current = st.session_state.practice_screen
    st.session_state.practice_screen = "settings" if current == "practice" else "practice"


def pitch_y(pitch: str) -> int:
    step = "CDEFGAB".index(pitch[0])
    return 95 - 5 * ((int(pitch[-1]) * 7 + step) - (4 * 7 + 2))


def event_timing(events: tuple[Event, ...]) -> tuple[tuple[float, float], ...]:
    total = sum((event.beats for event in events), Fraction())
    elapsed = Fraction()
    result = []
    for event in events:
        result.append((
            float(STAFF_WIDTH * elapsed / total),
            float(STAFF_WIDTH * event.beats / total),
        ))
        elapsed += event.beats
    return tuple(result)


def score_measure(events: tuple[Event, ...]) -> str:
    glyphs = []
    positions = [start + width / 2 for start, width in event_timing(events)]
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
    return "".join(glyphs)


def score(measures: tuple[tuple[Event, ...], ...], first: int, last: int) -> str:
    width = STAFF_WIDTH * len(measures)
    glyphs = []
    events_with_positions = []
    for index, events in enumerate(measures):
        x_offset = index * STAFF_WIDTH
        glyphs.append(f'<g transform="translate({x_offset} 0)">{score_measure(events)}</g>')
        events_with_positions.extend(
            (event, x_offset + position + duration / 2)
            for event, (position, duration) in zip(events, event_timing(events))
        )
    ties = []
    for (event, x), (following, next_x) in zip(events_with_positions, events_with_positions[1:]):
        if (event.tie == "start" and event.pitch is not None
                and following.tie == "stop" and event.pitch == following.pitch):
            y = pitch_y(event.pitch)
            ties.append(
                f'<path class="tie" d="M{x + 6:.1f} {y + 8} Q{(x + next_x) / 2:.1f} {y + 20} '
                f'{next_x - 6:.1f} {y + 8}" stroke="currentColor" fill="none"/>'
            )
    staff_lines = " ".join(f"M0 {y}H{width}" for y in (55, 65, 75, 85, 95))
    bar_lines = " ".join(f"M{x} 55V95" for x in range(0, width + 1, STAFF_WIDTH))
    svg = f"""
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="{(first - 1) * STAFF_WIDTH} 0 {(last - first + 1) * STAFF_WIDTH} 135" color="#4b4b4b">
          <path stroke="currentColor" stroke-width="1" opacity=".3" fill="none"
            d="{staff_lines} {bar_lines}"/>
          {''.join(glyphs)}{''.join(ties)}
        </svg>
    """
    encoded = b64encode(svg.encode("utf-8")).decode("ascii")
    return (
        f'<img class="staff-image" src="data:image/svg+xml;base64,{encoded}" '
        f'alt="Partitura: compases {first} a {last}">'
    )


def score_signature(meter: str, start: int, show_score: bool) -> str:
    match = re.fullmatch(r"(\d+)/(\d+)", meter)
    if match:
        numerator, denominator = match.groups()
        signature = (
            f'<text x="65" y="74" text-anchor="middle" font-size="24" font-weight="bold">{numerator}</text>'
            f'<text x="65" y="95" text-anchor="middle" font-size="24" font-weight="bold">{denominator}</text>'
        )
    else:
        signature = f'<text x="60" y="83" font-size="14">{escape(meter)}</text>'
    svg = f"""
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {STAFF_WIDTH} 135" color="#365950">
          <path stroke="currentColor" stroke-width="1" opacity=".3" fill="none"
            d="M0 55H300 M0 65H300 M0 75H300 M0 85H300 M0 95H300"/>
          <text x="10" y="97" fill="currentColor" font-family="Segoe UI Symbol" font-size="38">𝄞</text>
          {signature}
        </svg>
    """
    encoded = b64encode(svg.encode("utf-8")).decode("ascii")
    image = (
        f'<img class="signature-image" src="data:image/svg+xml;base64,{encoded}" '
        f'alt="Clave de sol, compás {escape(meter, quote=True)}">'
        if show_score else ""
    )
    return (
        '<div class="practice-signature">'
        f'<a class="practice-return" href="#practice-measure-{start}" '
        'aria-label="Ir al inicio del bucle" title="Ir al inicio del bucle">↤</a>'
        '<button class="practice-repeat" type="button" disabled '
        'aria-label="Repetir el compás actual (disponible con reproducción)" '
        'title="Repetir el compás actual: disponible con reproducción">↻</button>'
        f'{image}'
        '</div>'
    )


def render_music() -> None:
    start, end = st.session_state.practice_loop_bounds
    with st.container(key="practice-map"):
        columns = st.columns(len(MEASURES))
        for number, column in enumerate(columns, 1):
            column.button(
                str(number), key=f"map_measure_{number}",
                type="primary" if start <= number <= end else "secondary",
                on_click=select_loop_measure, args=(number,), use_container_width=True,
                help=f"Compás {number}" + (" · inicio A" if number == start else "")
                + (" · fin B" if number == end else ""),
            )
    if st.session_state.practice_visibility_saved == "Todos":
        first, last = 1, len(MEASURES)
    elif st.session_state.practice_visibility_saved == "Bucle y adyacentes":
        first, last = max(1, start - 1), min(len(MEASURES), end + 1)
    else:
        first, last = start, end
    headings, tablatures, backgrounds = [], [], []
    for number in range(first, last + 1):
        events = MEASURES[number - 1]
        timing = event_timing(events)
        notation_width = max(
            STAFF_WIDTH,
            math.ceil(MIN_EVENT_SPACING * STAFF_WIDTH / min(width for _, width in timing[:-1]))
            if len(events) > 1 else STAFF_WIDTH,
        )
        selected = start <= number <= end
        labels = []
        if number == start:
            labels.append("A")
        if number == end:
            labels.append("B")
        labels.append("En bucle" if selected else "Contexto")
        label = " · ".join(labels)
        classes = "selected" if selected else "context"
        tabs = ""
        if st.session_state.practice_tabs_saved:
            symbols = []
            for event, (position, duration) in zip(events, timing):
                colour = "blow" if event.tab_value and event.blow else "draw" if event.tab_value else "rest"
                symbols.append(
                    f'<span class="{colour}" style="left: {100 * (position + duration / 2) / STAFF_WIDTH:.6f}%">{event.tab}'
                    f'</span>'
                )
            tabs = (
                f'<div class="tabs measure-cell {classes}" data-measure="{number}" '
                f'style="--notation-width: {notation_width}; --notation-scale: {24 / notation_width:.8f}">'
                f'{"".join(symbols)}</div>'
            )
        background = (
            f'<div class="measure-background" data-measure="{number}" data-selected="{str(selected).lower()}">'
            + "".join(
                f'<span class="{"rest" if event.pitch is None else "blow-" + str(index % 2) if event.tab_value and event.blow else "draw-" + str(index % 2) if event.tab_value else "unknown"}" '
                f'style="left: {100 * position / STAFF_WIDTH:.6f}%; '
                f'width: {100 * width / STAFF_WIDTH:.6f}%"></span>'
                for index, (event, (position, width)) in enumerate(zip(events, timing))
            ) + "</div>"
            if st.session_state.practice_duration_saved else f'<div class="measure-background" data-measure="{number}" data-selected="{str(selected).lower()}"></div>'
        )
        headings.append(
            f'<div class="measure-heading measure-cell {classes}" data-measure="{number}" '
            f'id="practice-measure-{number}" aria-label="Compás {number}: {len(events)} eventos · {label}">'
            f'<span>{number}</span></div>'
        )
        if tabs:
            tablatures.append(tabs)
        backgrounds.append(background)
    signature = score_signature(METER, start, st.session_state.practice_score_saved)
    notation = score(MEASURES, first, last) if st.session_state.practice_score_saved else ""
    st.html(
        f'<div class="practice-score-container" '
        f'style="--measure-count: {last - first + 1}">'
        f'<div class="practice-score" role="region" '
        f'aria-label="Música: desplazar horizontalmente" '
        f'tabindex="0">'
        f'<div class="practice-viewport"><div class="practice-ribbon">{signature}'
        f'<div class="background-row" aria-hidden="true">{"".join(backgrounds)}</div>'
        f'<div class="practice-row heading-row" aria-label="Compases">{"".join(headings)}</div>'
        f'{notation}'
        f'<div class="practice-row tabs-row" aria-label="Tablatura">{"".join(tablatures)}</div>'
        f'</div></div></div></div>'
    )
    render_guide()
    render_transport()


def render_transport() -> None:
    tempo = float(st.session_state.practice_tempo_saved)
    precision = st.session_state.practice_tempo_precision
    st.session_state.practice_tempo = tempo
    with st.container(key="practice-transport"):
        player, lower, value, higher, slider = st.columns(
            [4, 0.5, 0.8, 0.5, 2],
            gap="small", vertical_alignment="center",
        )
        start, end = st.session_state.practice_loop_bounds
        player_data = {
            "tempo": tempo,
            "startMeasure": start,
            "endMeasure": end,
            "measureCount": len(MEASURES),
            "meter": METER,
            "measures": [
                float(sum((event.beats for event in measure), Fraction()))
                for measure in MEASURES
            ],
        }
        with player:
            render_player(player_data, on_tempo_change=save_player_tempo)
        lower.button(
            "−", key="tempo_down", on_click=change_tempo, args=(-1,),
            disabled=tempo - 1 < TEMPO_MIN, help="Bajar 1 BPM",
            use_container_width=True,
        )
        value.markdown(f"**{int(tempo) if tempo.is_integer() else tempo} BPM**")
        higher.button(
            "＋", key="tempo_up", on_click=change_tempo, args=(1,),
            disabled=tempo + 1 > TEMPO_MAX, help="Subir 1 BPM",
            use_container_width=True,
        )
        slider.slider(
            "Tempo", float(TEMPO_MIN), float(TEMPO_MAX), step=10.0 ** -precision,
            format=f"%.{precision}f",
            key="practice_tempo", label_visibility="collapsed",
            on_change=save_practice_setting, args=("practice_tempo",),
        )


def render_guide() -> None:
    holes = "".join(f"<span>{hole}</span>" for hole in range(1, 11))
    st.html(
        f'<div class="practice-holes" role="img" '
        f'aria-label="Guía de armónica {escape(INSTRUMENT, quote=True)}, '
        f'agujeros del 1 al 10; indicación de nota pendiente de reproducción">{holes}</div>'
    )


def render_settings() -> None:
    for key in PRACTICE_SETTING_DEFAULTS:
        st.session_state[key] = st.session_state[f"{key}_saved"]
    with st.container(key="practice-settings-page"):
        display, distribution = st.columns((1, 1.15), gap="large")
        with display:
            st.markdown("**Visualización**")
            st.radio(
                "Compases en las cintas",
                ("Todos", "Bucle y adyacentes", "Solo bucle"),
                key="practice_visibility",
                on_change=save_practice_setting,
                args=("practice_visibility",),
            )
            st.checkbox(
                "Partitura", key="practice_score", disabled=not st.session_state.practice_tabs,
                on_change=save_practice_setting, args=("practice_score",),
            )
            st.checkbox(
                "Tablatura", key="practice_tabs", disabled=not st.session_state.practice_score,
                on_change=save_practice_setting, args=("practice_tabs",),
            )
            st.checkbox(
                "Fondos de duración", key="practice_duration",
                on_change=save_practice_setting, args=("practice_duration",),
            )
        with distribution:
            st.markdown("**Distribución del bloque de música**")
            selector, guide, transport = st.columns(3)
            selector.number_input(
                "Selector (%)", min_value=10, max_value=25, key="practice_height_map",
                on_change=save_practice_setting, args=("practice_height_map",),
            )
            guide.number_input(
                "Guía (%)", min_value=10, max_value=25, key="practice_height_guide",
                on_change=save_practice_setting, args=("practice_height_guide",),
            )
            transport.number_input(
                "Controles (%)", min_value=10, max_value=25, key="practice_height_transport",
                on_change=save_practice_setting, args=("practice_height_transport",),
            )
            notation_share = 100 - sum(st.session_state[f"{key}_saved"] for key in (
                "practice_height_map", "practice_height_guide", "practice_height_transport",
            ))
            st.caption(f"Partitura / tablatura: {notation_share}% restante. Total: 100%.")
        with st.expander("Sonido y avisos · próximamente"):
            sound, notice = st.columns(2)
            with sound:
                st.toggle("Metrónomo", disabled=True)
                st.slider("Volumen", 0, 100, 75, disabled=True)
            with notice:
                st.number_input("Aviso (minutos)", min_value=1, value=15, disabled=True)


def render_header() -> None:
    screen = st.session_state.practice_screen
    if screen == "practice":
        start, end = st.session_state.practice_loop_bounds
        st.html(
            '<header class="practice-header">'
            f'<h3>{escape(TITLE)}</h3>'
            f'<p>Armónica {escape(INSTRUMENT)} · {escape(METER)} · '
            f'Bucle {start}–{end} · Repetición sin límite</p>'
            '</header>'
        )
        label = "⚙ Ajustes"
        next_screen = "settings"
    else:
        st.html('<header class="practice-header"><h3>Ajustes</h3></header>')
        label = "← Volver"
        next_screen = "practice"

    st.button(
        label,
        key="practice_screen_toggle",
        help="Abrir los ajustes" if next_screen == "settings" else "Volver a la práctica",
        on_click=toggle_practice_screen,
    )


def render() -> None:
    if not request_compatible_tempo():
        return
    initialise_state()
    stylesheet = Path(__file__).resolve().parents[1] / "assets" / "practica.css"
    map_share = st.session_state.practice_height_map_saved
    guide_share = st.session_state.practice_height_guide_saved
    transport_share = st.session_state.practice_height_transport_saved
    rows = (map_share, 100 - map_share - guide_share - transport_share, guide_share, transport_share)
    row_css = " ".join(f"minmax(0, {share}fr)" for share in rows)
    hidden_region = "settings" if st.session_state.practice_screen == "practice" else "music"
    st.html(
        f"<style>{stylesheet.read_text(encoding='utf-8')}"
        f".st-key-practice-music {{ --music-rows: {row_css}; }}"
        f".st-key-practice-shell .st-key-practice-grid > div:has(> .st-key-practice-{hidden_region}) "
        "{ display: none; }</style>"
    )
    render_layout(
        key="practice",
        horizontal=PRACTICE_LAYOUT,
        vertical=PRACTICE_LAYOUT,
        regions={"music": render_music, "settings": render_settings},
        header=render_header,
        height="screen",
    )


render()
