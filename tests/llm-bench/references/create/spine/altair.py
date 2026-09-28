import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# Women extend to the left of zero, Men to the right.
df["signed"] = df["percent"].where(df["gender"] == "Men", -df["percent"])

chart = (
    alt.Chart(df)
    .mark_bar()
    .encode(
        x=alt.X(
            "signed:Q", title="percent", axis=alt.Axis(labelExpr="abs(datum.value)")
        ),
        y=alt.Y("nationality:N", sort=None, title=None),
        color=alt.Color("gender:N", sort=["Women", "Men"]),
    )
    .properties(width=380, height=360)
)
chart.save(os.environ["OUT_PATH"], format="svg")
