import os

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Patch, Rectangle

df = pd.read_json(os.environ["DATA_PATH"])
colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]

# One entry per square, in data order; square i sits at row i // 10 (from the
# top) and column i % 10, so the grid fills row by row from the top-left.
squares = [i for i, n in enumerate(df["percent"]) for _ in range(n)]

fig, ax = plt.subplots(figsize=(5.6, 4.0), dpi=100)
for i, k in enumerate(squares):
    row, col = divmod(i, 10)
    ax.add_patch(Rectangle((col, 9 - row), 0.9, 0.9, color=colors[k]))

ax.set_xlim(-0.1, 10)
ax.set_ylim(-0.1, 10)
ax.set_aspect("equal")
ax.axis("off")
ax.legend(
    handles=[Patch(color=colors[k], label=s) for k, s in enumerate(df["source"])],
    loc="upper left",
    bbox_to_anchor=(1.02, 1),
)
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
