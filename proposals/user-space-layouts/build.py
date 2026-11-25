"""Build index.html and proposal.md from page.html and snippets.md.

- snippets.md holds every code block, each named by an `<!-- id: name -->`
  comment above its fence.
- page.html is the page, written by hand. It places a block with
  `{{code:name}}`.
- index.html is the published artifact. Its head (fonts, highlight.js,
  styles) and tab script come from the Voronoi treemap proposal page so the
  proposal pages look alike.
- proposal.md is the same content as one linear document, made from the page
  with pandoc.

Run: python3 proposals/user-space-layouts/build.py
"""

import html
import pathlib
import re
import subprocess

here = pathlib.Path(__file__).parent
snippets = (here / "snippets.md").read_text()
page = (here / "page.html").read_text()
base = (here.parent / "voronoi-treemap" / "index.html").read_text()

LANG = {
    "ts": "typescript",
    "js": "javascript",
    "python": "python",
    "text": "plaintext",
    "swift": "swift",
}
blocks = {
    name: (lang, code)
    for name, lang, code in re.findall(
        r"<!-- id: ([\w-]+) -->\s*```(\w+)\n(.*?)\n```", snippets, re.S
    )
}
used = set(re.findall(r"\{\{code:([\w-]+)\}\}", page))
missing = used - set(blocks)
assert not missing, f"page.html uses unknown code blocks: {missing}"

# ----------------------------------------------------------------- index.html


def code_html(match):
    lang, text = blocks[match.group(1)]
    return (
        f'<pre><code class="language-{LANG[lang]}">{html.escape(text)}</code></pre>'
    )


body = re.sub(r"\{\{code:([\w-]+)\}\}", code_html, page)

links = "\n".join(re.findall(r"<link\b[^>]*?/>", base, re.S))
scripts = "\n".join(re.findall(r'<script src="[^"]+"></script>', base))
style = re.search(r"<style>(.*?)</style>", base, re.S).group(1)
tabs = re.findall(r'aria-controls="([\w-]+)"', page)
tab_script = re.findall(r"<script>(.*?)</script>", base, re.S)[-1]
tab_script = tab_script.replace(
    '["proposal", "explainer", "rationale"]',
    "[" + ", ".join(f'"{t}"' for t in tabs) + "]",
)

extra = """
main {
  padding: 0;
  padding-block: 32px 80px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
.gallery { max-width: 900px; }
.gallery .strip { grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); }
.strip.wide { grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); }
.strip.small { grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr)); }
.natural { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
.natural figure {
  margin: 0; background: #fff; border: 1px solid var(--line);
  border-radius: 6px; padding: 6px; max-width: 100%;
}
.natural img { display: block; max-width: 100%; height: auto; margin: 0; }
.natural figcaption { font-size: 0.8rem; color: #444; padding: 4px 2px 0; max-width: 46ch; }
.natural figcaption b { font-family: var(--mono); font-weight: 500; color: #1d2430; }
.card .callout { margin: 4px 0; max-width: none; font-size: 0.92rem; }
.card pre { max-width: 100%; }
ol li { margin: 4px 0; }
ul.tight { margin: 0; padding-left: 20px; font-size: 0.92rem; }
ul.tight li { margin: 4px 0; }
h2.first { margin-top: 28px; }
.flow3 {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px; max-width: 900px; margin: 16px 0;
}
.flow3 .step {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 8px; padding: 12px 14px; min-width: 0;
}
.flow3 .step b { display: block; font-family: var(--display); font-size: 1.05rem; }
.flow3 .step span { display: block; color: var(--muted); font-size: 0.88rem; margin-top: 4px; }
.flow3 .step em { display: block; font-style: normal; font-size: 0.85rem; margin-top: 8px; }
@media (max-width: 700px) { .flow3 { grid-template-columns: minmax(0, 1fr); } }
.ev { display: inline-block; font: 500 0.72rem/1.2 var(--body); padding: 3px 6px; border-radius: 3px; }
.ev.exact { background: var(--add); color: var(--ink); }
.ev.close { background: var(--warn-soft); color: var(--warn); }
.ev.paper { background: var(--code-bg); color: var(--muted); }
.ev.no { background: var(--del); color: var(--ink); }
"""

index = f"""<title>Layouts in User Space</title>
<meta name="claude:viewport-fit-sides" content="cover" />
{links}
{scripts}
<style>{style}{extra}</style>
{body}
<script>{tab_script}</script>
"""
(here / "index.html").write_text(index)

# ---------------------------------------------------------------- proposal.md
# One linear document: a tab becomes a section (h2), a heading inside a tab
# an h3, and a card an h4.


def code_md(match):
    lang, text = blocks[match.group(1)]
    return f'<pre class="{lang}"><code>{html.escape(text)}</code></pre>'


def sub(pattern, repl, text):
    return re.sub(pattern, repl, text, flags=re.S)


m = sub(r"\{\{code:([\w-]+)\}\}", code_md, page)
m = sub(r'<div class="tabs".*?</div>', "", m)
m = sub(r"<h3[^>]*>(.*?)</h3>", r"<h4>\1</h4>", m)
m = sub(r"<h2[^>]*>(.*?)</h2>", r"<h3>\1</h3>", m)
m = sub(r'<section[^>]*data-title="([^"]*)"[^>]*>', r"<h2>\1</h2>", m)
m = m.replace("</section>", "")
m = sub(r'<span class="(?:tag|ev)[^"]*">(.*?)</span>', r" (\1)", m)
m = sub(
    r"<figure>\s*<img\s+src=\"([^\"]+)\"\s+alt=\"([^\"]*)\"\s*/>\s*<figcaption>(.*?)</figcaption>\s*</figure>",
    r'<p><img src="\1" alt="\2" /></p><p><em>\3</em></p>',
    m,
)
m = sub(r"<details[^>]*>\s*<summary>(.*?)</summary>", r"<p><strong>\1</strong></p>", m)
m = m.replace("</details>", "")
m = sub(r'<div class="callout">(.*?)</div>', r"<blockquote><p>\1</p></blockquote>", m)
m = sub(
    r'<div class="step">\s*<b>(.*?)</b>\s*<span>(.*?)</span>\s*<em>(.*?)</em>\s*</div>',
    r"<p><strong>\1.</strong> \2 \3</p>",
    m,
)
m = sub(r'<p class="label[^"]*">(.*?)</p>', r"<p><strong>\1</strong></p>", m)

md = subprocess.run(
    ["pandoc", "-f", "html", "-t", "gfm", "--wrap=none"],
    input=m,
    text=True,
    capture_output=True,
    check=True,
).stdout
md = re.sub(r"^</?div[^>]*>\n", "", md, flags=re.M)
md = re.sub(r"\n{3,}", "\n\n", md)
md = re.sub(r"^``` (\w+)$", r"```\1", md, flags=re.M)
(here / "proposal.md").write_text(md)

print(
    "blocks:", len(blocks), "used:", len(used),
    "bytes:", len(index), "md lines:", md.count("\n"),
)
