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


for sec in C.SECTIONS:
    for b in sec["blocks"]:
        if b[0] == "item":
            d = b[1]
            d["_js"], d["_py"], d["_today"] = snip("js", d["js"]), snip("python", d["py"]), snip("js", d.get("today_js"))
        elif b[0] == "code":
            b.append((snip("js", b[2]), snip("python", b[3])))
        elif b[0] == "today":
            b.append(snip("js", b[2]))

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




def fig(f, cap, cls=""):
    alt = html.escape(re.sub("<[^>]+>", "", cap))
    return f'<figure class="{cls}"><img src="img/{f}" alt="{alt}"><figcaption>{cap}</figcaption></figure>'


def block_html(b):
    kind = b[0]
    if kind == "p":
        return b[1]
    if kind == "figs":
        return f'<div class="figs">{"".join(fig(f, c) for f, c in b[1])}</div>'
    if kind == "wide":
        return fig(b[1], b[2], "wide")
    if kind == "code":
        ij, ip = b[4]
        return f'<p class="label">{b[1]}</p>{both(ij, ip)}'
    if kind == "today":
        return f'<p class="label">{b[1]}</p>{pre(b[3], "js")}'
    if kind == "item":
        d = b[1]
        today = ""
        if d["_today"] is not None:
            today = f'<p class="label">{d["today_label"]}</p>{pre(d["_today"], "js")}'
        elif d.get("today_label"):
            today = f'<p class="label">{d["today_label"]}</p>'
        return f"""<div class="item">{fig(d["img"], d["cap"])}<div><p class="label">{d.get("label", "Proposed")}</p>{both(d["_js"], d["_py"])}{today}</div></div>"""
    raise ValueError(kind)


sections = "".join(
    f'<h2 id="{sec["id"]}">{sec["title"]}</h2><article class="card">{"".join(block_html(b) for b in sec["blocks"])}</article>'
    for sec in C.SECTIONS
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
.item{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;align-items:start;border-top:1px solid var(--line);padding-top:12px;margin-top:12px}
.wide img{width:100%}
.note{font-size:.9rem;color:var(--muted)}
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
<h1>{C.H1}</h1>
<ul class="summary">{''.join(f'<li>{s}</li>' for s in C.SUMMARY)}</ul>
<p class="note">{C.FULL_LINK}</p>
<div class="toggle"><span class="muted">Code in</span><button data-lang="js" aria-pressed="true">JavaScript</button><button data-lang="py" aria-pressed="false">Python</button></div>
<details><summary>Terms used on this page</summary><div class="table-wrap"><table>{terms}</table></div></details>
{sections}
<h2>Rules</h2>
<ul>{''.join(f'<li>{r}</li>' for r in C.RULES)}</ul>
<h2>Decisions</h2>
<ol class="decisions">{''.join(f'<li>{d}</li>' for d in C.DECISIONS)}</ol>
</main>
{JS}
"""
open(os.path.join(HERE, "page.html"), "w").write(page)

# --- Markdown -----------------------------------------------------------------


def md(s):
    s = re.sub(r"<b>(.*?)</b>", r"**\1**", s, flags=re.S)
    s = re.sub(r"<i>(.*?)</i>", r"*\1*", s, flags=re.S)
    s = re.sub(r"<code>(.*?)</code>", r"`\1`", s, flags=re.S)
    s = re.sub(r'<a href="([^"]+)">(.*?)</a>', r"[\2](\1)", s, flags=re.S)
    s = re.sub(r"<h4>(.*?)</h4>", r"\n#### \1\n", s, flags=re.S)
    s = re.sub(r"<li>", "\n- ", s)
    s = re.sub(r"</?(ul|li|p|ol)>", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return html.unescape(s).strip()


def fence(i, lang):
    if i is None:
        return ""
    code, _ = code_lines(i)
    return f"```{lang}\n{code}\n```\n"


def block_md(b):
    kind = b[0]
    if kind == "p":
        return [b[1].strip() if "<table" in b[1] else md(b[1]), ""]
    if kind == "figs":
        return [x for f, c in b[1] for x in (f"![{md(c)}](img/{f})", "", f"*{md(c)}*", "")]
    if kind == "wide":
        return [f"![{md(b[2])}](img/{b[1]})", "", f"*{md(b[2])}*", ""]
    if kind == "code":
        ij, ip = b[4]
        return [md(b[1]) + ":", "", fence(ij, "js"), fence(ip, "python")]
    if kind == "today":
        return [md(b[1]) + ":", "", fence(b[3], "js")]
    d = b[1]
    out = [f"![{md(d['cap'])}](img/{d['img']})", "", f"*{md(d['cap'])}*", "", md(d.get("label", "Proposed")) + ":", "", fence(d["_js"], "js"), fence(d["_py"], "python")]
    if d.get("today_label"):
        out += [md(d["today_label"]) + ":", "", fence(d["_today"], "js")]
    return out


out = [f"# {md(C.H1)}", ""]
out += [f"{n}. {md(s)}" for n, s in enumerate(C.SUMMARY, 1)]
out += ["", md(C.FULL_LINK), "", "The review page is `page.html` beside this file.", "", "## Terms", "", "| Term | Meaning |", "| --- | --- |"]
out += [f"| {t} | {md(d)} |" for t, d in C.TERMS]
for sec in C.SECTIONS:
    out += ["", f"## {md(sec['title'])}", ""]
    for b in sec["blocks"]:
        out += block_md(b)
out += ["## Rules", ""] + [f"- {md(r)}" for r in C.RULES]
out += ["", "## Decisions", ""] + [f"{n}. {md(d)}" for n, d in enumerate(C.DECISIONS, 1)] + [""]
open(os.path.join(HERE, "proposal.md"), "w").write("\n".join(out))
print("ok", len(page), "bytes")
