"""Sample data and the depth color ramp shared by the GoTree gallery ports.

Mirrors packages/gofish-gotree/stories/data.ts.
"""

from python_stories._json_data import load_json

# A moderate sample tree (3 levels, uneven) with leaf `value`s so value-driven
# layouts (treemaps) have something to size against.
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

# Sequential blue ramp, dark at the root -> light at the leaves.
DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def by_depth(colors=DEPTH_BLUES):
    """A node's color from its depth."""
    return lambda d: colors[min(d["depth"], len(colors) - 1)]


# The Flare "vis" package tree (its util subtree), vendored from BIT-VIS/gotree
# (app/hierarchicalData/flare-vis.json, MIT): 1 root, 19 children and 27
# grandchildren in uneven fans. The gallery ports that place their nodes by
# hand lay it out. Mirrors packages/gofish-gotree/stories/gallery/_flareVis.ts.
FLARE_VIS = load_json("flare_vis")
