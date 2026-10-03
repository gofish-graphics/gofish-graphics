import os

import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
y = range(len(df))

fig, ax = plt.subplots(figsize=(6.4, 3.0), dpi=100)
# Bands nested from zero, widest (lightest) first so the darker ones show.
for key, shade in [("good", "#dddddd"), ("average", "#bbbbbb"), ("poor", "#999999")]:
    ax.barh(y, df[key], height=0.6, color=shade)
ax.barh(y, df["sales"], height=0.2, color="#333")
ax.vlines(df["target"], [i - 0.2 for i in y], [i + 0.2 for i in y], color="#d62728", linewidth=3)

ax.set_yticks(y, df["category"])
ax.invert_yaxis()  # first category at the top
ax.tick_params(axis="y", length=0)
ax.xaxis.set_major_formatter(ticker.EngFormatter())
for side in ("left", "right", "top"):
    ax.spines[side].set_visible(False)
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
