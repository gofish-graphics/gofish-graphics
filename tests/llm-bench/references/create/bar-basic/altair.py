import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_bar(color="steelblue")
    .encode(x=alt.X("lake:N", sort=None), y="count:Q")
    .properties(width=560, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
