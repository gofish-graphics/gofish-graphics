"""Strategy families (#1013): one module per family, bound in the package
under its capitalized name, with no flat top-level copies."""

import importlib
import math

import pytest

import gofish

from ._ir import ir
from gofish import Bin, Calendar, Coord, Curve, Overlap, Tile, field, line, ribbon, scatter, chart, circle

FAMILIES = {
    "Color": ("color", ["palette", "gradient"]),
    "Coord": ("coord", ["polar", "clock", "wavy", "geo"]),
    "Curve": (
        "curve",
        [
            "linear",
            "step",
            "monotone",
            "smooth",
            "catmull_rom",
            "bezier",
            "orthogonal",
            "arc",
            "perfect_arrows",
        ],
    ),
    "Overlap": ("overlap", ["separate", "noise", "sina", "jitter"]),
    "Tile": ("tile", ["squarify", "slice", "dice", "binary", "slice_dice"]),
    "Bin": ("bin", ["step", "thresholds", "hex", "voronoi"]),
    "Calendar": (
        "calendar",
        ["second", "minute", "hour", "day", "weekday", "week", "month", "quarter", "year"],
    ),
}


@pytest.mark.parametrize("namespace", sorted(FAMILIES))
def test_namespace_is_the_family_module(namespace):
    module_name, members = FAMILIES[namespace]
    module = importlib.import_module(f"gofish.{module_name}")
    assert getattr(gofish, namespace) is module
    assert namespace in gofish.__all__
    for member in members:
        assert getattr(module, member) is getattr(getattr(gofish, namespace), member)
        # One home per strategy: no flat top-level copy.
        assert member not in gofish.__all__


def test_member_import_from_the_family_module():
    from gofish.overlap import separate

    assert separate is gofish.Overlap.separate
    assert separate(padding=1) == {"kind": "separate", "padding": 1}


def test_coords_are_type_tagged_configs_on_the_wire():
    assert Coord.wavy() == {"type": "wavy"}
    # The projection is positional, as in JS `geo(projection, opts)`.
    assert Coord.geo("equalEarth", lon=(-170, -30), lat=(-60, 75)) == {
        "type": "geo",
        "projection": "equalEarth",
        "lon": [-170, -30],
        "lat": [-60, 75],
    }
    assert Coord.geo("mercator") == {"type": "geo", "projection": "mercator"}
    assert Coord.polar(inner_radius=0.5, center=(1, 2)) == {
        "type": "polar",
        "innerRadius": 0.5,
        "center": [1, 2],
    }


def test_coord_params_are_positional_or_keyword_as_in_js():
    # JS `geo(projection, opts)` and `polar(opts)`: the projection is
    # positional-only, every other option keyword-only.
    with pytest.raises(TypeError, match="positional-only"):
        Coord.geo(projection="mercator")
    with pytest.raises(TypeError, match="positional argument"):
        Coord.geo("mercator", (-170, -30))
    with pytest.raises(TypeError, match="positional argument"):
        Coord.polar(0.5)


def test_curves_are_calls_on_the_wire():
    assert Curve.monotone() == {"kind": "monotone"}
    assert Curve.catmull_rom() == {"kind": "catmullRom"}
    assert Curve.arc(direction="down") == {"kind": "arc", "direction": "down"}
    # Param keys are snake_case in Python; the option renames them to the
    # camelCase wire keys.
    assert Curve.perfect_arrows(bow=0.3, pad_end=4) == {
        "kind": "perfectArrows",
        "bow": 0.3,
        "pad_end": 4,
    }
    assert ir(line(curve=Curve.perfect_arrows(pad_end=4)))["curve"] == {
        "kind": "perfectArrows",
        "padEnd": 4,
    }
    assert ir(line(curve=Curve.step()))["curve"] == {"kind": "step"}
    assert ir(ribbon(curve=Curve.bezier()))["curve"] == {"kind": "bezier"}
    with pytest.raises(TypeError, match="'swoop'"):
        line(curve={"kind": "swoop"})
    with pytest.raises(TypeError, match="did you mean 'pad_end'"):
        line(curve={"kind": "perfectArrows", "padEnd": 4})


def test_strategy_modules_are_generated():
    # gofish/<family>.py for the strategy families and Coord is written by
    # scripts/generate.ts from the gofish-ir STRATEGIES and COORDS tables.
    for module_name in ("tile", "overlap", "curve", "bin", "calendar", "coord"):
        module = importlib.import_module(f"gofish.{module_name}")
        with open(module.__file__) as f:
            assert f.readline().startswith("# GENERATED")


# The generated factories check each param at the call, from its type in the
# STRATEGIES table: ValueError for a value of the right Python type that is out
# of range, TypeError for a wrong type or an unknown kwarg.
BAD_VALUES = [
    (lambda: Tile.squarify(ratio=0.5), "Tile.squarify(ratio=...) must be >= 1, got 0.5"),
    (lambda: Tile.squarify(ratio=float("nan")), "must not be NaN"),
    (lambda: Overlap.separate(padding=-1), "Overlap.separate(padding=...) must be >= 0, got -1"),
    (lambda: Overlap.separate(padding=math.inf), "must be finite, got inf"),
    (lambda: Overlap.noise(randomness="pink"), "Overlap.noise(randomness=...) must be one of"),
    (lambda: Overlap.noise(smoothing=-1), "must be >= 0"),
    (lambda: Overlap.noise(smoothing=float("nan")), "must not be NaN"),
    (lambda: Overlap.noise(smoothing="scott"), 'must be a number >= 0 or "silverman"'),
    (lambda: Overlap.noise(seed=math.inf), "Overlap.noise(seed=...) must be finite"),
    # A preset checks the params the caller passes, as its base kind does.
    (lambda: Overlap.sina(randomness="pink"), "Overlap.sina(randomness=...)"),
    (lambda: Overlap.jitter(padding=-2), "Overlap.jitter(padding=...) must be >= 0"),
    (lambda: Curve.arc(direction="left"), "Curve.arc(direction=...) must be one of"),
    (lambda: Curve.orthogonal(bend="always"), 'must be "auto"'),
    (lambda: Curve.perfect_arrows(bow=float("nan")), "Curve.perfect_arrows(bow=...)"),
    (lambda: Bin.thresholds(0), "Bin.thresholds(thresholds) must be >= 1, got 0"),
    (lambda: Bin.thresholds([]), "Bin.thresholds(thresholds) must have at least 1 item, got []"),
    (lambda: Coord.geo("robinson"), 'Coord.geo(projection) must be one of "equalEarth", "mercator"'),
    (lambda: Coord.polar(center=(1, 2, 3)), "Coord.polar(center=...) must have 2 items"),
    (lambda: Coord.geo("mercator", lat=(0, float("nan"))), "Coord.geo(lat=...)[1] must not be NaN"),
]

WRONG_TYPES = [
    (lambda: Tile.squarify(ratio="2"), "Tile.squarify(ratio=...) must be a number >= 1, got str"),
    (lambda: Overlap.separate(padding=True), "got bool"),
    (lambda: Overlap.noise(seed="1"), "Overlap.noise(seed=...) must be a finite number, got str"),
    (lambda: Overlap.noise(smoothing=[1]), "got list"),
    (lambda: Overlap.noise(randomness=1), "got int"),
    (lambda: Curve.arc(direction=3), 'Curve.arc(direction=...) must be one of "up", "down", got int'),
    (lambda: Curve.perfect_arrows(flip="yes"), "Curve.perfect_arrows(flip=...) must be a bool, got str"),
    (lambda: Curve.perfect_arrows(pad_end="4"), "must be a number, got str"),
    (lambda: Bin.thresholds(2.5), "Bin.thresholds(thresholds) must be a whole number >= 1 or a list"),
    # A required param is required: None is not a value of it.
    (lambda: Bin.step(None), "Bin.step(size) must be a finite number > 0, got NoneType"),
    (lambda: Bin.thresholds(None), "Bin.thresholds(thresholds) must be a whole number >= 1"),
    (lambda: Bin.hex(radius=None), "Bin.hex(radius=...) must be a finite number > 0 or a dict"),
    (lambda: Bin.voronoi(seeds=None), "Bin.voronoi(seeds=...) must be a table"),
    (lambda: Coord.geo(None), "Coord.geo(projection) must be one of"),
    (lambda: Coord.polar(inner_radius="0.5"), "Coord.polar(inner_radius=...) must be a number, got str"),
    (lambda: Coord.geo("mercator", lon="-170"), "Coord.geo(lon=...) must be a list or tuple of 2 items"),
]

UNKNOWN_KWARGS = [
    lambda: Tile.slice(ratio=2),
    lambda: Overlap.separate(randomness="blue"),
    lambda: Overlap.sina(bandwidth=1),
    lambda: Curve.perfect_arrows(padEnd=4),
]


@pytest.mark.parametrize("call, message", BAD_VALUES)
def test_strategy_bad_value_is_a_value_error(call, message):
    with pytest.raises(ValueError) as e:
        call()
    assert message in str(e.value)


@pytest.mark.parametrize("call, message", WRONG_TYPES)
def test_strategy_wrong_type_is_a_type_error(call, message):
    with pytest.raises(TypeError) as e:
        call()
    assert message in str(e.value)


@pytest.mark.parametrize("call", UNKNOWN_KWARGS)
def test_strategy_unknown_kwarg_is_a_type_error(call):
    with pytest.raises(TypeError, match="unexpected keyword argument"):
        call()


def test_strategy_values_in_range_pass():
    assert Tile.squarify(ratio=1) == {"kind": "squarify", "ratio": 1}
    assert Overlap.separate(padding=0) == {"kind": "separate", "padding": 0}
    assert Overlap.noise(smoothing=math.inf)["smoothing"] == math.inf
    assert Overlap.noise(smoothing="silverman", seed=3, randomness="quasi")["seed"] == 3
    assert Curve.perfect_arrows(bow=-0.5, flip=True)["flip"] is True


# Bare kinds (#1133): a kind with no required option is a value as it is, and
# calling it sets options. The bare kind is its call with no arguments: equal,
# the same JSON, and the same wire form at the option it is passed to.
BARE = [
    (Curve, "monotone"),
    (Curve, "perfect_arrows"),
    (Tile, "squarify"),
    (Tile, "slice_dice"),
    (Overlap, "separate"),
    (Overlap, "jitter"),
    (Calendar, "month"),
    (Calendar, "week"),
]


@pytest.mark.parametrize("family, name", BARE)
def test_bare_kind_is_its_call(family, name):
    import json

    bare = getattr(family, name)
    assert bare == bare()
    assert json.dumps(bare) == json.dumps(bare())
    assert dict(bare) == bare()


def test_every_kind_without_a_required_option_is_bare():
    from gofish._strategy import StrategyKind

    for family in (Tile, Overlap, Curve, Calendar):
        for name in family.__all__:
            assert isinstance(getattr(family, name), StrategyKind), name
    # A kind with a required option is a function only.
    for name in Bin.__all__:
        assert not isinstance(getattr(Bin, name), dict), name


def test_bare_kind_wire_form_at_an_option():
    def wire(curve, overlap):
        return (
            chart([{"a": 1, "b": 2}])
            .flow(scatter(x="a", overlap=overlap))
            .mark(circle(r=2))
            .to_ir()["root"],
            ir(line(curve=curve)),
        )

    assert wire(Curve.monotone, Overlap.separate) == wire(
        Curve.monotone(), Overlap.separate()
    )
    assert ir(line(curve=Curve.perfect_arrows))["curve"] == {
        "kind": "perfectArrows"
    }
    assert dict(field("d").bin(Calendar.month)) == dict(field("d").bin(Calendar.month()))


def test_bare_kind_errors_name_its_options():
    with pytest.raises(AttributeError, match=r"Curve\.arc\(direction=\.\.\.\)"):
        Curve.arc.bend
    with pytest.raises(TypeError, match=r"Curve\.arc: .*direction=\.\.\."):
        Curve.arc(bend="auto")


def test_a_param_that_is_a_value_of_another_family_is_checked_by_its_kind():
    # Animation.tween's `curve` is a Curve value: checked by its tag against
    # the Curve family's kinds, at the call.
    from gofish import animation

    assert animation.tween(curve=Curve.monotone) == {"kind": "tween", "curve": {"kind": "monotone"}}
    with pytest.raises(TypeError, match="must be a Curve value"):
        animation.tween(curve="monotone")
    with pytest.raises(ValueError, match="must be a Curve value"):
        animation.tween(curve={"kind": "squarify"})


def test_a_list_branch_of_an_option_union_renames_its_items():
    # `.transition(enter=[...])` is an Animation or a list of them; each item
    # of the list is renamed to wire keys like the single value is.
    from gofish import animation
    from gofish._generated import _OPTION_TYPES, _to_wire

    shape = _OPTION_TYPES["MarkTransition"]
    one = _to_wire(shape, {"enter": animation.wipe(from_="top")}, "t")
    many = _to_wire(shape, {"enter": [animation.wipe(from_="top"), animation.fade_in]}, "t")
    assert one == {"enter": {"kind": "wipe", "from": "top"}}
    assert many == {"enter": [{"kind": "wipe", "from": "top"}, {"kind": "fadeIn"}]}
