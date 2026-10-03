import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
totals = df.groupby("site")["yield"].sum().sort_values(ascending=False)

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.barh(totals.index, totals.values, color="steelblue")
ax.invert_yaxis()  # largest at the top
ax.set_xlabel("total yield")
ax.set_ylabel("site")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
