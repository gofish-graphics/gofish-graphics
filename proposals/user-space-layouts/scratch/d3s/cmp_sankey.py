import json, re, sys
# usage: cmp_sankey.py <story slug> <d3 key in sankey.json>
# Pairs the story's node rects (DOM order: column by column, input order)
# with d3's nodes sorted by (x0, input index), and its ribbons (DOM order =
# link order) with d3's links; prints the max |difference| of each field.
ROOT = "/Users/jmp/gofish-20250316/.claude/worktrees/layout-dsl-proposal/tests/tmp/iterate/proposals/"
slug, key = sys.argv[1], sys.argv[2]
ref = json.load(open("/Users/jmp/.claude/jobs/a4ed3dcc/tmp/d3s/sankey.json"))[key]
html = open(ROOT + "user-space-d3-flow--" + slug + ".html").read()
rects = []
for m in re.finditer(r"<rect([^>]*)>", html):
    a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1)))
    if a.get("fill") == "#2f3e46":
        x, y, w, h = (float(a[k]) for k in ("x", "y", "width", "height"))
        rects.append((x, x + w, y, y + h))
names = list(ref["nodes"].keys())
order = sorted(names, key=lambda n: (ref["nodes"][n][0], names.index(n)))
d = [0, 0, 0, 0]
worst = ["", "", "", ""]
for n, r in zip(order, rects):
    for k in range(4):
        e = abs(r[k] - ref["nodes"][n][k])
        if e > d[k]:
            d[k], worst[k] = e, n
print("nodes", len(rects), "of", len(order))
for k, f in enumerate(["x0", "x1", "y0", "y1"]):
    print(f"  max |{f}| diff = {d[k]:.6f}  ({worst[k]})")
paths = re.findall(r'<path d="M([-\d.]+),([-\d.]+) C[-\d., ]*? ([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+) C[-\d., ]*? ([-\d.]+),([-\d.]+) L', html)
ld = [0, 0, 0]
for p, l in zip(paths, ref["links"]):
    sx, stop, tx, ttop, tx2, tbot, sx2, sbot = map(float, p)
    got = ((stop + sbot) / 2, (ttop + tbot) / 2, sbot - stop)
    for k in range(3):
        ld[k] = max(ld[k], abs(got[k] - l[2 + k]))
print("links", len(paths), "of", len(ref["links"]))
print(f"  max |link y0| diff = {ld[0]:.6f}, |link y1| = {ld[1]:.6f}, |width| = {ld[2]:.6f}")
