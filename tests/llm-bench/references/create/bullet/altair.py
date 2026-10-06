import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# Three qualitative bands per category, end to end: 0-poor, poor-average,
# average-good.
bands = pd.concat(
    [
        df.assign(band="poor", start=0, end=df["poor"]),
        df.assign(band="average", start=df["poor"], end=df["average"]),
        df.assign(band="good", start=df["average"], end=df["good"]),
    ]
)

y = alt.Y("category:N", sort=None, title=None)
ranges = (
    alt.Chart(bands)
    .mark_bar(size=36)
    .encode(
        y=y,
        x=alt.X("start:Q", title="sales"),
        x2="end:Q",
        color=alt.Color(
            "band:N",
            scale=alt.Scale(
                domain=["poor", "average", "good"], range=["#999", "#bbb", "#ddd"]
            ),
            legend=None,
        ),
    )
)
measure = alt.Chart(df).mark_bar(size=12, color="#333").encode(y=y, x="sales:Q")
target = (
    alt.Chart(df)
    .mark_tick(size=26, thickness=3, color="black")
    .encode(y=y, x="target:Q")
)
chart = (ranges + measure + target).properties(width=520, height=240)
chart.save(os.environ["OUT_PATH"], format="svg")
