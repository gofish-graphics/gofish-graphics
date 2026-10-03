import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
n = len(df)
step = 2 * np.pi / n
angles = np.arange(n) * step + step / 2  # bar centers
inner = df["exports"].max() * 0.45  # the empty middle, in data units

fig, ax = plt.subplots(figsize=(5.2, 5.2), dpi=100, subplot_kw={"projection": "polar"})
ax.set_theta_zero_location("N")  # 12 o'clock
ax.set_theta_direction(-1)  # clockwise
ax.bar(angles, df["exports"], width=step * 0.9, bottom=inner, color="#69b3a2")
ax.set_ylim(0, inner + df["exports"].max())

# Country names just beyond each bar, rotated along its angle.
for a, value, name in zip(angles, df["exports"], df["country"]):
    deg = 90 - np.degrees(a)  # screen angle of this direction
    flip = deg < -90
    ax.text(
        a, inner + value + df["exports"].max() * 0.03, name,
        rotation=deg + 180 if flip else deg, rotation_mode="anchor",
        ha="right" if flip else "left", va="center", fontsize=9,
    )
ax.set_axis_off()
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
