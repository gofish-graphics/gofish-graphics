"""Equivalent of Mosaic.stories.tsx — atom/Mosaic."""

import pandas as pd

from gofish import chart, stack, derive, rect, normalize, palette


def _mosaic_cells():
    passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    ).to_dict("records")

    # group by pclass (ascending), then by survived (encounter order) — mirrors
    # the JS `groupBy(...).flatMap(...)` + `orderBy(["pclass"], ["asc"])`.
    by_class: dict = {}
    for p in passengers:
        by_class.setdefault(p["pclass"], []).append(p)

    cells = []
    for pclass in sorted(by_class):
        rows = by_class[pclass]
        class_total = len(rows)
        by_surv: dict = {}
        for r in rows:
            by_surv.setdefault(r["survived"], []).append(r)
        for survived, srows in by_surv.items():
            cells.append(
                {
                    "pclass": pclass,
                    "survived": survived,
                    "count": len(srows),
                    "classTotal": class_total,
                }
            )
    return cells


def story_default():
    return (
        chart(_mosaic_cells(), color=palette(["#2b8cbe", "#ff8408"]), axes=True)
        .flow(
            stack(by="pclass", dir="x", spacing=2),
            derive(
                lambda rows: normalize(
                    sorted(rows, key=lambda r: r["survived"], reverse=True),
                    "count",
                )
            ),
            stack(by="survived", dir="y"),
        )
        .mark(
            rect(
                w="classTotal",
                h="count",
                fill="survived",
                stroke="white",
                strokeWidth=1,
            )
        ),
        {"w": 520, "h": 420},
    )
