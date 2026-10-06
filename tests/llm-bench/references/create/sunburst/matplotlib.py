import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import to_rgb

df = pd.read_json(os.environ["DATA_PATH"])
regions = df.groupby("region", sort=False)["population"].sum()
base = plt.rcParams["axes.prop_cycle"].by_key()["color"]
region_color = {r: base[i] for i, r in enumerate(regions.index)}
# Subregions in a lighter shade of their region's color.
lighter = [0.6 * np.array(to_rgb(region_color[r])) + 0.4 for r in df["region"]]

fig, ax = plt.subplots(figsize=(5.2, 5.2), dpi=100)
# Two nested pies (matplotlib's nested pie recipe): the same start angle and
# direction, so each region's subregions fill exactly its angle.
common = dict(startangle=90, counterclock=False, wedgeprops=dict(width=0.35, edgecolor="white", linewidth=0.5))
ax.pie(
    regions, radius=0.65, colors=[region_color[r] for r in regions.index],
    labels=regions.index, labeldistance=0.73,
    textprops=dict(color="white", ha="center", va="center"), **common,
)
ax.pie(df["population"], radius=1.0, colors=lighter, **common)
ax.set_aspect("equal")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
