import os

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"], convert_dates=["date"])
categories = list(dict.fromkeys(df["category"]))

# Scatter sizes are marker areas in points squared, so s proportional to sales
# makes area proportional to sales. The largest radius is 18 px = 12.96 pt.
s_max = (2 * 18 * 72 / 100) ** 2
sizes = s_max * df["sales"] / df["sales"].max()

fig, ax = plt.subplots(figsize=(6.4, 3.0), dpi=100)
for i, cat in enumerate(categories):
    rows = df["category"] == cat
    ax.axhline(i, color="#ccc", linewidth=1, zorder=0)
    ax.scatter(df.loc[rows, "date"], [i] * rows.sum(), s=sizes[rows], alpha=0.8)

ax.set_yticks(range(len(categories)), categories)
ax.set_ylim(len(categories) - 0.5, -0.5)  # first category at the top
ax.tick_params(axis="y", length=0)
ax.margins(x=0.05)
ax.xaxis.set_major_locator(mdates.YearLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
