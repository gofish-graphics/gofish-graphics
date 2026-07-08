"""Equivalent of lowlevel/ImageMixedPrimitives.stories.tsx — Low Level
Syntax/Image Mixed Primitives.

`image({href, w, h})` mixed into low-level `spread`/`spreadX`/`spreadY`
combinators alongside `rect` and `text` — cards, labeled rows, and a data-URI
SVG mixed with raster assets.

Image assets: the JS storybook imports `bottle.jpg`,
`maja7777-glass-bottle-free-2451180_1280.png`, and
`schwarzenarzisse-isolated-2437759_1280.png` via Vite, which serves them from
the dev server via the `/@fs/<absolute-path>` form in dev (see
tests/python-stories/piccl/test_bottle.py and
tests/python-stories/forward-syntax-v3/test_cut.py for the same pattern); the
DOM normalizer collapses these to their basenames for comparison against the
JS baseline. The inline SVG badge is a `data:image/svg+xml;utf8,` URI built
inline in the JS story itself (not a Vite-resolved asset) via
`encodeURIComponent`; the normalizer leaves data URIs untouched, so we
reconstruct the byte-identical percent-encoding here with Python's
`urllib.parse.quote`, using the safe-character set that matches
`encodeURIComponent`'s unreserved set (`A-Za-z0-9-_.!~*'()`).
"""

import os
from urllib.parse import quote

from gofish import image, rect, spread, text

_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
_ASSETS = f"{_REPO_ROOT}/packages/gofish-graphics/stories/assets"
BOTTLE_JPG = f"/@fs{_ASSETS}/bottle.jpg"
BOTTLE_PHOTO_PNG = (
    f"/@fs{_ASSETS}/maja7777-glass-bottle-free-2451180_1280.png"
)
FLOWER_PNG = f"/@fs{_ASSETS}/schwarzenarzisse-isolated-2437759_1280.png"


def _encode_uri_component(s: str) -> str:
    """Python equivalent of JS `encodeURIComponent`."""
    return quote(s, safe="-_.!~*'()")


_INLINE_BADGE_SVG_MARKUP = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72" '
    'viewBox="0 0 120 72"><rect width="120" height="72" rx="12" '
    'fill="#e2e8f0"/><rect x="10" y="12" width="48" height="48" rx="8" '
    'fill="#94a3b8"/><rect x="64" y="20" width="44" height="10" rx="5" '
    'fill="#0f172a"/><rect x="64" y="36" width="32" height="8" rx="4" '
    'fill="#475569"/></svg>'
)
INLINE_BADGE_SVG = (
    "data:image/svg+xml;utf8," + _encode_uri_component(_INLINE_BADGE_SVG_MARKUP)
)


def _image_card(title, subtitle, image_node):
    return spread(
        [
            text(text=title, fontSize=14, fill="#0f172a"),
            rect(w=180, h=2, fill="#cbd5e1"),
            image_node,
            text(text=subtitle, fontSize=12, fill="#475569"),
        ],
        dir="y",
        spacing=6,
        alignment="start",
    )


def story_cards_row():
    return (
        spread(
            [
                _image_card(
                    "Bottle Icon",
                    "fixed 120x120",
                    image(href=BOTTLE_JPG, w=120, h=120),
                ),
                _image_card(
                    "Bottle Photo",
                    "fixed 170x110",
                    image(href=BOTTLE_PHOTO_PNG, w=170, h=110),
                ),
                _image_card(
                    "Flower",
                    "fixed 120x150",
                    image(href=FLOWER_PNG, w=120, h=150),
                ),
            ],
            dir="x",
            spacing=28,
            alignment="start",
        ),
        {"w": 980, "h": 300},
    )


def story_labeled_rows():
    return (
        spread(
            [
                spread(
                    [
                        rect(w=12, h=60, fill="#7dd3fc", rx=3, ry=3),
                        image(href=BOTTLE_JPG, w=60, h=60),
                        text(
                            text="Square thumbnail with color marker",
                            fontSize=14,
                            fill="#0f172a",
                        ),
                    ],
                    dir="x",
                    spacing=12,
                    alignment="middle",
                ),
                spread(
                    [
                        rect(w=12, h=60, fill="#86efac", rx=3, ry=3),
                        image(href=BOTTLE_PHOTO_PNG, w=92, h=60),
                        text(
                            text="Wide thumbnail mixed with text",
                            fontSize=14,
                            fill="#0f172a",
                        ),
                    ],
                    dir="x",
                    spacing=12,
                    alignment="middle",
                ),
                spread(
                    [
                        rect(w=12, h=60, fill="#fda4af", rx=3, ry=3),
                        image(href=FLOWER_PNG, w=44, h=60),
                        text(
                            text="Tall thumbnail with matching row layout",
                            fontSize=14,
                            fill="#0f172a",
                        ),
                    ],
                    dir="x",
                    spacing=12,
                    alignment="middle",
                ),
            ],
            dir="y",
            spacing=16,
            alignment="start",
        ),
        {"w": 820, "h": 360},
    )


def story_data_uri_with_assets():
    return (
        spread(
            [
                _image_card(
                    "Inline SVG",
                    "w only (w=120, h inferred)",
                    image(href=INLINE_BADGE_SVG, w=120),
                ),
                _image_card(
                    "Asset JPG",
                    "fixed 110x110",
                    image(href=BOTTLE_JPG, w=110, h=110),
                ),
                _image_card(
                    "Asset PNG",
                    "fixed 120x90",
                    image(href=BOTTLE_PHOTO_PNG, w=120, h=90),
                ),
            ],
            dir="x",
            spacing=24,
            alignment="start",
        ),
        {"w": 760, "h": 260},
    )
