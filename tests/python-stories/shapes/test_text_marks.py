"""Equivalent of shapes/TextMarks.stories.tsx — Shapes/Text Marks.

Text mark layout: spreads of styled text labels (vertical, middle-aligned,
horizontal) plus a text mark spread against an ellipse. JS `For(...)` is
array-map sugar and becomes a list comprehension. The JS stories pass
`textAnchor: "start"` to text(), but it is a no-op in JS (the renderer
hardcodes "start") and is not an IR field, so it is omitted here.
PolarText is exempt (raw JS coordinate-transform closure).
"""

from gofish import ellipse, spread, text

FONT_FAMILY = "Inter, sans-serif"

LABELS = [
    {"text": "GoFish", "color": "#22577a"},
    {"text": "Text", "color": "#38a3a5"},
    {"text": "Stacky", "color": "#57cc99"},
    {"text": "Mark", "color": "#80ed99"},
]


def _label_texts():
    return [
        text(
            text=label["text"],
            fill=label["color"],
            fontSize=28,
            fontFamily=FONT_FAMILY,
            debugBoundingBox=True,
        )
        for label in LABELS
    ]


def story_text_stack():
    return (
        spread(_label_texts(), dir="y", spacing=18, alignment="start"),
        {"w": 500, "h": 240},
    )


def story_text_stack_middle_alignment():
    return (
        spread(_label_texts(), dir="y", spacing=18, alignment="middle"),
        {"w": 500, "h": 240},
    )


def story_text_stack_horizontal():
    return (
        spread(_label_texts(), dir="x", spacing=18, alignment="start"),
        {"w": 500, "h": 240},
    )


def story_text_stack_with_ellipse():
    return (
        spread(
            [
                ellipse(w=10, h=10, fill="red"),
                text(text="Mercury"),
            ],
            dir="y",
            spacing=60,
            alignment="middle",
        ),
        {"w": 500, "h": 240},
    )
