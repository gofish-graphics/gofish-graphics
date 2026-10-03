import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
colors = ["#d62728" if r < 0 else "#4e79a7" for r in df["profit_ratio"]]

fig, ax = plt.subplots(figsize=(5.6, 4.8), dpi=100)
ax.barh(df["sub_category"], df["profit_ratio"], color=colors)
ax.axvline(0, color="#333", linewidth=0.8)
ax.invert_yaxis()  # first sub-category at the top
ax.set_xlabel("profit ratio")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
