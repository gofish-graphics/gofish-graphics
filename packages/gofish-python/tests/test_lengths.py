"""Tests for `percent` and `fr`, the Python lengths (#1176 step 6), mirroring
JS `percent(n)` / `fr(n)` in `gofish-graphics/src/ast/length.ts`."""

import json

import pytest

from gofish import LengthValue, chart, fr, percent, rect, spread


def test_percent_wire_form():
    assert percent(30) == {"type": "length", "percent": 30}
    assert isinstance(percent(30), LengthValue)


def test_fr_wire_form():
    assert fr(2) == {"type": "length", "fr": 2}


def test_percent_plus_pixels():
    assert percent(30) + 10 == {"type": "length", "percent": 30, "px": 10}
    assert 10 + percent(30) == {"type": "length", "percent": 30, "px": 10}
    assert percent(30) - 4 == {"type": "length", "percent": 30, "px": -4}
    assert (percent(30) + 10) - 4 == {"type": "length", "percent": 30, "px": 6}
    assert percent(30).offset(10) == percent(30) + 10


def test_offsets_that_cancel_drop_px():
    assert (percent(30) + 10) - 10 == {"type": "length", "percent": 30}


def test_fr_takes_no_offset():
    with pytest.raises(TypeError):
        fr(1) + 3


def test_bad_values():
    with pytest.raises(TypeError):
        percent(float("nan"))
    with pytest.raises(TypeError):
        fr(-1)
    with pytest.raises(TypeError):
        percent("30%")


def test_lengths_reach_the_wire():
    doc = (
        chart([{"k": "a", "v": 1}], w=percent(50), h=200)
        .flow(spread(by="k", dir="x", spacing=fr(0.25)))
        .mark(rect(h="v", inset=percent(10)))
        .to_ir()
    )
    text = json.dumps(doc)
    assert '"w": {"type": "length", "percent": 50}' in text
    assert '"spacing": {"type": "length", "fr": 0.25}' in text
    assert '"inset": {"type": "length", "percent": 10}' in text
