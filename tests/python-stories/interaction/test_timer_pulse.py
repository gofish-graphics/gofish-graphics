"""Equivalent of TimerPulse.stories.tsx — Interaction/Timer Pulse.

Both regimes on a `timer(...)` clock the browser runs. PaintOnly reads the
clock in a fill expression, so the bars pulse at paint. GrowingData reads it
inside a Python `derive` (the kernel tier): the browser ships the clock's
value with each call, and re-runs the derive when it changes. Both are
captured at their first frame.
"""

import math

from gofish import chart, derive, rect, spread, timer, when

BASE = [
    {"cat": "a", "count": 30},
    {"cat": "b", "count": 80},
    {"cat": "c", "count": 45},
    {"cat": "d", "count": 60},
]

# The full series GrowingData scrolls a window over: a bounded sine of each
# point's index (JS `Math.round` rounds a half up, as `floor(x + 0.5)` does).
SERIES = [
    {"t": str(k), "count": 20 + math.floor(15 * (1 + math.sin(k / 2)) + 0.5)}
    for k in range(200)
]


def story_paint_only():
    t = timer(domain=[0, 1], step=1, duration=800)
    return (
        chart(BASE)
        .flow(spread(by="cat", dir="x"))
        .mark(rect(h="count", fill=when(t == 0).then("#6b9bd1").otherwise("#d62728"))),
        {"w": 400, "h": 300},
    )


def story_growing_data():
    window = 20
    head = timer(domain=[0, len(SERIES) - 1], step=1, duration=len(SERIES) * 500)

    def rolling(rows):
        n = head()
        return rows[max(0, n - window + 1) : n + 1]

    return (
        chart(SERIES)
        .flow(derive(rolling), spread(by="t", dir="x"))
        .mark(rect(h="count", fill="#6b9bd1")),
        {"w": 500, "h": 300},
    )
