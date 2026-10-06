import os

import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
table = df.pivot_table(
    index="nationality", columns="gender", values="percent", aggfunc="sum", sort=False
)

fig, ax = plt.subplots(figsize=(5.6, 4.2), dpi=100)
ax.barh(table.index, -table["Women"], color="#e15759", label="Women")
ax.barh(table.index, table["Men"], color="#4e79a7", label="Men")
ax.axvline(0, color="#333", linewidth=0.8)
ax.invert_yaxis()  # first nationality at the top
limit = table.values.max() * 1.05
ax.set_xlim(-limit, limit)  # the same scale on both sides
ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda v, _: f"{abs(v):g}"))
ax.set_xlabel("percent")
ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.0), ncols=2, frameon=False)
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
