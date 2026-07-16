"""Equivalent of Bar/LayeredBarsAndArea.stories.tsx — Vega-Lite/Layered Bars
and Area.

Was exempt from Python parity (see the removed file-level
`.python-sync-exempt` entry): the JS story used to raise the emphasized
sites' areas with a `.zOrder((d) => isEmphasized(project(d, "site")) ? 1 :
0)` callback, which has no IR spelling and can't cross the derive RPC. #796's
`field(...).map(mapping, default=...)` gives that data-driven paint order a
serializable, declarative spelling — `EMPHASIS_Z_ORDER` below — so Default
and TwoSites now port byte-for-byte.

HoistedVarietySpread stays exempt (see the per-export entry in
`.python-sync-exempt`): it nests `layer([chart(...), chart(...)])` INSIDE
another chart's `.mark(...)`, and Python's `layer([...])` doesn't yet support
producing the mark-combinator wire shape for ChartBuilder children (only the
root LayerIR chart-tiers shape) — a separate, pre-existing gap.
"""

from gofish import chart, field, group, layer, palette, rect, ribbon, selectAll, spread, stack
from python_stories.vega_data_urls import read_json

# Data-driven paint order: the two emphasized sites' areas (z = 1) paint on
# top of the gray ones (z = 0). Mirrors the JS story's `emphasisZOrder`.
EMPHASIS_Z_ORDER = field("site").map({"Morris": 1, "Grand Rapids": 1}, default=0)


def _is_emphasized(site) -> bool:
    return site == "Morris" or site == "Grand Rapids"


def story_default():
    barley = read_json("barley.json").to_dict("records")
    return (
        layer([
            chart(
                barley,
                color=palette({"Morris": "#e15759", "Grand Rapids": "#4e79a7"}),
            )
            .flow(
                spread(by="variety", dir="x", spacing=20),
                spread(by="year", dir="x", spacing=40),
                stack(by=field("site").sort("yield"), dir="y"),
            )
            .mark(rect(h="yield", fill="site").name("bars")),
            chart(selectAll("bars"))
            .flow(group(by="variety"), group(by="site"))
            .mark(ribbon(opacity=0.7).z_order(EMPHASIS_Z_ORDER)),
        ]),
        {"w": 400, "h": 400, "axes": True},
    )


def story_two_sites():
    barley = read_json("barley.json").to_dict("records")
    barley = [row for row in barley if _is_emphasized(row["site"])]
    return (
        layer([
            chart(
                barley,
                color=palette({"Morris": "#e15759", "Grand Rapids": "#4e79a7"}),
            )
            .flow(
                spread(by="variety", dir="x", spacing=20),
                spread(by="year", dir="x", spacing=40),
                stack(by=field("site").sort("yield"), dir="y"),
            )
            .mark(rect(h="yield", fill="site").name("bars")),
            chart(selectAll("bars"))
            .flow(group(by="variety"), group(by="site"))
            .mark(ribbon(opacity=0.7)),
        ]),
        {"w": 400, "h": 400, "axes": True},
    )


# HoistedVarietySpread is intentionally not ported here — see the module
# docstring and the per-export entry in tests/.python-sync-exempt.
