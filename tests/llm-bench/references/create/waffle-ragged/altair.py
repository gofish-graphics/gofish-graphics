import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# One row per fish; within its lake, fish i sits in row i // 5 (up from the
# baseline) and column i % 5.
squares = df.loc[df.index.repeat(df["count"])].reset_index(drop=True)
i = squares.groupby("lake").cumcount()
squares["row"] = i // 5
squares["col"] = i % 5

chart = (
    alt.Chart(squares)
    .mark_rect()
    .encode(
        x=alt.X("col:O", axis=None, scale=alt.Scale(paddingInner=0.15)),
        y=alt.Y("row:O", axis=None, sort="descending", scale=alt.Scale(paddingInner=0.15)),
        color=alt.Color("lake:N", sort=None, legend=None),
    )
    .properties(width=55, height=308)
    .facet(
        column=alt.Column(
            "lake:N", sort=None, title=None, header=alt.Header(labelOrient="bottom")
        ),
        spacing=16,
    )
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
