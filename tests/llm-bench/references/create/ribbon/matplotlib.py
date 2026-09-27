import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"], dtype={"year": str})
table = df.pivot_table(
    index="year", columns="channel", values="revenue", aggfunc="sum", sort=False
).fillna(0)
tops = table.cumsum(axis=1)  # stacked bottom to top in data order
bottoms = tops - table

x = np.arange(len(table))
width = 0.55
colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
for k, channel in enumerate(table.columns):
    color = colors[k]
    ax.bar(x, table[channel], width, bottom=bottoms[channel], color=color, label=channel)
    # A band from the right edge of each segment to the left edge of the same
    # channel's segment in the next bar.
    for i in range(len(table) - 1):
        xs = [x[i] + width / 2, x[i + 1] - width / 2]
        ax.fill_between(
            xs,
            [bottoms[channel].iloc[i], bottoms[channel].iloc[i + 1]],
            [tops[channel].iloc[i], tops[channel].iloc[i + 1]],
            color=color,
            alpha=0.35,
            linewidth=0,
        )

ax.set_xticks(x, table.index)
ax.set_xlabel("year")
ax.set_ylabel("revenue")
ax.legend(title="channel", loc="upper left", bbox_to_anchor=(1.01, 1))
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
