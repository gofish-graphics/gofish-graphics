"""Tests for `pluck`, the Python port of JS `pluck` (datumProjection.ts)."""

from gofish import pluck, project
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


def test_project_collapses_agreeing_values():
    assert project(ROWS, "lake") == "A"
    assert project(_InputRef(0, ROWS), "lake") == "A"


def test_project_is_none_when_rows_disagree_or_lack_the_field():
    assert project(ROWS, "species") is None
    assert project(ROWS, "missing") is None


# The cases below are what JS `pluck` / `project` answer for the same input
# (datumProjection.ts), so Python reads a bag exactly as JS does.


def test_none_is_no_value_so_it_never_disagrees():
    assert project([{"a": None}, {"a": 2}], "a") == 2
    assert project([{"a": None}, {}], "a") is None


def test_values_are_the_same_when_js_keys_them_the_same():
    # JS keys a value by String(v), so 1, 1.0 and "1" are one value.
    assert pluck([{"a": 1}, {"a": 1.0}, {"a": "1"}], "a") == [1]
    assert pluck([{"a": True}, {"a": "true"}], "a") == [True]
    assert pluck([{"p": {"x": 1.0}}, {"p": {"x": 1}}], "p") == [{"x": 1.0}]
    nan = float("nan")
    assert len(pluck([{"a": nan}, {"a": nan}], "a")) == 1


def test_numbers_key_as_js_writes_them():
    from gofish.datum_projection import _js_number

    for value, text in [
        (1e21, "1e+21"),
        (1.5e-7, "1.5e-7"),
        (0.00001, "0.00001"),
        (123.5, "123.5"),
        (-2.0, "-2"),
        (1e20, "100000000000000000000"),
    ]:
        assert _js_number(value) == text


def test_paths_parse_as_lodash_to_path():
    assert pluck([{"a": {"b.c": 3}}], 'a["b.c"]') == [3]
    assert pluck([{"a": {"0": "x"}}], "a[0]") == ["x"]


def test_pluck_reads_a_source_through_its_datum_and_project_does_not():
    row = {"datum": [{"a": 1}], "a": 5}
    assert pluck(row, "a") == [1]
    assert project(row, "a") == 5
