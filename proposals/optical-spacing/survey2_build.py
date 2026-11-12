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

# Each widget has two starts, (far, close), pinned so that changing a
# candidate later does not move them (design v2c). The page picks one of the
# two at random for each person. Each is at least 3 sd from every prediction
# and at least 8% of the track from either end.
PINNED = {
    1: (50.5, -38),
    2: (49, -19.5),
    3: (50.5, -2.5),
    4: (50.5, 0),
    5: (50.5, 0),
    6: (100.5, -76.5),
    7: (64.5, 0),
    8: (49, -19.5),
    9: (50.5, 0),
    10: (50.5, -38),
    11: (50.5, -2.5),
    12: (50.5, 0),
    13: (50.5, -38),
    14: (50.5, -2.5),
    15: (50, -4.5),
}
KEY_N = {w["key"]: w["n"] for w in D["widgets"]}

widgets, report = [], []
for w in D["widgets"]:
    far, close = PINNED.get(w["n"], (w["starts"]["far"], w["starts"]["close"]))
    v0, v1 = w["range"]
    xs = [x for x in w["preds"].values() if x is not None]
    for side, s in (("far", far), ("close", close)):
        near = min(abs(s - x) for x in xs) / w["sd"]
        edge = min(s - v0, v1 - s) / (v1 - v0)
        report.append(f"w{w['n']} {w['key']} {side}: track {v0} to {v1}, start {s}, {near:.1f} sd from the nearest prediction, {edge:.0%} from an end")
    widgets.append(
        {
            "n": w["n"],
            "key": w["key"],
            "tier": w["tier"],
            "invert": w["invert"],
            "text": w["text"],
            "aria": w["aria"],
            "axis": w["axis"],
            "range": [v0, v1],
            "starts": {"far": far, "close": close},
            # a repeat names its original, so the shuffle can keep them apart
            "rep": KEY_N[w["of"]] if w["kind"] == "repeat" else None,
            "view": w["view"],
            "fixed": [{k: v for k, v in f.items() if v is not None} for f in w["fixed"]],
            "moving": [{k: v for k, v in m.items() if v is not None} for m in w["moving"]],
            "edge": w["edge"],
        }
    )

tpl = open(os.path.join(HERE, "survey2_template.html")).read()
data = json.dumps({"widgets": widgets}, separators=(",", ":"))
open(os.path.join(HERE, "survey2.html"), "w").write(tpl.replace("__SURVEY_DATA__", data))
print("\n".join(report))
