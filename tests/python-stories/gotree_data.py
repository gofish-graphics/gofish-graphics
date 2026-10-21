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


# The Flare "vis" package tree (its util subtree), vendored from BIT-VIS/gotree
# (app/hierarchicalData/flare-vis.json, MIT): 1 root, 19 children and 27
# grandchildren in uneven fans. The gallery ports that place their nodes by
# hand lay it out. Mirrors packages/gofish-gotree/stories/gallery/_flareVis.ts.
FLARE_VIS = {
    "name": "util",
    "class": "O",
    "children": [
        {"name": "Arrays", "class": "O", "value": 8258},
        {
            "name": "Colors",
            "class": "B",
            "children": [
                {"name": "red", "class": "B", "value": 6001},
                {"name": "green", "class": "B", "value": 4000},
            ],
        },
        {
            "name": "Dates",
            "class": "C",
            "children": [
                {"name": "Spring", "class": "C", "value": 4000},
                {"name": "autumn", "class": "C", "value": 4217},
            ],
        },
        {"name": "Displays", "class": "O", "value": 12555},
        {"name": "Filter", "class": "O", "value": 2324},
        {
            "name": "Geometry",
            "class": "D",
            "children": [
                {"name": "rect", "class": "D", "value": 4000},
                {"name": "rect", "class": "D", "value": 6993},
            ],
        },
        {
            "name": "heap",
            "class": "E",
            "children": [
                {"name": "FibonacciHeap", "class": "E", "value": 9354},
                {"name": "HeapNode", "class": "E", "value": 1233},
            ],
        },
        {"name": "IEvaluable", "class": "O", "value": 3335},
        {"name": "IPredicate", "class": "O", "value": 5383},
        {"name": "IValueProxy", "class": "O", "value": 2874},
        {
            "name": "math",
            "class": "F",
            "children": [
                {"name": "DenseMatrix", "class": "F", "value": 3165},
                {"name": "IMatrix", "class": "F", "value": 2815},
                {"name": "SparseMatrix", "class": "F", "value": 3366},
            ],
        },
        {
            "name": "Maths",
            "class": "G",
            "children": [
                {"name": "Algebra", "class": "G", "value": 4000},
                {"name": "Numerical", "class": "G", "value": 10000},
                {"name": "Fundamental", "class": "G", "value": 2000},
                {"name": "Quantification", "class": "G", "value": 1705},
            ],
        },
        {"name": "Orientation", "class": "O", "value": 3486},
        {
            "name": "palette",
            "class": "H",
            "children": [
                {"name": "ColorPalette", "class": "H", "value": 6367},
                {"name": "Palette", "class": "H", "value": 1229},
                {"name": "ShapePalette", "class": "H", "value": 2059},
                {"name": "SizePalette", "class": "H", "value": 2291},
            ],
        },
        {"name": "Property", "class": "O", "value": 5559},
        {
            "name": "Shapes",
            "class": "I",
            "children": [
                {"name": "Triangle", "class": "I", "value": 4000},
                {"name": "Rectangle", "class": "I", "value": 3000},
                {"name": "Circle", "class": "I", "value": 5000},
                {"name": "Ellipse", "class": "I", "value": 7000},
            ],
        },
        {"name": "Sort", "class": "O", "value": 6887},
        {"name": "Stats", "class": "O", "value": 6557},
        {
            "name": "Strings",
            "class": "J",
            "children": [
                {"name": "SingleChar", "class": "J", "value": 2026},
                {"name": "Length20", "class": "J", "value": 6000},
                {"name": "Length50", "class": "J", "value": 5000},
                {"name": "Length100", "class": "J", "value": 8000},
            ],
        },
    ],
}
