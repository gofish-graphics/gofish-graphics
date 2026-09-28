import os

import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"]).sort_values("sales", ascending=False)

fig, ax = plt.subplots(figsize=(5.6, 3.2), dpi=100)
ax.hlines(df["region"], 0, df["sales"], color="#888", linewidth=2)
ax.scatter(df["sales"], df["region"], s=150, color="#4e79a7", zorder=3)
ax.invert_yaxis()  # largest at the top
ax.set_xlim(0, df["sales"].max() * 1.08)
ax.xaxis.set_major_formatter(ticker.EngFormatter())
ax.set_xlabel("sales")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
