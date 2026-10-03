import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
bars = ax.bar(df["store"], df["sales"], color="steelblue")
ax.bar_label(bars, labels=[f"{v:,}" for v in df["sales"]], padding=3)
ax.set_xlabel("store")
ax.set_ylabel("sales")
ax.margins(y=0.1)
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
