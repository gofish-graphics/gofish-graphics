import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
channels = ["Retail", "Online", "Wholesale", "Partner"]
HALF = 0.28  # half a bar's width, in years

# Stack each year's channels bottom to top in data order (Retail first).
df["year"] = df["year"].astype(int)
df["y1"] = df.groupby("year")["revenue"].cumsum()
df["y0"] = df["y1"] - df["revenue"]

# A band per channel between neighboring bars: from the right edge of this
# year's segment to the left edge of the next year's.
nxt = df.assign(year=df["year"] - 1)
bands = df.merge(nxt, on=["year", "channel"], suffixes=("", "_next"))
bands["gap"] = bands["year"]
bands = pd.concat(
    [
        bands.assign(x=bands["year"] + HALF),
        bands.assign(x=bands["year"] + 1 - HALF, y0=bands["y0_next"], y1=bands["y1_next"]),
    ]
)

color = alt.Color("channel:N", sort=channels)
bars = (
    alt.Chart(df)
    .transform_calculate(x0=f"datum.year - {HALF}", x1=f"datum.year + {HALF}")
    .mark_rect()
    .encode(
        x=alt.X("x0:Q", title="year", axis=alt.Axis(format="d", tickMinStep=1)),
        x2="x1:Q",
        y=alt.Y("y0:Q", title="revenue"),
        y2="y1:Q",
        color=color,
    )
)
ribbons = (
    alt.Chart(bands)
    .mark_area(opacity=0.4)
    .encode(x="x:Q", y="y0:Q", y2="y1:Q", color=color, detail="gap:N")
)
chart = (ribbons + bars).properties(width=500, height=330)
chart.save(os.environ["OUT_PATH"], format="svg")
