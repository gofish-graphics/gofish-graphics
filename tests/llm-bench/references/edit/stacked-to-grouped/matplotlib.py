import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
table = df.pivot_table(
    index="question", columns="answer", values="count", aggfunc="sum", sort=False
)

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
table.plot.barh(ax=ax, width=0.8)
ax.invert_yaxis()  # first question at the top, Agree first within each group
ax.set_xlabel("count")
ax.set_ylabel("question")
ax.legend(title="answer", loc="upper left", bbox_to_anchor=(1.01, 1))
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
