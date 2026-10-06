import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# One row per square, in data order; square i sits in row i // 10 (from
# the top) and column i % 10, so the grid fills row by row.
squares = df.loc[df.index.repeat(df["percent"])].reset_index(drop=True)
squares["row"] = squares.index // 10
squares["col"] = squares.index % 10

chart = (
    alt.Chart(squares)
    .mark_rect()
    .encode(
        x=alt.X("col:O", axis=None, scale=alt.Scale(paddingInner=0.1)),
        y=alt.Y("row:O", axis=None, scale=alt.Scale(paddingInner=0.1)),
        color=alt.Color("source:N", sort=None),
    )
    .properties(width=370, height=370)
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
