import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_bar()
    .encode(
        x=alt.X("profit_ratio:Q", title="profit ratio"),
        y=alt.Y("sub_category:N", sort=None, title=None),
        color=alt.condition(
            "datum.profit_ratio < 0", alt.value("#d62728"), alt.value("#4c78a8")
        ),
    )
    .properties(width=440, height=430)
)
chart.save(os.environ["OUT_PATH"], format="svg")
