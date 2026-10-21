"""Equivalent of Bar/LayeredBarsAndArea.stories.tsx — Vega-Lite/Layered Bars and Area.

Only TwoSites is ported. Default and HoistedVarietySpread order their areas
with a function `.zOrder(...)`, which does not cross the bridge (see
tests/.python-sync-exempt). The JS `filter` on the rows is plain data prep and
becomes a pandas filter here.
"""

from gofish import (
    chart,
    field,
    group,
    layer,
    rect,
    ribbon,
    select_all,
    spread,
    stack,
    Color,
)
from vega_datasets import data as vega_data

EMPHASIZED = ["Morris", "Grand Rapids"]


def story_two_sites():
    barley = vega_data.barley()
    barley = barley[barley["site"].isin(EMPHASIZED)]
    return (
        layer(
            [
                chart(
                    barley,
                    color=Color.palette(
                        {"Morris": "#e15759", "Grand Rapids": "#4e79a7"}
                    ),
                )
                .flow(
                    spread(by="variety", dir="x", spacing=20),
                    spread(by="year", dir="x", spacing=40),
                    stack(by=field("site").sort("yield"), dir="y"),
                )
                .mark(rect(h="yield", fill="site").name("bars")),
                chart(select_all("bars"))
                .flow(group(by="variety"), group(by="site"))
                .mark(ribbon(opacity=0.7)),
            ]
        ),
        {"w": 400, "h": 400, "axes": True},
    )
