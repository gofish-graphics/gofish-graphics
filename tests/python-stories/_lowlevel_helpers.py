"""Small data helpers shared by the low-level story ports.

The JS low-level stories lean on lodash `groupBy`/`sumBy`/`orderBy` to shape
data before handing it to the layout combinators. These mirror that behavior
with plain Python so the ports stay readable and emit the same row ordering
(lodash `groupBy` preserves first-seen key order — Python dicts do too).
"""

from typing import Callable, Dict, List, Union

_Key = Union[str, Callable]


def _get(item: dict, key: _Key):
    return item[key] if isinstance(key, str) else key(item)


def group_by(items: List[dict], key: _Key) -> Dict[object, List[dict]]:
    """lodash `groupBy` — groups rows by `key`, preserving first-seen order."""
    groups: Dict[object, List[dict]] = {}
    for item in items:
        groups.setdefault(_get(item, key), []).append(item)
    return groups


def sum_by(items: List[dict], key: _Key) -> float:
    """lodash `sumBy` — sum of `key` over `items`."""
    return sum(_get(item, key) for item in items)


def order_by(items: List[dict], key: _Key, direction: str = "asc") -> List[dict]:
    """lodash `orderBy` (single key) — stable sort, asc or desc."""
    return sorted(items, key=lambda it: _get(it, key), reverse=direction == "desc")
