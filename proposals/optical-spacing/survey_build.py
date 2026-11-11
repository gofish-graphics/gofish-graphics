# Builds survey.html, the standalone "Spacing by eye" page, from widgets.json
# (the same drawings as the widgets on page.html) and survey_template.html.
# Run: python3 proposals/optical-spacing/survey_build.py
# It keeps only the drawings and the slider ranges, no model tables, and
# chooses each slider's start away from every model's prediction.
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "widgets.json")))

INFO = {
    1: ("square-gap", "Move the square until the gaps look even to you."),
    2: ("tip-gap", "Move the triangle until the gaps look even to you."),
    3: ("circle-gap", "Move the circle until the gaps look even to you. The last square follows it."),
    4: ("tip-gap", "Move the triangle until the gaps look even to you."),
    5: ("o-shift", "Move the O until the gaps look even to you. The last H follows it."),
    6: ("t-shift", "Move the T until the gaps look even to you."),
    7: ("left-inset", "Move the airplane until the left inset looks the same as the top and bottom."),
    8: ("gap-below", "Move the middle curve up or down until the gaps look even to you."),
}


def solve(ps, a, b, scale):
    """Where a and b are equal (the crossing with the largest measures), or None.
    A crossing marked with a dagger on page.html (both measures under a third of
    the model's reference strip: it sees almost no gap) also counts as None."""
    best = None
    for i in range(len(ps) - 1):
        if None in (a[i], a[i + 1], b[i], b[i + 1]):
            continue
        d0, d1 = a[i] - b[i], a[i + 1] - b[i + 1]
        if d0 == 0 or (d0 > 0) != (d1 > 0):
            t = 0 if d0 == 0 else d0 / (d0 - d1)
            level = a[i] + t * (a[i + 1] - a[i])
            if best is None or level > best[1]:
                best = (ps[i] + t * (ps[i + 1] - ps[i]), level)
    return best[0] if best and best[1] >= scale / 3 else None


def start(lo, hi, v0, v1, far):
    """A start outside [lo, hi], 40% of the range past it where the track allows, never at an end."""
    L = v1 - v0
    edge = 0.06 * L
    sides = {
        "far": min(hi + 0.4 * L, v1 - edge),
        "close": max(lo - 0.4 * L, v0 + edge),
    }
    gap = {"far": sides["far"] - hi, "close": lo - sides["close"]}
    want = "far" if far else "close"
    other = "close" if far else "far"
    # keep the alternation unless that side has almost no room
    side = want if gap[want] >= 0.15 * L or gap[want] >= gap[other] else other
    return round(sides[side] * 2) / 2, side


widgets, report = [], []
for k, w in enumerate(D["widgets"]):
    preds = [solve(w["p"], w["a"][m["key"]], w["b"][m["key"]], w["scale"][m["key"]]) for m in D["models"]]
    preds = [p for p in preds if p is not None]
    lo, hi = min(preds), max(preds)
    v0, v1 = w["p"][0], w["p"][-1]
    s, side = start(lo, hi, v0, v1, k % 2 == 0)
    key, text = INFO[w["n"]]
    report.append(
        f"w{w['n']} {key}: track {v0} to {v1}, {len(preds)} predictions {lo:.1f} to {hi:.1f}, start {s} ({side}, "
        f"{min(abs(s - lo), abs(s - hi)):.1f} from the nearest = {min(abs(s - lo), abs(s - hi)) / (v1 - v0):.0%} of the track)"
    )
    widgets.append(
        {
            "n": w["n"],
            "key": key,
            "text": text,
            "aria": w["aria"],
            "axis": w["axis"],
            "range": [v0, v1],
            "start": s,
            "view": w["view"],
            "fixed": w["fixed"],
            "moving": w["moving"],
            "edge": w["edge"],
        }
    )

tpl = open(os.path.join(HERE, "survey_template.html")).read()
data = json.dumps({"widgets": widgets}, separators=(",", ":"))
open(os.path.join(HERE, "survey.html"), "w").write(tpl.replace("__SURVEY_DATA__", data))
print("\n".join(report))
