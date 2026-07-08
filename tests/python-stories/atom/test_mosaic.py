"""Equivalent of Mosaic.stories.tsx — atom/Mosaic."""

import pandas as pd

from gofish import chart, stack, rect, palette


def _passengers():
    passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    ).to_dict("records")
    # `count: 1` per passenger so the stacks aggregate; sorted so every class
    # column stacks survived/died in the same order (pclass asc, survived desc)
    # — mirrors the JS `.map(count: 1).sort(...)`.
    for p in passengers:
        p["count"] = 1
    passengers.sort(key=lambda r: (r["pclass"], -r["survived"]))
    return passengers


def story_default():
    return (
        chart(_passengers(), color=palette(["#2b8cbe", "#ff8408"]), axes=True)
        .flow(
            # columns by class — width ∝ each class's passenger count (marginal)
            stack(by="pclass", dir="x"),
            # survival share within each class column (conditional), fills height
            stack(by="survived", dir="y", w="count", normalize=True),
        )
        .mark(rect(h="count", fill="survived", stroke="white", strokeWidth=1)),
        {"w": 520, "h": 420},
    )
