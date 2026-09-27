import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
colors = ["#f58518" if mpg >= 30 else "steelblue" for mpg in df["mpg"]]

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.scatter(df["mpg"], df["horsepower"], s=20, color=colors, alpha=0.7)
ax.set_xlabel("Fuel economy (mpg)")
ax.set_ylabel("Engine power (hp)")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
