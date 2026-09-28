import math
import os

import altair as alt
import pandas as pd

links = pd.read_json(os.environ["DATA_PATH"])
nodes = list(dict.fromkeys(list(links["source"]) + list(links["target"])))
totals = {
    n: links.loc[(links["source"] == n) | (links["target"] == n), "count"].sum()
    for n in nodes
}

SIZE = 440
C = SIZE / 2  # the view's center, where Vega centers arcs
R0, R1 = 170, 190  # the ring's inner and outer radius
GAP = 0.06  # radians between segments
k = (2 * math.pi - GAP * len(nodes)) / sum(totals.values())  # radians per count

# Segments clockwise from 12 o'clock (Vega's arc angles); each link's end
# takes the next slice of its node's segment.
seg, cursor, a = [], {}, 0.0
for n in nodes:
    seg.append({"node": n, "a0": a, "a1": a + totals[n] * k, "mid": a + totals[n] * k / 2})
    cursor[n] = a
    a += totals[n] * k + GAP
segments = pd.DataFrame(seg)


def point(angle, r):
    return [C + r * math.sin(angle), C - r * math.cos(angle)]


def arc(a0, a1, steps=24):
    return [point(a0 + (a1 - a0) * i / steps, R0) for i in range(steps + 1)]


def through_center(p, q, steps=24):
    # A quadratic curve from p to q with its control point at the center.
    return [
        [
            (1 - t) ** 2 * p[0] + 2 * t * (1 - t) * C + t**2 * q[0],
            (1 - t) ** 2 * p[1] + 2 * t * (1 - t) * C + t**2 * q[1],
        ]
        for t in (i / steps for i in range(1, steps))
    ]


ribbons = []
for _, link in links.iterrows():
    s0 = cursor[link["source"]]
    s1 = cursor[link["source"]] = s0 + link["count"] * k
    t0 = cursor[link["target"]]
    t1 = cursor[link["target"]] = t0 + link["count"] * k
    ring = arc(s0, s1)
    ring += through_center(ring[-1], point(t0, R0))
    ring += arc(t0, t1)
    ring += through_center(ring[-1], point(s0, R0))
    ring.append(ring[0])
    ribbons.append(
        {
            "type": "Feature",
            "properties": {"node": link["source"]},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        }
    )

color = alt.Scale(domain=nodes, scheme="tableau10")
ring = (
    alt.Chart(segments)
    .mark_arc(radius=R1, radius2=R0)
    .encode(
        theta=alt.Theta("a0:Q", scale=None),
        theta2="a1:Q",
        color=alt.Color("node:N", scale=color, legend=None),
    )
)
labels = (
    alt.Chart(segments)
    .mark_text(radius=R1 + 14, fontSize=13)
    .encode(theta=alt.Theta("mid:Q", scale=None), text="node:N")
)
# The ribbons are drawn in pixel coordinates (identity projection, y down).
bands = (
    alt.Chart(alt.Data(values=ribbons))
    .mark_geoshape(opacity=0.6, stroke=None)
    .encode(color=alt.Color("properties.node:N", scale=color, legend=None))
    .project(type="identity", scale=1, translate=[0, 0])
)
chart = (bands + ring + labels).properties(width=SIZE, height=SIZE).configure_view(
    stroke=None
)
chart.save(os.environ["OUT_PATH"], format="svg")
