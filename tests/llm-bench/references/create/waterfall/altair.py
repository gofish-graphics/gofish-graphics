import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# Running totals: each change floats from the total before it to the total
# after it; Begin and End stand on zero.
df["end"] = df["amount"].cumsum()
df["start"] = df["end"] - df["amount"]
df["kind"] = ["increase" if a >= 0 else "decrease" for a in df["amount"]]
df.loc[0, "kind"] = "total"
total = df["end"].iloc[-1]
end_row = {"label": "End", "amount": total, "start": 0, "end": total, "kind": "total"}
df = pd.concat([df, pd.DataFrame([end_row])], ignore_index=True)

chart = (
    alt.Chart(df)
    .mark_bar()
    .encode(
        x=alt.X("label:N", sort=None, title=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y("start:Q", title="amount"),
        y2="end:Q",
        color=alt.Color(
            "kind:N",
            scale=alt.Scale(
                domain=["increase", "decrease", "total"],
                range=["#59a14f", "#e15759", "#4e79a7"],
            ),
            title=None,
        ),
    )
    .properties(width=440, height=300)
)
chart.save(os.environ["OUT_PATH"], format="svg")
