"""Equivalent of shapes/ImageMarks.stories.tsx — Shapes/Image Marks.

`image({href, w, h})` sizing resolution: a data-URI SVG that resolves its
intrinsic 96x64 size when no `w`/`h` are given, three raster assets pinned to
explicit `w`+`h`, and one asset pinned by `w` only (h inferred from aspect).

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

from gofish import image, spread, stack, text

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
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" '
    'viewBox="0 0 96 64"><rect width="96" height="64" rx="10" '
    'fill="#e0f2fe"/><circle cx="20" cy="32" r="10" fill="#38bdf8"/>'
    '<rect x="36" y="24" width="44" height="16" rx="5" fill="#0284c7"/></svg>'
)
INLINE_BADGE_SVG = (
    "data:image/svg+xml;utf8," + _encode_uri_component(_INLINE_BADGE_SVG_MARKUP)
)


def _labeled_image(label, image_node):
    return stack(
        [
            text(text=label, fontSize=14, fill="#1f2937"),
            image_node,
        ],
        dir="y",
        spacing=8,
        alignment="start",
    )


def story_size_resolution():
    return (
        spread(
            [
                _labeled_image(
                    "data URI (intrinsic 96x64)", image(href=INLINE_BADGE_SVG)
                ),
                _labeled_image(
                    "asset 1 (w+h 110x110)",
                    image(href=BOTTLE_JPG, w=110, h=110),
                ),
                _labeled_image(
                    "asset 2 (w+h 160x100)",
                    image(href=BOTTLE_PHOTO_PNG, w=160, h=100),
                ),
                _labeled_image(
                    "asset 3 (w+h 110x140)",
                    image(href=FLOWER_PNG, w=110, h=140),
                ),
                _labeled_image(
                    "asset 1 (w only 90)", image(href=BOTTLE_JPG, w=90)
                ),
            ],
            dir="x",
            spacing=36,
            alignment="start",
        ),
        {"w": 960, "h": 260},
    )
