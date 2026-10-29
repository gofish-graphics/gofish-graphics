"""Equivalent of lowlevel/PorterDuffRelations.stories.tsx —
Low Level Syntax/Porter-Duff Relations.

Six exports, one per Porter-Duff compositing operator (Over/In/Xor/Out/Atop/Mask).
Each builds the same `image + colored rect` pair and feeds them to a
different operator. JS imports the bottle PNG via Vite's `?url` resolution;
Python re-builds the `/@fs/<absolute-path>` URL Vite would generate so the
captured DOM is byte-identical.
"""

import os

from gofish import (
    Bin,
    chart,
    circle,
    exclude,
    field,
    image,
    intersect,
    mask,
    over,
    paint,
    partition,
    rect,
    subtract,
)

# The Vite-served URL of the bottle image. JS storybook imports it via
# `import bottlePng from "../assets/wilsonblanco.png"`, which Vite resolves
# to `/@fs/<absolute-path>` in dev. The parity harness is also Vite, so the
# same path works here.
_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
BOTTLE_PNG = (
    f"/@fs{_REPO_ROOT}/packages/gofish-graphics/stories/assets/wilsonblanco.png"
)


# JS default args:
#   w=193, h=678, splitY=50 (percent), bgColor="#1c7520", blendMode="color"
# Derived in the JS render:
#   splitY_px = h - h * (splitY/100) = h * 0.5
#   splitH    = h * (splitY/100)     = h * 0.5
W = 193
H = 678
SPLIT_Y_PX = int(H - H * 0.5)
SPLIT_H = int(H * 0.5)
BG_COLOR = "#1c7520"
BLEND_MODE = "color"


def _build_children():
    """The shared `image + rect` pair — image full-size, rect over the bottom half."""
    return [
        image(href=BOTTLE_PNG, x=0, y=0, w=W, h=H),
        rect(x=0, y=SPLIT_Y_PX, w=W, h=SPLIT_H, fill=BG_COLOR),
    ]


# ─── operators ────────────────────────────────────────────────────────────


def story_union():
    return over(_build_children(), blend_mode=BLEND_MODE), {"w": W, "h": H}


def story_intersect():
    return intersect(_build_children(), blend_mode=BLEND_MODE), {"w": W, "h": H}


def story_exclude():
    return exclude(_build_children(), blend_mode=BLEND_MODE), {"w": W, "h": H}


def story_subtract():
    return subtract(_build_children(), blend_mode=BLEND_MODE), {"w": W, "h": H}


def story_paint():
    return paint(_build_children(), blend_mode=BLEND_MODE), {"w": W, "h": H}


def story_mask():
    # Mirrors the JS `MaskOp(buildChildren(args))` (no blendMode passed).
    return mask(_build_children()), {"w": W, "h": H}


def story_intersect_painted():
    # A circle and a square cut to the lens they share, filled and stroked.
    return (
        intersect(
            [circle(cx=90, cy=90, r=70), rect(x=80, y=30, w=120, h=120)],
            fill="#D1E4F6",
            stroke="#467DA8",
            stroke_width=2,
        ),
        {"w": 220, "h": 180},
    )


def story_intersect_image_fill():
    # An image has no outline, so the overlap is filled through a mask.
    return (
        intersect(
            [
                image(href=BOTTLE_PNG, x=0, y=0, w=193, h=678),
                rect(x=0, y=339, w=193, h=339),
            ],
            fill="#467DA8",
        ),
        {"w": 193, "h": 678},
    )


def story_intersect_in_cells():
    # A composite under a partition, its operands at literal positions: each
    # cell draws its own copy, centered in that cell, as a layer would be.
    return (
        chart([{"v": 5}, {"v": 15}, {"v": 25}], w=480, h=120)
        .flow(partition(by=field("v").bin(Bin.step(10)), dir="x"))
        .mark(
            intersect(
                [
                    rect(x=0, y=0, w=90, h=40, fill="#467DA8"),
                    rect(x=30, y=20, w=90, h=40, fill="#D1E4F6"),
                ]
            )
        ),
        {},
    )
