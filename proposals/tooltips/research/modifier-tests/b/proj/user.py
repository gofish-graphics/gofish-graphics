import plugin_ns  # noqa: F401  (registers .tt)
import plugin_patch  # noqa: F401  (patches .tooltip)
from fakelib import rect
from plugin_fn import tooltip

a = rect(h="v").tooltip("v")  # monkeypatched method
b = rect(h="v").tt.tooltip("v")  # accessor namespace
c = rect(h="v").pipe(tooltip, "v").corner_radius(2)  # pipe + imported function
d = rect(h="v").pipe(tooltip, 3)  # wrong argument type
e = rect(h="v").pipe(toolTip, "v")  # typo / missing import
f = tooltip(rect(h="v"), "v").corner_radius(2)  # wrapping form
reveal_type(c)
