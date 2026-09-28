import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_circle(size=40, color="steelblue", opacity=0.7)
    .encode(
        x=alt.X("mpg:Q", title="Miles per gallon", scale=alt.Scale(zero=False)),
        y=alt.Y("horsepower:Q", title="Horsepower", scale=alt.Scale(zero=False)),
    )
    .properties(width=560, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
