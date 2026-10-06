import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.hist(
    df["flipper_length_mm"],
    bins=range(170, 250, 10),
    color="steelblue",
    edgecolor="white",
)
ax.set_xlabel("Flipper length (mm)")
ax.set_ylabel("Count")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
