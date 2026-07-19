"""Equivalent of gofish-gotree/stories/gallery/BarcodeTree.stories.tsx —
GoTree / Gallery / barcodetree.

Thin vertical bars packed left-to-right like a barcode. Each parent bar sits
left of its subtree (distribute x); nest is on Y ONLY, so internal nodes are
fixed-narrow-width but UNSIZED on y — the parent bar grows vertically to wrap
its subtree (include). Siblings flatten along x and align on y. Color =
depth (dark -> light gray).
"""

from gofish import rect
from gofish.gotree import combine, tree

# Same sample tree as gofish-gotree/stories/data.ts::sampleTree.
SAMPLE_TREE = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A1", "value": 4},
                {"name": "A2", "value": 2},
                {"name": "A3", "value": 3},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B1", "value": 5},
                {
                    "name": "B2",
                    "children": [
                        {"name": "B2a", "value": 2},
                        {"name": "B2b", "value": 1},
                    ],
                },
            ],
        },
        {
            "name": "C",
            "children": [
                {"name": "C1", "value": 3},
                {"name": "C2", "value": 2},
            ],
        },
    ],
}

# Dark -> light gray ramp, matching the dsl ColorRange #070707 -> #929598.
_GRAYS = ["#070707", "#3b3e41", "#6c6f72", "#929598", "#b6b9bc"]


def _by_depth(d):
    return _GRAYS[min(d["depth"], len(_GRAYS) - 1)]


# Thin rectangles. Leaves get a fixed narrow width and a tall height (the
# barcode "bar"); internal nodes keep the same narrow width but are UNSIZED on
# y (the nest axis) so the parent box grows to wrap its subtree vertically.
def _node(d):
    if d["height"] == 0:
        return rect(w=12, h=80, fill=_by_depth(d))
    return rect(w=12, fill=_by_depth(d))


def story_barcode_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 4},
                y={"kind": "nest", "pad": 6},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 4},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
