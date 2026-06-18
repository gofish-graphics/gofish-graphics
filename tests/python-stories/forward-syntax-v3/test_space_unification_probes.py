"""Equivalent of SpaceUnificationProbes.stories.tsx — Forward Syntax V3/Space
Unification Probes.

Probe for the underlying-space collapse (#586). Rects spread along x and SIZED
along x by ``hours`` with 30px gaps and an x-axis: the spread's x distribute
folds to a baseline magnitude ``SIZE(linear(Σhours, 30·(n−1)))`` whose intercept
is the reserved pixel spacing. A baseline magnitude ("free") is NOT niced, so
the root σ solves ``(W − 30·(n−1)) / Σhours`` and the gaps are reserved. The
two-state cut mistook this for an ``origin 0`` anchored axis, niced it, and
destroyed the intercept → wrong σ; the parity render pins the correct geometry.
"""

from gofish import chart, spread, rect

# Tasks laid left-to-right, width ∝ hours, with gaps — a proportional strip.
TASKS = [
    {"task": "Design", "hours": 18},
    {"task": "Build", "hours": 42},
    {"task": "Test", "hours": 24},
    {"task": "Ship", "hours": 10},
]


def story_spaced_size_axis():
    return (
        chart(TASKS)
        .flow(spread(by="task", dir="x", spacing=30))
        .mark(rect(w="hours", h=80, fill="task")),
        {"w": 520, "h": 220, "axes": True},
    )
