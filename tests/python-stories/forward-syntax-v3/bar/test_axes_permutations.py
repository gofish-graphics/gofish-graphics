"""Equivalent of BarAxesPermutations.stories.tsx — Forward Syntax V3/Bar/Axes Permutations."""

from gofish import chart, spread, rect
from python_stories.data import SEAFOOD


def _bar(axes):
    # axes is a CHART-level option only, mirroring the current
    # BarAxesPermutations.stories.tsx (`Chart(seafood, { axes })` with a plain
    # `spread({ by, dir })`). A per-operator override on the spread would
    # claim the axes a second time and draw them twice.
    return (
        chart(SEAFOOD, axes=axes)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count"))
    )


def _story(axes):
    return (_bar(axes), {"w": 400, "h": 400})


def story_axes_true():
    return _story(True)


def story_axes_false():
    return _story(False)


def story_axes_xytrue():
    return _story({"x": True, "y": True})


def story_axes_xonly():
    return _story({"x": True, "y": False})


def story_axes_yonly():
    return _story({"x": False, "y": True})


def story_axes_xyfalse():
    return _story({"x": False, "y": False})


def story_axes_xonly_undefined_y():
    return _story({"x": True})


def story_axes_yonly_undefined_x():
    return _story({"y": True})


def story_axes_custom_xtitle():
    return _story({"x": {"title": "Custom X Title"}, "y": True})


def story_axes_suppressed_title():
    return _story({"x": {"title": False}, "y": True})


# labelAngle (#746): a nested grouped bar chart (city, then year) at a small
# thumbnail size, where the unrotated category labels would collide under the
# bars. Two-tier x axis: labelAngle applies to both the inner (year) and
# outer (city) label rows.
CITY_YEAR = [
    {"city": "Austin", "year": "2022", "visitors": 42},
    {"city": "Austin", "year": "2023", "visitors": 58},
    {"city": "Austin", "year": "2024", "visitors": 71},
    {"city": "Boston", "year": "2022", "visitors": 55},
    {"city": "Boston", "year": "2023", "visitors": 49},
    {"city": "Boston", "year": "2024", "visitors": 63},
    {"city": "Chicago", "year": "2022", "visitors": 38},
    {"city": "Chicago", "year": "2023", "visitors": 44},
    {"city": "Chicago", "year": "2024", "visitors": 51},
]


def _grouped_bar(label_angle):
    return (
        chart(CITY_YEAR, axes={"x": {"labelAngle": label_angle}})
        .flow(
            spread(by="city", dir="x", spacing=24),
            spread(by="year", dir="x", spacing=0),
        )
        .mark(rect(h="visitors", fill="year")),
        {"w": 300, "h": 210},
    )


def story_grouped_label_angle45():
    return _grouped_bar(45)


def story_grouped_label_angle90():
    return _grouped_bar(90)
