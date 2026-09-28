import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

base = alt.Chart(df).encode(y=alt.Y("region:N", sort="-x", title=None))
stems = base.mark_rule(strokeWidth=2).encode(
    x=alt.X("sales:Q", title="sales"), x2=alt.datum(0)
)
heads = base.mark_circle(size=150, opacity=1).encode(x="sales:Q")
chart = (stems + heads).properties(width=460, height=260)
chart.save(os.environ["OUT_PATH"], format="svg")
