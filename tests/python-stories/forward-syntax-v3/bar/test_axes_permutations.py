"""Equivalent of BarAxesPermutations.stories.tsx — Forward Syntax V3/Bar/Axes Permutations."""

from gofish import chart, spread, rect
from python_stories.data import SEAFOOD


def _bar(axes):
    # axes is both a chart option and a per-operator override on the spread,
    # mirroring BarAxesPermutations.stories.tsx (`Chart(seafood, { axes })`
    # + `spread({ by, dir, axes })`).
    return (
        chart(SEAFOOD).flow(spread(by="lake", dir="x", axes=axes)).mark(rect(h="count"))
    )


def _story(axes):
    return (_bar(axes), {"w": 400, "h": 400, "axes": axes})


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
