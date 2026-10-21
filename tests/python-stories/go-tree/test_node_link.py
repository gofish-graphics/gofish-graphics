"""Equivalent of gofish-gotree/stories/Tree.stories.tsx (GoTree / Node-Link)."""

import math

from gofish import Constraint, Coord, Curve, circle, layer, rect, text
from gofish.gotree import distribute, nest, tree

SAMPLE_DATA = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A1"},
                {"name": "A2", "children": [{"name": "A2a"}, {"name": "A2b"}]},
            ],
        },
        {"name": "B", "children": [{"name": "B1"}, {"name": "B2"}, {"name": "B3"}]},
        {"name": "C"},
    ],
}

FILE_TREE_DATA = {
    "name": "project",
    "children": [
        {
            "name": "src",
            "children": [
                {"name": "index.ts"},
                {
                    "name": "ast",
                    "children": [
                        {"name": "node.ts"},
                        {"name": "render.tsx"},
                        {"name": "spread.tsx"},
                    ],
                },
                {
                    "name": "marks",
                    "children": [{"name": "rect.tsx"}, {"name": "circle.tsx"}],
                },
            ],
        },
        {
            "name": "tests",
            "children": [{"name": "tree.test.ts"}, {"name": "layout.test.ts"}],
        },
        {"name": "README.md"},
    ],
}

DEPTH_COLOR = ["#1f3a5f", "#4682b4", "#7baed1", "#c0d8ec"]


def story_node_link():
    return (
        tree(
            SAMPLE_DATA,
            node=lambda d: circle(
                r=10,
                fill=DEPTH_COLOR[min(d["depth"], len(DEPTH_COLOR) - 1)],
                stroke="#1f3a5f",
                stroke_width=1,
            ),
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1.5},
            # Parent above its children, centered on x.
            parent_child=distribute(dir="y", spacing=48, alignment="middle"),
            sibling=distribute(dir="x", spacing=24, alignment="start"),
        ),
        {"w": 600, "h": 400},
    )


# Composed node: a rounded rect with a centered text label. The node function
# closes over the node, so the label reads its name.
def labeled_node(d):
    return layer(
        [
            rect(
                w=96,
                h=26,
                rx=6,
                fill="#dbe6f3" if d["height"] > 0 else "#f5f7fa",
                stroke="#4682b4",
                stroke_width=1.25,
            ).name("box"),
            text(
                text=d["data"]["name"],
                font_size=12,
                font_family="ui-monospace, SFMono-Regular, Menlo, monospace",
                fill="#1d3557",
            ).name("label"),
        ],
        w=96,
        h=26,
    ).relate(
        lambda box, label: [Constraint.align([box, label], x="middle", y="middle")]
    )


def story_labeled_file_tree():
    return (
        tree(
            FILE_TREE_DATA,
            node=labeled_node,
            link={"curve": Curve.linear(), "stroke": "#9bb1c4", "stroke_width": 1.5},
            parent_child=distribute(dir="y", spacing=36, alignment="middle"),
            # Bottom-align siblings, so every leaf lands on one bottom row.
            sibling=distribute(dir="x", spacing=12, alignment="end"),
        ),
        {"w": 760, "h": 460},
    )


# Containment: parent rects grow by `nest` to wrap their subtree. Leaves get a
# fixed size; internal nodes are unsized, so nest sizes them.
GREENS = ["#3c7c3c", "#7fb37f", "#a8d9a8", "#c8e6c8"]


def nested_node(d):
    if d["height"] == 0:
        return rect(w=28, h=28, fill=GREENS[0])
    return rect(fill=GREENS[min(d["height"], len(GREENS) - 1)])


BALANCED_TREE = {
    "name": "root",
    "children": [
        {"name": "A", "children": [{"name": "A1"}, {"name": "A2"}]},
        {"name": "B", "children": [{"name": "B1"}, {"name": "B2"}]},
    ],
}


def story_nested_boxes():
    return (
        tree(
            BALANCED_TREE,
            node=nested_node,
            link="none",
            parent_child=nest(x=12, y=12),
            sibling=distribute(dir="x", spacing=10, alignment="middle"),
        ),
        {"w": 480, "h": 240},
    )


# Labeled nested boxes, with a custom parent_child combiner: any function from
# the children to one mark is a combiner.
def labeled_header(d):
    return layer(
        [
            rect(
                w=96,
                h=22,
                rx=4,
                fill="#dbe6f3" if d["height"] > 0 else "#f5f7fa",
                stroke="#5a7da6",
                stroke_width=1,
            ).name("box"),
            text(
                text=d["data"]["name"],
                font_size=11,
                font_family="ui-monospace, SFMono-Regular, Menlo, monospace",
                fill="#1d3557",
            ).name("label"),
        ],
        w=96,
        h=22,
    ).relate(
        lambda box, label: [Constraint.align([box, label], x="middle", y="middle")]
    )


# Stacks [child group, header] on y, so the header ends up on top, then nests
# the stack inside a new outer rect.
def labeled_contain_combiner(children):
    header, child_group = children
    return nest(x=10, y=10)(
        [
            rect(fill="#fafbfd", stroke="#9bb1c4", stroke_width=1, rx=6),
            distribute(dir="y", spacing=6, alignment="middle")([child_group, header]),
        ]
    )


def story_labeled_nested_boxes():
    return (
        tree(
            FILE_TREE_DATA,
            node=labeled_header,
            link="none",
            parent_child=labeled_contain_combiner,
            sibling=distribute(dir="y", spacing=6, alignment="middle"),
        ),
        {"w": 720, "h": 600},
    )


# Sunburst: root at the center, leaves on the outer ring. Each node is a polar
# wedge whose angle is its share of the leaves.
POLAR_GREENS = ["#3c7c3c", "#7fb37f", "#a8d9a8", "#c8e6c8"]

POLAR_BALANCED_TREE = {
    "name": "root",
    "children": [
        {"name": "A", "children": [{"name": "A1"}, {"name": "A2"}]},
        {"name": "B", "children": [{"name": "B1"}, {"name": "B2"}]},
    ],
}


# A balanced binary tree, 4 levels deep (16 leaves), for the sunburst and the
# icicle plot.
def make(depth, prefix=""):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix or "root",
        "children": [make(depth - 1, prefix + "L"), make(depth - 1, prefix + "R")],
    }


DEEP_BALANCED_TREE = make(4)

DEEP_LEAF_COUNT = 16  # 2^4
LEAF_THETA = (2 * math.pi) / DEEP_LEAF_COUNT  # a sunburst leaf's angle
BAND_HEIGHT = 38  # radial thickness per tree level


def sunburst_node(d):
    return rect(
        w=d["width"] * LEAF_THETA,
        h=BAND_HEIGHT,
        em_x=True,
        em_y=True,
        fill=POLAR_GREENS[min(d["depth"], len(POLAR_GREENS) - 1)],
        stroke="white",
        stroke_width=2,
    )


def story_sunburst():
    return (
        tree(
            DEEP_BALANCED_TREE,
            node=sunburst_node,
            link="none",
            # Parent on the inner ring, its children one ring out.
            parent_child=distribute(dir="y", spacing=0, alignment="middle"),
            # Siblings packed along theta, on one radial band.
            sibling=distribute(dir="x", spacing=0, alignment="middle"),
            coord=Coord.clock(),
        ),
        {"w": 540, "h": 540},
    )


# The cartesian counterpart of the sunburst: an icicle plot.
ICICLE_LEAF_WIDTH = 28  # pixels per leaf


def icicle_node(d):
    return rect(
        w=d["width"] * ICICLE_LEAF_WIDTH,
        h=BAND_HEIGHT,
        fill=POLAR_GREENS[min(d["depth"], len(POLAR_GREENS) - 1)],
        stroke="white",
        stroke_width=2,
    )


def story_icicle_plot():
    return (
        tree(
            DEEP_BALANCED_TREE,
            node=icicle_node,
            link="none",
            parent_child=distribute(dir="y", spacing=0, alignment="middle"),
            sibling=distribute(dir="x", spacing=0, alignment="middle"),
        ),
        {"w": 540, "h": 320},
    )


# Nested pie tree: the polar version of the nested boxes. A parent's wedge
# encloses its children's, so the leaves are innermost. The sizes are worked
# out by hand to fit the 2 pi budget (#475):
#   4 * leaf width + 4 * sibling gap + 6 * x pad = 2 pi.
NPT_LEAF_W = math.pi / 2 - 0.27  # about 1.30 rad
NPT_SIB = 0.08
NPT_X_PAD = 0.13


def nested_pie_node(d):
    if d["height"] == 0:
        return rect(
            w=NPT_LEAF_W,
            h=36,
            em_x=True,
            em_y=True,
            fill=POLAR_GREENS[-1],
            stroke="white",
            stroke_width=4,
        )
    return rect(
        em_x=True,
        em_y=True,
        fill=POLAR_GREENS[
            min(len(POLAR_GREENS) - 1 - d["height"], len(POLAR_GREENS) - 1)
        ],
        stroke="white",
        stroke_width=4,
    )


def story_nested_pietree():
    return (
        tree(
            POLAR_BALANCED_TREE,
            node=nested_pie_node,
            link="none",
            parent_child=nest(x=NPT_X_PAD, y=32),
            sibling=distribute(dir="x", spacing=NPT_SIB, alignment="middle"),
            coord=Coord.clock(),
        ),
        {"w": 540, "h": 540},
    )


def story_radial_nodes():
    return (
        tree(
            SAMPLE_DATA,
            node=lambda d: circle(
                r=8,
                fill=DEPTH_COLOR[min(d["depth"], len(DEPTH_COLOR) - 1)],
                stroke="#1f3a5f",
                stroke_width=1,
            ),
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1.5},
            # anchor="middle" treats the nodes as points and reads spacing in
            # data units: radius units here.
            parent_child=distribute(
                dir="y", spacing=70, anchor="middle", alignment="middle"
            ),
            # And radians between sibling centers.
            sibling=distribute(
                dir="x", spacing=(2 * math.pi) / 3, anchor="middle", alignment="middle"
            ),
            coord=Coord.clock(),
        ),
        {"w": 480, "h": 480},
    )
