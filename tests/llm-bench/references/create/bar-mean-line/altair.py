import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
mean = df["rain_mm"].mean()

bars = (
    alt.Chart(df)
    .mark_bar(color="steelblue")
    .encode(x=alt.X("month:N", sort=None), y=alt.Y("rain_mm:Q", title="rain_mm"))
)
rule = (
    alt.Chart(pd.DataFrame({"mean": [mean]}))
    .mark_rule(color="#333", strokeDash=[6, 4])
    .encode(y="mean:Q")
)
label = (
    alt.Chart(pd.DataFrame({"mean": [mean], "text": [f"Mean = {mean:.1f}"]}))
    .mark_text(align="right", baseline="bottom", dx=-4, dy=-4)
    .encode(x=alt.value(560), y="mean:Q", text="text:N")
)
chart = (bars + rule + label).properties(width=560, height=330)
chart.save(os.environ["OUT_PATH"], format="svg")
