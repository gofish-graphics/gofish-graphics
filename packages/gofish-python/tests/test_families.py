"""Strategy families (#1013): one module per family, bound in the package
under its capitalized name, with no flat top-level copies."""

import importlib

import pytest

import gofish
from gofish import Curve, line, ribbon

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
