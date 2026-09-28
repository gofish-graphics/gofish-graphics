import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# One equal angular slot per country, clockwise from 12 o'clock in data
# order, with a small gap on each side. (Stacking theta would group by the
# radius field, so the slots are given explicitly.)
n = len(df)
df["mid"] = [i + 0.5 for i in range(n)]
df["start"] = df["mid"] - 0.45
df["end"] = df["mid"] + 0.45

INNER, OUTER = 60, 190
theta_scale = alt.Scale(domain=[0, n])
radius = alt.Radius(
    "exports:Q",
    scale=alt.Scale(type="linear", domain=[0, df["exports"].max()], range=[INNER, OUTER]),
)
bars = (
    alt.Chart(df)
    .mark_arc(radius2=INNER)
    .encode(
        theta=alt.Theta("start:Q", scale=theta_scale),
        theta2="end:Q",
        radius=radius,
        color=alt.Color("country:N", sort=None, legend=None),
    )
)
labels = (
    alt.Chart(df)
    .mark_text(radiusOffset=16, fontSize=11)
    .encode(theta=alt.Theta("mid:Q", scale=theta_scale), radius=radius, text="country:N")
)
chart = (bars + labels).properties(width=460, height=460)
chart.save(os.environ["OUT_PATH"], format="svg")
