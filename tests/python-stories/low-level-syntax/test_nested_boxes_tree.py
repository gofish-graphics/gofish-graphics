"""Equivalent of lowlevel/NestedBoxesTree.stories.tsx — Low Level Syntax/Nested
Boxes Tree.

A tree visualization built purely from `Constraint.nest`. Each subtree is a
layer of `[outerRect, innerStack]` with a nest constraint that sizes outerRect
to innerStack's intrinsic dims + padding. The layer's pre-pass topo-sorts so the
innermost subtree is laid out first; sizes propagate outward through the chained
nest constraints.

Pure-spec story (no JS-only options); its normalized DOM should match the JS
NestedBoxesTree story.
"""

from gofish import Constraint, layer, rect, stack, text

sample = {
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

depthFill = ["#e3edf7", "#dbe6f3", "#cfdcec", "#c2d2e6"]
leafFill = "#fff3e0"


# Each node renders as a rounded rect labeled with its name. Internal nodes also
# wrap their children in a containing rect via Constraint.nest.
def buildSubtree(node, depth):
    # The labeled "header" block: a small rect with the node's name centered.
    header = layer(
        [
            rect(
                w=96,
                h=22,
                rx=4,
                fill=(
                    depthFill[min(depth, len(depthFill) - 1)]
                    if node.get("children")
                    else leafFill
                ),
                stroke="#5a7da6",
                strokeWidth=1,
            ).name("box"),
            text(
                text=node["name"],
                fontSize=11,
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace",
                fill="#1d3557",
            ).name("label"),
        ],
        w=96,
        h=22,
    ).constrain(lambda box, label: [
        Constraint.align([box, label], x="middle", y="middle"),
    ])

    if not node.get("children"):
        return header

    # Stack [header, ...childSubtrees] vertically — header on top, children below.
    inner = stack(
        [header, *[buildSubtree(c, depth + 1) for c in node["children"]]],
        dir="y",
        spacing=8,
        alignment="middle",
    )

    # Wrap the inner stack in a containing rect.
    return layer([
        rect(rx=6, fill="#fafbfd", stroke="#9bb1c4", strokeWidth=1.25).name(
            "outer"
        ),
        inner.name("inner"),
    ]).constrain(lambda outer, inner: [
        Constraint.nest([outer, inner], x=10, y=10),
    ])


def story_nested_boxes_tree():
    return (buildSubtree(sample, 0), {})
