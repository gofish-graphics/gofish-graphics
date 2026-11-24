"""Strategy families (#1013): one module per family, bound in the package
under its capitalized name, with no flat top-level copies."""

import importlib
import math

import pytest

import gofish

from ._ir import ir
from gofish import Binning, Calendar, Constraint, Coord, Curve, Overlap, Placement, Shape, Slack, Spacing, Tiling, chunk, field, fr, line, ribbon, scatter, chart, circle, percent, select_all

FAMILIES = {
    "Color": ("color", ["palette", "gradient"]),
    "Domain": ("domain", ["discrete"]),
    "Trait": ("trait", ["ordered", "diverging", "summable"]),
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
    "Effect": ("effect", ["grayscale", "luminance_to_alpha"]),
    "Shape": ("shape", ["box", "oval", "fillet", "blob", "hull", "spine"]),
    "Placement": ("placement", ["around", "along", "start", "end", "interior"]),
    "Spacing": ("spacing", ["box", "pitch"]),
    "Tiling": ("tiling", ["squarify", "slice", "dice", "binary", "voronoi"]),
    "Binning": ("binning", ["step", "thresholds", "quantiles", "hex", "voronoi"]),
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


# The families whose modules are written by hand: Color's scales are not in
# the gofish-ir STRATEGIES table, and a Domain or Trait value never reaches
# the wire (`Unit` turns it into the trait it declares).
HAND_WRITTEN = {"Color", "Domain", "Trait"}


def test_strategy_modules_are_generated():
    # gofish/<family>.py for the strategy families and Coord is written by
    # scripts/generate.ts from the gofish-ir STRATEGIES and COORDS tables.
    for namespace, (module_name, _) in FAMILIES.items():
        if namespace in HAND_WRITTEN:
            continue
        module = importlib.import_module(f"gofish.{module_name}")
        with open(module.__file__) as f:
            assert f.readline().startswith("# GENERATED")


# The generated factories check each param at the call, from its type in the
# STRATEGIES table: ValueError for a value of the right Python type that is out
# of range, TypeError for a wrong type or an unknown kwarg.
BAD_VALUES = [
    (lambda: Tiling.squarify(ratio=0.5), "Tiling.squarify(ratio=...) must be >= 1, got 0.5"),
    (lambda: Tiling.squarify(ratio=float("nan")), "must not be NaN"),
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
    (lambda: Binning.thresholds(0), "Binning.thresholds(thresholds) must be >= 1, got 0"),
    (lambda: Binning.thresholds([]), "Binning.thresholds(thresholds) must have at least 1 item, got []"),
    (lambda: Binning.quantiles(0), "Binning.quantiles(quantiles) must be >= 1, got 0"),
    (lambda: Binning.quantiles([0.5, 1]), "Binning.quantiles(quantiles) item must be < 1, got 1"),
    (lambda: Binning.quantiles([0, 0.5]), "Binning.quantiles(quantiles) item must be > 0, got 0"),
    (
        lambda: Binning.quantiles([0.5, 0.5]),
        "Binning.quantiles(quantiles) must not hold an item twice, got [0.5, 0.5]",
    ),
    (lambda: Coord.geo("robinson"), 'Coord.geo(projection) must be one of "equalEarth", "mercator"'),
    (lambda: Coord.polar(center=(1, 2, 3)), "Coord.polar(center=...) must have 2 items"),
    (lambda: Coord.geo("mercator", lat=(0, float("nan"))), "Coord.geo(lat=...)[1] must not be NaN"),
    (lambda: Spacing.pitch(20, at="center"), 'Spacing.pitch(at=...) must be one of "start", "middle"'),
    (lambda: Spacing.box(float("nan")), "Spacing.box(gap) must be finite, got nan"),
    (lambda: Spacing.pitch(float("inf")), "Spacing.pitch(distance) must be finite, got inf"),
]

WRONG_TYPES = [
    (lambda: Tiling.squarify(ratio="2"), "Tiling.squarify(ratio=...) must be a number >= 1, got str"),
    (lambda: Overlap.separate(padding=True), "got bool"),
    (lambda: Overlap.noise(seed="1"), "Overlap.noise(seed=...) must be a finite number, got str"),
    (lambda: Overlap.noise(smoothing=[1]), "got list"),
    (lambda: Overlap.noise(randomness=1), "got int"),
    (lambda: Curve.arc(direction=3), 'Curve.arc(direction=...) must be one of "up", "down", got int'),
    (lambda: Curve.perfect_arrows(flip="yes"), "Curve.perfect_arrows(flip=...) must be a bool, got str"),
    (lambda: Curve.perfect_arrows(pad_end="4"), "must be a number, got str"),
    (lambda: Binning.thresholds(2.5), "Binning.thresholds(thresholds) must be a whole number >= 1 or a list"),
    # A required param is required: None is not a value of it.
    (lambda: Binning.step(None), "Binning.step(size) must be a finite number > 0, got NoneType"),
    (lambda: Binning.thresholds(None), "Binning.thresholds(thresholds) must be a whole number >= 1"),
    (lambda: Binning.hex(radius=None), "Binning.hex(radius=...) must be a finite number > 0 or a dict"),
    (lambda: Binning.voronoi(seeds=None), "Binning.voronoi(seeds=...) must be a table"),
    (lambda: Coord.geo(None), "Coord.geo(projection) must be one of"),
    (lambda: Coord.polar(inner_radius="0.5"), "Coord.polar(inner_radius=...) must be a number, got str"),
    (lambda: Coord.geo("mercator", lon="-170"), "Coord.geo(lon=...) must be a list or tuple of 2 items"),
    (lambda: Spacing.box("8"), "Spacing.box(gap) must be a finite number or a LengthValue, got str"),
    (lambda: Spacing.pitch(None), "Spacing.pitch(distance) must be a finite number or a LengthValue"),
    (lambda: Spacing.box({"type": "length", "percent": 5}), "Spacing.box(gap) must be a finite number or a LengthValue, got dict"),
]

UNKNOWN_KWARGS = [
    lambda: Tiling.slice(ratio=2),
    lambda: Overlap.separate(randomness="blue"),
    lambda: Overlap.sina(bandwidth=1),
    lambda: Curve.perfect_arrows(padEnd=4),
    lambda: Spacing.box(8, at="middle"),
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


# A preset fixes its values and takes only the options it does not fix, so a
# fixed one is a TypeError from its signature. Another value of it is the kind
# (``Overlap.noise(smoothing=3)``, ``Slack.at(0.3)``).
PRESET_FIXED = [
    lambda: Overlap.sina(smoothing=3),
    lambda: Overlap.jitter(randomness="blue"),
    lambda: Overlap.jitter(smoothing=0),
    lambda: Shape.hull(convexity=0.9),
    lambda: Shape.hull(neck=0.5),
    lambda: Shape.spine(convexity=0.2),
    lambda: Slack.start(t=0.3),
    lambda: Slack.center(t=0.3),
    lambda: Slack.end(t=0.3),
]


@pytest.mark.parametrize("call", PRESET_FIXED)
def test_preset_rejects_an_option_it_fixes(call):
    with pytest.raises(TypeError, match="unexpected keyword argument"):
        call()


def test_preset_takes_the_options_it_does_not_fix():
    assert Overlap.sina(randomness="quasi", padding=1, seed=2) == {
        "kind": "noise",
        "smoothing": "silverman",
        "randomness": "quasi",
        "padding": 1,
        "seed": 2,
    }
    assert Overlap.jitter(padding=1, seed=2) == {
        "kind": "noise",
        "randomness": "uniform",
        "smoothing": math.inf,
        "padding": 1,
        "seed": 2,
    }
    assert Shape.hull(connection=0.5, holes=True, separate=True) == {
        "kind": "blob",
        "convexity": 1,
        "neck": 1,
        "connection": 0.5,
        "holes": True,
        "separate": True,
    }
    assert Shape.spine(neck=0.5) == {"kind": "blob", "convexity": 0, "neck": 0.5}
    assert Slack.end() == Slack.at(1)


def test_strategy_values_in_range_pass():
    assert Tiling.squarify(ratio=1) == {"kind": "squarify", "ratio": 1}
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
    (Tiling, "squarify"),
    (Tiling, "voronoi"),
    (Overlap, "separate"),
    (Overlap, "jitter"),
    (Calendar, "month"),
    (Calendar, "week"),
    (Placement, "around"),
    (Placement, "interior"),
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

    for family in (Tiling, Overlap, Curve, Calendar, Placement):
        for name in family.__all__:
            assert isinstance(getattr(family, name), StrategyKind), name
    # A kind with a required option is a function only.
    for name in Binning.__all__:
        assert not isinstance(getattr(Binning, name), dict), name


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
    assert field("d").bin(Calendar.month) == field("d").bin(Calendar.month())


def test_bare_kind_errors_name_its_options():
    with pytest.raises(AttributeError, match=r"Curve\.arc\(direction=\.\.\.\)"):
        Curve.arc.bend
    with pytest.raises(TypeError, match=r"Curve\.arc: .*direction=\.\.\."):
        Curve.arc(bend="auto")


def test_placement_at_a_label_crosses_as_its_plain_object():
    spec = ir(
        line(stroke_width=2).label(
            "s",
            placement=Placement.along(at=0.6, side=["above", "below"], orient="sloped"),
            halo={"color": "#fafafa", "width": 2},
            background={"fill": "#eee", "padding": [3, 2]},
            font_weight=600,
        )
    )["label"][0]
    assert spec == {
        "accessor": "s",
        "placement": {
            "kind": "along",
            "at": 0.6,
            "side": ["above", "below"],
            "orient": "sloped",
        },
        "halo": {"color": "#fafafa", "width": 2},
        "background": {"fill": "#eee", "padding": [3, 2]},
        "fontWeight": 600,
    }
    # A bare kind is its call; a position string is as it was.
    assert ir(circle(r=3).label("c", placement=Placement.end))["label"][0][
        "placement"
    ] == {"kind": "end"}
    assert ir(circle(r=3).label("c", placement="center"))["label"][0][
        "placement"
    ] == "center"


def test_label_avoiding_is_a_node_selection():
    doc = (
        chart([{"c": "a", "x": 1, "y": 2}])
        .flow(scatter(by="c", x="x", y="y"))
        .mark(circle(r=4).label("c", avoiding=select_all("trend")))
        .to_ir()
    )
    assert doc["root"]["mark"]["label"][0]["avoiding"] == {
        "type": "select",
        "layer": "trend",
        "mode": "all",
    }


def test_label_halo_rejects_an_unknown_key():
    with pytest.raises(TypeError, match="halo"):
        circle(r=3).label("c", halo={"radius": 2})


# Spacing: a spread's (or a distribute's) `spacing` is a bare amount, which is
# `Spacing.box(amount)`, or a `Spacing` strategy.
def test_spacing_strategies_are_plain_dicts():
    assert Spacing.box(8) == {"kind": "box", "gap": 8}
    assert Spacing.pitch(30) == {"kind": "pitch", "distance": 30}
    assert Spacing.pitch(30, at="middle") == {
        "kind": "pitch",
        "distance": 30,
        "at": "middle",
    }
    assert Spacing.pitch(percent(10), at="end")["distance"] == {
        "type": "length",
        "percent": 10,
    }


def test_spacing_wire_form_at_spread():
    from gofish import rect, spread

    def spacing_of(spacing):
        return ir(spread([rect(w=10, h=10)], dir="x", spacing=spacing))["options"][
            "spacing"
        ]

    assert spacing_of(8) == 8
    assert spacing_of(percent(5)) == {"type": "length", "percent": 5}
    assert spacing_of(Spacing.box(8)) == {"kind": "box", "gap": 8}
    assert spacing_of(Spacing.pitch(36, at="baseline")) == {
        "kind": "pitch",
        "distance": 36,
        "at": "baseline",
    }
    assert spacing_of(Spacing.pitch(percent(20), at="middle")) == {
        "kind": "pitch",
        "distance": {"type": "length", "percent": 20},
        "at": "middle",
    }
    with pytest.raises(TypeError, match="unexpected value 'gap'"):
        spacing_of({"kind": "gap", "gap": 8})
    with pytest.raises(TypeError, match="unexpected key 'at'"):
        spacing_of({"kind": "box", "gap": 8, "at": "middle"})
    # A plain dict is a Spacing there: a length is a LengthValue, which
    # percent(n) and fr(k) build.
    with pytest.raises(TypeError, match="missing the key 'kind'"):
        spacing_of({"type": "length", "percent": 5})
    # A value of another named type's class is not a spacing.
    with pytest.raises(TypeError, match="missing the key 'kind'"):
        spacing_of(chunk(5))


def test_lengths_take_their_branch_by_class():
    """A LengthValue is a Length where the option takes one (spacing, a
    Spacing gap or distance, w/h) and is rejected where it does not."""
    from gofish import rect, spread

    for length, wire in [
        (percent(5), {"type": "length", "percent": 5}),
        (fr(2), {"type": "length", "fr": 2}),
        (percent(30) + 4, {"type": "length", "percent": 30, "px": 4}),
    ]:
        options = ir(
            spread([rect(w=10, h=10)], dir="x", spacing=length, w=length, h=length)
        )["options"]
        assert options["spacing"] == wire
        assert options["w"] == wire and options["h"] == wire
        box = ir(spread([rect(w=10, h=10)], dir="x", spacing=Spacing.box(length)))
        assert box["options"]["spacing"] == {"kind": "box", "gap": wire}
        pitch = ir(
            spread([rect(w=10, h=10)], dir="x", spacing=Spacing.pitch(length))
        )
        assert pitch["options"]["spacing"] == {"kind": "pitch", "distance": wire}
    with pytest.raises(TypeError, match="axes got an unexpected key 'type'"):
        spread([rect(w=10, h=10)], dir="x", axes=percent(10))


def test_distribute_spacing_is_spreads():
    """Constraint.distribute's spacing is spread's: the same values pass and
    the same values fail, with the same errors."""

    def spacing_of(spacing):
        return Constraint.distribute([], dir="x", spacing=spacing).options["spacing"]

    assert spacing_of(8) == 8
    with pytest.raises(TypeError, match=r"spacing\['kind'\] got an unexpected value 'gap'"):
        spacing_of({"kind": "gap", "gap": 8})


@pytest.mark.parametrize("name", ["align", "position", "nest"])
def test_an_axis_constraint_needs_an_axis(name):
    with pytest.raises(ValueError, match=f"Constraint.{name} requires at least one of x, y"):
        getattr(Constraint, name)([None, None])


def test_distribute_pitch_matches_the_js_wire_fixture():
    # The document JS's spacing.test.ts validates and rebuilds: both compare
    # with one fixture, so Python's IR is the one JS lays out.
    import json
    import pathlib

    from gofish import layer, rect

    fixture = pathlib.Path(__file__).parents[2] / (
        "gofish-graphics/src/tests/fixtures/relate-distribute-pitch.json"
    )
    doc = layer(
        [
            rect(w=10, h=20, fill="red").name("a"),
            rect(w=30, h=40, fill="blue").name("b"),
        ]
    ).relate(
        lambda a, b: [
            Constraint.distribute(
                [a, b], dir="x", spacing=Spacing.pitch(50, at="middle")
            )
        ]
    ).to_ir()
    scope = doc["root"]["relate"]["scope"]
    text = json.dumps(doc).replace(scope, "relate-1")
    assert json.loads(text) == json.loads(fixture.read_text(encoding="utf-8"))
