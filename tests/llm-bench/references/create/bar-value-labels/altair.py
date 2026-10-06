import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

base = alt.Chart(df).encode(x=alt.X("store:N", sort=None), y="sales:Q")
bars = base.mark_bar(color="steelblue")
labels = base.mark_text(baseline="bottom", dy=-3).encode(
    text=alt.Text("sales:Q", format=",d")
)
chart = (bars + labels).properties(width=560, height=330)
chart.save(os.environ["OUT_PATH"], format="svg")
