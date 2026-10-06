import os

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"], convert_dates=["date"])
table = df.pivot_table(
    index="date", columns="category", values="sales", aggfunc="sum", sort=False
)

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
# stackplot stacks the columns bottom to top in order.
ax.stackplot(table.index, table.T.values, labels=table.columns)
ax.set_xlim(table.index.min(), table.index.max())
ax.set_ylim(bottom=0)
ax.xaxis.set_major_locator(mdates.YearLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
ax.set_ylabel("sales")
handles, labels = ax.get_legend_handles_labels()
ax.legend(handles[::-1], labels[::-1], loc="upper left", bbox_to_anchor=(1.01, 1))
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
