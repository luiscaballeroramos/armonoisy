from pathlib import Path
from typing import Any

import streamlit as st


@st.cache_resource(show_spinner=False)
def _register_component() -> Any:
    assets = Path(__file__).resolve().parents[2] / "assets"
    return st.components.v2.component(
        "armonoisy_practice_player",
        html=(assets / "practice_player.html").read_text(encoding="utf-8"),
        css=(assets / "practice_player.css").read_text(encoding="utf-8"),
        js=(assets / "practice_player.js").read_text(encoding="utf-8"),
    )


def render_player(data: dict[str, Any], on_tempo_change: Any) -> Any:
    return _register_component()(
        data=data,
        default={"tempo": data["tempo"]},
        key="practice_player",
        on_tempo_change=on_tempo_change,
    )
