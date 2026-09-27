import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"]).sort_values("year")
peak = df.loc[df["visitors"].idxmax()]

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.plot(df["year"], df["visitors"], color="steelblue", linewidth=2)
ax.plot(peak["year"], peak["visitors"], "o", color="#d62728", markersize=7)
ax.annotate(
    f"Peak: {int(peak['visitors']):,} in {int(peak['year'])}",
    xy=(peak["year"], peak["visitors"]),
    xytext=(-8, 0),
    textcoords="offset points",
    ha="right",
    va="center",
)
ax.set_xlabel("Year")
ax.set_ylabel("Visitors (thousands)")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
