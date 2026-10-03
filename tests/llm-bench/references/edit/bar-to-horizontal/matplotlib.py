import json
import os

import matplotlib.pyplot as plt

with open(os.environ["DATA_PATH"]) as f:
    data = json.load(f)

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.barh([d["lake"] for d in data], [d["count"] for d in data], color="steelblue")
ax.set_xlabel("count")
ax.set_ylabel("lake")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
