import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
subs = list(dict.fromkeys(df["sub_category"]))

fig, ax = plt.subplots(figsize=(6.4, 3.0), dpi=100)
# eventplot draws one short vertical line per value, one row per list.
ax.eventplot(
    [df.loc[df["sub_category"] == s, "avg_sales"] for s in subs],
    lineoffsets=range(len(subs)),
    linelengths=0.3,
    linewidths=1.5,
    colors="#e94e25",
)
ax.set_yticks(range(len(subs)), subs)
ax.set_ylim(len(subs) - 0.5, -0.5)  # first sub-category at the top
ax.tick_params(axis="y", length=0)
ax.set_xlim(left=0)
ax.set_xlabel("average sales")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
