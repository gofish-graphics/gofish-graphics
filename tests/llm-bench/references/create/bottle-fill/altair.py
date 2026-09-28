import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# Pixel coordinates, y up from the bottles' baseline. A bottle is a 60 x 150
# body with a 20 x 50 neck; `x` is its left edge.
BOTTLE = [(0, 0), (60, 0), (60, 150), (40, 150), (40, 200), (20, 200), (20, 150), (0, 150), (0, 0)]
W, H = 480, 280
df["x"] = 30 + 120 * df.index
df["level"] = 2 * df["fill_pct"]  # px of the 200 px bottle

outline = pd.DataFrame(
    [
        {"wine": r.wine, "k": k, "px": r.x + dx, "py": dy}
        for r in df.itertuples()
        for k, (dx, dy) in enumerate(BOTTLE)
    ]
)
# The liquid: the body up to the level, and the neck above 150 px.
body = df.assign(x0=df["x"], x1=df["x"] + 60, y1=df["level"].clip(upper=150))
neck = df[df["level"] > 150].assign(x0=df["x"] + 20, x1=df["x"] + 40, y1=df["level"])
liquid = pd.concat([body.assign(y0=0), neck.assign(y0=150)])
df["pct"] = df["fill_pct"].astype(str) + "%"
df["mid"] = df["x"] + 30

xs = alt.Scale(domain=[0, W], nice=False)
ys = alt.Scale(domain=[-40, H - 40], nice=False)
liquid_layer = (
    alt.Chart(liquid)
    .mark_rect(color="#4caf50")
    .encode(
        x=alt.X("x0:Q", scale=xs, axis=None),
        x2="x1",
        y=alt.Y("y0:Q", scale=ys, axis=None),
        y2="y1",
    )
)
outline_layer = (
    alt.Chart(outline)
    .mark_line(color="#444444", strokeWidth=2)
    .encode(
        x=alt.X("px:Q", scale=xs, axis=None),
        y=alt.Y("py:Q", scale=ys, axis=None),
        order="k:Q",
        detail="wine:N",
    )
)
text = alt.Chart(df).encode(x=alt.X("mid:Q", scale=xs, axis=None))
pct = text.mark_text(baseline="bottom", dy=-8).encode(y=alt.datum(200), text="pct:N")
names = text.mark_text(baseline="top", dy=8).encode(y=alt.datum(0), text="wine:N")
chart = (
    (liquid_layer + outline_layer + pct + names)
    .properties(width=W, height=H)
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
