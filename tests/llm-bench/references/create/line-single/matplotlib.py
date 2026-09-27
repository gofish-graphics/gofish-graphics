import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"]).sort_values("year")

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.plot(df["year"], df["wheat"], color="steelblue", linewidth=2)
ax.set_xlabel("Year")
ax.set_ylabel("Wheat price (shillings)")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
