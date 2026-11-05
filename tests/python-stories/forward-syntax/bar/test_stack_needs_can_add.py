"""Equivalent of StackNeedsCanAdd.stories.tsx — Forward Syntax/Bar/Stack Needs CanAdd.

CelsiusRefused is exempt (see tests/.python-sync-exempt): its JS story shows
the error GoFish throws, which a Python spec cannot reproduce.
"""

from gofish import chart, spread, stack, rect, Unit, Trait

CITIES = [
    {"month": "Jun", "city": "Boston", "temp": 21, "usd": 120},
    {"month": "Jun", "city": "Chicago", "temp": 22, "usd": 95},
    {"month": "Jul", "city": "Boston", "temp": 24, "usd": 135},
    {"month": "Jul", "city": "Chicago", "temp": 25, "usd": 110},
    {"month": "Aug", "city": "Boston", "temp": 23, "usd": 150},
    {"month": "Aug", "city": "Chicago", "temp": 24, "usd": 128},
]

SCHEMA = {
    "temp": Unit("°C"),
    "usd": Unit("USD", traits=[Trait.summable()]),
}


def story_no_schema():
    return (
        chart(CITIES, w=460, h=300)
        .flow(
            spread(by="month", dir="x"),
            stack(by="city", dir="y"),
        )
        .mark(rect(h="temp", fill="city")),
        {},
    )


def story_usd_stacks():
    return (
        chart(CITIES, schema=SCHEMA, w=460, h=300)
        .flow(
            spread(by="month", dir="x"),
            stack(by="city", dir="y"),
        )
        .mark(rect(h="usd", fill="city")),
        {},
    )
