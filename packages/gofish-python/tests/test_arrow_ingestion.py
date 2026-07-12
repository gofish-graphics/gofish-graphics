"""Tests for the dataframe-agnostic ingestion helper in `gofish/arrow_utils.py`.

The chart-data ingestion boundary (`to_arrow_table` / `data_to_arrow_bytes`)
is narwhals-based (https://narwhals-dev.github.io/narwhals/) so pandas is no
longer a hard runtime dependency: any narwhals-supported dataframe backend
(pandas, polars, pyarrow, ...) or a plain list of dict rows works.
"""

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


class TestNoneAndEmpty:
    def test_none_yields_placeholder(self):
        from gofish.arrow_utils import empty_placeholder_arrow_bytes

        assert data_to_arrow_bytes(None) == empty_placeholder_arrow_bytes()

    def test_empty_list_yields_placeholder(self):
        from gofish.arrow_utils import empty_placeholder_arrow_bytes

        assert data_to_arrow_bytes([]) == empty_placeholder_arrow_bytes()

    def test_empty_pandas_dataframe_yields_placeholder(self):
        from gofish.arrow_utils import empty_placeholder_arrow_bytes

        assert data_to_arrow_bytes(pd.DataFrame()) == empty_placeholder_arrow_bytes()


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
            assert widget.arrow_data
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
