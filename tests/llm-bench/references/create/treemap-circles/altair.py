import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
W, H = 480, 380


def squarify(values, x, y, w, h):
    """Squarified treemap (Bruls et al.): lay out `values` (sorted largest
    first) in the rectangle, areas proportional to the values. Returns one
    (x, y, w, h) per value, in order. (Vega-Lite has no treemap layout.)"""
    scale = w * h / sum(values)
    areas = [v * scale for v in values]
    rects = []
    while areas:
        side = min(w, h)

        def worst(row):
            s = sum(row)
            return max(max(side * side * a / (s * s), s * s / (side * side * a)) for a in row)

        n = 1
        while n < len(areas) and worst(areas[: n + 1]) <= worst(areas[:n]):
            n += 1
        row, areas = areas[:n], areas[n:]
        thick = sum(row) / side
        pos = 0.0
        for a in row:
            if w >= h:  # a column along the left side
                rects.append((x, y + pos, thick, a / thick))
            else:  # a row along the top
                rects.append((x + pos, y, a / thick, thick))
            pos += a / thick
        if w >= h:
            x, w = x + thick, w - thick
        else:
            y, h = y + thick, h - thick
    return rects


totals = df.groupby("genre", sort=False)["gross"].sum().sort_values(ascending=False)
cells = []
for genre, (gx, gy, gw, gh) in zip(totals.index, squarify(list(totals), 0, 0, W, H)):
    films = df[df["genre"] == genre].sort_values("gross", ascending=False)
    for title, (x, y, w, h) in zip(films["title"], squarify(list(films["gross"]), gx, gy, gw, gh)):
        cells.append({"genre": genre, "title": title, "x": x, "y": y, "w": w, "h": h})
cells = pd.DataFrame(cells)
cells["x2"] = cells["x"] + cells["w"]
cells["y2"] = cells["y"] + cells["h"]
cells["cx"] = cells["x"] + cells["w"] / 2
cells["cy"] = cells["y"] + cells["h"] / 2
# circle diameter = shorter side - 2px; a circle's size is its diameter squared
cells["size"] = (cells[["w", "h"]].min(axis=1) - 2) ** 2

# pixel coordinates, y down
x = alt.Scale(domain=[0, W], nice=False)
y = alt.Scale(domain=[0, H], nice=False, reverse=True)
rects = (
    alt.Chart(cells)
    .mark_rect(fill=None, stroke="#cccccc", strokeWidth=1)
    .encode(
        x=alt.X("x:Q", scale=x, axis=None),
        x2="x2",
        y=alt.Y("y:Q", scale=y, axis=None),
        y2="y2",
    )
)
dots = (
    alt.Chart(cells)
    .mark_circle(opacity=1)
    .encode(
        x=alt.X("cx:Q", scale=x, axis=None),
        y=alt.Y("cy:Q", scale=y, axis=None),
        size=alt.Size("size:Q", scale=None),
        color=alt.Color("genre:N", sort=None),
    )
)
chart = (rects + dots).properties(width=W, height=H).configure_view(stroke=None)
chart.save(os.environ["OUT_PATH"], format="svg")
