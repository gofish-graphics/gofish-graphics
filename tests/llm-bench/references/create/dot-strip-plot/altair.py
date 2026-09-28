import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_circle(size=80, opacity=1)
    .encode(
        x=alt.X("sales:Q", title="sales"),
        y=alt.Y("month:N", sort=None, title=None),
        color=alt.Color("sub_category:N", sort=None, title="sub-category"),
    )
    .properties(width=440, height=300)
)
chart.save(os.environ["OUT_PATH"], format="svg")
