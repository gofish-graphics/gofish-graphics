import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
months = list(dict.fromkeys(df["month"]))
n = len(months)

# Baselines one unit apart, Jan at the top; the tallest peak rises 2 units.
scale = 2 / df["days"].max()

fig, ax = plt.subplots(figsize=(5.6, 4.8), dpi=100)
for i, month in enumerate(months):
    rows = df[df["month"] == month].sort_values("temp_c")
    base = n - 1 - i
    ax.fill_between(
        rows["temp_c"],
        base,
        base + rows["days"] * scale,
        facecolor="steelblue",
        edgecolor="white",
        linewidth=1,
        zorder=i,  # each ridge in front of the one above it
    )
ax.set_yticks(range(n), months[::-1])
ax.set_ylim(-0.2, n + 1.2)
ax.set_xlabel("temp_c")
ax.tick_params(axis="y", length=0)
for side in ["left", "right", "top"]:
    ax.spines[side].set_visible(False)
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
