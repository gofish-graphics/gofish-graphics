import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
months = list(dict.fromkeys(df["month"]))
STEP = 30  # px between baselines; the tallest peak rises 2 * STEP

chart = (
    alt.Chart(df, height=STEP, width=460)
    .mark_area(interpolate="linear", color="steelblue", stroke="white", strokeWidth=1)
    .encode(
        x=alt.X("temp_c:Q"),
        y=alt.Y(
            "days:Q",
            axis=None,
            scale=alt.Scale(domain=[0, df["days"].max()], range=[STEP, -STEP]),
        ),
    )
    .facet(
        row=alt.Row(
            "month:N",
            sort=months,
            title=None,
            header=alt.Header(labelAngle=0, labelAlign="left", labelAnchor="start", labelBaseline="bottom"),
        )
    )
    .properties(bounds="flush")
    .configure_facet(spacing=0)
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
