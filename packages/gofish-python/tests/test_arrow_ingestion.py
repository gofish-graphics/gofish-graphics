"""Tests for the dataframe-agnostic ingestion helper in `gofish/arrow_utils.py`.

The chart-data ingestion boundary (`to_arrow_table` / `data_to_arrow_bytes`)
is narwhals-based (https://narwhals-dev.github.io/narwhals/) so pandas is no
longer a hard runtime dependency: any narwhals-supported dataframe backend
(pandas, polars, pyarrow, ...) or a plain list of dict rows works.
"""

import math
import subprocess
import sys
import textwrap

import pandas as pd
import polars as pl
import pyarrow as pa
import pytest

from gofish.arrow_utils import arrow_to_records, data_to_arrow_bytes, to_arrow_table


ROWS = [
    {"x": 1, "y": 2.5, "label": "a"},
    {"x": 2, "y": 3.5, "label": "b"},
    {"x": 3, "y": 4.5, "label": "c"},
]


class TestIngestionRoundTrip:
    """The same logical rows, ingested from every supported backend, must
    decode back to identical records — this is the contract the JS widget
    relies on regardless of which dataframe library produced the data.
    """

    def test_list_of_dicts(self):
        assert arrow_to_records(data_to_arrow_bytes(ROWS)) == ROWS

    def test_pandas_dataframe(self):
        assert arrow_to_records(data_to_arrow_bytes(pd.DataFrame(ROWS))) == ROWS

    def test_polars_dataframe(self):
        assert arrow_to_records(data_to_arrow_bytes(pl.DataFrame(ROWS))) == ROWS

    def test_pyarrow_table(self):
        table = pa.Table.from_pylist(ROWS)
        assert arrow_to_records(data_to_arrow_bytes(table)) == ROWS

    def test_polars_lazyframe_is_collected(self):
        # narwhals LazyFrames (polars .lazy(), DuckDB relations, ...) must be
        # collected before the Arrow export — the wire format is always a
        # materialized table.
        lf = pl.DataFrame(ROWS).lazy()
        assert arrow_to_records(data_to_arrow_bytes(lf)) == ROWS

    def test_all_backends_agree_with_each_other(self):
        variants = [
            ROWS,
            pd.DataFrame(ROWS),
            pl.DataFrame(ROWS),
            pa.Table.from_pylist(ROWS),
        ]
        decoded = [arrow_to_records(data_to_arrow_bytes(v)) for v in variants]
        assert all(d == ROWS for d in decoded)


class TestUnsupportedInput:
    def test_unrecognized_type_raises_loud_type_error(self):
        with pytest.raises(TypeError, match="str.*supported"):
            to_arrow_table("not a dataframe")

    def test_int_raises_loud_type_error(self):
        with pytest.raises(TypeError) as excinfo:
            to_arrow_table(42)
        message = str(excinfo.value)
        assert "int" in message
        assert "narwhals" in message

    def test_data_to_arrow_bytes_also_raises(self):
        with pytest.raises(TypeError):
            data_to_arrow_bytes(object())

    def test_conflicting_column_types_raise_naming_the_column(self):
        rows = [{"Title": "Up", "n": 1}, {"Title": 2012, "n": 2.5}]
        with pytest.raises(TypeError) as excinfo:
            to_arrow_table(rows)
        message = str(excinfo.value)
        assert 'column "Title"' in message
        assert "(string, number)" in message
        assert "coerce" in message

    def test_nan_in_rows_stays_nan(self):
        """GoFish never reads NaN as missing: in dict rows NaN crosses as
        NaN, and only None is null."""
        values = [
            r["x"] for r in _records([{"x": 1.0}, {"x": float("nan")}, {"x": None}])
        ]
        assert values[0] == 1.0
        assert math.isnan(values[1])
        assert values[2] is None

    def test_pandas_nan_is_missing_by_pandas_rule(self):
        """pandas defines NaN as its float columns' missing value, so a
        DataFrame's NaN crosses as null."""
        pd = pytest.importorskip("pandas")
        df = pd.DataFrame({"x": [1.0, float("nan")]})
        assert [r["x"] for r in _records(df)] == [1.0, None]

    def test_columns_follow_first_seen_keys(self):
        rows = [{"a": 1}, {"a": 2, "b": "x"}]
        table = to_arrow_table(rows)
        assert [f.name for f in table.schema.field("item").type] == ["a", "b"]
        assert [r["b"] for r in _records(rows)] == [None, "x"]

    def test_ints_and_floats_share_a_column(self):
        assert [r["n"] for r in _records([{"n": 1}, {"n": 2.5}, {"n": None}])] == [
            1.0,
            2.5,
            None,
        ]


def _records(data):
    return arrow_to_records(data_to_arrow_bytes(data))


class TestOneColumnOfItems:
    """A table is a list, so it crosses as one Arrow column, `item`, whose
    type is the items' type, whatever they are; the decode reads column 0
    back as the list."""

    def test_every_list_is_one_column_of_its_item_type(self):
        cases = [
            (ROWS, pa.types.is_struct),
            ([[{"x": 1}], [{"x": 2}, {"x": 3}]], pa.types.is_list),
            (["a", "b"], pa.types.is_string),
            ([1, 2], pa.types.is_int64),
        ]
        for items, is_type in cases:
            table = to_arrow_table(items)
            assert table.column_names == ["item"]
            assert is_type(table.schema.field("item").type)
            assert _records(items) == items

    def test_a_dataframe_is_one_struct_column_that_keeps_its_types(self):
        """A dataframe's columns are the struct's fields, with their Arrow
        types: an int64 column stays int64 (JS sends it back as integers),
        and a timestamp keeps its zone."""
        t = pd.Timestamp("2024-03-01", tz="America/New_York")
        df = pd.DataFrame({"n": [1, 2], "f": [0.5, 1.0], "t": [t, t]})
        item = to_arrow_table(df).schema.field("item").type
        assert pa.types.is_struct(item)
        assert item.field("n").type == pa.int64()
        assert item.field("f").type == pa.float64()
        assert item.field("t").type.tz == "America/New_York"
        assert _records(pl.DataFrame({"n": [1, 2]})) == [{"n": 1}, {"n": 2}]

    def test_none_and_empty_are_no_items(self):
        for data in (None, [], pd.DataFrame(), pl.DataFrame({"x": []})):
            assert _records(data) == []


class TestNoPandasInstalled:
    """`import gofish` + a basic render must work with no pandas installed at
    all, now that ingestion goes through narwhals instead of a hard pandas
    dependency.

    We exercise this with a real subprocess (rather than
    `monkeypatch.setitem(sys.modules, "pandas", None)`) because pyarrow's own
    optional-pandas integration shim inspects `sys.modules` directly and
    dereferences a `None` entry, raising `AttributeError` instead of the
    `ImportError` a genuinely-absent module produces (see pyarrow's
    `pandas-shim.pxi`) — so the sys.modules trick doesn't honestly simulate
    "pandas not installed" for code that touches pyarrow. A subprocess is
    slower but tests the real thing: this repo's test environment has
    pandas installed (it's in the `test` extra), so we spawn a fresh
    interpreter and block the import at the `sys.meta_path` level — via a
    `MetaPathFinder.find_spec` that raises `ImportError` — before `gofish`
    (or pyarrow) ever gets a chance to see it.
    """

    def test_import_and_render_without_pandas(self):
        script = textwrap.dedent(
            """
            import sys

            class _BlockPandas:
                def find_spec(self, name, path, target=None):
                    if name == "pandas" or name.startswith("pandas."):
                        raise ImportError(f"{name} is blocked for this test")
                    return None

            sys.meta_path.insert(0, _BlockPandas())

            import gofish
            from gofish import chart, rect

            widget = (
                chart([{"x": 1, "y": 2}, {"x": 2, "y": None}, {"x": 3, "y": 4}])
                .mark(rect(h="y"))
                .render(w=200, h=200)
            )
            assert widget.doc["tables"]
            assert "pandas" not in sys.modules
            print("OK")
            """
        )
        result = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result.returncode == 0, (
            f"subprocess failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
        )
        assert "OK" in result.stdout
