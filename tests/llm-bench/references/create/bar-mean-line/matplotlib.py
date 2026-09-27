import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
mean = df["rain_mm"].mean()

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.bar(df["month"], df["rain_mm"], color="steelblue")
ax.axhline(mean, color="#333", linestyle="--", linewidth=1)
ax.annotate(
    f"Mean = {mean:.1f}",
    xy=(1, mean),
    xycoords=("axes fraction", "data"),
    xytext=(-4, 4),
    textcoords="offset points",
    ha="right",
    va="bottom",
)
ax.set_xlabel("month")
ax.set_ylabel("rain_mm")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
