from typing import TypeVar

from fakelib import Mark

M = TypeVar("M", bound=Mark)


def tooltip(mark: M, field: str) -> M:
    return mark._with(tooltip=field)
