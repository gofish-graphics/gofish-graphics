import os

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Patch, Rectangle

df = pd.read_json(os.environ["DATA_PATH"])
colors = {"Yes": "#4e79a7", "No": "#bab0ac"}
total = df["count"].sum()

fig, ax = plt.subplots(figsize=(5.6, 4.4), dpi=100)

# Class bands bottom to top, sex left to right within a band, survived
# bottom to top within that; every split is by share of the parent cell.
y0 = 0.0
for cls, in_class in df.groupby("class", sort=False):
    band = in_class["count"].sum() / total
    x0 = 0.0
    for sex, in_sex in in_class.groupby("sex", sort=False):
        width = in_sex["count"].sum() / in_class["count"].sum()
        v0 = y0
        for outcome, rows in in_sex.groupby("survived", sort=False):
            height = band * rows["count"].sum() / in_sex["count"].sum()
            ax.add_patch(
                Rectangle(
                    (x0, v0),
                    width,
                    height,
                    facecolor=colors[outcome],
                    edgecolor="white",
                    linewidth=1,
                )
            )
            v0 += height
        x0 += width
    ax.text(-0.02, y0 + band / 2, cls, ha="right", va="center")
    y0 += band

ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.axis("off")
ax.legend(
    handles=[Patch(color=c, label=k) for k, c in colors.items()],
    title="survived",
    loc="upper left",
    bbox_to_anchor=(1.01, 1),
)
fig.subplots_adjust(left=0.14, right=0.82, top=0.95, bottom=0.05)
fig.savefig(os.environ["OUT_PATH"], format="svg")
