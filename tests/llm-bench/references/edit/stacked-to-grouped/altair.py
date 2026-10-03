import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
answers = ["Agree", "Neutral", "Disagree"]

chart = (
    alt.Chart(df)
    .mark_bar()
    .encode(
        y=alt.Y("question:N", sort=None),
        x="count:Q",
        color=alt.Color("answer:N", sort=answers),
        yOffset=alt.YOffset("answer:N", sort=answers),
    )
    .properties(width=440, height=340)
)
chart.save(os.environ["OUT_PATH"], format="svg")
