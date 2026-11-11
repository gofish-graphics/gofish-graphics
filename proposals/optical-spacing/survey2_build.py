# Builds survey2.html, "Spacing by eye, part 2", from survey2_widgets.json
# (written by packages/gofish-graphics/stories/proposals/stack-profile/survey2Run.ts)
# and survey2_template.html, a copy of v1's survey_template.html.
# Run: python3 proposals/optical-spacing/survey2_build.py
# The page gets only the drawings, the slider tracks and the starts: no
# predictions. survey2_design.md lists what each widget is for.
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "survey2_widgets.json")))

# Starts are pinned to the values the first responses will see, so changing
# a candidate later does not move them. Each is outside every prediction and
# at least 8% of the track from either end.
PINNED = {
    1: 51,
    2: 22.5,
    3: 49,
    4: -17,
    5: 101,
    6: -18.5,
    7: 48,
    8: 9.5,
    9: 25.5,
    10: 49,
    11: 49,
    12: 49,
}

widgets, report = [], []
for w in D["widgets"]:
    s = PINNED.get(w["n"], w["start"])
    v0, v1 = w["range"]
    xs = [x for x in w["preds"].values() if x is not None]
    near = min(abs(s - x) for x in xs)
    edge = min(s - v0, v1 - s) / (v1 - v0)
    report.append(f"w{w['n']} {w['key']}: track {v0} to {v1}, start {s}, {near:.1f} px from the nearest prediction, {edge:.0%} from an end")
    widgets.append(
        {
            "n": w["n"],
            "num": w["n"],
            "key": w["key"],
            "text": w["text"],
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

tpl = open(os.path.join(HERE, "survey2_template.html")).read()
data = json.dumps({"widgets": widgets}, separators=(",", ":"))
open(os.path.join(HERE, "survey2.html"), "w").write(tpl.replace("__SURVEY_DATA__", data))
print("\n".join(report))
