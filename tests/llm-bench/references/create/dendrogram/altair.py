import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
height = dict(zip(df["name"], df["height"]))
children = {name: [] for name in df["name"]}
for name, parent in zip(df["name"], df["parent"]):
    if parent:
        children[parent].append(name)
root = df.loc[df["parent"] == "", "name"].iloc[0]

# Leaves get x = 0, 1, 2, ... in depth-first order, so each node's leaves are
# next to each other; every other node sits midway between its children.
x = {}


def place(node):
    if not children[node]:
        x[node] = len([n for n in x if not children[n]])
    else:
        for child in children[node]:
            place(child)
        x[node] = sum(x[c] for c in children[node]) / len(children[node])


place(root)

# Each internal node's elbow: one horizontal line across its children at its
# height, and one vertical line from each child up to it.
across = pd.DataFrame(
    [
        {"x": min(x[c] for c in kids), "x2": max(x[c] for c in kids), "h": height[n]}
        for n, kids in children.items()
        if kids
    ]
)
up = pd.DataFrame(
    [
        {"x": x[c], "h": height[c], "h2": height[n]}
        for n, kids in children.items()
        for c in kids
    ]
)
leaves = pd.DataFrame([{"x": x[n], "name": n} for n, kids in children.items() if not kids])

xs = alt.X("x:Q", axis=None, scale=alt.Scale(domain=[-0.5, len(leaves) - 0.5]))
ys = alt.Y("h:Q", title="height")
lines = alt.Chart(across).mark_rule().encode(x=xs, x2="x2:Q", y=ys) + alt.Chart(
    up
).mark_rule().encode(x=xs, y=ys, y2="h2:Q")
labels = (
    alt.Chart(leaves)
    .mark_text(baseline="top", dy=6)
    .encode(x=xs, y=alt.datum(0), text="name:N")
)
chart = (lines + labels).properties(width=540, height=320).configure_view(stroke=None)
chart.save(os.environ["OUT_PATH"], format="svg")
