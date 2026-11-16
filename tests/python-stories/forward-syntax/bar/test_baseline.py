"""Equivalent of Baseline.stories.tsx — Forward Syntax/Bar/Baseline."""

from gofish import chart, spread, stack, rect, Unit, Domain, Baseline, Color
from python_stories.data import SEAFOOD

LEVELS = [
    "Strongly disagree",
    "Disagree",
    "Neutral",
    "Agree",
    "Strongly agree",
]
LIKERT_COLORS = Color.palette(
    {
        "Strongly disagree": "#ca0020",
        "Disagree": "#f4a582",
        "Neutral": "#d9d9d9",
        "Agree": "#92c5de",
        "Strongly agree": "#0571b0",
    }
)

SURVEY = [
    {"question": question, "response": LEVELS[i], "count": count}
    for question, counts in [
        ("The docs are clear", [12, 22, 38, 86, 42]),
        ("The API is easy to learn", [26, 48, 50, 54, 22]),
        ("Error messages are helpful", [58, 64, 36, 30, 12]),
        ("Charts render fast enough", [8, 18, 44, 80, 50]),
        # Nobody strongly disagreed: no row for that level.
        ("I would recommend it", [0, 9, 27, 78, 86]),
    ]
    for i, count in enumerate(counts)
    if count != 0
]


def story_at_neutral():
    return (
        chart(
            SURVEY,
            schema={"response": Unit(domain=Domain.discrete(LEVELS))},
            color=LIKERT_COLORS,
            axes={"x": {"title": "Respondents"}, "y": True},
            w=640,
            h=300,
        )
        .flow(
            spread(by="question", dir="y"),
            stack(by="response", dir="x", baseline=Baseline.at("Neutral", 0.5)),
        )
        .mark(rect(w="count", fill="response")),
        {},
    )


def story_middle():
    return (
        chart(SEAFOOD, w=400, h=400)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y", baseline=Baseline.middle()),
        )
        .mark(rect(h="count", fill="species")),
        {},
    )


def story_end():
    return (
        chart(SEAFOOD, w=400, h=400)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y", baseline=Baseline.end()),
        )
        .mark(rect(h="count", fill="species")),
        {},
    )
