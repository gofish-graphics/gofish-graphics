import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"], convert_dates=["date"])

fig, ax = plt.subplots(figsize=(6.4, 4.0), dpi=100)
# fill_between with interpolate=True splits the fill where the line crosses
# zero, so each side changes color exactly at the crossing.
ax.fill_between(
    df["date"], df["balance"], 0,
    where=df["balance"] >= 0, interpolate=True, color="#2a9d8f", linewidth=0,
)
ax.fill_between(
    df["date"], df["balance"], 0,
    where=df["balance"] < 0, interpolate=True, color="#e76f51", linewidth=0,
)
ax.plot(df["date"], df["balance"], color="#222", linewidth=1.5)
ax.axhline(0, color="#666", linewidth=0.8)

ax.set_xlim(df["date"].min(), df["date"].max())
ax.set_ylabel("balance")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
