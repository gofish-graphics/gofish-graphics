"""Equivalent of SpreadBaseline.stories.tsx — Forward Syntax/Spread Baseline."""

from gofish import chart, spread, rect, text, field, Baseline, Color

LINES = [
    "a spread places its children with a gap between them",
    "each row of the table is a spread of words",
    "the parent lines up every spread on its own zero",
    "we wanted a spread that keeps its gaps",
    "inside a spread the order of the parts is the data order",
    "unlike a stack a spread does not glue",
]
KEYWORD = "spread"


def _words():
    out = []
    for l, line in enumerate(LINES):
        ws = line.split(" ")
        k = ws.index(KEYWORD)
        for i, word in enumerate(ws):
            out.append(
                {
                    "line": l,
                    "at": i - k,
                    "word": word,
                    "role": "keyword" if i == k else "context",
                }
            )
    return out


WORDS = _words()

BANDS = [
    ("0-4", 9.6, 10.0),
    ("5-9", 9.9, 10.3),
    ("10-14", 10.4, 10.8),
    ("15-19", 10.5, 10.9),
    ("20-24", 10.6, 11.0),
    ("25-29", 11.2, 11.6),
    ("30-34", 11.0, 11.2),
    ("35-39", 10.9, 10.8),
    ("40-44", 10.1, 9.9),
    ("45-49", 10.1, 9.8),
    ("50-54", 10.6, 10.3),
    ("55-59", 11.0, 10.4),
    ("60-64", 10.6, 9.8),
    ("65-69", 9.2, 8.2),
    ("70-74", 7.6, 6.6),
    ("75-79", 5.3, 4.3),
    ("80-84", 3.4, 2.5),
    ("85+", 3.9, 2.2),
]
POPULATION = [
    row
    for age, women, men in BANDS
    for row in (
        {"age": age, "part": "Women", "people": women},
        {"age": age, "part": "Age", "people": 0},
        {"age": age, "part": "Men", "people": men},
    )
]

BARS = [
    {"row": row, "part": f"p{i}", "w": w}
    for row, ws in [("a", [30, 10, 20]), ("b", [10, 50]), ("c", [25, 25, 25, 5])]
    for i, w in enumerate(ws)
]


def story_concordance():
    return (
        chart(
            WORDS,
            color=Color.palette({"keyword": "#c0392b", "context": "#333333"}),
            axes=False,
            legend=False,
            w=520,
            h=150,
        )
        .flow(
            spread(by="line", dir="y", spacing=6),
            spread(by="at", dir="x", spacing=4, baseline=Baseline.at(0, 0.5)),
        )
        .mark(text(text="word", font_size=13, fill="role")),
        {},
    )


def _age_or_bar(d):
    if d[0]["part"] == "Age":
        # A column 40 px wide, the label centered in it.
        return spread(
            [
                rect(w=40, h=0, fill="none"),
                text(text=d[0]["age"], font_size=11),
            ],
            dir="y",
            spacing=0,
            alignment="middle",
        )
    return rect(w="people", fill="part")(d)


def story_pyramid_with_age_labels():
    return (
        chart(
            POPULATION,
            color=Color.palette({"Women": "#c05780", "Men": "#3b75af"}),
            axes=False,
            w=480,
            h=440,
        )
        .flow(
            spread(by=field("age").reverse(), dir="y", spacing=1),
            spread(by="part", dir="x", spacing=6, baseline=Baseline.at("Age", 0.5)),
        )
        .mark(_age_or_bar),
        {},
    )


def _rows_with(baseline):
    return (
        chart(BARS, axes={"x": False, "y": True}, legend=False, w=300, h=110)
        .flow(
            spread(by="row", dir="y", spacing=6),
            spread(by="part", dir="x", spacing=4, baseline=baseline),
        )
        .mark(rect(w="w", fill="part")),
        {},
    )


def story_rows_at_start():
    return _rows_with(Baseline.start())


def story_rows_at_middle():
    return _rows_with(Baseline.middle())


def story_rows_at_end():
    return _rows_with(Baseline.end())
