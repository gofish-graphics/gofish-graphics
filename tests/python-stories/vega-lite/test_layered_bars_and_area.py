"""Equivalent of Bar/LayeredBarsAndArea.stories.tsx — Vega-Lite/Layered Bars and Area.

Default and HoistedVarietySpread order their areas with a function
`.z_order(...)`, called through the bridge once with the list of refs each
area is bound to, and read the site with `project` (one value, since the
areas are grouped by site). The JS `filter` on the rows of TwoSites is plain data prep and becomes
a pandas filter here.
"""

from gofish import (
    chart,
    field,
    group,
    layer,
    project,
    rect,
    ribbon,
    select_all,
    spread,
    stack,
    Color,
)
from vega_datasets import data as vega_data

EMPHASIZED = ["Morris", "Grand Rapids"]
SITE_COLORS = Color.palette({"Morris": "#e15759", "Grand Rapids": "#4e79a7"})


def story_default():
    barley = vega_data.barley()
    return (
        layer(
            [
                chart(
                    barley,
                    color=SITE_COLORS,
                )
                .flow(
                    spread(by="variety", dir="x", spacing=20),
                    spread(by="year", dir="x", spacing=40),
                    stack(by=field("site").sort("yield"), dir="y"),
                )
                .mark(rect(h="yield", fill="site").name("bars")),
                chart(select_all("bars"))
                .flow(group(by="variety"), group(by="site"))
                # Data-driven paint order: the emphasized sites' areas (z = 1)
                # paint on top of the gray ones (z = 0).
                .mark(
                    ribbon(opacity=0.7).z_order(
                        lambda d: 1 if project(d, "site") in EMPHASIZED else 0
                    )
                ),
            ]
        ),
        {"h": 400, "axes": True},
    )


def story_two_sites():
    barley = vega_data.barley()
    barley = barley[barley["site"].isin(EMPHASIZED)]
    return (
        layer(
            [
                chart(
                    barley,
                    color=SITE_COLORS,
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
        {"h": 400, "axes": True},
    )


def story_hoisted_variety_spread():
    barley = vega_data.barley()
    return (
        chart(
            barley,
            color=SITE_COLORS,
            h=400,
        )
        .flow(spread(by="variety", dir="x", spacing=20))
        .mark(
            layer(
                [
                    # An empty-scope `chart()` inherits this variety cell's rows.
                    chart()
                    .flow(
                        spread(by="year", dir="x", spacing=40),
                        stack(by=field("site").sort("yield"), dir="y"),
                    )
                    .mark(rect(h="yield", fill="site").name("bars")),
                    chart(select_all("bars"))
                    .flow(group(by="site"))
                    .mark(
                        ribbon(opacity=0.7).z_order(
                            lambda a: 1 if project(a, "site") in EMPHASIZED else 0
                        )
                    ),
                ]
            )
        ),
        {},
    )
