import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
table = df.pivot_table(
    index="region", columns="brand", values="units", aggfunc="sum", sort=False
).fillna(0)
totals = table.sum(axis=1)
shares = table.div(totals, axis=0)
lefts = totals.cumsum() - totals  # each column starts where the last ended

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
bottom = pd.Series(0.0, index=table.index)
for brand in table.columns:  # bottom to top in data order
    ax.bar(
        lefts,
        shares[brand],
        width=totals,
        bottom=bottom,
        align="edge",
        label=brand,
        edgecolor="white",
        linewidth=1,
    )
    bottom += shares[brand]

ax.set_xlim(0, totals.sum())
ax.set_ylim(0, 1)
ax.set_xticks(lefts + totals / 2, table.index)
ax.yaxis.set_major_formatter(plt.matplotlib.ticker.PercentFormatter(1.0))
ax.set_ylabel("share of region's units")
ax.legend(title="brand", loc="upper left", bbox_to_anchor=(1.01, 1))
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
