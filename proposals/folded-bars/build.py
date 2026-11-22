"""Build page.html from page.src.html.

`{{code:name}}` in the template becomes a highlighted code block. Proposed
code comes from the fenced blocks of proposal.md, in order. Today's code comes
verbatim from the prototype stories. JS goes through the repo's prettier and
Python through black. `<img src="img/...">` gets its width and height.

Run from the repo root: python3 proposals/folded-bars/build.py
"""

import html
import pathlib
import re
import subprocess

here = pathlib.Path(__file__).parent
root = here.parent.parent
stories = root / "packages/gofish-graphics/stories/_proposals"
story = (stories / "FoldedBars.stories.tsx").read_text()
helpers = (stories / "foldedBars.ts").read_text()
md = (here / "proposal.md").read_text()


def cut(text, start, end):
    """The text from `start` through the first `end` after it."""
    i = text.index(start)
    return text[i : text.index(end, i) + len(end)]


def prettier(code, parser):
    return subprocess.run(
        [str(root / "node_modules/.bin/prettier"), "--parser", parser,
         "--stdin-filepath", f"block.{'ts' if parser == 'typescript' else 'js'}"],
        input=code, capture_output=True, text=True, check=True, cwd=root,
    ).stdout.strip()


def black(code):
    return subprocess.run(
        ["uvx", "--offline", "black", "-q", "-"], input=code, capture_output=True, text=True,
        check=True,
    ).stdout.strip()


fences = re.findall(r"```(\w+)\n(.*?)\n```", md, re.S)
langs = [lang for lang, _ in fences]
assert langs == ["js", "python", "js", "js", "js", "js", "js", "js", "js"], langs
md_code = [code for _, code in fences]

# (language for highlight.js, source, formatter)
blocks = {
    "ex1": ("javascript", md_code[0], lambda c: prettier(c, "babel")),
    "ex1-py": ("python", md_code[1], black),
    "ex2": ("javascript", md_code[3], lambda c: prettier(c, "babel")),
    "ex3": ("javascript", md_code[4], lambda c: prettier(c, "babel")),
    "ex4": ("javascript", md_code[5], lambda c: prettier(c, "babel")),
    "ex5": ("javascript", md_code[6], lambda c: prettier(c, "babel")),
    "ex6": ("javascript", md_code[7], lambda c: prettier(c, "babel")),
    "ex7": ("javascript", md_code[8], lambda c: prettier(c, "babel")),
    "today1": (
        "typescript",
        "\n\n".join([
            cut(helpers, "export const foldRows = (", "\n};"),
            cut(story, "const foldTable = ", "\n  );"),
            cut(story, "chart(foldTable(occupations", ".render(container);"),
        ]),
        lambda c: prettier(c, "typescript"),
    ),
    "today2": (
        "javascript",
        cut(story, "chart(foldTable(courses", ".render(container);"),
        lambda c: prettier(c, "babel"),
    ),
    "today6": (
        "javascript",
        "\n\n".join([
            cut(story, "const acTable = () => {", "\n};"),
            cut(story, "chart(acTable()", ".render(container);"),
        ]),
        lambda c: prettier(c, "babel"),
    ),
}


def code(match):
    lang, src, fmt = blocks[match.group(1)]
    return (
        f'<div class="code"><pre><code class="language-{lang}">'
        f"{html.escape(fmt(src))}</code></pre></div>"
    )


def size(path):
    out = subprocess.run(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return re.findall(r"pixel\w+: (\d+)", out)


def img(match):
    w, h = size(here / match.group(1))
    return f'<img src="{match.group(1)}" width="{w}" height="{h}"'


page = (here / "page.src.html").read_text()
page = re.sub(r"\{\{code:([\w-]+)\}\}", code, page)
page = re.sub(r'<img src="(img/[^"]+)"', img, page)
(here / "page.html").write_text(page)
print("wrote", here / "page.html")
