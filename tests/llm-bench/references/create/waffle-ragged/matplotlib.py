import os

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Rectangle

df = pd.read_json(os.environ["DATA_PATH"])
colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]

COLS = 5
BLOCK_GAP = 2  # in squares, between neighboring blocks
SIZE = 0.8  # square side; the lattice pitch is 1

fig, ax = plt.subplots(figsize=(5.6, 4.0), dpi=100)
for k, row in enumerate(df.itertuples()):
    x0 = k * (COLS + BLOCK_GAP)
    # Square i sits in row i // 5 (up from the baseline) and column i % 5.
    for i in range(row.count):
        r, c = divmod(i, COLS)
        ax.add_patch(Rectangle((x0 + c, r), SIZE, SIZE, color=colors[k]))
    ax.text(x0 + (COLS - 1 + SIZE) / 2, -0.8, row.lake, ha="center", va="top")

n = len(df)
rows = -(-df["count"].max() // COLS)
ax.set_xlim(-0.5, n * (COLS + BLOCK_GAP) - BLOCK_GAP + 0.5)
ax.set_ylim(-3, rows + 0.5)
ax.set_aspect("equal")
ax.axis("off")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
