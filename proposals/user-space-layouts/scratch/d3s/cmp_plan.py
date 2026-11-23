import json
D = "/Users/jmp/.claude/jobs/a4ed3dcc/tmp/d3s/"
p = json.load(open(D + "plan.json"))
r = json.load(open(D + "sankey.json"))
for a in ["left", "right", "justify", "center"]:
    print(a, "column mismatches:", [n for n in r[a] if p[a][n] != r[a][n]])
print("ky plan", p["ky"], "d3", r["ky"])
for k in ["relaxed", "relaxedLR", "relaxed6"]:
    for ref in ["relaxed", "stacked"]:
        dy0 = max(abs(p[k][n][0] - r[ref]["nodes"][n][2]) for n in p[k])
        mean = sum(abs(p[k][n][0] - r[ref]["nodes"][n][2]) for n in p[k]) / len(p[k])
        worst = max(p[k], key=lambda n: abs(p[k][n][0] - r[ref]["nodes"][n][2]))
        print(f"{k} vs d3 {ref}: max |y0| {dy0:.3f} ({worst}), mean {mean:.3f}")
print("plan relaxed:", {n: round(v[0], 2) for n, v in p["relaxed"].items()})
print("d3 relaxed:  ", {n: round(v[2], 2) for n, v in r["relaxed"]["nodes"].items()})
