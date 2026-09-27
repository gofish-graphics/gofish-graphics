import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import to_rgb

df = pd.read_json(os.environ["DATA_PATH"])
img = plt.imread(os.path.join(os.environ["ASSET_DIR"], "bottle.png"))  # RGBA, 0-1
rgb, alpha = img[..., :3], img[..., 3:]

# The bottle in grayscale.
gray = rgb @ np.array([0.2126, 0.7152, 0.0722])
grayscale = np.dstack([gray, gray, gray])

# The "color" blend: the tint's hue and saturation with the glass's own
# brightness (luminosity kept, channels pulled back into range).
def lum(c):
    return c @ np.array([0.3, 0.59, 0.11])


tint = np.array(to_rgb("#00c853"))
colored = tint + (gray - lum(tint))[..., None]
L = lum(colored)[..., None]
lo = colored.min(axis=-1, keepdims=True)
hi = colored.max(axis=-1, keepdims=True)
with np.errstate(divide="ignore", invalid="ignore"):
    colored = np.where(lo < 0, L + (colored - L) * L / (L - lo), colored)
    colored = np.where(hi > 1, L + (colored - L) * (1 - L) / (hi - L), colored)
colored = np.clip(colored, 0, 1)

# Axes in pixels (the figure is 640 x 360 px at dpi 100).
fig = plt.figure(figsize=(6.4, 3.6), dpi=100)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 640)
ax.set_ylim(0, 360)
ax.axis("off")

H = 240
W = H * img.shape[1] / img.shape[0]
base = 60
rows = img.shape[0]
for i, row in enumerate(df.itertuples()):
    x0 = 80 + i * 140 - W / 2
    level = row.fill_pct / 100
    # Image rows run top to bottom: the liquid is the bottom `level` of them.
    first = int(round(rows * (1 - level)))
    out = grayscale.copy()
    out[first:] = colored[first:]
    ax.imshow(
        np.dstack([out, alpha]),
        extent=(x0, x0 + W, base, base + H),
        interpolation="antialiased",
    )
    y = base + H * level
    ax.plot([x0, x0 + W], [y, y], color="#666666", linewidth=0.75)
    ax.text(x0 + W + 4, y, f"{row.fill_pct}%", color="#666666", fontsize=10.5, va="center")
    ax.text(x0 + W / 2, base - 8, row.wine, ha="center", va="top", fontsize=9)

ax.set_xlim(0, 640)
ax.set_ylim(0, 360)
fig.savefig(os.environ["OUT_PATH"], format="svg")
