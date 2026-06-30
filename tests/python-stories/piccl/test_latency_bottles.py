"""Equivalent of piccl/LatencyBottles.stories.tsx — Piccl/LatencyBottles.

System latencies (Gregg, *Systems Performance*, Table 2.2) drawn as wine
bottles, faceted into three magnitude bands. Within each band bottle height is
log-scaled to that band's own range, so neighbors read clearly; the band titles
(the categorical y-axis) carry the ×1000-per-row story.

Everything is authored with plain field-string channels — `image(h="h")`,
`text(text="latency")` — and stacked `.label()` calls, so no Python lambda
crosses the derive RPC; the per-row `h` and `scaledLabel` columns are
precomputed in the data exactly as the JS story computes them.
"""

import math
import os

from gofish import chart, image, paint, rect, spread

_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
BOTTLE_PNG = (
    f"/@fs{_REPO_ROOT}/packages/gofish-graphics/stories/assets/wilsonblanco.png"
)

NS = "CPU & memory · nanoseconds"
US_MS = "Storage & network · µs–ms"
S_MIN = "System events · seconds–minutes"

ROWS = [
    {"tier": NS, "event": "1 CPU cycle", "latency": "0.3 ns", "scaled": "1 s", "ns": 0.3},
    {"tier": NS, "event": "L1 cache access", "latency": "0.9 ns", "scaled": "3 s", "ns": 0.9},
    {"tier": NS, "event": "L2 cache access", "latency": "3 ns", "scaled": "10 s", "ns": 3},
    {"tier": NS, "event": "L3 cache access", "latency": "10 ns", "scaled": "33 s", "ns": 10},
    {"tier": NS, "event": "Main memory (DRAM)", "latency": "100 ns", "scaled": "6 min", "ns": 100},
    {"tier": US_MS, "event": "SSD I/O (flash)", "latency": "10–100 µs", "scaled": "9–90 hours", "ns": 50_000},
    {"tier": US_MS, "event": "Rotational disk I/O", "latency": "1–10 ms", "scaled": "1–12 months", "ns": 5_000_000},
    {"tier": US_MS, "event": "Internet: SF → New York", "latency": "40 ms", "scaled": "4 years", "ns": 40_000_000},
    {"tier": US_MS, "event": "Internet: SF → U.K.", "latency": "81 ms", "scaled": "8 years", "ns": 81_000_000},
    {"tier": US_MS, "event": "Lightweight HW virt boot", "latency": "100 ms", "scaled": "11 years", "ns": 100_000_000},
    {"tier": US_MS, "event": "Internet: SF → Australia", "latency": "183 ms", "scaled": "19 years", "ns": 183_000_000},
    {"tier": S_MIN, "event": "OS virt system boot", "latency": "< 1 s", "scaled": "105 years", "ns": 1_000_000_000},
    {"tier": S_MIN, "event": "TCP timer retransmit", "latency": "1–3 s", "scaled": "105–317 years", "ns": 2_000_000_000},
    {"tier": S_MIN, "event": "SCSI command time-out", "latency": "30 s", "scaled": "3 millennia", "ns": 30_000_000_000},
    {"tier": S_MIN, "event": "HW virt system boot", "latency": "40 s", "scaled": "4 millennia", "ns": 40_000_000_000},
    {"tier": S_MIN, "event": "Physical system reboot", "latency": "5 m", "scaled": "32 millennia", "ns": 300_000_000_000},
]

# Per-band bottle heights: log10(latency) mapped to [H_MIN, H_MAX] using each
# band's own min/max, so each row of bottles fills the height range.
H_MIN = 56
H_MAX = 190
# wilsonblanco.png is 157×650; `bw` is the bottle width at a given height, used
# to size the burgundy tint rect so it exactly covers the bottle.
BOTTLE_ASPECT = 157 / 650
_band_range: dict = {}
for _r in ROWS:
    _l = math.log10(_r["ns"])
    _cur = _band_range.get(_r["tier"])
    _band_range[_r["tier"]] = (
        (min(_cur[0], _l), max(_cur[1], _l)) if _cur else (_l, _l)
    )
DATA = []
for _r in ROWS:
    _lo, _hi = _band_range[_r["tier"]]
    _t = (math.log10(_r["ns"]) - _lo) / (_hi - _lo) if _hi > _lo else 1.0
    _h = H_MIN + _t * (H_MAX - H_MIN)
    DATA.append({**_r, "h": _h, "bw": _h * BOTTLE_ASPECT, "scaledLabel": f"≈ {_r['scaled']}"})


def story_default():
    return (
        chart(DATA)
        .flow(
            spread(by="tier", dir="y", spacing=64, alignment="start", reverse=True, axes={"x": False, "y": False}),
            spread(by="event", dir="x", spacing=24, alignment="baseline", axes={"x": False, "y": False}),
        )
        .mark(
            paint(
                [
                    image(href=BOTTLE_PNG, h="h"),
                    rect(h="h", w="bw", fill="#b3304f"),
                ],
                blendMode="multiply",
            )
            .label("latency", position="outset-top", offset=6, fontSize=12, color="#7a1020")
            .label("scaledLabel", position="outset-top", offset=22, fontSize=9, color="#9a9a9a")
            .label("event", position="center", fontSize=10, color="#ffffff", rotate=-90)
        ),
        {"axes": {"x": False, "y": {"title": False}}},
    )
