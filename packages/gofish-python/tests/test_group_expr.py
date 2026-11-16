"""Function values and per-group expressions (stack profiles S9, S10)."""

import pytest

from gofish import fun


def test_fun_raises_until_the_bridge_can_read_it():
    with pytest.raises(NotImplementedError, match="synchronous"):
        fun(lambda t: t, domain=(0, 1))
