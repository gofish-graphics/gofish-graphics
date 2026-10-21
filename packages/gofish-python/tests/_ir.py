"""The IR of one construct, read through the one entry point, ``to_ir()``,
and a host's answer to a bridge call, through ``ir_payload``."""

import base64
from typing import Any, List

from gofish import chart, rect
from gofish.arrow_utils import arrow_to_records, data_to_arrow_bytes
from gofish.ast import Operator, answer, ir_payload


def _root(node: Any) -> Any:
    """``node`` as a root: an operator sits in a chart's flow."""
    return chart([]).flow(node).mark(rect()) if isinstance(node, Operator) else node


def ir(node: Any) -> dict:
    """The IR of ``node``: the root of a mark's, a chart's or a chain's
    document, or an operator's entry in the flow of a chart's document."""
    root = _root(node).to_ir()["root"]
    return root["operators"][0] if isinstance(node, Operator) else root


def _b64(items: List[Any]) -> str:
    return base64.b64encode(data_to_arrow_bytes(items)).decode("ascii")


def call(
    node: Any, lambda_id: str, rows: List[Any], refs: List[Any] = ()
) -> List[Any]:
    """The rows a host answers JS's call of ``lambda_id`` with, when
    rendering ``node``: the list its reply's root names. ``refs`` is the
    datum of each ref (``BridgeRef``) the rows hold, by its index."""
    _, callbacks = ir_payload(_root(node))
    reply = answer(callbacks, lambda_id, _b64(rows), _b64(list(refs)))
    return arrow_to_records(base64.b64decode(reply["tables"][reply["root"]["id"]]))
