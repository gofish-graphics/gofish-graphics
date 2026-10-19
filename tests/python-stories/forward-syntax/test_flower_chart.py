"""Equivalent of FlowerChart.stories.tsx — Forward Syntax/Flower Chart."""

from gofish import Constraint, Coord, chart, layer, petal, rect, scatter, stack
from python_stories.data import CATCH_LOCATIONS, SEAFOOD

# Fixed radius of every flower head, in pixels. The petals fan out to this
# shared length; only their colors and angular widths vary with the data.
FLOWER_RADIUS = 40

# color.green[5] in packages/gofish-graphics/src/color.ts.
GREEN = "rgb(0, 142, 91)"

# Each species row tagged with its lake's planting location on x.
STEM_DATA = [{**d, "x": CATCH_LOCATIONS[d["lake"]]["x"]} for d in SEAFOOD]


def story_default():
    # One flower head: a polar fan of petals, one per species, each as wide
    # as that species' count. It has no data of its own, so as a nested mark
    # it inherits each lake's rows.
    flower = (
        chart(coord=Coord.polar(), axes=False)
        .flow(stack(by="species", dir="x", h=FLOWER_RADIUS))
        # TODO(#1111): lighten the petals, as the low-level version did.
        .mark(petal(w="count", fill="species"))
    )

    # One plant per lake, planted at the lake's x location: a thin green stem
    # as tall as the lake's total catch, with the flower centered on its top.
    return (
        chart(STEM_DATA, axes=False)
        .flow(scatter(by="lake", x="x"))
        .mark(
            layer([
                rect(w=4, h="count", fill=GREEN).name("stem"),
                flower.name("flower"),
            ]).relate(lambda stem, flower: [
                Constraint.align([stem, flower], x="middle", y=["end", "middle"]),
            ])
        ),
        {"w": 400, "h": 400},
    )
