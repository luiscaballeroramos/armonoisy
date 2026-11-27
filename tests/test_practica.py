from base64 import b64decode
from decimal import Decimal
import json
import re
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

from streamlit.testing.v1 import AppTest


APP = Path(__file__).resolve().parents[1] / "app.py"
SCORE = APP.parent / "partituras" / "formateadas" / "stand-by-me.json"


def show_settings(app: AppTest) -> None:
    if app.session_state["practice_screen"] != "settings":
        app.button(key="practice_screen_toggle").click().run()


def show_practice(app: AppTest) -> None:
    if app.session_state["practice_screen"] != "practice":
        app.button(key="practice_screen_toggle").click().run()


def show_all_measures(app: AppTest) -> None:
    show_settings(app)
    app.radio(key="practice_visibility").set_value("Todos").run()
    show_practice(app)


class PracticeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = AppTest.from_file(str(APP), default_timeout=15).run()
        self.assertEqual(len(self.app.exception), 0)

    def set_loop(self, start: int, end: int) -> None:
        self.app.session_state["practice_loop_bounds"] = (start, end)
        self.app.run()

    def test_only_selected_measures_are_visible_by_default(self) -> None:
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(re.findall(r'id="practice-measure-(\d+)"', html), ["3", "4", "5"])
        self.app.button(key="map_measure_2").click().run()
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(re.findall(r'id="practice-measure-(\d+)"', html), ["2", "3", "4", "5"])
        show_settings(self.app)
        self.assertEqual(self.app.radio(key="practice_visibility").value, "Solo bucle")
        self.app.radio(key="practice_visibility").set_value("Todos").run()
        show_practice(self.app)
        self.assertEqual(self.app.session_state["practice_visibility_saved"], "Todos")
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(len(re.findall(r'id="practice-measure-(\d+)"', html)), 25)

    def test_screen_layout_preserves_frame_when_notation_is_hidden(self) -> None:
        layout_css = next(
            item.value for item in self.app.get("html")
            if "grid-template-areas:" in item.value
        )
        self.assertIn("height: calc(100dvh - 5.75rem)", layout_css)
        self.assertIn("grid-template-rows: minmax(0, 1fr)", layout_css)
        self.assertIn("overflow: auto", layout_css)
        styles = next(item.value for item in self.app.get("html") if "practice-score-container" in item.value and "<style>" in item.value)
        self.assertIn('[data-testid="stMain"] .st-key-practice-shell { min-height: 0; }', styles)
        show_settings(self.app)
        self.app.checkbox(key="practice_score").uncheck().run()
        show_practice(self.app)
        self.assertEqual(len(self.app.exception), 0)
        self.assertIn(layout_css, [item.value for item in self.app.get("html")])
        shell = next(c for c in self.app.get("flex_container") if c.key == "practice-shell")
        self.assertIn('class="practice-header"', shell.children[0].value)
        grid = next(child for child in shell.children.values() if child.key == "practice-grid")
        self.assertEqual(grid.key, "practice-grid")
        self.assertEqual(
            [region.key for region in grid.children.values()],
            ["practice-music", "practice-settings"],
        )
        self.assertEqual(self.app.slider(key="practice_tempo").value, 72)

    def test_loop_resize_and_move(self) -> None:
        self.app.button(key="map_measure_1").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (1, 5))
        self.app.button(key="map_measure_7").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (1, 7))
        self.app.button(key="map_measure_4").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (4, 7))
        self.app.button(key="map_measure_6").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (4, 6))
        self.app.button(key="map_measure_4").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (5, 6))
        self.assertEqual(len(self.app.exception), 0)

    def test_music_percentages_update_without_resetting_practice(self) -> None:
        self.set_loop(2, 6)
        self.app.slider(key="practice_tempo").set_value(88).run()
        self.app.button(key="practice_screen_toggle").click().run()
        self.assertEqual(self.app.session_state["practice_screen"], "settings")
        for selector, guide, transport in ((20, 15, 25), (25, 25, 25), (10, 10, 10)):
            with self.subTest(shares=(selector, guide, transport)):
                self.app.number_input(key="practice_height_map").set_value(selector)
                self.app.number_input(key="practice_height_guide").set_value(guide)
                self.app.number_input(key="practice_height_transport").set_value(transport)
                self.app.run()
                notation = 100 - selector - guide - transport
                styles = next(item.value for item in self.app.get("html") if "--music-rows:" in item.value)
                rows = " ".join(f"minmax(0, {value}fr)" for value in (selector, notation, guide, transport))
                self.assertIn(f"--music-rows: {rows}", styles)
                self.assertTrue(any(f"{notation}% restante" in item.value for item in self.app.caption))
                self.assertEqual(self.app.session_state["practice_loop_bounds"], (2, 6))
                self.assertEqual(self.app.session_state["practice_tempo_saved"], 88)
                self.assertEqual(len(self.app.exception), 0)
        self.app.button(key="practice_screen_toggle").click().run()
        self.assertEqual(self.app.session_state["practice_screen"], "practice")
        show_settings(self.app)
        self.app.checkbox(key="practice_score").uncheck().run()
        show_practice(self.app)
        styles = next(item.value for item in self.app.get("html") if "--music-rows:" in item.value)
        self.assertIn("--music-rows: minmax(0, 10fr) minmax(0, 70fr) minmax(0, 10fr) minmax(0, 10fr)", styles)

    def test_settings_screen_preserves_practice_state(self) -> None:
        self.set_loop(4, 7)
        self.app.slider(key="practice_tempo").set_value(96).run()
        show_settings(self.app)
        self.app.checkbox(key="practice_duration").uncheck().run()
        self.app.radio(key="practice_visibility").set_value("Solo bucle").run()
        self.app.number_input(key="practice_height_map").set_value(18).run()
        self.app.button(key="practice_screen_toggle").click().run()
        self.assertEqual(self.app.session_state["practice_screen"], "practice")
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (4, 7))
        self.assertEqual(self.app.session_state["practice_tempo_saved"], 96)
        self.assertEqual(self.app.slider(key="practice_tempo").value, 96)
        show_settings(self.app)
        self.assertEqual(self.app.session_state["practice_screen"], "settings")
        self.assertTrue(any(item.key == "practice-settings-page" for item in self.app.get("flex_container")))
        self.assertFalse(self.app.checkbox(key="practice_duration").value)
        self.assertEqual(self.app.radio(key="practice_visibility").value, "Solo bucle")
        self.assertEqual(self.app.number_input(key="practice_height_map").value, 18)
        show_practice(self.app)
        self.assertEqual(self.app.session_state["practice_screen"], "practice")
        self.assertEqual(self.app.slider(key="practice_tempo").value, 96)
        self.assertIn("Bucle 4–7", next(
            item.value for item in self.app.get("html") if 'class="practice-header"' in item.value
        ))

    def test_clicking_loop_endpoints_removes_them_until_one_remains(self) -> None:
        self.set_loop(3, 5)
        self.app.button(key="map_measure_5").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (3, 4))
        self.app.button(key="map_measure_3").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (4, 4))
        self.app.button(key="map_measure_4").click().run()
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (4, 4))
        html = "\n".join(item.value for item in self.app.get("html"))
        self.assertIn("Bucle 4–4", html)
        self.assertIn("A · B · En bucle", html)
        self.assertIn('href="#practice-measure-4"', html)
        self.assertEqual(len(self.app.exception), 0)

    def test_existing_slider_session_migrates_to_map(self) -> None:
        app = AppTest.from_file(str(APP), default_timeout=15)
        app.session_state["practice_loop"] = (2, 7)
        app.run()
        self.assertEqual(app.session_state["practice_loop_bounds"], (2, 7))
        app.button(key="map_measure_1").click().run()
        self.assertEqual(app.session_state["practice_loop_bounds"], (1, 7))
        self.assertEqual(len(app.exception), 0)

    def test_selected_score_is_loaded_and_rendered(self) -> None:
        show_all_measures(self.app)
        data = json.loads(SCORE.read_text(encoding="utf-8"))
        header = next(item.value for item in self.app.get("html") if 'class="practice-header"' in item.value)
        self.assertIn(f'<h3>{data["title"]}</h3>', header)
        self.assertEqual(len([b for b in self.app.button if b.key and b.key.startswith("map_measure_")]), len(data["measures"]))
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(html.count('class="measure-heading measure-cell '), len(data["measures"]))
        self.assertIn(f'Compás {len(data["measures"])}', html)
        first = data["measures"][0]
        tab = next(event["tab"] for event in first["events"] if "tab" in event)
        expected = f'{tab.lstrip("+")}{"↑" if tab.startswith("+") else "↓"}'
        first_card = re.search(r'<div class="tabs measure-cell [^"]+" data-measure="1".*?</div>', html, re.DOTALL)
        assert first_card is not None
        self.assertIn(expected, first_card.group())
        self.assertIn("class=\"rest\"", html)
        self.assertNotIn("<small>", first_card.group())
        guide = next(item.value for item in self.app.get("html") if 'class="practice-holes"' in item.value)
        self.assertEqual(re.findall(r"<span>(\d+)</span>", guide), [str(hole) for hole in range(1, 11)])
        self.assertIn('role="img"', guide)
        self.assertIn("Guía de armónica C, agujeros del 1 al 10", guide)
        self.assertFalse(any("Guía · armónica" in item.value for item in self.app.markdown))
        self.assertNotIn("active", guide)
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

    def test_tab_shows_only_hole_and_direction_with_matching_backgrounds(self) -> None:
        original_read_text = Path.read_text
        data = {
            "version": 3, "title": "Dirección", "instrument": {"key": "C"},
            "timeSignature": "4/4",
            "measures": [
                {"number": 1, "events": [
                    {"pitch": "C5", "tab": "+4", "duration": "quarter"},
                    {"pitch": "D5", "tab": "4", "duration": "quarter", "bendSemitones": 1},
                    {"rest": True, "duration": "quarter"},
                    {"pitch": "E5", "duration": "quarter"},
                ]},
                {"number": 2, "events": [
                    {"pitch": "C5", "tab": "+4", "duration": "whole"}
                ]},
            ],
        }

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            app = AppTest.from_file(str(APP), default_timeout=15).run()
            show_all_measures(app)
        self.assertEqual(len(app.exception), 0)
        html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        tab_cell = re.search(r'<div class="tabs measure-cell [^"]+" data-measure="1".*?</div>', html, re.DOTALL)
        bg_cell = re.search(r'<div class="measure-background" data-measure="1".*?</div>', html, re.DOTALL)
        assert tab_cell is not None and bg_cell is not None
        self.assertEqual(re.findall(r'<span class="[^"]+" style="[^"]+">([^<]+)</span>', tab_cell.group()),
                         ["4↑", "4↓", "—", "—"])
        self.assertEqual(re.findall(r'<span class="([^"]+)"', bg_cell.group()),
                         ["blow-0", "draw-1", "rest", "unknown"])
        show_settings(app)
        app.checkbox(key="practice_duration").uncheck().run()
        app.checkbox(key="practice_score").uncheck().run()
        show_practice(app)
        html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        self.assertIn(">4↑</span>", html)
        self.assertIn(">4↓</span>", html)
        self.assertNotIn("<small>", html)

    def test_clef_and_meter_in_separate_signature_cell(self) -> None:
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        images = re.findall(r'data:image/svg\+xml;base64,([^"]+)', html)
        self.assertGreater(len(images), 1)
        scores = [b64decode(image).decode("utf-8") for image in images]
        self.assertEqual(scores[0].count("𝄞"), 1)
        self.assertIn('alt="Clave de sol, compás 4/4"', html)
        self.assertIn('class="practice-signature"', html)
        self.assertIn('>4</text>', scores[0])
        self.assertTrue(all("𝄞" not in score for score in scores[1:]))
        self.set_loop(3, 5)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        scores = [b64decode(image).decode("utf-8") for image in re.findall(
            r'data:image/svg\+xml;base64,([^"]+)', html
        )]
        self.assertEqual(sum(score.count("𝄞") for score in scores), 1)
        show_settings(self.app)
        self.app.checkbox(key="practice_score").uncheck().run()
        show_practice(self.app)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertIn('class="practice-signature"', html)
        self.assertNotIn('class="signature-image"', html)
        self.assertIn('aria-label="Ir al inicio del bucle"', html)

    def test_signature_uses_score_meter(self) -> None:
        original_read_text = Path.read_text
        data = json.loads(SCORE.read_text(encoding="utf-8"))
        data["timeSignature"] = "3/4"

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            app = AppTest.from_file(str(APP), default_timeout=15).run()
        html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        self.assertIn('alt="Clave de sol, compás 3/4"', html)
        image = re.search(r'data:image/svg\+xml;base64,([^"]+)', html)
        assert image is not None
        svg = b64decode(image.group(1)).decode("utf-8")
        self.assertIn(">3</text>", svg)
        self.assertIn(">4</text>", svg)

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
            show_all_measures(app)
        self.assertEqual(len(app.exception), 0)
        html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        image = re.search(r'<img class="staff-image" src="data:image/svg\+xml;base64,([^"]+)', html)
        assert image is not None
        svg = ElementTree.fromstring(b64decode(image.group(1)))
        staff = next(element for element in svg if element.tag.endswith("path"))
        for height in (55, 65, 75, 85, 95):
            self.assertIn(f"M0 {height}H600", staff.attrib["d"])
        first_measure = next(element for element in svg if element.get("transform") == "translate(0 0)")
        points = [
            float(element.attrib["cx"] if element.tag.endswith("ellipse") else element.attrib["x"])
            for element in first_measure.iter()
            if element.tag.endswith("ellipse")
            or (element.tag.endswith("text") and element.get("font-size") == "28")
        ]
        tab_cell = re.search(r'<div class="tabs measure-cell [^"]+" data-measure="1".*?</div>', html, re.DOTALL)
        bar_cell = re.search(r'<div class="measure-background" data-measure="1".*?</div>', html, re.DOTALL)
        assert tab_cell is not None and bar_cell is not None
        tabs = [
            float(value) * 3 for value in re.findall(
                r'<span class="(?:blow|draw|rest)" style="left: ([0-9.]+)%"', tab_cell.group()
            )
        ]
        bars = [
            (float(start) * 3, float(width) * 3)
            for start, width in re.findall(
                r'<span class="(?:rest|blow-[01]|draw-[01]|unknown)" style="left: ([0-9.]+)%; width: ([0-9.]+)%"',
                bar_cell.group(),
            )
        ]
        expected_positions = (37.5, 100, 150, 200, 262.5)
        expected_widths = (75, 50, 50, 50, 75)
        self.assertEqual((len(points), len(tabs), len(bars)), (5, 5, 5))
        for point, tab, (start, width), expected, expected_width in zip(
            points, tabs, bars, expected_positions, expected_widths
        ):
            self.assertAlmostEqual(point, expected, delta=0.1)
            self.assertAlmostEqual(tab, point, delta=0.1)
            self.assertAlmostEqual(start + width / 2, point, delta=0.1)
            self.assertAlmostEqual(width, expected_width, delta=0.01)
        single_background = re.search(r'<div class="measure-background" data-measure="2".*?</div>', html)
        assert single_background is not None
        single_bar = re.search(
            r'<span class="blow-0" style="left: ([0-9.]+)%; width: ([0-9.]+)%"', single_background.group()
        )
        assert single_bar is not None
        self.assertAlmostEqual(float(single_bar.group(1)) * 3, 0, delta=0.01)
        self.assertAlmostEqual(float(single_bar.group(2)) * 3, 300, delta=0.01)

        with patch.object(Path, "read_text", read_text):
            show_settings(app)
            app.checkbox(key="practice_score").uncheck().run()
            show_practice(app)
        hidden_html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        hidden_card = re.search(r'<div class="tabs measure-cell [^"]+" data-measure="1".*?</div>', hidden_html)
        assert hidden_card is not None
        self.assertNotIn('class="staff-image"', hidden_html)
        self.assertEqual(
            re.findall(r'<span class="(?:blow|draw|rest)" style="left: ([0-9.]+)%"', hidden_card.group()),
            [f"{value / 3:.6f}" for value in tabs],
        )
        self.assertAlmostEqual(bars[0][0], 0)
        self.assertAlmostEqual(bars[-1][0] + bars[-1][1], 300)
        for previous, following in zip(bars, bars[1:]):
            self.assertAlmostEqual(previous[0] + previous[1], following[0], delta=0.01)

    def test_measure_columns_are_shared_by_all_rows(self) -> None:
        show_all_measures(self.app)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        for row in ("heading-row", "tabs-row"):
            self.assertIn(f'practice-row {row}', html)
        self.assertNotIn("navigation-row", html)
        self.assertNotIn("measure-navigation", html)
        self.assertLess(html.index('class="practice-score"'), html.index('class="practice-signature"'))
        self.assertLess(html.index('class="practice-signature"'), html.index('class="practice-row heading-row"'))
        self.assertIn('class="background-row"', html)
        self.assertNotIn('duration-row', html)
        for number in range(1, len(json.loads(SCORE.read_text(encoding="utf-8"))["measures"]) + 1):
            self.assertEqual(html.count(f'data-measure="{number}"'), 3)
        self.assertEqual(html.count('class="staff-image"'), 1)
        show_settings(self.app)
        self.app.checkbox(key="practice_score").uncheck().run()
        show_practice(self.app)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertIn('class="practice-signature"', html)
        self.assertIn('class="tabs measure-cell ', html)
        self.assertNotIn('class="staff-image"', html)

    def test_duration_background_can_be_hidden_without_losing_divisions(self) -> None:
        show_settings(self.app)
        self.app.radio(key="practice_visibility").set_value("Todos").run()
        self.app.checkbox(key="practice_duration").uncheck().run()
        show_practice(self.app)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        backgrounds = re.findall(r'<div class="measure-background" data-measure="\d+" data-selected="(?:true|false)">(.*?)</div>', html)
        self.assertEqual(len(backgrounds), len(json.loads(SCORE.read_text(encoding="utf-8"))["measures"]))
        self.assertTrue(all(not background for background in backgrounds))
        self.assertIn('class="staff-image"', html)
        self.assertIn('class="tabs measure-cell ', html)

    def test_ties_across_measures_use_one_continuous_curve(self) -> None:
        original_read_text = Path.read_text
        data = {
            "version": 3, "title": "Ligadura", "instrument": {"key": "C"},
            "timeSignature": "4/4",
            "measures": [
                {"number": 1, "events": [
                    {"pitch": "C5", "tab": "+4", "duration": "whole", "tie": "start"}
                ]},
                {"number": 2, "events": [
                    {"pitch": "C5", "tab": "+4", "duration": "whole", "tie": "stop"}
                ]},
            ],
        }

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            app = AppTest.from_file(str(APP), default_timeout=15).run()
            show_all_measures(app)
        self.assertEqual(len(app.exception), 0)
        html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        image = re.search(r'<img class="staff-image" src="data:image/svg\+xml;base64,([^"]+)', html)
        assert image is not None
        svg = ElementTree.fromstring(b64decode(image.group(1)))
        ties = [element for element in svg.iter() if element.get("class") == "tie"]
        self.assertEqual(len(ties), 1)
        self.assertIn("M156.0", ties[0].attrib["d"])
        self.assertIn("444.0", ties[0].attrib["d"])

        data["measures"][1]["events"][0]["pitch"] = "D5"
        with patch.object(Path, "read_text", read_text):
            invalid = AppTest.from_file(str(APP), default_timeout=15).run()
        self.assertIn("ligadura", invalid.error[0].value.lower())

    def test_all_score_ties_are_rendered_once(self) -> None:
        show_all_measures(self.app)
        data = json.loads(SCORE.read_text(encoding="utf-8"))
        expected = sum(event.get("tie") == "start" for measure in data["measures"] for event in measure["events"])
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        image = re.search(r'<img class="staff-image" src="data:image/svg\+xml;base64,([^"]+)', html)
        assert image is not None
        svg = ElementTree.fromstring(b64decode(image.group(1)))
        self.assertEqual(sum(element.get("class") == "tie" for element in svg.iter()), expected)

    def test_dense_measures_scale_without_minimum_width(self) -> None:
        data = {
            "version": 3, "title": "Prueba", "instrument": {"key": "C"},
            "timeSignature": "4/4",
            "measures": [
                {"number": 1, "events": [
                    {"pitch": "C5", "tab": "+4", "duration": "16th"}
                    for _ in range(16)
                ]},
                {"number": 2, "events": [
                    {"pitch": "C5", "tab": "+4", "duration": "whole"}
                ]},
            ],
        }
        original_read_text = Path.read_text

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            app = AppTest.from_file(str(APP), default_timeout=15).run()
            show_all_measures(app)
        self.assertEqual(len(app.exception), 0)
        html = next(item.value for item in app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(re.findall(r'--notation-width: (\d+)', html), ["512", "300"])
        self.assertNotIn("min-width:", html)

    def test_score_tempo_initialises_the_practice_without_rounding(self) -> None:
        original_read_text = Path.read_text
        data = json.loads(original_read_text(SCORE, encoding="utf-8"))

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            for tempo in (40, 40.5, 72.12345678901234, 91.25, 127.96, 159.5, 160):
                with self.subTest(tempo=tempo):
                    data["tempoBpm"] = tempo
                    app = AppTest.from_file(str(APP), default_timeout=15).run()
                    self.assertEqual(len(app.exception), 0)
                    slider = app.slider(key="practice_tempo")
                    self.assertEqual(slider.value, tempo)
                    self.assertEqual(Decimal(str(tempo)) % Decimal(str(slider.proto.step)), 0)
                    self.assertEqual(app.session_state["practice_tempo_saved"], tempo)
                    self.assertTrue(any(f"{tempo} BPM" in item.value for item in app.markdown))
                    if tempo == 40.5:
                        self.assertTrue(app.button(key="tempo_down").disabled)
                        app.button(key="tempo_up").click().run()
                        self.assertEqual(app.slider(key="practice_tempo").value, 41.5)
                    elif tempo == 159.5:
                        self.assertTrue(app.button(key="tempo_up").disabled)
                        app.button(key="tempo_down").click().run()
                        self.assertEqual(app.slider(key="practice_tempo").value, 158.5)
                    elif tempo == 91.25:
                        app.button(key="tempo_up").click().run()
                        show_settings(app)
                        show_practice(app)
                        self.assertEqual(app.slider(key="practice_tempo").value, 92.25)
                    elif tempo == 127.96:
                        app.button(key="tempo_up").click().run()
                        self.assertEqual(app.slider(key="practice_tempo").value, 128.96)

    def test_score_tempo_preserves_an_existing_session_value(self) -> None:
        original_read_text = Path.read_text
        data = json.loads(original_read_text(SCORE, encoding="utf-8"))
        data["tempoBpm"] = 100

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            app = AppTest.from_file(str(APP), default_timeout=15)
            app.session_state["practice_tempo"] = 88
            app.run()
        self.assertEqual(len(app.exception), 0)
        self.assertEqual(app.slider(key="practice_tempo").value, 88)

    def test_out_of_range_score_tempo_requires_an_explicit_choice(self) -> None:
        original_read_text = Path.read_text
        original_score = original_read_text(SCORE, encoding="utf-8")
        data = json.loads(original_score)

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            for tempo in (39.9, 160.1):
                with self.subTest(tempo=tempo):
                    data["tempoBpm"] = tempo
                    app = AppTest.from_file(str(APP), default_timeout=15)
                    app.session_state["practice_tempo_saved"] = 88
                    app.run()
                    self.assertEqual(len(app.exception), 0)
                    self.assertTrue(any(
                        f"{tempo}" in item.value and "40" in item.value and "160" in item.value
                        for item in app.warning
                    ))
                    self.assertEqual(len(app.slider), 0)
                    app.number_input(key="practice_tempo_choice").set_value(85)
                    app.button(key="confirm_score_tempo").click().run()
                    self.assertEqual(len(app.exception), 0)
                    self.assertEqual(app.slider(key="practice_tempo").value, 85)
                    self.assertEqual(app.session_state["practice_tempo_saved"], 85)
                    show_settings(app)
                    show_practice(app)
                    self.assertEqual(app.slider(key="practice_tempo").value, 85)
        self.assertEqual(original_read_text(SCORE, encoding="utf-8"), original_score)

    def test_invalid_score_tempo_reports_an_error(self) -> None:
        original_read_text = Path.read_text
        data = json.loads(original_read_text(SCORE, encoding="utf-8"))

        def read_text(path: Path, *args, **kwargs):
            return json.dumps(data) if path == SCORE else original_read_text(path, *args, **kwargs)

        with patch.object(Path, "read_text", read_text):
            for tempo in ("80", None, True, float("nan")):
                with self.subTest(tempo=tempo):
                    data["tempoBpm"] = tempo
                    app = AppTest.from_file(str(APP), default_timeout=15).run()
                    self.assertEqual(len(app.exception), 0)
                    self.assertTrue(any("tempo" in item.value.lower() for item in app.error))
                    self.assertEqual(len(app.slider), 0)

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

    def test_transport_controls_share_one_row(self) -> None:
        transport = next(c for c in self.app.get("flex_container") if c.key == "practice-transport")
        row = transport.children[0]
        columns = list(row.children.values())
        self.assertEqual(len(columns), 5)
        self.assertEqual(columns[0].button, [])
        self.assertEqual(columns[0].slider, [])
        self.assertEqual(columns[1].button[0].key, "tempo_down")
        self.assertIn("BPM", columns[2].markdown[0].value)
        self.assertEqual(columns[3].button[0].key, "tempo_up")
        self.assertEqual(columns[4].slider[0].key, "practice_tempo")
        self.assertEqual(len(self.app.exception), 0)

    def test_metronome_and_volume_settings_are_saved(self) -> None:
        show_settings(self.app)
        self.assertTrue(self.app.toggle(key="practice_metronome").value)
        self.assertEqual(self.app.slider(key="practice_volume").value, 75)
        self.app.toggle(key="practice_metronome").set_value(False).run()
        self.app.slider(key="practice_volume").set_value(42).run()
        self.assertFalse(self.app.session_state["practice_metronome_saved"])
        self.assertEqual(self.app.session_state["practice_volume_saved"], 42)
        show_practice(self.app)
        show_settings(self.app)
        self.assertFalse(self.app.toggle(key="practice_metronome").value)
        self.assertEqual(self.app.slider(key="practice_volume").value, 42)
        self.assertEqual(len(self.app.exception), 0)

    def test_collapsing_settings_preserves_values(self) -> None:
        self.set_loop(1, 2)
        show_settings(self.app)
        self.app.checkbox(key="practice_duration").uncheck().run()
        self.app.button(key="practice_screen_toggle").click().run()
        self.app.slider(key="practice_tempo").set_value(88).run()
        show_settings(self.app)
        self.assertTrue(any(item.label == "Sonido y avisos" for item in self.app.expander))
        show_practice(self.app)
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (1, 2))
        show_settings(self.app)
        self.assertFalse(self.app.checkbox(key="practice_duration").value)
        show_practice(self.app)
        self.assertEqual(self.app.slider(key="practice_tempo").value, 88)
        self.assertEqual(len(self.app.exception), 0)

    def test_simplified_header_and_guide(self) -> None:
        self.assertEqual(len(self.app.title), 0)
        header = next(item.value for item in self.app.get("html") if 'class="practice-header"' in item.value)
        self.assertIn("<h3>Stand by Me</h3>", header)
        self.assertIn("Armónica C · 4/4 · Bucle 3–5 · Repetición sin límite", header)
        self.set_loop(4, 6)
        header = next(item.value for item in self.app.get("html") if 'class="practice-header"' in item.value)
        self.assertIn("Bucle 4–6", header)
        show_settings(self.app)
        self.assertEqual([radio.label for radio in self.app.radio], ["Compases en las cintas"])
        self.assertTrue(any(button.label == "← Volver" for button in self.app.button))
        self.assertTrue(any(expander.label == "Sonido y avisos" for expander in self.app.expander))
        show_practice(self.app)
        self.assertEqual(len(self.app.get("popover")), 0)
        visible_text = "\n".join(item.value for item in self.app.caption)
        self.assertNotIn("ARMONOISY · Primera interfaz", visible_text)
        self.assertNotIn("Soplar: naranja", visible_text)
        self.assertNotIn("Segunda nota", visible_text)
        self.assertNotIn("Sonido y aviso se activarán", visible_text)
        self.assertFalse(any("Tu fragmento" in item.value for item in self.app.markdown))
        self.assertFalse(any("Mapa de la canción" in item.value for item in self.app.markdown))
        self.assertFalse(any(e.label == "Reproducción y tempo" for e in self.app.expander))
        self.assertIsNotNone(self.app.slider(key="practice_tempo"))
        self.assertEqual(len(self.app.select_slider), 0)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertIn('class="practice-repeat" type="button" disabled', html)
        self.assertIn("Repetir el compás actual (disponible con reproducción)", html)

    def test_map_and_music_follow_loop_including_single_measure(self) -> None:
        self.set_loop(2, 4)
        html = "\n".join(item.value for item in self.app.get("html"))
        self.assertEqual(self.app.button(key="map_measure_2").label, "2")
        self.assertEqual(self.app.button(key="map_measure_4").label, "4")
        self.assertIn('href="#practice-measure-2" aria-label="Ir al inicio del bucle"', html)
        self.assertIn('id="practice-measure-4"', html)
        self.assertIn('aria-label="Música: desplazar horizontalmente"', html)
        self.set_loop(3, 3)
        html = "\n".join(item.value for item in self.app.get("html"))
        self.assertEqual(self.app.button(key="map_measure_3").label, "3")
        self.assertIn("A · B · En bucle", html)
        self.assertEqual(len(self.app.exception), 0)

    def test_context_measure_marking_tracks_loop(self) -> None:
        show_all_measures(self.app)
        self.set_loop(3, 5)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertIn('data-measure="2" data-selected="false"', html)
        self.assertIn('data-measure="3" data-selected="true"', html)
        self.assertRegex(html, r'class="tabs measure-cell context" data-measure="2"')
        self.app.button(key="map_measure_2").click().run()
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertIn('data-measure="2" data-selected="true"', html)
        self.assertNotRegex(html, r'class="tabs measure-cell context" data-measure="2"')

    def test_measure_headings_show_only_numbers(self) -> None:
        show_all_measures(self.app)
        for bounds in ((3, 5), (4, 4)):
            with self.subTest(bounds=bounds):
                self.set_loop(*bounds)
                html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
                headings = [
                    ElementTree.fromstring(fragment)
                    for fragment in re.findall(r'<div class="measure-heading\b[^>]*>.*?</div>', html)
                ]
                self.assertEqual(len(headings), 25)
                for heading in headings:
                    self.assertEqual("".join(heading.itertext()), heading.attrib["data-measure"])
                selected = headings[bounds[0] - 1]
                self.assertIn("En bucle", selected.attrib["aria-label"])
                self.assertIn("Contexto", headings[0].attrib["aria-label"])

    def test_visibility_modes_and_song_boundaries(self) -> None:
        self.set_loop(3, 5)
        show_settings(self.app)
        for mode, expected in (
            ("Todos", list(range(1, 26))),
            ("Bucle y adyacentes", [2, 3, 4, 5, 6]),
            ("Solo bucle", [3, 4, 5]),
        ):
            self.app.radio(key="practice_visibility").set_value(mode).run()
            show_practice(self.app)
            html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
            self.assertEqual([int(n) for n in re.findall(r'id="practice-measure-(\d+)"', html)], expected)
            image = re.search(r'<img class="staff-image" src="data:image/svg\+xml;base64,([^"]+)', html)
            assert image is not None
            svg = ElementTree.fromstring(b64decode(image.group(1)))
            self.assertEqual(svg.attrib["viewBox"], f"{(expected[0] - 1) * 300} 0 {len(expected) * 300} 135")
            show_settings(self.app)
        self.app.radio(key="practice_visibility").set_value("Bucle y adyacentes").run()
        show_practice(self.app)
        self.set_loop(1, 1)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(re.findall(r'id="practice-measure-(\d+)"', html), ["1", "2"])
        self.set_loop(25, 25)
        html = next(item.value for item in self.app.get("html") if 'class="practice-score"' in item.value)
        self.assertEqual(re.findall(r'id="practice-measure-(\d+)"', html), ["24", "25"])

    def test_view_changes_keep_practice_settings_and_one_notation(self) -> None:
        self.app.slider(key="practice_tempo").set_value(88).run()
        self.set_loop(1, 2)
        show_settings(self.app)
        self.app.checkbox(key="practice_score").uncheck().run()
        self.assertTrue(self.app.checkbox(key="practice_tabs").disabled)
        self.assertEqual(self.app.session_state["practice_tempo_saved"], 88)
        self.assertEqual(self.app.session_state["practice_loop_bounds"], (1, 2))
        self.app.checkbox(key="practice_score").check().run()
        self.app.checkbox(key="practice_tabs").uncheck().run()
        self.assertTrue(self.app.checkbox(key="practice_score").disabled)
        self.assertEqual(len(self.app.exception), 0)


if __name__ == "__main__":
    unittest.main()
