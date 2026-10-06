import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_rect()
    .encode(
        x=alt.X("age_range:O", sort=None, title="age range", axis=alt.Axis(labelAngle=0)),
        y=alt.Y("savings:O", sort=None, title="savings"),
        color=alt.Color(
            "response_rate:Q", title="response rate", scale=alt.Scale(scheme="blues")
        ),
    )
    .properties(width=420, height=340)
)
chart.save(os.environ["OUT_PATH"], format="svg")
