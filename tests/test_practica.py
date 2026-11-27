from base64 import b64decode
import json
import re
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

from streamlit.testing.v1 import AppTest


APP = Path(__file__).resolve().parents[1] / "app.py"
SCORE = APP.parent / "partituras" / "formateadas" / "stand-by-me.json"


class PracticeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = AppTest.from_file(str(APP), default_timeout=15).run()
        self.assertEqual(len(self.app.exception), 0)

    def test_loop_resize_move_and_single_measure(self) -> None:
        last = int(self.app.slider(key="practice_loop").max)
        self.app.slider(key="practice_loop").set_range(2, 4).run()
        self.app.button(key="loop_right").click().run()
        self.assertEqual(self.app.slider(key="practice_loop").value, (3, 5))
        self.assertEqual(self.app.select_slider(key="practice_measure").value, 5)
        self.app.slider(key="practice_loop").set_range(last, last).run()
        self.assertEqual(self.app.select_slider(key="practice_measure").value, last)
        self.assertTrue(self.app.button(key="loop_right").disabled)
        self.app.button(key="loop_left").click().run()
        self.assertEqual(self.app.slider(key="practice_loop").value, (last - 1, last - 1))
        self.assertEqual(self.app.select_slider(key="practice_measure").value, last - 1)
        self.app.slider(key="practice_loop").set_range(1, last).run()
        self.assertTrue(self.app.button(key="loop_left").disabled)
        self.assertTrue(self.app.button(key="loop_right").disabled)
        self.assertEqual(len(self.app.exception), 0)

    def test_selected_score_is_loaded_and_rendered(self) -> None:
        data = json.loads(SCORE.read_text(encoding="utf-8"))
        self.assertEqual(self.app.subheader[0].value, data["title"])
        self.assertEqual(self.app.slider(key="practice_loop").max, len(data["measures"]))
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(html.count('<article class="measure '), len(data["measures"]))
        self.assertIn(f'Compás {len(data["measures"])}', html)
        first = data["measures"][0]
        tab = next(event["tab"] for event in first["events"] if "tab" in event)
        expected = f'{tab.lstrip("+")}{"↑" if tab.startswith("+") else "↓"}'
        first_card = re.search(r'<article class="measure .*?</article>', html, re.DOTALL)
        assert first_card is not None
        self.assertIn(expected, first_card.group())
        self.assertIn("class=\"rest\"", html)
        self.assertIn("(3:2)", html)
        single = next(
            measure["number"] for measure in data["measures"]
            if sum("tab" in event for event in measure["events"]) == 1
        )
        self.app.slider(key="practice_loop").set_range(single, single).run()
        self.assertTrue(any("Única nota con tablatura" in item.value for item in self.app.caption))
        self.assertEqual(len(self.app.exception), 0)

    def test_missing_score_reports_error(self) -> None:
        original_read_text = Path.read_text

        def read_text(path: Path, *args, **kwargs):
            if path == SCORE:
                raise FileNotFoundError("partitura no encontrada")
            return original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            app = AppTest.from_file(str(APP), default_timeout=15).run()
        self.assertEqual(len(app.exception), 0)
        self.assertIn("No se pudo cargar la partitura", app.error[0].value)

    def test_elements_share_duration_scaled_positions(self) -> None:
        triplets = [
            {
                "pitch": "C5",
                "tab": "+4",
                "duration": "quarter",
                "tuplet": {"actual": 3, "normal": 2, "boundary": boundary},
            }
            for boundary in ("start", "continue", "stop")
        ]
        events = [{"rest": True, "duration": "quarter"}, *triplets,
                  {"pitch": "C5", "tab": "+4", "duration": "quarter"}]
        data = {
            "version": 3, "title": "Prueba", "instrument": {"key": "C"},
            "timeSignature": "4/4",
            "measures": [
                {"number": 1, "events": events},
                {"number": 2, "events": [{"pitch": "C5", "tab": "+4", "duration": "whole"}]},
            ],
        }
        original_read_text = Path.read_text

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            app = AppTest.from_file(str(APP), default_timeout=15).run()
        self.assertEqual(len(app.exception), 0)
        html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        card = re.search(r'<article class="measure .*?</article>', html, re.DOTALL)
        assert card is not None
        image = re.search(r'data:image/svg\+xml;base64,([^"]+)', card.group())
        assert image is not None
        svg = ElementTree.fromstring(b64decode(image.group(1)))
        points = [
            float(element.attrib["cx"] if element.tag.endswith("ellipse") else element.attrib["x"])
            for element in svg.iter()
            if element.tag.endswith("ellipse")
            or (element.tag.endswith("text") and element.get("font-size") == "28")
        ]
        tabs = [
            float(value) * 3 for value in re.findall(
                r'<span class="(?:blow|draw|rest)" style="left: ([0-9.]+)%"', card.group()
            )
        ]
        bars = [
            (float(start) * 3, float(width) * 3)
            for start, width in re.findall(
                r'<span class="(?:rest)?" style="left: ([0-9.]+)%; width: ([0-9.]+)%"',
                card.group(),
            )
        ]
        expected_positions = (70, 122.5, 157.5, 192.5, 227.5)
        expected_widths = (52.5, 35, 35, 35, 52.5)
        self.assertEqual((len(points), len(tabs), len(bars)), (5, 5, 5))
        for point, tab, (start, width), expected, expected_width in zip(
            points, tabs, bars, expected_positions, expected_widths
        ):
            self.assertAlmostEqual(point, expected, delta=0.1)
            self.assertAlmostEqual(tab, point, delta=0.1)
            self.assertAlmostEqual(start, point, delta=0.1)
            self.assertAlmostEqual(width, expected_width, delta=0.01)
        cards = re.findall(r'<article class="measure .*?</article>', html, re.DOTALL)
        single_bar = re.search(
            r'<span class="" style="left: ([0-9.]+)%; width: ([0-9.]+)%"', cards[1]
        )
        assert single_bar is not None
        self.assertAlmostEqual(float(single_bar.group(1)) * 3, 70, delta=0.01)
        self.assertAlmostEqual(float(single_bar.group(2)) * 3, 210, delta=0.01)

        with patch.object(Path, "read_text", read_text):
            app.checkbox(key="practice_score").uncheck().run()
        hidden_html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        hidden_card = re.search(r'<article class="measure .*?</article>', hidden_html, re.DOTALL)
        assert hidden_card is not None
        self.assertNotIn('class="staff-image"', hidden_card.group())
        self.assertEqual(
            re.findall(r'<span class="(?:blow|draw|rest)" style="left: ([0-9.]+)%"', hidden_card.group()),
            [f"{value / 3:.6f}" for value in tabs],
        )

    def test_tempo_buttons_follow_slider_and_limits(self) -> None:
        self.app.slider(key="practice_tempo").set_value(40).run()
        self.assertTrue(self.app.button(key="tempo_down").disabled)
        self.app.button(key="tempo_up").click().run()
        self.assertEqual(self.app.slider(key="practice_tempo").value, 41)
        self.app.slider(key="practice_tempo").set_value(160).run()
        self.assertTrue(self.app.button(key="tempo_up").disabled)
        self.app.button(key="tempo_down").click().run()
        self.assertEqual(self.app.slider(key="practice_tempo").value, 159)
        self.assertEqual(len(self.app.exception), 0)

    def test_view_changes_keep_practice_settings_and_one_notation(self) -> None:
        self.app.slider(key="practice_tempo").set_value(88).run()
        self.app.slider(key="practice_loop").set_range(1, 2).run()
        self.app.checkbox(key="practice_score").uncheck().run()
        self.assertTrue(self.app.checkbox(key="practice_tabs").disabled)
        self.assertEqual(self.app.slider(key="practice_tempo").value, 88)
        self.assertEqual(self.app.slider(key="practice_loop").value, (1, 2))
        self.app.checkbox(key="practice_score").check().run()
        self.app.checkbox(key="practice_tabs").uncheck().run()
        self.assertTrue(self.app.checkbox(key="practice_score").disabled)
        self.assertEqual(len(self.app.exception), 0)


if __name__ == "__main__":
    unittest.main()
