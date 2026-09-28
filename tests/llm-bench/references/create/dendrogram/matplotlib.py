import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
height = dict(zip(df["name"], df["height"]))
children = {}
for name, parent in zip(df["name"], df["parent"]):
    children.setdefault(parent, []).append(name)
root = children[""][0]

# matplotlib has no tree layout (scipy's dendrogram takes a linkage matrix,
# not a tree, and scipy is not available): leaves are evenly spaced in
# depth-first order, and every other node sits at the middle of its children.
x = {}
leaves = []


def place(node):
    kids = children.get(node, [])
    if not kids:
        x[node] = len(leaves)
        leaves.append(node)
    else:
        for k in kids:
            place(k)
        x[node] = (min(x[k] for k in kids) + max(x[k] for k in kids)) / 2


place(root)

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
for node, kids in children.items():
    if node == "":
        continue
    # One elbow per node: across its children at its height, and up from each.
    ax.hlines(height[node], min(x[k] for k in kids), max(x[k] for k in kids), color="#555", linewidth=1.5)
    ax.vlines([x[k] for k in kids], [height[k] for k in kids], height[node], color="#555", linewidth=1.5)

ax.set_xticks(range(len(leaves)), leaves)
ax.tick_params(axis="x", length=0)
ax.set_xlim(-0.5, len(leaves) - 0.5)
ax.set_ylim(bottom=0)
ax.set_ylabel("height")
for side in ("top", "right", "bottom"):
    ax.spines[side].set_visible(False)
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
