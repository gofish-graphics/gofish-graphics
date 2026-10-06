import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.scatter(df["horsepower"], df["mpg"], s=20, color="steelblue", alpha=0.7)
ax.set_xlabel("Horsepower")
ax.set_ylabel("Miles per gallon")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
