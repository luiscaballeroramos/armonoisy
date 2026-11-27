from fractions import Fraction
import re
from typing import NamedTuple


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


class TimedEvent(NamedTuple):
    measure_number: int
    event_index: int
    start_beats: Fraction
    duration_beats: Fraction
    event: Event


class MelodyNote(NamedTuple):
    measure_number: int
    event_index: int
    start_beats: Fraction
    duration_beats: Fraction
    pitch: str


FIGURES = {
    "whole": Fraction(4),
    "half": Fraction(2),
    "quarter": Fraction(1),
    "eighth": Fraction(1, 2),
    "16th": Fraction(1, 4),
    "32nd": Fraction(1, 8),
    "64th": Fraction(1, 16),
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
    beats = FIGURES[figure] * sum(
        (Fraction(1, 2**i) for i in range(dots + 1)),
        Fraction(),
    )
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


def build_timeline(measures: tuple[tuple[Event, ...], ...]) -> tuple[TimedEvent, ...]:
    timeline = []
    elapsed = Fraction()
    for measure_number, events in enumerate(measures, 1):
        for event_index, event in enumerate(events):
            timeline.append(TimedEvent(
                measure_number,
                event_index,
                elapsed,
                event.beats,
                event,
            ))
            elapsed += event.beats
    return tuple(timeline)


def build_loop_melody(
    measures: tuple[tuple[Event, ...], ...],
    start_measure: int,
    end_measure: int,
) -> tuple[MelodyNote, ...]:
    if not 1 <= start_measure <= end_measure <= len(measures):
        raise ValueError("Los límites del bucle no pertenecen a la partitura.")

    timeline = build_timeline(measures)
    loop_start = sum(
        (event.beats for measure in measures[:start_measure - 1] for event in measure),
        Fraction(),
    )
    loop_end = loop_start + sum(
        (event.beats for measure in measures[start_measure - 1:end_measure] for event in measure),
        Fraction(),
    )
    loop_events = [
        item for item in timeline if start_measure <= item.measure_number <= end_measure
    ]
    notes = []
    index = 0
    while index < len(loop_events):
        item = loop_events[index]
        event = item.event
        if event.pitch is None:
            index += 1
            continue

        note_end = item.start_beats + item.duration_beats
        if event.tie == "start" and index + 1 < len(loop_events):
            following = loop_events[index + 1]
            if following.event.tie == "stop" and following.event.pitch == event.pitch:
                note_end = following.start_beats + following.duration_beats
                index += 1

        note_end = min(note_end, loop_end)
        if note_end > item.start_beats:
            notes.append(MelodyNote(
                item.measure_number,
                item.event_index,
                item.start_beats - loop_start,
                note_end - item.start_beats,
                event.pitch,
            ))
        index += 1
    return tuple(notes)
