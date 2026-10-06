import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# A circle's `size` is its diameter squared, so a zero-based linear scale
# makes area proportional to population; the largest is 30 px in radius.
chart = (
    alt.Chart(df)
    .mark_circle(opacity=0.6)
    .encode(
        x=alt.X("gdp_per_capita:Q", title="GDP per capita (thousand USD)"),
        y=alt.Y(
            "life_expectancy:Q",
            title="Life expectancy (years)",
            scale=alt.Scale(zero=False),
        ),
        size=alt.Size(
            "population:Q",
            scale=alt.Scale(
                domain=[0, df["population"].max()], range=[0, 60**2]
            ),
            legend=None,
        ),
        color=alt.Color("region:N", sort=None),
    )
    .properties(width=500, height=370)
)
chart.save(os.environ["OUT_PATH"], format="svg")
