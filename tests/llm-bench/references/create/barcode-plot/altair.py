import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_tick(size=15, thickness=2, color="#4c78a8", opacity=1)
    .encode(
        x=alt.X("avg_sales:Q", title="average sales"),
        y=alt.Y("sub_category:N", sort=None, title=None),
    )
    .properties(width=530, height=240)
)
chart.save(os.environ["OUT_PATH"], format="svg")
