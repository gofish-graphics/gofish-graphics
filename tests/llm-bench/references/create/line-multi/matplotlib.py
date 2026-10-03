import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
for country, group in df.groupby("country", sort=False):
    group = group.sort_values("year")
    ax.plot(group["year"], group["life_expect"], linewidth=2, label=country)
ax.set_xlabel("year")
ax.set_ylabel("life_expect")
ax.legend(title="country")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
