import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

fig, ax = plt.subplots(figsize=(4.8, 4.0), dpi=100)
ax.pie(
    df["visits"],
    labels=df["channel"],
    startangle=90,
    counterclock=False,
    wedgeprops={"width": 0.5, "edgecolor": "white"},
)
ax.set_aspect("equal")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
