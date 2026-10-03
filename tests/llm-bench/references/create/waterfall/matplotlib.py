import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
after = df["amount"].cumsum()  # running total after each row
before = after - df["amount"]

labels = list(df["label"]) + ["End"]
bottoms = list(pd.concat([before, after], axis=1).min(axis=1)) + [0]
heights = list(df["amount"].abs()) + [after.iloc[-1]]
colors = ["#115DAA"] + [
    "#59a14f" if a >= 0 else "#e15759" for a in df["amount"].iloc[1:]
] + ["#115DAA"]

fig, ax = plt.subplots(figsize=(5.6, 3.6), dpi=100)
# Each change is a floating bar between the running totals before and after it.
ax.bar(labels, heights, bottom=bottoms, color=colors, width=0.75)
# Dashed connectors from each bar's end to the next bar.
for i, level in enumerate(after):
    ax.plot([i + 0.375, i + 0.625], [level, level], color="#888", linestyle=":", linewidth=1)
ax.set_ylabel("amount")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
