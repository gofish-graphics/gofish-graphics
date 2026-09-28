import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_circle(size=40, opacity=1)
    .encode(
        x=alt.X("bill_length_mm:Q", scale=alt.Scale(zero=False)),
        y=alt.Y("flipper_length_mm:Q", scale=alt.Scale(zero=False)),
        color="species:N",
    )
    .properties(width=480, height=340)
)
chart.save(os.environ["OUT_PATH"], format="svg")
