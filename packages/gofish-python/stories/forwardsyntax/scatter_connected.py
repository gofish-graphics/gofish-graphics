"""Forward Syntax V3/Scatter (Connected & WithPieGlyphs) — mirrors Scatter.stories.tsx"""

from gofish import Layer, chart, scatter, circle, selectAll, line
from stories.data.driving_shifts import driving_shifts

TITLE = "Forward Syntax V3/Scatter (Connected)"


def connected(w=400, h=400):
    points = (
        chart(driving_shifts)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", strokeWidth=2).name("points"))
    )
    lines = chart(selectAll("points")).mark(line(stroke="black", strokeWidth=2))
    dots = (
        chart(driving_shifts)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", strokeWidth=2))
    )
    return Layer([points, lines, dots])


def with_pie_glyphs(w=400, h=400):
    raise NotImplementedError(
        "WithPieGlyphs requires Layer + clock() coordinate + nested chart mark — "
        "not yet implemented in Python wrapper"
    )
