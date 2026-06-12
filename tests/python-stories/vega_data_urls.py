"""Pin the JS-side vega-datasets URLs so Python parity tests load the same
bytes the JS storybook loads.

The `vega_datasets` PyPI package ships an older snapshot of vega-datasets;
its `seattle_weather`/`movies`/etc. tables differ from what the JS npm
package fetches, which makes byte-level DOM parity impossible. The JS side
uses npm `vega-datasets@3.2.1` which exposes each file at
`https://cdn.jsdelivr.net/npm/vega-datasets@<version>/data/<file>`.
"""

from __future__ import annotations

import io
from urllib.request import urlopen

import pandas as pd

VEGA_DATASETS_VERSION = "3.2.1"
_BASE_URL = f"https://cdn.jsdelivr.net/npm/vega-datasets@{VEGA_DATASETS_VERSION}/data"

_cache: dict[str, bytes] = {}


def _fetch(filename: str) -> bytes:
    if filename not in _cache:
        with urlopen(f"{_BASE_URL}/{filename}") as resp:
            _cache[filename] = resp.read()
    return _cache[filename]


def read_csv(filename: str) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(_fetch(filename)))


def read_json(filename: str) -> pd.DataFrame:
    return pd.read_json(io.BytesIO(_fetch(filename)))
