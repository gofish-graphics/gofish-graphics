"""What happens today if a third party monkeypatches .tooltip() onto the real
gofish Python Mark and stores its state on the instance."""
import sys

sys.path.insert(
    0,
    "/Users/jmp/gofish-20250316/.claude/worktrees/tooltip-proposal-1395/packages/gofish-python",
)
import json

from gofish import rect
from gofish.ast import Mark


def tooltip(self, field):
    # Copy-on-write like the built-ins, storing third-party state.
    new = type(self)(self.mark_type, _children=self._children, **self.kwargs)
    self._copy_meta(new)
    new._tooltip = field
    return new


Mark.tooltip = tooltip  # the monkeypatch

m = rect(h="value").tooltip("value")
print("after .tooltip():  _tooltip =", getattr(m, "_tooltip", "<lost>"))
m2 = m.name("bars")
print("after .name():     _tooltip =", getattr(m2, "_tooltip", "<lost>"))
print("IR of m:", json.dumps(m.to_ir()["root"]) if hasattr(m, "to_ir") else None)

# Alternative: a modifier that is a pure rewrite into existing constructs.
from gofish import layer, text


def tooltip_as_rewrite(field):
    def apply(mark):
        return layer([mark, text(text=field).hidden()])

    return apply


r = tooltip_as_rewrite("value")(rect(h="value"))
print("rewrite IR root type:", r.to_ir()["root"].get("type"))
print("has .pipe on Mark:", hasattr(Mark, "pipe"))
