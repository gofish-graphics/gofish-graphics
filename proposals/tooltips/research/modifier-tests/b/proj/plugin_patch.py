from fakelib import Mark


def _tooltip(self: Mark, field: str) -> Mark:
    return self._with(tooltip=field)


Mark.tooltip = _tooltip  # monkeypatch
