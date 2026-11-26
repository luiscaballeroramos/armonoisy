from pathlib import Path

import streamlit as st


def main() -> None:
    st.set_page_config(page_title="Armonoisy · Práctica libre", layout="wide")
    navigation = st.navigation([
        st.Page(
            Path("pages") / "practica_libre.py",
            title="Práctica libre",
            default=True,
        ),
    ])
    navigation.run()


if __name__ == "__main__":
    main()
