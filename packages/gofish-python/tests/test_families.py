"""Strategy families (#1013): one module per family, bound in the package
under its capitalized name, with no flat top-level copies."""

import importlib
import math

import pytest

import gofish
from gofish import Curve, Overlap, Tile, line, ribbon

FAMILIES = {
    "Color": ("color", ["palette", "gradient"]),
    "Coord": ("coord", ["polar", "clock", "wavy"]),
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
    assert line(curve=Curve.perfect_arrows(pad_end=4)).to_dict()["curve"] == {
        "kind": "perfectArrows",
        "padEnd": 4,
    }
    assert line(curve=Curve.step()).to_dict()["curve"] == {"kind": "step"}
    assert ribbon(curve=Curve.bezier()).to_dict()["curve"] == {"kind": "bezier"}
    with pytest.raises(TypeError, match="'swoop'"):
        line(curve={"kind": "swoop"})
    with pytest.raises(TypeError, match="did you mean 'pad_end'"):
        line(curve={"kind": "perfectArrows", "padEnd": 4})


def test_strategy_modules_are_generated():
    # gofish/<family>.py for the strategy families is written by
    # scripts/generate.ts from the gofish-ir STRATEGIES table.
    for module_name in ("tile", "overlap", "curve"):
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
