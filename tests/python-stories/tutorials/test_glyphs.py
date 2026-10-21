"""Equivalent of tutorials/Glyphs.stories.tsx — Tutorials/Glyphs.

The finished example of the Glyphs tutorial. A glyph is a plain function that
returns a `layer` of shapes; here it is handed to `.mark()`, so the chart
draws one composite marker per row instead of a single built-in mark.
"""

from gofish import chart, ellipse, layer, rect, scatter, text

STATIONS = [
    {"id": "AB", "x": 12, "y": 46, "color": "#e63946"},
    {"id": "CD", "x": 38, "y": 22, "color": "#457b9d"},
    {"id": "EF", "x": 55, "y": 61, "color": "#2a9d8f"},
    {"id": "GH", "x": 78, "y": 35, "color": "#e9a13b"},
    {"id": "IJ", "x": 92, "y": 70, "color": "#8e6bbf"},
]


def marker(d):
    return layer(
        [
            ellipse(cx=0, cy=0, w=34, h=34, fill=d["color"]),
            ellipse(cx=0, cy=0, w=18, h=18, fill="white"),
            rect(cx=0, cy=0, w=8, h=8, fill=d["color"]),
            text(cx=32, cy=0, text=d["id"], font_size=14, fill="#333"),
        ]
    )


def story_glyphs():
    return (
        chart(STATIONS, axes=False)
        .flow(scatter(by="id", x="x", y="y"))
        .mark(lambda d: marker(d[0])),
        {"w": 260, "h": 170},
    )
