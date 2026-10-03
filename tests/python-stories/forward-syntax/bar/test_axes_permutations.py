"""Equivalent of BarAxesPermutations.stories.tsx — Forward Syntax/Bar/Axes Permutations."""

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


# label_angle (#746): a nested grouped bar chart (city, then year) at a small
# thumbnail size, where the unrotated category labels would collide under the
# bars. Two-tier x axis: label_angle applies to both the inner (year) and
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


def _x_axis(label_angle):
    return {"x": {} if label_angle is None else {"label_angle": label_angle}}


def _grouped_bar(label_angle, w=300):
    return (
        chart(CITY_YEAR, axes=_x_axis(label_angle))
        .flow(
            spread(by="city", dir="x", spacing=24),
            spread(by="year", dir="x", spacing=0),
        )
        .mark(rect(h="visitors", fill="year")),
        {"w": w, "h": 210},
    )


def story_grouped_label_angle45():
    return _grouped_bar(45)


def story_grouped_label_angle90():
    return _grouped_bar(90)


# Per-tier label_angle array: [45]/[90] rotates only the innermost (year) row,
# leaving the outer (city) row upright.
def story_grouped_label_angle_inner45():
    return _grouped_bar([45])


def story_grouped_label_angle_inner90():
    return _grouped_bar([90])


# The same grouped bar chart with no label_angle: the unrotated baseline.
def story_grouped_label_angle_none():
    return _grouped_bar(None)


# label_angle "auto" (#486) chooses each label row (inner and outer tier) on its
# own: the first of 0, 45, 90 degrees at which no two labels in the row collide,
# across the whole chart. Each story names the inner and outer angles.
def story_grouped_label_angle_auto0():
    return _grouped_bar("auto", w=400)


def story_grouped_label_angle_auto_inner45_outer0():
    return _grouped_bar("auto", w=250)


# "Inner labels are often too long": product names under region groups.
REGION_PRODUCT = [
    {"region": region, "product": product, "sales": 30 + ((i * 17 + j * 11) % 40)}
    for i, product in enumerate(["Laptops", "Smartphones", "Accessories", "Wearables"])
    for j, region in enumerate(["North", "South", "West"])
]


def _grouped_products(w):
    return (
        chart(REGION_PRODUCT, axes={"x": {"label_angle": "auto"}})
        .flow(
            spread(by="region", dir="x", spacing=24),
            spread(by="product", dir="x", spacing=0),
        )
        .mark(rect(h="sales", fill="product")),
        {"w": w, "h": 210},
    )


def story_grouped_label_angle_auto_long0():
    return _grouped_products(900)


def story_grouped_label_angle_auto_long_inner45_outer0():
    return _grouped_products(400)


def story_grouped_label_angle_auto_long_inner90_outer0():
    return _grouped_products(220)


# The products collide at every angle: that row is hidden and the color legend
# names them; the regions stay upright.
def story_grouped_label_angle_auto_inner_hidden_outer0():
    return _grouped_products(90)


# The same, colored by region, so no legend names the products (warns).
def story_grouped_label_angle_auto_inner_hidden_no_legend():
    return (
        chart(REGION_PRODUCT, axes={"x": {"label_angle": "auto"}})
        .flow(
            spread(by="region", dir="x", spacing=24),
            spread(by="product", dir="x", spacing=0),
        )
        .mark(rect(h="sales", fill="region")),
        {"w": 90, "h": 210},
    )


# Horizontal grouped bars: an ordinal y axis with "auto" (both rows 0 degrees).
def story_grouped_horizontal_label_angle_auto0():
    return (
        chart(REGION_PRODUCT, axes={"y": {"label_angle": "auto"}})
        .flow(
            spread(by="region", dir="y", spacing=16),
            spread(by="product", dir="y", spacing=0),
        )
        .mark(rect(w="sales", fill="product")),
        {"w": 300, "h": 400},
    )
