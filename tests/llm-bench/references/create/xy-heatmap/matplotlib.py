import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
grid = df.pivot_table(
    index="savings", columns="age_range", values="response_rate", sort=False
)

fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=100)
# pcolormesh draws one quadrilateral per cell.
mesh = ax.pcolormesh(grid.values, cmap="Blues", edgecolors="white", linewidth=1)
ax.set_xticks([i + 0.5 for i in range(grid.shape[1])], grid.columns)
# Escape "$" so labels such as "$5,000 - $9,999" are not read as math text.
ax.set_yticks(
    [i + 0.5 for i in range(grid.shape[0])],
    [s.replace("$", r"\$") for s in grid.index],
)
ax.invert_yaxis()  # first savings answer at the top
ax.tick_params(length=0)
for side in ax.spines.values():
    side.set_visible(False)
ax.set_xlabel("age range")
fig.colorbar(mesh, ax=ax, label="response rate (%)")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
