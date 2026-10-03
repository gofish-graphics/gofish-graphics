import json
import os

import matplotlib.pyplot as plt

with open(os.environ["DATA_PATH"]) as f:
    data = json.load(f)

data = sorted(data, key=lambda d: d["count"], reverse=True)

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
ax.bar([d["lake"] for d in data], [d["count"] for d in data], color="steelblue")
ax.set_xlabel("lake")
ax.set_ylabel("count")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
