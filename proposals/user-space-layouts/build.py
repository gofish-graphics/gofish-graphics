"""Build index.html from page.html, taking code blocks from proposal.md.

A block is named by an `<!-- id: name -->` comment before its fence in
proposal.md, and page.html places it with `{{code:name}}`. The head (fonts,
highlight.js, styles) and the tab script come from the Voronoi treemap
proposal page so the proposal pages look alike.

Run: python3 proposals/user-space-layouts/build.py
"""

import html
import pathlib
import re

here = pathlib.Path(__file__).parent
md = (here / "proposal.md").read_text()
page = (here / "page.html").read_text()
base = (here.parent / "voronoi-treemap" / "index.html").read_text()

LANG = {"ts": "typescript", "js": "javascript", "python": "python"}
blocks = {
    name: (LANG[lang], code)
    for name, lang, code in re.findall(
        r"<!-- id: ([\w-]+) -->\s*```(\w+)\n(.*?)\n```", md, re.S
    )
}


def code(match):
    lang, text = blocks[match.group(1)]
    return f'<pre><code class="language-{lang}">{html.escape(text)}</code></pre>'


body = re.sub(r"\{\{code:([\w-]+)\}\}", code, page)

links = "\n".join(re.findall(r"<link\b[^>]*?/>", base, re.S))
scripts = "\n".join(re.findall(r'<script src="[^"]+"></script>', base))
style = re.search(r"<style>(.*?)</style>", base, re.S).group(1)
tab_script = re.findall(r"<script>(.*?)</script>", base, re.S)[-1]
tab_script = tab_script.replace(
    '["proposal", "explainer", "rationale"]',
    '["examples", "review", "approaches", "precedent"]',
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
.ladder { display: grid; gap: 6px; max-width: 760px; margin: 16px 0; }
.rung {
  display: grid; grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
  gap: 2px 14px; background: var(--surface); border: 1px solid var(--line);
  border-radius: 6px; padding: 10px 14px;
}
.rung b { grid-row: span 2; align-self: center; }
.rung span { color: var(--muted); font-size: 0.88rem; }
.rung code { justify-self: start; }
@media (max-width: 600px) {
  .rung { grid-template-columns: minmax(0, 1fr); }
  .rung b { grid-row: auto; }
}
ol li { margin: 4px 0; }
"""

out = f"""<title>Layouts in User Space</title>
<meta name="claude:viewport-fit-sides" content="cover" />
{links}
{scripts}
<style>{style}{extra}</style>
{body}
<script>{tab_script}</script>
"""
(here / "index.html").write_text(out)
missing = set(re.findall(r"\{\{code:([\w-]+)\}\}", page)) - set(blocks)
print("blocks:", len(blocks), "missing:", missing, "bytes:", len(out))
