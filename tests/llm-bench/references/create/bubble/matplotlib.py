import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# scatter's `s` is the marker area in points^2, so it is proportional to
# population. A 30 px radius at dpi 100 is 21.6 pt.
max_r_pt = 30 * 72 / 100
scale = 3.14159 * max_r_pt**2 / df["population"].max()

fig, ax = plt.subplots(figsize=(6.4, 4.4), dpi=100)
for region, group in df.groupby("region", sort=False):
    ax.scatter(
        group["gdp_per_capita"],
        group["life_expectancy"],
        s=group["population"] * scale,
        alpha=0.6,
        label=region,
        edgecolors="none",
    )
ax.set_xlabel("GDP per capita (thousand USD)")
ax.set_ylabel("Life expectancy (years)")
ax.margins(0.12)
legend = ax.legend(title="region", loc="upper left", bbox_to_anchor=(1.01, 1))
for handle in legend.legend_handles:
    handle.set_sizes([60])
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
