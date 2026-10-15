"""Sample data and the depth color ramp shared by the GoTree gallery ports.

Mirrors packages/gofish-gotree/stories/data.ts.
"""

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
