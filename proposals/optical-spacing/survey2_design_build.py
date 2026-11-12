# Writes survey2_design.md from survey2_widgets.json (written by
# packages/gofish-graphics/stories/proposals/stack-profile/survey2Run.ts).
# Run: python3 proposals/optical-spacing/survey2_design_build.py
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "survey2_widgets.json")))
W = D["widgets"]
KEYS = ["box", "contact", "pm3c", "hull", "mean", "size"]
LABEL = {c["key"]: c["label"] for c in D["candidates"]}
TIER = {w["key"]: w["tier"] for w in W}


def num(x):
    if x is None:
        return "none"
    s = f"{x:.1f}"
    return s.replace("-", "−")


def pred(w, k):
    x = w["preds"].get(k)
    if x is None:
        return "none"
    return ("≥ " if w["blind"].get(k) else "") + num(x)


out = []
o = out.append
o("# Spacing by eye, part 2: design")
o("")
o("The page is `survey2.html`, built by `survey2_build.py` from `survey2_widgets.json`,")
o("which `survey2Run.ts` writes. This file is written by `survey2_design_build.py`.")
o("Results go in `results/v2/` (see its README).")
o("")
o("## Goal: rule candidates out")
o("")
o("We have medium to low confidence that any of the candidate strategies below")
o("is how people space shapes. So the survey is built to rule each one out, not")
o("to pick a winner. For every candidate, the core tier has at least one")
o("realistic widget where that candidate's prediction is at least 4 sd from")
o("every other candidate's. If people's answers miss it there by more than")
o("about 3 sd, the candidate is out.")
o("")
o("If every candidate fails, the wedge widget tells us what people respond to.")
o("It changes one feature, the wedge a triangle's tip leaves beside a flat")
o("side, and nothing else. Each candidate predicts a different slope of the")
o("answer against the wedge's depth, so one answer per person gives that")
o("person's slope, and the slope says how much of the wedge's white counts as")
o("gap. A slope between two candidates' slopes points to a measure between")
o("them, such as a power mean with a different p; a slope outside all of them")
o("points to something none of the candidates measure.")
o("")
o("## Why rows, not offset pairs")
o("")
o("The first draft of part 2 showed a reference pair of squares above the pair")
o("being set, shifted sideways. Josh pointed out that comparing gaps that are")
o("offset from each other adds error that tells us nothing about spacing, like")
o("comparing lengths on unaligned baselines. Cleveland and McGill (1984) found")
o("that people judge position along a common scale more accurately than")
o("position along nonaligned scales. So every widget is now one row of three or")
o("four shapes on a shared baseline, as in part 1: the fixed shapes set the")
o("reference gap, and the gap being set sits beside it on the same line.")
o("")
o("## Candidates")
o("")
o("| Key | Strategy |")
o("| --- | --- |")
for c in D["candidates"]:
    o(f"| {c['key']} | {c['label']} |")
o("")
o("v is the box gap between the moving shape and its neighbor, in px at the")
o("page's own scale (shapes 56 px at 1x). Each candidate's prediction is the v")
o("at which it measures the two compared gaps as equal. The expected sd is")
o("1.5 px at 1x, scaled with size; the repeat will measure it. A prediction")
o("marked ≥ is the capped measure's plateau: past that v both gaps measure as")
o("far, so any larger answer fits. A plateau can't rule its candidate out and")
o("doesn't count as coverage. `pm3cRel` is the capped mean with its cap scaled")
o("to the shape; it differs from `pm3c` only on scaled rows.")
o("")
o("Realism, 1 to 3: 3, a row that appears in real icon rows and diagrams; 2,")
o("ordinary shapes in a plausible but less common arrangement; 1, a row built")
o("to make strategies disagree. Only rows scored 2 or 3 go in the core tier.")
o("")
o("## Widgets")
o("")
o("Core widgets show first. The extended ones wait behind a \"Keep going")
o("(optional, N more)\" button at the end. The copy button works at any point,")
o("marks untouched widgets `unset`, and records whether the extended tier was")
o("opened (`extended:`).")
o("")
o("| id | tier | purpose | realism | shapes | color | " + " | ".join(KEYS) + " | starts (far, close) |")
o("| --- | --- | --- | --- | --- | --- | " + " | ".join("---" for _ in KEYS) + " | --- |")
for w in W:
    color = "inverted" if w["invert"] else w["color"]
    o(f"| w{w['n']} {w['key']} | {w['tier']} | {w['purpose']} | {w['realism']} | {w['shapes']} | {color} | "
      + " | ".join(pred(w, k) for k in KEYS) + f" | {num(w['starts']['far'])}, {num(w['starts']['close'])}{'' if w['closeTouches'] else ' (overlap)'} |")
o("")
o("Starts and order. Every widget has two pinned starts. The far start sits")
o("40% of the track past every prediction. The close start has the moving")
o("shape just touching its neighbor; where touching would sit within 3 sd of a")
o("prediction (mean predicts touching on the notch, wedge and tip rows), it")
o("sits 3 sd past the lowest prediction instead, so the shapes overlap by a few")
o("px (marked overlap). On each page load, every widget draws one of its two")
o("starts at random, and the order is shuffled within the core and within the")
o("extended tier. A repeat sits at least 3 places from its original when the")
o("draw allows it, and never next to it. Each result line records the start")
o("side and the position: `w1 notch 20.5 start=far pos=3`.")
o("")
o("Why: Josh's first result (01-josh, design v2b, starts pinned to one side")
o("and a fixed order) set interlock-small at 7.5 from a touching start and its")
o("mirror at 20.5 from a far start. Every far start landed wide. With the side")
o("drawn at random, the start effect can be measured and averaged out, and")
o("the intro asks people to move past the spot that looks right and come back.")
o("")
o("## Ranking")
o("")
o("Rows are ranked greedily: first the realistic row that rules out the most")
o("candidates not yet covered, then the next, until every candidate is")
o("covered. The score is the sum over candidates of each one's isolation in sd,")
o("capped at 8. Factor pairs are ranked by what their comparison decides, not")
o("by spread, in the order the coordinator proposed, which I agree with: noise")
o("comes first because every other comparison is read against it.")
o("")
o("| rank | id | purpose | realism | score | decides | tier |")
o("| --- | --- | --- | --- | --- | --- | --- |")
pool = {p["key"]: p for p in D["pool"]}
purpose = {w["key"]: w["purpose"] for w in W}
purpose.update({"interlock": "an up and a down triangle, slanted sides parallel", "spike-square": "pathological: a long spike's tip at a flat side"})
rank = 0
for r in D["ranking"]:
    rank += 1
    k = r["key"]
    tier = TIER.get(k, "cut")
    o(f"| {rank} | {k} | {purpose.get(k, '')} | {r['realism']} | {r['score']} | {r['decides']} | {tier} |")
factors = [
    (f"{D['repeatOf']}-mirror", "repeat: within-person noise"),
    (f"{D['scaleOf']}-double", "scale: does the gap scale with the shapes"),
    ("stars", "control: execution noise where every candidate agrees"),
    ("notch-invert", "inversion: does light on dark change the gap"),
    ("square-circle-invert", "inversion, on the simple row"),
    ("notch-hue", "color: the moving shape colored"),
    ("tip-circle-hue", "color: a fixed neighbor colored"),
]
for k, why in factors:
    rank += 1
    o(f"| {rank} | {k} | {purpose.get(k, '')} | {W[[w['key'] for w in W].index(k)]['realism']} | n/a | {why} | {TIER.get(k, 'cut')} |")
o("")
o("Covered by the core: " + ", ".join(f"{c} by {D['coveredBy'][c]}" for c in KEYS) + ".")
o("Uncovered: " + (", ".join(D["uncovered"]) if D["uncovered"] else "none") + ".")
o("")
o("Cut from this round's pool: far-squares (one control is enough; the stars")
o("stay), spike-square (pathological, and tips already shows the same thing),")
o("interlock at one size (box and size agree there, so it isolates nothing),")
o("the half and double copies of tip-circle and the mirrors of tips and")
o("tip-circle (one scaled copy and one repeat), and the offset layout's")
o("triangles rows.")
o("")
o("## What rules out what")
o("")
o("Each cell is that candidate's isolation in sd: how far its prediction is")
o("from the nearest other candidate's. **out**: 4 sd or more, so a miss of more")
o("than about 3 sd rules that candidate out on its own. shared: a bold")
o("prediction another candidate shares, so a miss rules out the group.")
o("plateau: the cap's plateau, which rules nothing out. On a pathological row")
o("(realism 1), an isolated miss is marked **switch**: it shows people change")
o("strategy on rows like that one, not that the candidate is wrong on")
o("realistic rows.")
o("")
o("| widget | realism | " + " | ".join(KEYS) + " |")
o("| --- | --- | " + " | ".join("---" for _ in KEYS) + " |")
for m in D["matrix"]:
    cells = []
    for c in KEYS:
        v, iso = m["cells"][c], m["iso"][c]
        if v == "out":
            cells.append(f"**{'switch' if m['realism'] == 1 else 'out'}** ({iso:g})")
        elif v == "bold":
            cells.append(f"shared ({iso:g})")
        elif v == "blind":
            cells.append("plateau")
        else:
            cells.append("none")
    o(f"| {m['key']} | {m['realism']} | " + " | ".join(cells) + " |")
o("")
o("What realism costs:")
o("")
o("- On the realism 3 rows that use shape alone (wedge, tip-circle,")
o("  square-circle, stars), box, contact and size all predict the same place.")
o("  Telling box from contact needs an overhang (the interlocking triangles),")
o("  and telling box from size needs neighbors of different sizes. So in the")
o("  most ordinary rows those three are the same rule, and the choice between")
o("  them matters only for overhangs and mixed sizes.")
o("- Contact and hull are told apart only by the notch, by 5.6 sd (8.4 px),")
o("  because the hull fills the notch the triangle's tip enters. Without a")
o("  notch they differ only by how the hull's power mean weighs lines that")
o("  aren't the closest, which is a few px.")
o("- The capped mean and the hull differ by less than 3 sd on the wedge and")
o("  tip-circle; they separate on the notch (24.5 px).")
o("")
o("## The diagnostic: the wedge's slope")
o("")
o("Two squares 30 px apart, then a triangle whose tip points back at the second")
o("square. With a flat side (depth 0) every candidate puts it at 30. The table")
o("gives each candidate's prediction at four wedge depths (the triangle's length")
o("along the row; the survey uses 56, an equilateral-looking triangle).")
o("")
o("| depth | " + " | ".join(KEYS) + " |")
o("| --- | " + " | ".join("---" for _ in KEYS) + " |")
for r in D["wedgeSlopes"]:
    o(f"| {r['depth']} | " + " | ".join(("≥ " if r["blind"].get(k) else "") + num(r["preds"][k]) for k in KEYS) + " |")
last = D["wedgeSlopes"][-1]
o("")
o("Slope at depth 56, in px of v per px of depth: "
  + ", ".join(f"{k} {num((last['preds'][k] - 30) / 56) if last['preds'][k] is not None else 'none'}" for k in KEYS) + ".")
o("Size's slope is 0 only at depth 56, where the triangle's box is the")
o("square's; at shallower depths the triangle's box is narrower.")
o("")
o("## Analysis plan")
o("")
o("Each result block (header `optical-spacing-survey v2c`) has a `theme:` line")
o("(light or dark, from the page's color scheme), an `extended:` line (shown or")
o("hidden), an `invert:` line (the Invert toggle), the window width")
o("(`screen:`), and one line per widget with its value (`unset` if untouched),")
o("its start side and its position on the page.")
o("")
o("- **Start effect.** For each widget, the mean answer from far starts minus")
o("  the mean from close starts, across people. Its sign says whether answers")
o("  stop short of where they would settle; its size, against the noise, says")
o("  whether one pass is enough. Position (`pos=`) enters the same way, as a")
o("  check for fatigue or learning down the page.")
o("- **Comparing strategies.** Every comparison below uses, per widget, the")
o("  mean of the two sides' means, so a start effect that is the same in both")
o("  directions cancels. Where a widget has only a few answers on one side,")
o("  say so rather than leaning on that mean.")
o(f"- **Noise.** Within-person noise comes from {D['repeatOf']} and its mirror,")
o("  using only people who drew the same start side for both: half the squared")
o("  difference of their two answers, averaged. People who drew opposite sides")
o("  give the start effect plus noise. The stars' spread across people is")
o("  execution noise on an easy row where every candidate agrees.")
o("- **Ruling out.** For each candidate, on each core widget where it is")
o("  marked out, compare the mean of the two sides with its prediction. A miss of more")
o("  than 3 sd (the noise above, or 1.5 px until it is measured) rules it out.")
o("  A candidate that survives every one of its widgets stays in. On tips")
o("  (realism 1), a miss means people switch strategy on extreme spikes.")
o("- **If all fail.** Read each person's wedge slope, (answer − 30) / 56, and")
o("  place it among the candidates' slopes. Then check whether the same")
o("  in-between measure also fits the notch and interlock-small answers.")
o("- **One strategy or several.** On the core falsifiers, assign each person")
o("  to the nearest candidate when it is more than 2 sd closer than the next.")
o("  The same candidate for one person across widgets, with people differing,")
o("  means each person keeps a strategy; agreement within a widget with the")
o("  candidate changing across widgets means the shape picks the strategy.")
o("- **Mixed sizes.** If the gap scales with its neighbors' size as size^a,")
o("  mixed-small and mixed-big give a: gap alone predicts 30 on both (a = 0),")
o("  the size candidate predicts 22.5 and 45 (a = 1). Grouping can bend this:")
o("  a small square may read as belonging to its nearer big neighbor, which")
o("  would pull mixed-small below the size line while leaving mixed-big near")
o("  it, so the two rows are read separately before they are combined.")
o(f"- **Scale.** {D['scaleOf']}-double against {D['scaleOf']}, divided by 2: equal if the")
o("  measure scales with the shapes. Its capped prediction sits on the")
o("  plateau, so this pair can rule out the relative cap (pm3cRel) but not the")
o("  absolute one. On a narrow screen the 2x copy is drawn smaller; use")
o("  `screen:` to keep only blocks wide enough to show it whole.")
o("- **Inversion.** A widget's polarity is light on dark when the page is dark")
o("  and the widget is plain, or the page is light and the widget is inverted.")
o("  Within person, notch against notch-invert and square-circle against")
o("  square-circle-invert give the effect of flipping polarity; across people,")
o("  the `theme:` line gives it on every plain widget. Irradiation predicts")
o("  light shapes on dark look larger, so the gaps look smaller and people set")
o("  them wider.")
o("- **Color.** notch against notch-hue (the moving triangle colored) and")
o("  tip-circle against tip-circle-hue (the fixed circle colored), within")
o("  person. The colored shape is a saturated hue with the ink's luminance:")
o("  blue `#000090` in light mode (luminance 0.020 against the ink's 0.017)")
o("  and cyan `#00ffff` in dark mode (0.787 against 0.792). No hue reaches the")
o("  ink's luminance in both themes, so the hue differs by theme; split the")
o("  color comparison by `theme:`.")
o("- **Extended tier.** Only blocks with `extended: shown` count for the")
o("  extended widgets; the rest stand on the core.")
o("")
open(os.path.join(HERE, "survey2_design.md"), "w").write("\n".join(out))
print("wrote survey2_design.md")
