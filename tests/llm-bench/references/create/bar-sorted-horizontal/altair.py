import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_bar(color="steelblue")
    .encode(
        y=alt.Y("site:N", sort="-x"),
        x=alt.X("sum(yield):Q", title="total yield"),
    )
    .properties(width=500, height=340)
)
chart.save(os.environ["OUT_PATH"], format="svg")
