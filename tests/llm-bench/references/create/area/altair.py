import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
categories = list(dict.fromkeys(df["category"]))
df["stack_order"] = df["category"].map(categories.index)

chart = (
    alt.Chart(df)
    .mark_area()
    .encode(
        x=alt.X("date:T", title=None),
        y=alt.Y("sales:Q", stack="zero", title="sales"),
        color=alt.Color("category:N", sort=categories),
        order=alt.Order("stack_order:Q"),
    )
    .properties(width=480, height=340)
)
chart.save(os.environ["OUT_PATH"], format="svg")
