import unittest
from fractions import Fraction

from practice_timeline import build_loop_melody, build_timeline, parse_event


class PracticeTimelineTests(unittest.TestCase):
    def test_timeline_preserves_event_identity_and_exact_durations(self) -> None:
        measures = (
            (
                parse_event({
                    "pitch": "C#5", "tab": "+4", "duration": "dotted-quarter",
                    "bendSemitones": 1,
                }),
                parse_event({"rest": True, "duration": "eighth"}),
                parse_event({
                    "pitch": "G5", "duration": "eighth",
                    "tuplet": {"actual": 3, "normal": 2, "boundary": "start"},
                }),
                parse_event({
                    "pitch": "A5", "duration": "eighth",
                    "tuplet": {"actual": 3, "normal": 2, "boundary": "continue"},
                }),
                parse_event({
                    "pitch": "B5", "duration": "eighth",
                    "tuplet": {"actual": 3, "normal": 2, "boundary": "stop"},
                }),
                parse_event({"pitch": "E5", "duration": "quarter", "tie": "start"}),
            ),
            (
                parse_event({"pitch": "E5", "duration": "quarter", "tie": "stop"}),
                parse_event({"rest": True, "duration": "dotted-half"}),
            ),
        )

        timeline = build_timeline(measures)

        self.assertEqual(
            [(item.measure_number, item.event_index, item.start_beats, item.duration_beats)
             for item in timeline],
            [
                (1, 0, Fraction(0), Fraction(3, 2)),
                (1, 1, Fraction(3, 2), Fraction(1, 2)),
                (1, 2, Fraction(2), Fraction(1, 3)),
                (1, 3, Fraction(7, 3), Fraction(1, 3)),
                (1, 4, Fraction(8, 3), Fraction(1, 3)),
                (1, 5, Fraction(3), Fraction(1)),
                (2, 0, Fraction(4), Fraction(1)),
                (2, 1, Fraction(5), Fraction(3)),
            ],
        )
        self.assertEqual(timeline[0].event.pitch, "C#5")
        self.assertEqual(timeline[0].event.bend, 1)
        self.assertIsNone(timeline[1].event.pitch)
        self.assertEqual(timeline[2].event.tuplet, (3, 2, "start"))
        self.assertEqual(timeline[5].event.tie, "start")
        self.assertEqual(timeline[6].event.tie, "stop")

        loop_notes = build_loop_melody(measures, 1, 2)
        self.assertEqual(
            [(note.measure_number, note.event_index, note.start_beats,
              note.duration_beats, note.pitch) for note in loop_notes],
            [
                (1, 0, Fraction(0), Fraction(3, 2), "C#5"),
                (1, 2, Fraction(2), Fraction(1, 3), "G5"),
                (1, 3, Fraction(7, 3), Fraction(1, 3), "A5"),
                (1, 4, Fraction(8, 3), Fraction(1, 3), "B5"),
                (1, 5, Fraction(3), Fraction(2), "E5"),
            ],
        )
        self.assertEqual(
            build_loop_melody(measures, 2, 2),
            ((2, 0, Fraction(0), Fraction(1), "E5"),),
        )
        self.assertEqual(
            build_loop_melody(measures, 1, 1)[-1],
            (1, 5, Fraction(3), Fraction(1), "E5"),
        )


if __name__ == "__main__":
    unittest.main()
