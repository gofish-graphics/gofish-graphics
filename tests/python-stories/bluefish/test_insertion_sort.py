"""Equivalent of bluefish/InsertionSort.stories.tsx — Bluefish/Insertion Sort.

Each stage is a `layer` of an `enclose`d row of `array_entry` cells, an
optional dashed `enclose` around the sorted prefix, and a conditional
`arrow` for the cell being moved. Stages are `spread` vertically with a
label `spread` to the left of each, referencing the row by name — mirrors
the cross-tier `layer` + `ref` pattern used in test_pulley.py.
"""

from gofish import (
    Constraint,
    arrow,
    createName,
    ellipse,
    enclose,
    layer,
    mark,
    rect,
    ref,
    spread,
    text,
)

# so that colors in this diagram match the colors of the original Bluefish
# gallery example
def _js_num(v: float) -> str:
    """Format a float the way JS stringifies numbers: integral values render
    without a trailing `.0` (JS has no int/float distinction), and Python's
    shortest-round-trip float repr matches JS `Number.prototype.toString`
    for everything else."""
    return str(int(v)) if float(v).is_integer() else repr(float(v))


def _stage_color(t: float) -> str:
    T = 0.1 + 0.8 * (1 - t)
    s = max(0.0, min(1.0, T))
    r = max(0.05, min(1.0, 3 * T - 2))
    g = 3 * s * s - 2 * s * s * s
    b = 1 - (1 - max(0.0, min(1.0, 3 * T))) ** 0.5
    return f"rgba({_js_num(r * 255)}, {_js_num(g * 255)}, {_js_num(b * 255)}, 0.75)"


def _find_pos_to_insert(sorted_: list, item: int) -> int:
    for i, v in enumerate(sorted_):
        if v >= item:
            return i
    return len(sorted_)


def _insert_at_pos(array: list, pos: int, item) -> list:
    result = list(array)
    result.insert(pos, item)
    return result


# Insertion sort implemented as a generator: at each stage it yields the
# array as currently laid out and the (from, to) move the algorithm is about
# to perform (from == to signals the terminal, fully-sorted stage).
def _insertion_sort(unsorted: list, sorted_: list = None):
    if sorted_ is None:
        sorted_ = []
    if not unsorted:
        yield {"ar": sorted_, "move": (len(sorted_), len(sorted_))}
        return
    entry_to_sort = unsorted[0]
    pos_to_insert = _find_pos_to_insert(sorted_, entry_to_sort)
    if sorted_:
        yield {"ar": sorted_ + unsorted, "move": (len(sorted_), pos_to_insert)}
    new_sorted = _insert_at_pos(sorted_, pos_to_insert, entry_to_sort)
    yield from _insertion_sort(unsorted[1:], new_sorted)


def _stage_label(stage: int, length: int) -> str:
    if stage == 0:
        return "Unsorted"
    if stage == length - 1:
        return "Sorted"
    return f"Stage {stage}"


CELL_SIZE = 34
CELL_SPACING = 3
# Sorted-prefix (teal) border padding at a mid-row prefix boundary — matches
# Bluefish's DashedBorder padding={4}.
BORDER_PADDING = 4
# Row outline padding — upstream ArrayOutline uses Background's default
# padding of 10.
OUTLINE_PADDING = 10
# Dash band's inner edge is tangent to the outline's outer edge (outline
# outer edge = OUTLINE_PADDING + strokeWidth/2 = 11; dash half-width = 2).
DASH_OVERHANG = OUTLINE_PADDING + 1 + 2


@mark
def array_entry(value: int, color: str, highlight: bool):
    """A single array-entry cell: rounded colored square, translucent white
    circle, and the value centered on top."""
    return layer(
        [
            rect(w=CELL_SIZE, h=CELL_SIZE, fill=color, rx=8, ry=8).name("body"),
            ellipse(w=26, h=26, fill="rgba(255,255,255,0.6)").name("circle"),
            text(
                text=str(value),
                fontFamily="serif",
                fontSize=14,
                fill="orangered" if highlight else "black",
            ).name("label"),
        ]
    ).constrain(
        lambda body, circle, label: [
            Constraint.align([body, circle, label], x="middle", y="middle"),
        ]
    )


def story_insertion_sort():
    unsorted_array = [4, 2, 7, 1, 3]
    stages = list(_insertion_sort(unsorted_array))

    # Per-cell name tokens, keyed by [stage][index] — a fresh token per cell
    # per stage, since the same value can appear in many stages/positions.
    entry_names = [
        [createName(f"entry-{s}-{i}") for i in range(len(stage["ar"]))]
        for s, stage in enumerate(stages)
    ]
    row_names = [createName(f"row-{s}") for s in range(len(stages))]

    rows = []
    for stage, stage_data in enumerate(stages):
        ar = stage_data["ar"]
        from_, to = stage_data["move"]
        cells = [
            array_entry(
                value=value,
                color=_stage_color(stage / ((len(stages) - 1) or 1)),
                highlight=(i == stage + 1),
            ).name(entry_names[stage][i])
            for i, value in enumerate(ar)
        ]

        # Tier 1: the solid-bordered row of cells. Tier 2: the dashed
        # sorted-prefix border and the move arrow, both declared after the
        # row so their ref()s resolve against placed cells.
        row_children = [
            # Row outline — upstream ArrayOutline: <Rect fill="none"
            # stroke="black" stroke-width={2} rx={8} />.
            enclose(
                [spread(cells, dir="x", spacing=CELL_SPACING, alignment="middle")],
                padding=OUTLINE_PADDING,
                rx=8,
                ry=8,
                fill="none",
                stroke="black",
                strokeWidth=2,
            ).name(row_names[stage]),
        ]

        if from_ > 0:
            # Sorted-prefix border: enclose() collapses every child to a
            # shared local origin before measuring, discarding refs'
            # relative offsets — so the box's content size is computed
            # directly here and handed to enclose as an invisible sizer
            # rect, which only needs the right w/h (see the JS story for
            # the full writeup of this workaround).
            row_children.append(
                enclose(
                    [
                        rect(
                            w=from_ * CELL_SIZE
                            + (from_ - 1) * CELL_SPACING
                            + (0 if from_ == len(ar) else BORDER_PADDING - DASH_OVERHANG),
                            h=CELL_SIZE,
                            fill="none",
                            stroke="none",
                        )
                    ],
                    padding=DASH_OVERHANG,
                    rx=12,
                    ry=12,
                    fill="none",
                    stroke="teal",
                    strokeWidth=4,
                    strokeDasharray="12",
                )
            )

        if from_ != to:
            row_children.append(
                arrow(
                    [ref(entry_names[stage][from_]), ref(entry_names[stage][to])],
                    padStart=0,
                    padEnd=4,
                    straights=False,
                    flip=True,
                )
            )

        rows.append(layer(row_children))

    # Outer diagram: stages spread vertically (left edges aligned so cells
    # line up in columns), with a label to the left of each row. The x/y
    # offset shifts the whole diagram right/down so the leftward-placed
    # labels don't land at negative coordinates.
    return (
        layer(
            [
                spread(rows, dir="y", spacing=15, alignment="start"),
                *[
                    spread(
                        [
                            text(
                                text=_stage_label(stage, len(stages)),
                                fontFamily="serif",
                                fontStyle="italic",
                                fontWeight=300,
                                fontSize=14,
                                fill="gray",
                            ),
                            ref(row_names[stage]),
                        ],
                        dir="x",
                        spacing=20,
                        alignment="middle",
                    )
                    for stage in range(len(stages))
                ],
            ],
            x=90,
            y=20,
        ),
        {},
    )
