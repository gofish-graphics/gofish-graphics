import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
df = df[df["count"] > 0].reset_index(drop=True)
steps = ["class", "survival", "gender"]
cats = {s: list(dict.fromkeys(df[s])) for s in steps}

# Everything is laid out in pixels: W x H, y down.
W, H = 500, 380
NODE_W, GAP = 16, 12
k = (H - GAP * (max(len(c) for c in cats.values()) - 1)) / df["count"].sum()
col_x = [0, (W - NODE_W) / 2, W - NODE_W]

# Nodes, top to bottom in first-appearance order.
nodes = []
for i, s in enumerate(steps):
    y = 0.0
    for c in cats[s]:
        h = df.loc[df[s] == c, "count"].sum() * k
        nodes.append({"step": i, "name": c, "x": col_x[i], "y": y, "h": h})
        y += h + GAP
nodes = pd.DataFrame(nodes)
nodes["x2"] = nodes["x"] + NODE_W
nodes["y2"] = nodes["y"] + nodes["h"]

# Each ribbon's slot in each node: ribbons stack in the order of the other
# two steps' categories, so a ribbon keeps its slot through a middle node.
df["t"] = df["count"] * k
for i, s in enumerate(steps):
    others = [o for o in steps if o != s]
    rank = df[others].apply(lambda col: col.map(cats[col.name].index))
    order = df.assign(r0=rank[others[0]], r1=rank[others[1]]).sort_values([s, "r0", "r1"])
    top = nodes[nodes["step"] == i].set_index("name")["y"]
    df.loc[order.index, f"y{i}"] = (
        order.groupby(s)["t"].cumsum() - order["t"] + order[s].map(top)
    )


def smooth(t):
    return t * t * (3 - 2 * t)


# Each ribbon as one band: an S-curve across each gap, straight through the
# middle node.
xa, xb, xc, xd = NODE_W, col_x[1], col_x[1] + NODE_W, col_x[2]
N = 30
points = []
for idx, r in df.iterrows():
    for gap, (x0, x1, y0, y1) in enumerate([(xa, xb, r.y0, r.y1), (xc, xd, r.y1, r.y2)]):
        for j in range(N + 1):
            f = j / N
            y = y0 + (y1 - y0) * smooth(f)
            points.append(
                {"ribbon": idx, "class": r["class"], "x": x0 + (x1 - x0) * f, "top": y, "bottom": y + r.t}
            )
bands = pd.DataFrame(points)

xs = alt.Scale(domain=[0, W])
ys = alt.Scale(domain=[0, H], reverse=True)
ribbons = (
    alt.Chart(bands)
    .mark_area(opacity=0.5)
    .encode(
        x=alt.X("x:Q", scale=xs, axis=None),
        y=alt.Y("top:Q", scale=ys, axis=None),
        y2="bottom:Q",
        color=alt.Color("class:N", sort=cats["class"], title="class"),
        detail="ribbon:N",
    )
)
rects = (
    alt.Chart(nodes)
    .mark_rect(color="#444")
    .encode(x=alt.X("x:Q", scale=xs), x2="x2:Q", y=alt.Y("y:Q", scale=ys), y2="y2:Q")
)
nodes["mid"] = nodes["y"] + nodes["h"] / 2
nodes["lx"] = nodes["x"].where(nodes["step"] == 0, nodes["x2"])
label = alt.Chart(nodes).encode(
    x=alt.X("lx:Q", scale=xs), y=alt.Y("mid:Q", scale=ys), text="name:N"
)
labels = label.transform_filter("datum.step == 0").mark_text(
    align="right", dx=-6
) + label.transform_filter("datum.step > 0").mark_text(align="left", dx=6)
chart = (
    (ribbons + rects + labels)
    .properties(width=W, height=H)
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
