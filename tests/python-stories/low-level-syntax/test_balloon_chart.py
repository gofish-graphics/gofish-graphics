"""Equivalent of lowlevel/BalloonChart.stories.tsx — Low Level Syntax/Balloon Chart.

A whimsical scatter where each lake is a balloon on a string, the whole scene
warped by a `wavy` coordinate transform. Each balloon is a small `layer` of two
ellipses + two rects (flipped via a y=−1 scale transform); a thin rect draws the
string. Exercises `layer({coord: wavy()})` (Tier-2 coord transform) and
shape-level `cx`/`cy` positioning.
"""

from gofish import layer, ellipse, rect, wavy
from python_stories.data import SEAFOOD, CATCH_LOCATIONS, COLORS
from python_stories._lowlevel_helpers import group_by

_C6 = COLORS["color6"]
_MIX_WHITE = COLORS["mixWhite05"]
_MIX_BLACK_01 = COLORS["mixBlack01"]
_MIX_BLACK_035 = COLORS["mixBlack035"]
_BLACK = COLORS["colorBlack"]


def _balloon(x, y, palette):
    """A balloon glyph at (x, y). `palette` is the per-lake color ramp indexed
    [3..6], matching the JS array passed to the `Balloon` component."""
    return layer(
        [
            ellipse(cx=15, cy=15, w=24, h=30, fill=palette[4]),
            ellipse(cx=12, cy=11, w=7, h=11, fill=palette[3]),
            rect(cx=15, cy=32, w=8, h=4, fill=palette[5], rx=3, ry=2),
            rect(cx=15, cy=32, w=5, h=2.4, fill=palette[6], rx=2, ry=1),
        ],
        x=x - 15,
        y=y + 27,
        box=True,
        transform={"scale": {"x": 1, "y": -1}},
    )


def story_default():
    scene = []
    for i, lake in enumerate(group_by(SEAFOOD, "lake").keys()):
        loc = CATCH_LOCATIONS[lake]
        # JS passes [null, null, null, mix(c,white,.5), c, mix(c,black,.1), mix(c,black,.35)]
        palette = [None, None, None, _MIX_WHITE[i], _C6[i], _MIX_BLACK_01[i], _MIX_BLACK_035[i]]
        scene.append(
            layer(
                [
                    rect(x=0, y=0, w=1, h=loc["y"], emY=True, fill=_BLACK),
                    _balloon(0, loc["y"], palette),
                ],
                x=loc["x"],
            )
        )

    return (
        layer(scene, coord=wavy(), x=0, y=0),
        {"axes": True},
    )
