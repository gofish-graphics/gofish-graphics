"""Equivalent of WaffleChart.stories.tsx — Forward Syntax/Waffle Chart."""

from gofish import chart, compose, spread, derive, rect, repeat
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, axes={"x": {"side": "end"}})
        .flow(
            # Bottom-align the lake columns (y-down: "end" = bottom) so the
            # waffles sit on a baseline and fill upward.
            spread(by="lake", spacing=8, dir="x", axes=False, alignment="end"),
            derive(lambda d: [item for row in d for item in repeat(row, "count")]),
            derive(lambda d: [d[i : i + 5] for i in range(0, len(d), 5)]),
            # Reverse the rows so the ragged partial row lands at the top.
            spread(spacing=2, dir="y", reverse=True),
            spread(spacing=2, dir="x"),
        )
        .mark(rect(w=8, h=8, fill="species")),
        # x-axis at the bottom (y-end), under the upward-filling columns.
        {},
    )


def story_composed():
    # The same waffle with its steps packaged as reusable `compose` fragments.
    # The outer fragment nests two inner ones; `.flow()` flattens them.
    def units(count, row_size):
        return compose(
            derive(lambda d: [item for row in d for item in repeat(row, count)]),
            derive(lambda d: [d[i : i + row_size] for i in range(0, len(d), row_size)]),
        )

    grid = compose(
        spread(spacing=2, dir="y", reverse=True),
        spread(spacing=2, dir="x"),
    )
    waffle = compose(units("count", 5), grid)

    return (
        chart(SEAFOOD, axes={"x": {"side": "end"}})
        .flow(
            spread(by="lake", spacing=8, dir="x", axes=False, alignment="end"),
            waffle,
        )
        .mark(rect(w=8, h=8, fill="species")),
        {},
    )
