import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_arc(stroke="white")
    .encode(
        theta="amount:Q",
        order=alt.Order("amount:Q", sort="descending"),
        color=alt.Color("category:N", sort=None),
    )
    .properties(width=330, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
