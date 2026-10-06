import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_bar(color="steelblue", stroke="white")
    .encode(
        x=alt.X(
            "flipper_length_mm:Q",
            bin=alt.Bin(extent=[170, 240], step=10),
            title="Flipper length (mm)",
        ),
        y=alt.Y("count():Q", title="Count"),
    )
    .properties(width=560, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
