import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_line(color="steelblue", strokeWidth=2, point=True)
    .encode(
        x=alt.X(
            "year:Q",
            title="Year",
            scale=alt.Scale(zero=False),
            axis=alt.Axis(format="d"),
        ),
        y=alt.Y("wheat:Q", title="Wheat price (shillings)"),
    )
    .properties(width=560, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
