import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
table = df.pivot_table(
    index="lake", columns="species", values="count", aggfunc="sum", sort=False
)

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
table.plot.bar(ax=ax, width=0.8, rot=0)
ax.set_xlabel("lake")
ax.set_ylabel("count")
ax.legend(title="species", loc="upper left", bbox_to_anchor=(1.01, 1))
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
