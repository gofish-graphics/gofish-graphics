import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
df["date"] = pd.to_datetime(df["date"])

# Add a point at zero wherever the line crosses zero, so the fills above and
# below zero meet exactly at the crossing.
rows = [df.iloc[0]]
for (_, a), (_, b) in zip(df.iterrows(), df.iloc[1:].iterrows()):
    if a["balance"] * b["balance"] < 0:
        t = a["balance"] / (a["balance"] - b["balance"])
        rows.append(pd.Series({"date": a["date"] + t * (b["date"] - a["date"]), "balance": 0}))
    rows.append(b)
filled = pd.DataFrame(rows)
filled["surplus"] = filled["balance"].clip(lower=0)
filled["deficit"] = filled["balance"].clip(upper=0)

x = alt.X("date:T", title=None)
base = alt.Chart(filled).encode(x=x)
surplus = base.mark_area(color="#4e79a7", opacity=0.6).encode(
    y=alt.Y("surplus:Q", title="balance"), y2=alt.datum(0)
)
deficit = base.mark_area(color="#e15759", opacity=0.6).encode(
    y="deficit:Q", y2=alt.datum(0)
)
line = alt.Chart(df).mark_line(color="#333").encode(x=x, y="balance:Q")
chart = (surplus + deficit + line).properties(width=560, height=340)
chart.save(os.environ["OUT_PATH"], format="svg")
