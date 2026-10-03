import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
df = df[df["count"] > 0].reset_index(drop=True)
steps = ["class", "survival", "gender"]
cats = [list(dict.fromkeys(df[s])) for s in steps]
colors = dict(zip(cats[0], plt.rcParams["axes.prop_cycle"].by_key()["color"]))
gap = df["count"].sum() * 0.03  # between nodes, in counts
node_w = 0.06  # node width, in column units (columns at x = 0, 1, 2)

# matplotlib has no alluvial layout (its Sankey draws a different kind of
# flow diagram), so the layout is computed by hand, in counts from the top.
# Nodes stack top to bottom in first-appearance order. Inside each node the
# ribbons stack by the other two steps' categories, so a ribbon keeps its
# slot through the middle node.
top = {}  # (step, category) -> top of the node
slot = np.zeros((len(df), len(steps)))  # each ribbon's top at each step
for i, s in enumerate(steps):
    others = [steps[j] for j in range(len(steps)) if j != i]
    y = 0.0
    for c in cats[i]:
        top[s, c] = y
        rows = df.index[df[s] == c]
        rank = lambda idx: tuple(cats[steps.index(o)].index(df.at[idx, o]) for o in others)
        for idx in sorted(rows, key=rank):
            slot[idx, i] = y
            y += df.at[idx, "count"]
        y += gap

fig, ax = plt.subplots(figsize=(6.4, 4.2), dpi=100)
t = np.linspace(0, 1, 50)
ease = 3 * t**2 - 2 * t**3  # smooth S-curve across each gap
for idx, row in df.iterrows():
    for i in range(len(steps) - 1):
        xs = i + node_w / 2 + t * (1 - node_w)
        y0 = slot[idx, i] + ease * (slot[idx, i + 1] - slot[idx, i])
        ax.fill_between(xs, y0, y0 + row["count"], color=colors[row["class"]], alpha=0.5, linewidth=0)

for i, s in enumerate(steps):
    for c in cats[i]:
        h = df.loc[df[s] == c, "count"].sum()
        ax.bar(i, h, width=node_w, bottom=top[s, c], color="#444")
        left = i == 0
        ax.text(
            i + (-1 if left else 1) * (node_w / 2 + 0.02), top[s, c] + h / 2, c,
            ha="right" if left else "left", va="center",
        )

ax.set_xlim(-0.3, 2.3)
ax.invert_yaxis()  # first category at the top
ax.axis("off")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
