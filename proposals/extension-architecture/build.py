"""Build index.html from page.html, proposal.md and examples.md.

page.html is the frame (head, tabs, styles, script). Its placeholders pull
text from the two Markdown files, so the page keeps their wording:

  {{p:Summary}}            the proposal paragraph that starts **Summary.**
  {{sec:proposal:Title}}   a section of proposal.md, by heading text
  {{sec:examples:Title}}   a section of examples.md, by heading text
  {{lead:examples}}        the first sentence of "What the examples show"
  {{cards:L1,L2}}          example cards built from examples.md
  {{fork:1}}               a fork from proposal.md, with its exhibit
  {{precedent}}            the precedent table as cards

Code is formatted with the repo's prettier (JS) and black (Python), then
escaped. Lines with a NEW or PLANNED comment get a data-hl entry, which the
page script turns into a highlighted line after highlight.js runs. Images are
inlined as data URIs: the ex-* renders are trimmed to their content, and the
other renders are scaled to at most 800 px wide. Originals stay on disk.

Run from the repo root:
  uv run --with pillow python proposals/extension-architecture/build.py
"""

import base64
import html
import io
import pathlib
import re
import subprocess
import sys

from PIL import Image, ImageChops

here = pathlib.Path(__file__).resolve().parent
root = here.parents[1]
MD = {
    "proposal": (here / "proposal.md").read_text(),
    "examples": (here / "examples.md").read_text(),
}
page = (here / "page.html").read_text()

LANG = {"js": "javascript", "ts": "typescript", "python": "python"}
unformatted = []
lost_marks = []


# ---------------------------------------------------------------- images

_img_cache = {}


def data_uri(name):
    if name in _img_cache:
        return _img_cache[name]
    im = Image.open(here / "img" / name)
    if name.startswith("ex-"):
        rgb = im.convert("RGB")
        white = Image.new("RGB", rgb.size, (255, 255, 255))
        diff = ImageChops.difference(rgb, white).convert("L")
        box = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
        if box:
            pad = 10
            box = (
                max(0, box[0] - pad),
                max(0, box[1] - pad),
                min(im.width, box[2] + pad),
                min(im.height, box[3] + pad),
            )
            im = im.crop(box)
    elif im.width > 800:
        im = im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    _img_cache[name] = (uri, im.width, im.height)
    return _img_cache[name]


def figure(name, caption_html, cls="shot"):
    uri, w, h = data_uri(name)
    alt = html.escape(re.sub(r"<[^>]+>", "", caption_html), quote=True)
    cap = f"<figcaption>{caption_html}</figcaption>" if caption_html else ""
    return (
        f'<figure class="{cls}"><div class="imgpanel">'
        f'<img src="{uri}" width="{w}" height="{h}" alt="{alt}" loading="lazy" />'
        f"</div>{cap}</figure>"
    )


# ---------------------------------------------------------------- code

MARK = re.compile(r"(#|//).*\b(NEW|PLANNED)\b")


def run(cmd, text):
    p = subprocess.run(cmd, input=text, capture_output=True, text=True, cwd=root)
    return p.returncode, p.stdout


def fmt(lang, code):
    if lang == "python":
        rc, out = run(["uvx", "black", "-q", "-"], code + "\n")
    elif lang in ("js", "ts"):
        parser = "babel" if lang == "js" else "typescript"
        rc, out = run(
            [
                str(root / "node_modules/.bin/prettier"),
                "--parser",
                parser,
                "--stdin-filepath",
                "snippet." + lang,
            ],
            code + "\n",
        )
    else:
        return code
    if rc != 0:
        unformatted.append(code.splitlines()[0][:70])
        return code
    out = out.rstrip("\n")
    before = sum(1 for l in code.splitlines() if MARK.search(l))
    after = sum(1 for l in out.splitlines() if MARK.search(l))
    if before != after:
        lost_marks.append((code.splitlines()[0][:60], before, after))
    return out


def codeblock(lang, code):
    code = fmt(lang, code)
    hl = [str(i + 1) for i, l in enumerate(code.splitlines()) if MARK.search(l)]
    attr = f' data-hl="{",".join(hl)}"' if hl else ""
    return (
        f'<pre><code class="language-{LANG.get(lang, lang)}"{attr}>'
        f"{html.escape(code, quote=False)}</code></pre>"
    )


# ---------------------------------------------------------------- markdown


def inline(s):
    codes = []

    def keep(m):
        codes.append("<code>" + html.escape(m.group(1), quote=False) + "</code>")
        return f"\x00{len(codes) - 1}\x00"

    s = re.sub(r"`([^`]+)`", keep, s)
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)

    def link(m):
        text, href = m.group(1), m.group(2)
        if href.startswith("#") or href.endswith(".md"):
            return text
        return f'<a href="{href}">{text}</a>'

    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, s)
    s = re.sub(r"&lt;(https?://[^&\s]+)&gt;", r'<a href="\1">\1</a>', s)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], s)


LIST = re.compile(r"^(\s*)(-|\d+\.) (.*)")
IMG = re.compile(r"^!\[([^\]]*)\]\(img/([^)]+)\)\s*$")


def parse(lines):
    """Markdown lines -> a list of blocks."""
    out, i = [], 0
    while i < len(lines):
        l = lines[i]
        if not l.strip():
            i += 1
            continue
        m = re.match(r"^(#{1,6}) (.*)", l)
        if m:
            out.append(("h", len(m.group(1)), m.group(2)))
            i += 1
            continue
        if l.startswith("```"):
            lang, code, i = l[3:].strip(), [], i + 1
            while not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            out.append(("code", lang, "\n".join(code)))
            i += 1
            continue
        if l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(("table", rows))
            continue
        if IMG.match(l):
            imgs = []
            while i < len(lines) and IMG.match(lines[i]):
                imgs.append(IMG.match(lines[i]).groups())
                i += 1
            out.append(("imgs", imgs))
            continue
        m = LIST.match(l)
        if m and not m.group(1):
            ordered = m.group(2) != "-"
            items = []
            while i < len(lines):
                l = lines[i]
                if not l.strip():
                    j = i + 1
                    while j < len(lines) and not lines[j].strip():
                        j += 1
                    nm = LIST.match(lines[j]) if j < len(lines) else None
                    if nm and not nm.group(1):
                        i = j
                        continue
                    break
                m = LIST.match(l)
                if m and not m.group(1):
                    items.append([m.group(3), []])
                elif m:
                    items[-1][1].append(m.group(3))
                elif l.startswith(" "):
                    if items[-1][1]:
                        items[-1][1][-1] += " " + l.strip()
                    else:
                        items[-1][0] += " " + l.strip()
                else:
                    break
                i += 1
            out.append(("list", ordered, items))
            continue
        para = []
        while (
            i < len(lines)
            and lines[i].strip()
            and not re.match(r"^(#|```|\||!\[)", lines[i])
            and not (LIST.match(lines[i]) and not LIST.match(lines[i]).group(1))
        ):
            para.append(lines[i].strip())
            i += 1
        out.append(("p", " ".join(para)))
    return out


def table_html(rows, cls=""):
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    head, body = cells[0], cells[2:]
    th = "".join(f"<th>{inline(c)}</th>" for c in head)
    tb = "".join(
        "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body
    )
    return (
        f'<div class="tablewrap"><table class="{cls}"><thead><tr>{th}</tr></thead>'
        f"<tbody>{tb}</tbody></table></div>"
    )


def list_html(ordered, items, cls=""):
    tag = "ol" if ordered else "ul"
    lis = []
    for text, subs in items:
        sub = ""
        if subs:
            sub = "<ul>" + "".join(f"<li>{inline(s)}</li>" for s in subs) + "</ul>"
        lis.append(f"<li>{inline(text)}{sub}</li>")
    c = f' class="{cls}"' if cls else ""
    return f"<{tag}{c}>" + "".join(lis) + f"</{tag}>"


# Extra images placed next to a group that the Markdown already has.
S2_SPECS = [("scatter", "scatter"), ("lines", "lines"), ("polar", "polar"), ("geo", "geo map")]
S4_OTHER = [("scatter", "scatter"), ("lines", "lines"), ("polar", "polar"), ("geo", "geo map")]


def imgs_html(imgs):
    names = [n for _, n in imgs]
    if "s4-bars-pygfx.png" in names:
        imgs = imgs + [("scatter drawn by pygfx", "s4-scatter-pygfx.png")]
    cls = "pair" if len(imgs) > 1 else "single"
    out = f'<div class="figs {cls}">' + "".join(
        figure(n, inline(a)) for a, n in imgs
    ) + "</div>"
    if "s2-bars-node-chromium-fontkit.png" in names:
        rows = "".join(
            f'<div class="figs trio">'
            + figure(f"s2-{s}-browser.png", f"{label} in the browser")
            + figure(f"s2-{s}-node-chromium-fontkit.png", f"{label} from Node")
            + figure(f"s2-{s}-diff-fontkit.png", f"{label}, the pixels that differ")
            + "</div>"
            for s, label in S2_SPECS
        )
        out += (
            '<details class="more"><summary>The same pair for scatter, lines, '
            "polar and the geo map, with the pixels that differ</summary>"
            f'<div class="inner">{rows}</div></details>'
        )
    if "s4-bars-mpl.png" in names:
        figs = "".join(
            figure(f"s4-{s}-mpl.png", f"{label} drawn by matplotlib from the display list")
            for s, label in S4_OTHER
        )
        out += (
            '<details class="more"><summary>The other four display lists drawn '
            f'by matplotlib</summary><div class="inner"><div class="figs pair">{figs}'
            "</div></div></details>"
        )
    return out


def render(blocks, base=2):
    """Blocks -> HTML. A heading of level `base` becomes h2."""
    out = []
    for b in blocks:
        kind = b[0]
        if kind == "h":
            lvl = min(6, b[1] - base + 2)
            out.append(f"<h{lvl}>{inline(b[2])}</h{lvl}>")
        elif kind == "p":
            out.append(f"<p>{inline(b[1])}</p>")
        elif kind == "code":
            out.append(codeblock(b[1], b[2]))
        elif kind == "table":
            out.append(table_html(b[1]))
        elif kind == "list":
            out.append(list_html(b[1], b[2]))
        elif kind == "imgs":
            out.append(imgs_html(b[1]))
    return "\n".join(out)


def section_lines(doc, title):
    lines = MD[doc].splitlines()
    for i, l in enumerate(lines):
        m = re.match(r"^(#{1,6}) (.*)", l)
        if m and m.group(2).strip() == title:
            lvl, j = len(m.group(1)), i + 1
            while j < len(lines):
                n = re.match(r"^(#{1,6}) ", lines[j])
                if n and len(n.group(1)) <= lvl:
                    break
                j += 1
            return lvl, lines[i + 1 : j]
    sys.exit(f"no section {title!r} in {doc}")


def sec(doc, title):
    lvl, lines = section_lines(doc, title)
    return f"<h2>{inline(title)}</h2>\n" + render(parse(lines), base=lvl)


# ---------------------------------------------------------------- examples


def split_sub(lines):
    """Lines of one example -> (intro lines, {sub heading: lines})."""
    intro, subs, cur = [], {}, None
    for l in lines:
        m = re.match(r"^### (.*)", l)
        if m:
            cur = m.group(1).strip()
            subs[cur] = []
        elif cur is None:
            intro.append(l)
        else:
            subs[cur].append(l)
    return intro, subs


def fork_details(text):
    m = re.match(r"\*\*Fork: (.+?)\.\*\*\s*(.*)", text, re.S)
    name, body = m.group(1), m.group(2)
    paras = re.split(r"(?<=\.)\s+(?=\([abc]\) |Lean )", body)
    inner = "".join(f"<p>{inline(p)}</p>" for p in paras)
    return (
        f'<details class="fork"><summary>Fork: {inline(name)}</summary>'
        f'<div class="inner">{inner}</div></details>'
    )


def showcase_note(title, skip):
    """The proposal's comment on a showcase example (its last paragraph)."""
    _, lines = section_lines("proposal", title)
    paras = [b[1] for b in parse(lines) if b[0] == "p" and not b[1].startswith(skip)]
    return paras[-1]


EXTRA_NOTES = {
    "L1": showcase_note("Points on a basemap (lonboard `internet-speeds`)", ("lonboard today", "GoFish style")),
    "F4": showcase_note(
        "Movie, regions of interest, and traces with a time slider (fastplotlib `ImageWidget`)",
        ("fastplotlib today", "GoFish style"),
    ),
}
ORIGIN = {"L": "The lonboard program", "F": "The fastplotlib program", "P": "The ProgressiVis program"}


def card(ex_id):
    lines = MD["examples"].splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith(f"## {ex_id}. "))
    end = next(
        (i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines)
    )
    title = lines[start][3:].strip()
    intro, subs = split_sub(lines[start + 1 : end])

    forks, notes = [], []
    py_html = js_html = ""
    js_title = None
    for name, body in subs.items():
        if not name.startswith("GoFish style"):
            continue
        blocks = parse(body)
        lead, code, after = [], None, []
        for b in blocks:
            if b[0] == "p" and b[1].startswith("**Fork:"):
                forks.append(fork_details(b[1]))
            elif b[0] == "code" and code is None:
                code = b
            elif code is None:
                lead.append(b)
            else:
                after.append(b)
        notes.extend(after)
        part = render(lead) + (codeblock(code[1], code[2]) if code else "")
        if "Python" in name:
            py_html = part
        else:
            js_html, js_title = part, name
    for b in parse(intro):
        if b[0] == "p" and b[1].startswith("**Fork:"):
            forks.append(fork_details(b[1]))

    # Render today: the first image is the card's picture; others go to gaps.
    rblocks = parse(subs["Render today"])
    imgs = [b for b in rblocks if b[0] == "imgs"]
    main_img = imgs[0][1][0][1]
    caption = []
    for k, b in enumerate(rblocks):
        if b[0] == "p":
            text = b[1]
            nxt = rblocks[k + 1] if k + 1 < len(rblocks) else None
            if nxt and nxt[0] == "imgs" and nxt is not imgs[0]:
                # The image this sentence leads into moves to the gaps.
                text = re.sub(r":$", ". The picture is under the gaps.", text)
            caption.append(f"<p>{inline(text)}</p>")
        elif b[0] == "list":
            caption.append(list_html(b[1], b[2]))
    extra_imgs = [n for b in imgs[1:] for _, n in b[1]]

    owns = render(parse(subs["Who owns what"]))
    gaps = render(parse(subs["Gaps"]))
    for n in extra_imgs:
        gaps += figure(n, inline("The spelling with `resolve` + `line({ from, to })` under `Coord.geo`"))

    note_html = render(notes)
    if ex_id in EXTRA_NOTES:
        note_html += f"<p>{inline(EXTRA_NOTES[ex_id])}</p>"

    parts = [
        f'<article class="card" id="ex-{ex_id.lower()}">',
        f"<h3>{inline(title)}</h3>",
        figure(main_img, "", cls="shot main"),
        f'<div class="caption">{"".join(caption)}</div>',
        "<h4>GoFish style, Python</h4>",
        py_html,
        f'<details class="code"><summary>{ORIGIN[ex_id[0]]}</summary>'
        f'<div class="inner">{render(parse(intro))}</div></details>',
    ]
    if js_html:
        parts.append(
            f'<details class="code"><summary>{inline(js_title)}</summary>'
            f'<div class="inner">{js_html}</div></details>'
        )
    if note_html:
        parts.append(
            '<details class="code"><summary>Notes on the rewrite</summary>'
            f'<div class="inner">{note_html}</div></details>'
        )
    parts.extend(forks)
    parts += [
        '<div class="facts">',
        f'<div class="fact"><h4>Who owns what</h4>{owns}</div>',
        f'<div class="fact"><h4>Gaps</h4>{gaps}</div>',
        "</div>",
        "</article>",
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------- proposal parts


def para(lead):
    for b in parse(MD["proposal"].splitlines()):
        if b[0] == "p" and b[1].startswith(f"**{lead}.**"):
            return f'<p class="top">{inline(b[1])}</p>'
    sys.exit(f"no paragraph {lead}")


FORK_TITLES = {
    "1": "Fork 1. What the display list carries for large data",
    "2": "Fork 2. Which JavaScript runtime the Python package embeds",
    "3": "Fork 3. How an extension's constructs reach Python",
}


def fork(n):
    _, lines = section_lines("proposal", FORK_TITLES[n])
    blocks = parse(lines)
    out = [f'<section class="forkblock"><h3>{inline(FORK_TITLES[n])}</h3>']
    for i, b in enumerate(blocks):
        if b[0] == "p" and b[1].startswith("My lean"):
            out.append(f'<div class="lean"><p>{inline(b[1])}</p></div>')
        elif b[0] == "list":
            out.append(
                '<div class="options">'
                + "".join(f'<div class="opt"><p>{inline(t)}</p></div>' for t, _ in b[2])
                + "</div>"
            )
        else:
            out.append(render([b]))
        if i == 0 and n == "1":
            out.append(
                figure("s4-million-pygfx.png", "a million points by pygfx, axes and legend by GoFish")
            )
        if i == 0 and n == "3":
            out.append(codeblock("python", "from gofish_geo import basemap, Painter   # NEW"))
    out.append("</section>")
    return "\n".join(out)


def precedent():
    _, lines = section_lines("proposal", "Precedent")
    rows = next(b for b in parse(lines) if b[0] == "table")[1]
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    head, body = cells[0], cells[2:]
    cards = []
    for r in body:
        dl = "".join(f"<dt>{inline(h)}</dt><dd>{inline(c)}</dd>" for h, c in zip(head[1:], r[1:]))
        cards.append(f'<div class="pc"><h3>{inline(r[0])}</h3><dl>{dl}</dl></div>')
    return '<div class="prec">' + "".join(cards) + "</div>"


def lead_examples():
    _, lines = section_lines("proposal", "What the examples show")
    first = next(b for b in parse(lines) if b[0] == "p")[1]
    return f"<p>{inline(first.split(' The full set')[0])}</p>"


def sub(m):
    # prettier may wrap a long placeholder across lines
    kind, arg = m.group(1), m.group(2) and " ".join(m.group(2).split())
    if kind == "p":
        return para(arg)
    if kind == "sec":
        doc, title = arg.split(":", 1)
        return sec(doc, title)
    if kind == "intro":
        doc, title = arg.split(":", 1)
        lvl, lines = section_lines(doc, title)
        cut = next(
            (i for i, l in enumerate(lines) if re.match(r"^#{1,6} ", l)), len(lines)
        )
        return f"<h2>{inline(title)}</h2>\n" + render(parse(lines[:cut]), base=lvl)
    if kind == "cards":
        return "\n".join(card(x) for x in arg.split(","))
    if kind == "fork":
        return fork(arg)
    if kind == "precedent":
        return precedent()
    if kind == "lead":
        return lead_examples()
    if kind == "conventions":
        lines = MD["examples"].splitlines()
        a = next(i for i, l in enumerate(lines) if l.startswith("This page tests"))
        b = next(i for i, l in enumerate(lines) if l.startswith("Contents:"))
        return render(parse(lines[a:b]))
    sys.exit(f"unknown placeholder {kind}")


out = re.sub(r"\{\{(\w+)(?::([^}]*))?\}\}", sub, page)
(here / "index.html").write_text(out)
print("bytes:", len(out.encode()))
print("unformatted:", unformatted)
print("NEW/PLANNED marks moved or lost:", lost_marks)
