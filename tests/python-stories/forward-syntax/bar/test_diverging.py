"""Equivalent of Diverging.stories.tsx — Forward Syntax/Bar/Diverging."""

from gofish import chart, spread, stack, rect, field, palette, Schema

LEVELS = [
    "Strongly disagree",
    "Disagree",
    "Neutral",
    "Agree",
    "Strongly agree",
]
LIKERT_COLORS = palette(
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

LEVELS4 = ["Strongly disagree", "Disagree", "Agree", "Strongly agree"]

FORCED_CHOICE = [
    {"question": question, "response": LEVELS4[i], "count": count}
    for question, counts in [
        ("The docs are clear", [16, 34, 90, 60]),
        ("The API is easy to learn", [40, 60, 70, 30]),
        ("Error messages are helpful", [70, 70, 44, 16]),
        ("I would recommend it", [8, 22, 80, 90]),
    ]
    for i, count in enumerate(counts)
]

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
        {"age": age, "sex": "Women", "people": women},
        {"age": age, "sex": "Men", "people": men},
    )
]


def story_likert():
    return (
        chart(
            SURVEY,
            schema={"response": Schema.ordered(LEVELS).diverging()},
            color=LIKERT_COLORS,
            axes={"x": {"title": "Respondents"}, "y": True},
        )
        .flow(
            spread(by="question", dir="y"),
            stack(by="response", dir="x"),
        )
        .mark(rect(w="count", fill="response")),
        {"w": 640, "h": 300},
    )


def story_likert_even():
    return (
        chart(
            FORCED_CHOICE,
            schema={"response": Schema.ordered(LEVELS4).diverging()},
            color=LIKERT_COLORS,
            axes={"x": {"title": "Respondents"}, "y": True},
        )
        .flow(
            spread(by="question", dir="y"),
            stack(by="response", dir="x"),
        )
        .mark(rect(w="count", fill="response")),
        {"w": 640, "h": 260},
    )


def story_population_pyramid():
    return (
        chart(
            POPULATION,
            schema={"sex": Schema.ordered(["Women", "Men"]).diverging()},
            color=palette({"Women": "#c05780", "Men": "#3b75af"}),
            axes={"x": {"title": "People (millions)"}, "y": True},
        )
        .flow(
            spread(by=field("age").reverse(), dir="y", spacing=1),
            stack(by="sex", dir="x"),
        )
        .mark(rect(w="people", fill="sex")),
        {"w": 480, "h": 440},
    )
