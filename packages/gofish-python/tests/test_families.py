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
    assert Curve.monotone() == {"type": "monotone"}
    assert Curve.catmull_rom() == {"type": "catmullRom"}
    assert Curve.arc(direction="down") == {
        "type": "arc",
        "options": {"direction": "down"},
    }
    assert Curve.perfect_arrows(bow=0.3, pad_end=4) == {
        "type": "perfectArrows",
        "options": {"bow": 0.3, "padEnd": 4},
    }
    assert line(curve=Curve.step()).to_dict()["curve"] == {"type": "step"}
    assert ribbon(curve=Curve.bezier()).to_dict()["curve"] == {"type": "bezier"}
