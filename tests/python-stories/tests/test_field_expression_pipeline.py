"""Equivalent of FieldExpr.stories.tsx — Tests/Field Expression Pipeline."""

from gofish import chart, spread, stack, rect, field

# Deliberately out-of-alphabetical order (C, A, B) so a correct
# `field("x").sort("v")` visibly reorders the bars ascending by `v`.
_SORT_DATA = [
    {"x": "C", "v": 40},
    {"x": "A", "v": 10},
    {"x": "B", "v": 25},
]


def story_sort_by_value():
    # field("x").sort("v") should order the bars ascending by `v`:
    # A (10), B (25), C (40) — left to right.
    return (
        chart(_SORT_DATA)
        .flow(spread(by=field("x").sort("v"), dir="x", spacing=20))
        .mark(rect(w=40, h="v", fill="x")),
        {"w": 400, "h": 250, "axes": True},
    )


_BIN_DATA = [{"age": (i * 37) % 100} for i in range(60)]


def story_binned_spread():
    # field("age").bin() groups rows into ~10 numeric bins and spreads one
    # bar per bin, each sized by the bin's row count — a histogram.
    return (
        chart(_BIN_DATA)
        .flow(spread(by=field("age").bin(), dir="x", spacing=4))
        .mark(rect(w=30, h=field("age").count())),
        {"w": 500, "h": 250, "axes": True},
    )


_MEAN_DATA = [
    {"species": "Bass", "weight": 2},
    {"species": "Bass", "weight": 4},
    {"species": "Trout", "weight": 1},
    {"species": "Trout", "weight": 3},
    {"species": "Trout", "weight": 5},
]


def story_mean_aggregate():
    # field("weight").mean() overrides the default sum aggregate: Bass -> 3,
    # Trout -> 3 (both bars should render the SAME height, not 6 vs 9).
    return (
        chart(_MEAN_DATA)
        .flow(spread(by="species", dir="x", spacing=20))
        .mark(rect(w=60, h=field("weight").mean(), fill="species")),
        {"w": 300, "h": 250, "axes": True},
    )


_SHARE_DATA = [
    {"category": "a", "part": "x", "n": 1},
    {"category": "a", "part": "y", "n": 3},
    {"category": "b", "part": "x", "n": 2},
    {"category": "b", "part": "y", "n": 2},
]


def story_normalize_size_stack():
    # stack's `size=field("n").normalize()` (#700 Phase 2) replaces each
    # entry's raw `n` with its SHARE of the column: category "a" is 1/4 x,
    # 3/4 y; category "b" is 1/2 x, 1/2 y. Every bar reaches the same
    # full-height 1 (a percent-bar), unlike the raw-count MosaicChart story.
    return (
        chart(_SHARE_DATA)
        .flow(
            spread(by="category", dir="x", spacing=20),
            stack(by="part", dir="y", size=field("n").normalize()),
        )
        .mark(rect(w=60, fill="part")),
        {"w": 300, "h": 250, "axes": True},
    )


_SPREAD_SIZE_DATA = [
    {"lake": "Huron", "fish": 12},
    {"lake": "Erie", "fish": 30},
    {"lake": "Ontario", "fish": 18},
]


def story_spread_size_ordinal_axis():
    # `spread(by, size)` wraps each child in a sized layer (#700 Phase 2).
    # Regression check: the wrapper must copy the split identity (key/
    # datum/__splitBy) onto itself, or the legend/fill-by-category loses its
    # per-bar identity (all three bars would render the SAME color instead
    # of Huron/Erie/Ontario each keeping their own). Bar widths are also
    # proportional to `fish` (12/30/18).
    return (
        chart(_SPREAD_SIZE_DATA)
        .flow(spread(by="lake", dir="x", spacing=20, size="fish"))
        .mark(rect(h=40, fill="lake")),
        {"w": 400, "h": 250, "axes": True},
    )
