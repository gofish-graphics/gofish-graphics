import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
for species, group in df.groupby("species", sort=False):
    ax.scatter(group["bill_length_mm"], group["flipper_length_mm"], s=20, label=species)
ax.set_xlabel("bill_length_mm")
ax.set_ylabel("flipper_length_mm")
ax.legend(title="species")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
