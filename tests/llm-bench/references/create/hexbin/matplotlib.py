import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

fig, ax = plt.subplots(figsize=(6.0, 4.5), dpi=100)
# hexbin lays its grid out from the extent's lower-left corner, with
# (xmax - xmin) / nx between centers in a row and (ymax - ymin) / ny between
# rows: extent 0..500 x 0..5000 at 5 x 5 gives the 100 x 1000 lattice.
hb = ax.hexbin(
    df["budget"],
    df["box_office"],
    gridsize=(5, 5),
    extent=(0, 500, 0, 5000),
    mincnt=1,
    cmap="Oranges",
    edgecolors="white",
    linewidths=0.5,
)
ax.set_xlim(-50, 450)
ax.set_ylim(1000, 4000)
ax.set_xlabel("Budget (millions)")
ax.set_ylabel("Box office (millions)")
fig.colorbar(hb, ax=ax, label="Films")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
