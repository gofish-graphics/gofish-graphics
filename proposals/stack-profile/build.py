# Build page.html and proposal.md from content.py. Run from the repo root:
#   python3 proposals/stack-profile/build.py
import html, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import content as C  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# --- collect and format every snippet once -------------------------------
snips = []


def snip(lang, code):
    if code is None:
        return None
    snips.append({"lang": lang, "code": code})
    return len(snips) - 1


for ex in C.EXAMPLES:
    ex["_A_js"] = snip("js", ex["A_js"])
    ex["_A_py"] = snip("python", ex["A_py"])
    ex["_today"] = snip("js", ex["today_js"])
    for k in "BC":
        ex["_" + k + "_js"] = snip("js", ex[k + "_js"])
        ex["_" + k + "_py"] = snip("python", ex[k + "_py"])
for p in C.PRECEDENT:
    p["_code"] = snip(p["lang"], p["code"])
for ins in C.INSERTS:
    ins["_codes"] = [(label, snip("js", js), snip("python", py)) for label, js, py in ins["codes"]]

res = subprocess.run(
    ["node", "proposals/_tools/format-snippets.mjs"],
    input=json.dumps(snips), capture_output=True, text=True, cwd=REPO, check=True,
)
formatted = json.loads(res.stdout)
bad = [f["code"].splitlines()[0] for f in formatted if not f["ok"]]
if bad:
    print("NOT FORMATTED:", *bad, sep="\n  ")

HL = re.compile(r"\s*(//|#) @hl\s*$")


def code_lines(i):
    """Formatted code with @hl markers removed, and the highlighted line numbers."""
    lines, hl = [], []
    for line in formatted[i]["code"].split("\n"):
        if HL.search(line):
            line = HL.sub("", line)
            if not line.strip() and lines:
                # prettier moved the marker onto its own line: mark the line above
                hl.append(len(lines) - 1)
                continue
            hl.append(len(lines))
        lines.append(line)
    return "\n".join(lines), hl


# --- HTML ------------------------------------------------------------------
LANG_CLASS = {"js": "javascript", "python": "python", "r": "r", "json": "json", "text": "plaintext"}


def pre(i, lang, extra=""):
    if i is None:
        return ""
    code, hl = code_lines(i)
    return (
        f'<pre class="code {extra}"><code class="language-{LANG_CLASS[lang]}" '
        f'data-hl="{",".join(map(str, hl))}">{html.escape(code)}</code></pre>'
    )


def both(i_js, i_py):
    """A JS block and a Python block; the page toggle shows one."""
    out = pre(i_js, "js", "lang-js")
    out += pre(i_py, "python", "lang-py") if i_py is not None else pre(i_js, "js", "lang-py")
    return out


def nlines(i):
    return 0 if i is None else formatted[i]["code"].count("\n") + 1


def example_card(n, ex):
    imgs = "".join(
        f'<figure><img src="img/{f}" alt="{html.escape(re.sub("<[^>]+>", "", cap))}">'
        f"<figcaption>{cap}</figcaption></figure>"
        for f, cap in ex["imgs"]
    )
    today = ex["_today"]
    if today is None:
        today_html = f'<p class="label">{ex["today_label"]}</p>'
    else:
        body = pre(today, "js")
        if nlines(today) > 12:
            body = f'<details><summary>{ex["today_label"]} ({nlines(today)} lines)</summary>{body}</details>'
        else:
            body = f'<p class="label">{ex["today_label"]}</p>{body}'
        today_html = body
    others = ""
    for k in "BC":
        ij, ip = ex["_" + k + "_js"], ex["_" + k + "_py"]
        inner = both(ij, ip) if ij is not None else '<p class="muted">The same as A.</p>'
        others += f'<div><p class="label">{k}: {ex["verdict"][k]}</p>{inner}</div>'
    verdict = "".join(f'<tr><th>{k}</th><td>{ex["verdict"][k]}</td></tr>' for k in "ABC")
    return f"""
<article class="card" id="{ex['id']}">
  <h3>{n}. {ex['title']}</h3>
  <div class="figs">{imgs}</div>
  <p>{ex['text']}</p>
  <p class="label">{ex.get('A_label', 'Proposed (A)')}</p>
  {both(ex['_A_js'], ex['_A_py'])}
  <div class="today">{today_html}</div>
  <table class="verdict">{verdict}</table>
  <details><summary>B and C spellings</summary><div class="two">{others}</div></details>
</article>"""


def insert_card(ins):
    figs = "".join(
        f'<figure><img src="img/{f}" alt="{html.escape(re.sub("<[^>]+>", "", cap))}">'
        f"<figcaption>{cap}</figcaption></figure>"
        for f, cap in ins["figs"]
    )
    codes = "".join(f'<p class="label">{label}</p>{both(j, p)}' for label, j, p in ins["_codes"])
    return f"""
<article class="card insert" id="{ins['id']}">
  <h3>{ins['title']}</h3>
  <p>{ins['intro']}</p>
  {f'<div class="figs">{figs}</div>' if figs else ''}
  {codes}
  {ins['body']}
</article>"""


def cards_with_inserts():
    out = []
    for n, e in enumerate(examples):
        out.append(example_card(n + 1, e))
        out += [insert_card(i) for i in C.INSERTS if i["after"] == e["id"]]
    return "".join(out)


def precedent_card(p):
    img = f'<img src="img/{p["img"]}" alt="{p["name"]} render">' if p["img"] else ""
    return f"""<article class="card small"><h4>{p['name']}</h4>{img}{pre(p['_code'], p['lang'])}<p>{p['note']}</p></article>"""


def approach_card(a):
    comp = "".join(f"<li>{c}</li>" for c in a["composes"])
    ov = "".join(f"<tr><td>{x}</td><td>{y}</td></tr>" for x, y in a["overlaps"])
    tr = "".join(f"<li>{t}</li>" for t in a["tradeoffs"])
    return f"""<article class="card approach {'rec' if a['key']=='A' else ''}">
  <h3>{a['name']}</h3><p>{a['idea']}</p>
  <h4>Composition</h4><ul>{comp}</ul>
  <p><b>Desugaring.</b> {a['desugar']}</p>
  <h4>Overlap check</h4><div class="table-wrap"><table><tr><th>Pair</th><th>Overlap</th></tr>{ov}</table></div>
  <h4>Trade-offs</h4><ul>{tr}</ul>
</article>"""


order = {e["id"]: e for e in C.EXAMPLES}
examples = [order[i] for i in C.SIDE_BY_SIDE_ORDER]
verdict_rows = "".join(
    f'<tr><td><a href="#{e["id"]}">{e["title"]}</a></td>'
    + "".join(f'<td class="{"bad" if v.startswith("can") else ""}">{v}</td>' for v in (e["verdict"][k] for k in "ABC"))
    + "</tr>"
    for e in examples
)

CSS = """
:root{--bg:#fbfaf7;--fg:#1f2328;--muted:#5f6670;--card:#ffffff;--line:#e3e0d8;--accent:#2f6f9f;--rec:#e9f3ea;--rec-line:#7aa77f;--hl:#fff1b8;--code-bg:#f6f5f1;--bad:#b3412e;
--hk:#8a3ea8;--hs:#1f7a3a;--hn:#9a5b00;--hc:#7b8590;--ht:#2f6f9f}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#16181b;--fg:#e6e6e3;--muted:#a0a6ad;--card:#1e2125;--line:#33373d;--accent:#7fb3dc;--rec:#1d2a20;--rec-line:#4f7d55;--hl:#4a4020;--code-bg:#191b1f;--bad:#e58a77;--hk:#d199ef;--hs:#8fd4a0;--hn:#f0b46a;--hc:#8a929b;--ht:#7fb3dc}}
:root[data-theme="dark"]{--bg:#16181b;--fg:#e6e6e3;--muted:#a0a6ad;--card:#1e2125;--line:#33373d;--accent:#7fb3dc;--rec:#1d2a20;--rec-line:#4f7d55;--hl:#4a4020;--code-bg:#191b1f;--bad:#e58a77;--hk:#d199ef;--hs:#8fd4a0;--hn:#f0b46a;--hc:#8a929b;--ht:#7fb3dc}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 "Inter",system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:2rem;margin:.2em 0 .4em}h2{margin-top:2.4em;border-bottom:1px solid var(--line);padding-bottom:.2em}
h3{margin:.2em 0 .5em;font-size:1.15rem}h4{margin:1em 0 .3em}
a{color:var(--accent)}code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.88em}
.summary{font-size:1.05rem}.summary li{margin:.4em 0}
.rec-box{background:var(--rec);border:1px solid var(--rec-line);border-radius:10px;padding:14px 16px;margin:16px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0;min-width:0}
.card.approach.rec{border-color:var(--rec-line);box-shadow:0 0 0 2px var(--rec) inset}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:16px}
.grid .card{margin:0}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:12px}
.figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;margin-bottom:8px}
figure{margin:0}img{max-width:100%;height:auto;display:block;border-radius:6px;background:#fff}
figcaption{font-size:.85rem;color:var(--muted);margin-top:4px}
.small img{margin-bottom:8px}.small p{font-size:.9rem}
pre.code{background:var(--code-bg);border:1px solid var(--line);border-radius:8px;padding:10px 0;overflow-x:auto;margin:6px 0 10px;font-size:.84rem;line-height:1.45}
pre.code code{display:block;min-width:max-content}
pre.code .ln{display:block;padding:0 12px}pre.code .ln.hl{background:var(--hl);box-shadow:inset 3px 0 0 var(--accent)}
.label{font-size:.82rem;font-weight:600;color:var(--muted);margin:10px 0 2px;text-transform:none}
.muted{color:var(--muted)}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
table.verdict{width:auto;margin:8px 0}table.verdict th{width:2.5em}
td.bad{color:var(--bad)}
details{margin:8px 0}summary{cursor:pointer;color:var(--accent);font-weight:600}
.toggle{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.toggle button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;padding:3px 12px;cursor:pointer}
.toggle button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);font-weight:600}
body.py .lang-js{display:none}body:not(.py) .lang-py{display:none}
.decisions li{margin:.5em 0}
.card.insert{border-left:4px solid var(--accent)}
.insert .figs{grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))}
table.methods td{min-width:9em}
.hljs-keyword,.hljs-built_in{color:var(--hk)}.hljs-string{color:var(--hs)}.hljs-number,.hljs-literal{color:var(--hn)}.hljs-comment{color:var(--hc);font-style:italic}.hljs-title,.hljs-attr,.hljs-property{color:var(--ht)}
"""

JS = """
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/r.min.js"></script>
<script>
document.querySelectorAll("pre.code code").forEach(function (el) {
  if (window.hljs) hljs.highlightElement(el);
  var hl = (el.dataset.hl || "").split(",").filter(Boolean).map(Number);
  el.innerHTML = el.innerHTML.split("\\n").map(function (l, i) {
    return '<span class="ln' + (hl.indexOf(i) >= 0 ? " hl" : "") + '">' + (l || " ") + "</span>";
  }).join("");
});
function setLang(py) {
  document.body.classList.toggle("py", py);
  document.querySelectorAll(".toggle button").forEach(function (b) {
    b.setAttribute("aria-pressed", String((b.dataset.lang === "py") === py));
  });
  try { localStorage.setItem("sp-lang", py ? "py" : "js"); } catch (e) {}
}
document.querySelectorAll(".toggle button").forEach(function (b) {
  b.addEventListener("click", function () { setLang(b.dataset.lang === "py"); });
});
try { setLang(localStorage.getItem("sp-lang") === "py"); } catch (e) { setLang(false); }
</script>
"""

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">'

terms = "".join(f"<tr><td><b>{t}</b></td><td>{d}</td></tr>" for t, d in C.TERMS)
page = f"""<title>{C.TITLE}</title>
<style>{CSS}</style>
{FONTS}
<main>
<h1>Stack profiles: one geometry for stacking and dividing</h1>
<ul class="summary">{''.join(f'<li>{s}</li>' for s in C.SUMMARY)}</ul>
<div class="rec-box">{C.RECOMMENDATION}</div>
<div class="toggle"><span class="muted">Code in</span><button data-lang="js" aria-pressed="true">JavaScript</button><button data-lang="py" aria-pressed="false">Python</button></div>

<h2>Rules</h2>
<ul>{''.join(f'<li>{r}</li>' for r in C.RULES)}</ul>
<details><summary>Terms used on this page</summary><div class="table-wrap"><table>{terms}</table></div></details>

<h2>Precedent</h2>
<p>How other systems stack, align and divide. Images marked real are rendered here from the code shown.</p>
<div class="grid">{''.join(precedent_card(p) for p in C.PRECEDENT)}</div>

<h2>Approaches</h2>
<div class="grid3">{''.join(approach_card(a) for a in C.APPROACHES)}</div>

<h2>Examples</h2>
<p>Each card shows the render, the spelling in A, today's spelling, and how each approach fares. Highlighted lines are the ones that change. Renders marked emulated are drawn by today's engine from precomputed rows; the proposed code does not run yet.</p>
{cards_with_inserts()}

<h2>Trade-offs</h2>
<div class="table-wrap"><table><tr><th>Example</th><th>A. Profiles</th><th>B. Per-x core</th><th>C. Divide a drawn whole</th></tr>{verdict_rows}</table></div>
<h4>New syntax in A</h4>
<ul>{''.join(f'<li>{s}</li>' for s in C.SYNTAX_CHANGES)}</ul>

<h2>Recommendation</h2>
<div class="rec-box">{C.RECOMMENDATION}</div>
<p>A is the only approach that writes every example here as one local stack, spread or partition, with one definition of a shape's thickness. B is its shortcut: the rewrite from A to the per-x form is how A ships first. C is the right reading for shapes the spec really draws first, and A keeps it as <code>cut</code> with a region operator.</p>

<details><summary><b>Rationale</b>: the profile, its readers, locality, baseline, cut, sampling, implementation</summary>
<h3>The profile</h3>{C.SECTIONS_PROFILE}
<h3>Readers</h3>{C.SECTIONS_READERS}
<h3>What stays local, and why</h3>{C.SECTIONS_LOCALITY}
<h3>Baseline and StackOrigin</h3>{C.SECTIONS_BASELINE}
<h3>Cut</h3>{C.SECTIONS_CUT}
<h3>Sampling and the continuum</h3>{C.SECTIONS_SAMPLING}
<h3>Implementation path</h3>{C.SECTIONS_IMPL}
<h3>Bugs seen while rendering</h3><ul>{''.join(f'<li>{b}</li>' for b in C.BUGS)}</ul>
<h3>Related issues</h3><ul>{''.join(f'<li><b>{n}</b>: {g}</li>' for n, g in C.RELATED)}</ul>
</details>

<h2>Decisions</h2>
<ol class="decisions">{''.join(f'<li>{d}</li>' for d in C.DECISIONS)}</ol>
</main>
{JS}
"""
open(os.path.join(HERE, "page.html"), "w").write(page)

# --- Markdown -----------------------------------------------------------------


def md(s):
    s = re.sub(r"<b>(.*?)</b>", r"**\1**", s, flags=re.S)
    s = re.sub(r"<code>(.*?)</code>", r"`\1`", s, flags=re.S)
    s = re.sub(r"<li>", "\n- ", s)
    s = re.sub(r"</?(ul|li|p|ol)>", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return html.unescape(s).strip()


def fence(i, lang):
    if i is None:
        return ""
    code, _ = code_lines(i)
    return f"```{lang}\n{code}\n```\n"


out = [f"# {C.TITLE}: one geometry for stacking and dividing\n"]
out += [f"{n}. {md(s)}" for n, s in enumerate(C.SUMMARY, 1)]
out += ["", md(C.RECOMMENDATION), "", "The review page is `page.html` beside this file.", "", "## Rules", ""]
out += [f"- {md(r)}" for r in C.RULES]
out += ["", "## Terms", "", "| Term | Meaning |", "| --- | --- |"]
out += [f"| {t} | {md(d)} |" for t, d in C.TERMS]
out += ["", "## Approaches", ""]
for a in C.APPROACHES:
    out += [f"### {a['name']}", "", md(a["idea"]), "", "Composition:", ""]
    out += [f"- {md(c)}" for c in a["composes"]]
    out += ["", f"Desugaring: {md(a['desugar'])}", "", "| Pair | Overlap |", "| --- | --- |"]
    out += [f"| {md(x)} | {md(y)} |" for x, y in a["overlaps"]]
    out += ["", "Trade-offs:", ""] + [f"- {md(t)}" for t in a["tradeoffs"]] + [""]
out += ["## Examples", ""]
for n, ex in enumerate(examples, 1):
    out += [f"### {n}. {md(ex['title'])}", ""]
    for f, cap in ex["imgs"]:
        out += [f"![{md(cap)}](img/{f})", "", f"*{md(cap)}*", ""]
    out += [md(ex["text"]), "", md(ex.get("A_label", "Proposed (A)")) + ":", "", fence(ex["_A_js"], "js"), fence(ex["_A_py"], "python")]
    out += [f"{md(ex['today_label'])}:", "", fence(ex["_today"], "js")]
    for k in "BC":
        out += [f"{k} ({ex['verdict'][k]}):", ""]
        if ex["_" + k + "_js"] is None:
            out += ["The same as A.", ""]
        else:
            out += [fence(ex["_" + k + "_js"], "js"), fence(ex["_" + k + "_py"], "python")]
    for ins in [i for i in C.INSERTS if i["after"] == ex["id"]]:
        out += [f"### {md(ins['title'])}", "", md(ins["intro"]), ""]
        for f, cap in ins["figs"]:
            out += [f"![{md(cap)}](img/{f})", "", f"*{md(cap)}*", ""]
        for label, j, p in ins["_codes"]:
            out += [f"{md(label)}:", "", fence(j, "js"), fence(p, "python")]
        out += [ins["body"].strip(), ""]
out += ["## Trade-offs", "", "| Example | A | B | C |", "| --- | --- | --- | --- |"]
out += [f"| {md(e['title'])} | " + " | ".join(e["verdict"][k] for k in "ABC") + " |" for e in examples]
out += ["", "New syntax in A:", ""] + [f"- {md(s)}" for s in C.SYNTAX_CHANGES]
out += ["", "## The profile", "", md(C.SECTIONS_PROFILE), "", "## Readers", "", C.SECTIONS_READERS.strip(), ""]
out += ["## What stays local, and why", "", md(C.SECTIONS_LOCALITY), "", "## Baseline and StackOrigin", "", md(C.SECTIONS_BASELINE)]
out += ["", "## Cut", "", md(C.SECTIONS_CUT), "", "## Sampling and the continuum", "", md(C.SECTIONS_SAMPLING)]
out += ["", "## Implementation path", "", re.sub(r"\n- ", "\n1. ", md(C.SECTIONS_IMPL.replace("<ol>", "<ul>").replace("</ol>", "</ul>")))]
out += ["", "## Precedent", ""]
for p in C.PRECEDENT:
    out += [f"### {p['name']}", ""]
    if p["img"]:
        out += [f"![{p['name']}](img/{p['img']})", ""]
    out += [fence(p["_code"], {"text": ""}.get(p["lang"], p["lang"])), md(p["note"]), ""]
out += ["## Bugs seen while rendering", ""] + [f"- {md(b)}" for b in C.BUGS]
out += ["", "## Related issues", ""] + [f"- {n}: {md(g)}" for n, g in C.RELATED]
out += ["", "## Decisions", ""] + [f"{n}. {md(d)}" for n, d in enumerate(C.DECISIONS, 1)] + [""]
open(os.path.join(HERE, "proposal.md"), "w").write("\n".join(out))
print("ok", len(page), "bytes")
