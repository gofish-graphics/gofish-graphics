"""Tests for `pluck`, the Python port of JS `pluck` (datumProjection.ts)."""

from gofish import pluck
from gofish.ast import _InputRef

ROWS = [
    {"lake": "A", "species": "Bass", "count": 3},
    {"lake": "A", "species": "Trout", "count": 5},
    {"lake": "A", "species": "Bass", "count": 1},
]


def test_distinct_values_in_first_seen_order():
    assert pluck(ROWS, "species") == ["Bass", "Trout"]


def test_homogeneous_field_gives_one_value():
    assert pluck(ROWS, "lake") == ["A"]


def test_reads_a_refs_datum():
    ref = _InputRef(0, ROWS)
    assert pluck(ref, "species") == ["Bass", "Trout"]


def test_list_of_refs_projects_over_every_bag():
    refs = [
        _InputRef(0, ROWS),
        _InputRef(1, [{"species": "Perch"}, {"species": "Bass"}]),
    ]
    assert pluck(refs, "species") == ["Bass", "Trout", "Perch"]


def test_single_row():
    assert pluck(ROWS[1], "species") == ["Trout"]


def test_missing_field_contributes_nothing():
    assert pluck([{"a": 1}, {"b": 2}, {"a": None}], "a") == [1]


def test_dotted_path_projects_through_nested_lists():
    rows = [
        {"meta": {"tags": [{"name": "x"}, {"name": "y"}]}},
        {"meta": {"tags": [{"name": "y"}, {"name": "z"}]}},
    ]
    assert pluck(rows, "meta.tags.name") == ["x", "y", "z"]


def test_object_values_deduplicate_by_content():
    rows = [{"p": {"x": 1}}, {"p": {"x": 1}}, {"p": {"x": 2}}]
    assert pluck(rows, "p") == [{"x": 1}, {"x": 2}]
