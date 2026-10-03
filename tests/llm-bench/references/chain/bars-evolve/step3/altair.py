import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_bar(color="steelblue")
    .encode(
        y=alt.Y("lake:N", sort="-x"),
        x="count:Q",
        color=alt.condition(
            alt.datum.lake == "Lake B", alt.value("#f58518"), alt.value("steelblue")
        ),
    )
    .properties(width=560, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
