import base64
import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
with open(os.path.join(os.environ["ASSET_DIR"], "bottle.png"), "rb") as f:
    url = "data:image/png;base64," + base64.b64encode(f.read()).decode()

# Pixel coordinates, y up from the baseline; `x` is a bottle's left edge.
IMG_W, IMG_H = 58, 240
W, H = 560, 300
df["x"] = 50 + 140 * df.index
df["x1"] = df["x"] + IMG_W
df["mid"] = df["x"] + IMG_W / 2
df["base"] = 0
df["top"] = IMG_H
df["level"] = IMG_H * df["fill_pct"] / 100
df["pct"] = df["fill_pct"].astype(str) + "%"
df["url"] = url

xs = alt.Scale(domain=[0, W], nice=False)
ys = alt.Scale(domain=[-30, H - 30], nice=False)


def x(field):
    return alt.X(f"{field}:Q", scale=xs, axis=None)


def y(field):
    return alt.Y(f"{field}:Q", scale=ys, axis=None)


base = alt.Chart(df)
bottles = base.mark_image(
    width=IMG_W, height=IMG_H, align="left", baseline="bottom"
).encode(x=x("x"), y=y("base"), url="url:N")
# Grayscale: a gray rect over the picture in the "saturation" blend mode
# takes the saturation away. The liquid: a rect in the "color" blend mode
# gives the glass the tint's hue and saturation but keeps its brightness.
# Both leave the white background white, so only the bottle changes.
gray = base.mark_rect(color="#808080", blend="saturation").encode(
    x=x("x"), x2="x1", y=y("base"), y2="top"
)
liquid = base.mark_rect(color="#00c853", blend="color").encode(
    x=x("x"), x2="x1", y=y("base"), y2="level"
)
line = base.mark_rule(color="#666666", strokeWidth=1).encode(
    x=x("x"), x2="x1", y=y("level")
)
pct = base.mark_text(align="left", dx=4, color="#666666", fontSize=13).encode(
    x=x("x1"), y=y("level"), text="pct:N"
)
names = base.mark_text(baseline="top", dy=6).encode(
    x=x("mid"), y=y("base"), text="wine:N"
)
chart = (
    (bottles + gray + liquid + line + pct + names)
    .properties(width=W, height=H)
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
