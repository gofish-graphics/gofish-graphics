import json, re, sys
# usage: cmp_stack.py <story slug> <d3 key, e.g. "wiggle/insideOut">
# Each x column's band rects, bottom first, are paired with d3's series in
# d3's stacking order. Pixels are fit to d3's units by ONE scale k (from the
# band heights) and ONE offset c (where d3's 0 lands): px = c - k * y.
ROOT = "/Users/jmp/gofish-20250316/.claude/worktrees/layout-dsl-proposal/tests/tmp/iterate/proposals/"
slug, key = sys.argv[1], sys.argv[2]
ref = json.load(open("/Users/jmp/.claude/jobs/a4ed3dcc/tmp/d3s/stack.json"))
bands, order = ref[key], ref[key + "/order"]
html = open(ROOT + "user-space-d3-flow--" + slug + ".html").read()
cols = {}
for m in re.finditer(r"<rect([^>]*)>", html):
    a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1)))
    x, y, h = float(a["x"]), float(a["y"]), float(a["height"])
    cols.setdefault(round(x, 3), []).append((y + h, y))  # (bottom, top) in px
xs = sorted(cols)
pairs = []  # (d3 y0, d3 y1, px bottom, px top)
for j, x in enumerate(xs):
    got = sorted(cols[x], reverse=True)  # bottom first
    assert len(got) == len(order), (x, len(got))
    for s, (b, t) in zip(order, got):
        y0, y1 = bands[s][j]
        pairs.append((y0, y1, b, t))
ks = sorted((b - t) / (y1 - y0) for y0, y1, b, t in pairs)
k = ks[len(ks) // 2]
c = sum(b + k * y0 for y0, y1, b, t in pairs) / len(pairs)
err = max(max(abs(b - (c - k * y0)), abs(t - (c - k * y1))) for y0, y1, b, t in pairs)
kerr = ks[-1] - ks[0]
print(f"{slug} vs d3 {key}: {len(xs)} x, {len(pairs)} bands; k = {k:.6f} px/unit (spread {kerr:.2e}), c = {c:.4f}; max |edge| diff = {err:.6f} px")
