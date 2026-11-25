"""Equivalent of gofish-gotree/stories/gallery/NestedPieTree.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import by_depth

# The root's 19 wedges, read clockwise off the reference: a number is a wedge
# with that value, a list is a wedge whose bands have those values.
WEDGES = [
    [3, 2, 2, 1],
    4,
    5,
    [3, 2, 1, 1],
    3,
    [3, 2, 2, 1],
    1.5,
    [4, 2, 2],
    [2, 2],
    1,
    2,
    3,
    [3, 2],
    [4, 3],
    1.5,
    5,
    [3, 2],
    [3, 2],
    4,
]


def wedge(i, w):
    if not isinstance(w, list):
        return {"name": f"w{i}", "value": w}
    return {
        "name": f"w{i}",
        "children": [{"name": f"w{i}-{j}", "value": v} for j, v in enumerate(w)],
    }


PIE_DATA = {"name": "root", "children": [wedge(i, w) for i, w in enumerate(WEDGES)]}


# A node's value: its own, or the sum of its leaves'.
def total(n):
    if "children" in n:
        return sum(total(c) for c in n["children"])
    return n["value"]


PIE_BLUES = ["#2171b5", "#84aed8", "#deebf7"]

# slice: siblings split the angle and share a ring.
slice_ = combine(
    x={"kind": "distribute", "spacing": 0},
    y={"kind": "align", "alignment": "start"},
)
# dice: siblings split the radius and share an arc.
dice = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": 4},
)


# A node at an odd depth sits in a slice (its angle is its value), one at an
# even depth in a dice (its thickness is its value).
def node(d):
    style = {"fill": by_depth(PIE_BLUES)(d), "stroke": "white", "stroke_width": 1.5}
    if d["depth"] == 0:
        return rect(**style)
    value = datum(total(d["data"]))
    if d["depth"] % 2 == 1:
        return rect(w=value, **style)
    return rect(h=value, **style)


def story_nested_pie_tree():
    return (
        tree(
            PIE_DATA,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "nest", "pad": 4},
            ),
            sibling=alternate([slice_, dice]),
            coord=Coord.clock(),
        ),
        {"w": 520, "h": 520},
    )
