from fakelib import Mark, register_mark_namespace


@register_mark_namespace("tt")
class TooltipNamespace:
    def __init__(self, mark: Mark) -> None:
        self._mark = mark

    def tooltip(self, field: str) -> Mark:
        return self._mark._with(tooltip=field)
