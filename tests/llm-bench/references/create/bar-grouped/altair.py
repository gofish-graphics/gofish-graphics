import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
species = ["Bass", "Trout", "Catfish", "Perch", "Salmon"]

chart = (
    alt.Chart(df)
    .mark_bar()
    .encode(
        x=alt.X("lake:N", sort=None),
        xOffset=alt.XOffset("species:N", sort=species),
        y="count:Q",
        color=alt.Color("species:N", sort=species),
    )
    .properties(width=500, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
