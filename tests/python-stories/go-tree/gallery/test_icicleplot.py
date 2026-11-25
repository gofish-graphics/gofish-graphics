"""Equivalent of gofish-gotree/stories/gallery/IciclePlot.stories.tsx."""

from gofish import datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth

ICICLE_BLUES = ["#2171b5", "#84aed8", "#deebf7"]

# The root's 19 children, read off the reference: a number is a leaf with that
# value, a list is a child whose leaves have those values.
BRANCHES = [
    10,
    [7, 5],
    [5, 5],
    16,
    3,
    [5, 9],
    [12, 1],
    4,
    7,
    3,
    [4, 3, 4],
    [5, 13, 2, 2],
    4,
    [8, 1, 3, 3],
    7,
    [5, 4, 6, 9],
    8,
    7,
    [2, 6, 6, 10],
]


def branch(i, b):
    if isinstance(b, int):
        return {"name": f"c{i}", "value": b}
    return {
        "name": f"c{i}",
        "children": [{"name": f"c{i}-{j}", "value": v} for j, v in enumerate(b)],
    }


ICICLE_DATA = {
    "name": "root",
    "children": [branch(i, b) for i, b in enumerate(BRANCHES)],
}

BAND_HEIGHT = 120  # one depth band


# Each leaf is as wide as its value; internal nodes leave their width unsized
# so the nest grows them to their children's sum.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(d["data"]["value"]),
            h=BAND_HEIGHT,
            fill=by_depth(ICICLE_BLUES)(d),
            stroke="white",
            stroke_width=2,
        )
    return rect(
        h=BAND_HEIGHT,
        fill=by_depth(ICICLE_BLUES)(d),
        stroke="white",
        stroke_width=2,
    )


def story_icicle_plot():
    return (
        tree(
            ICICLE_DATA,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 0},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0},
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 640},
    )
