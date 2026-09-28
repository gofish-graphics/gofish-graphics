import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
months = list(dict.fromkeys(df["month"]))
row = {m: i for i, m in enumerate(months)}

fig, ax = plt.subplots(figsize=(6.4, 3.8), dpi=100)
for sub, group in df.groupby("sub_category", sort=False):
    ax.scatter(group["sales"], group["month"].map(row), s=60, alpha=0.85, label=sub)

ax.set_yticks(range(len(months)), months)
ax.set_ylim(len(months) - 0.5, -0.5)  # first month at the top
ax.grid(axis="y", color="#ddd")
ax.set_axisbelow(True)
ax.set_xlim(left=0)
ax.set_xlabel("sales")
ax.legend(title="sub-category", loc="upper left", bbox_to_anchor=(1.01, 1))
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
