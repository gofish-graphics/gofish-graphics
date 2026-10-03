import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

base = alt.Chart(df).encode(
    x=alt.X("year:Q", title="Year", scale=alt.Scale(zero=False), axis=alt.Axis(format="d")),
    y=alt.Y("visitors:Q", title="Visitors (thousands)"),
)
line = base.mark_line(color="steelblue", strokeWidth=2)
peak = base.transform_joinaggregate(top="max(visitors)").transform_filter(
    "datum.visitors == datum.top"
)
point = peak.mark_circle(size=80, color="#d62728", opacity=1)
text = peak.transform_calculate(
    label="'Peak: ' + format(datum.visitors, ',') + ' in ' + datum.year"
).mark_text(align="right", dx=-9).encode(text="label:N")
chart = (line + point + text).properties(width=560, height=330)
chart.save(os.environ["OUT_PATH"], format="svg")
