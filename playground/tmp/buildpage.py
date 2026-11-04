# SCRATCH: build artifact-page/index.html (the #1247 proposal page) from the formatted snippets.
import difflib, html, os

HERE = os.path.dirname(os.path.abspath(__file__))
SN = os.path.join(HERE, "snips")
OUT = os.path.join(HERE, "../../artifact-page/index.html")


def snip(k):
    p = os.path.join(SN, k + ".ts")
    return open(p).read().rstrip("\n") if os.path.exists(p) else None


def changed(a, b):
    """1-based line numbers of b not matched in a."""
    al, bl = a.split("\n"), b.split("\n")
    keep = set()
    for m in difflib.SequenceMatcher(None, al, bl, autojunk=False).get_matching_blocks():
        keep.update(range(m.b, m.b + m.size))
    return [i + 1 for i in range(len(bl)) if i not in keep]


def pre(code, marks, kind):
    m = ",".join(map(str, marks))
    attr = f' data-mark="{m}" data-kind="{kind}"' if marks else ""
    return f'<pre{attr}><code class="language-ts">{html.escape(code, quote=False)}</code></pre>'


def code_block(key):
    new, old = snip(key + ".new"), snip(key + ".old")
    out = ['<p class="lab">Proposed</p>', pre(new, changed(old, new) if old else [], "add")]
    if old is None:
        out.append('<p class="note">Today on main: the same spelling.</p>')
    else:
        body = pre(old, changed(new, old), "del")
        if old.count("\n") + 1 <= 12:
            out += ['<p class="lab">Today on main</p>', body]
        else:
            out.append(f"<details class=\"today\"><summary>Today on main</summary>{body}</details>")
    return "\n".join(out)


def img(f, alt, cap=None):
    i = f'<img src="img/{f}.png" alt="{html.escape(alt)}" loading="lazy" />'
    return f"<figure>{f'<figcaption>{cap}</figcaption>' if cap else ''}{i}</figure>"


CARDS = [
    dict(
        t="ChartAccent, default blob",
        imgs=[img("ca-blob", "One smooth blob around the Sub-Saharan African countries")],
        k="ca-blob",
        n="The gallery story drops its tuning. The default blob is one piece, and each bay between the spine and the padded hull fills half of its own area.",
    ),
    dict(
        t="ChartAccent, ovals in pieces",
        imgs=[img("ca-oval-085", "A large oval around most countries and four small ovals around the far ones")],
        k="ca-oval",
        n="At convexity 2 each piece is the smallest ellipse around it. Connection 0.85 cuts the weakest 15 percent of the join tree's links, so the four far countries get their own small ovals. Today has no pieces, so the nearest spelling is one oval around every member.",
    ),
    dict(
        t="ChartAccent, avoiding the other countries",
        imgs=[img("ca-avoid", "The blob with every other country cut out of it")],
        k="ca-avoid",
        n="<code>avoiding</code> moves from the shape onto <code>enclose</code>. The outline keeps <code>clearance</code> from each avoided country, and clearance defaults to the padding, 6 px here. A member that is also avoided is ignored, as today.",
    ),
    dict(
        t="Penguins, connection 0.9",
        imgs=[img("pen-09", "Three species blobs, with four far points as their own small pieces")],
        k="pen-09",
        n="<code>penguinStory</code> is the story's helper: the beak scatter with one <code>enclose</code> per species, padding 6. At 0.9 each species keeps one main body, and its four far points become their own pieces.",
    ),
    dict(
        t="Penguins, overlap or separate",
        imgs=[
            img("pen-c2-05", "Ovals per species, overlapping freely", "Default"),
            img("pen-c2-05-sep", "Ovals per species, each cut away from its set's other pieces", "separate: true"),
        ],
        k="pen-sep",
        n="Convexity 2 and connection 0.5 split each species into ovals. By default the pieces of a set may overlap, and a piece wholly inside another piece of its set is dropped. With <code>separate: true</code> each piece is cut out of the set's other pieces, as <code>avoiding</code> cuts, and keeps <code>clearance</code> from them.",
    ),
    dict(
        t="U cloud",
        imgs=[img("u", "A U-shaped band of points with a blob whose bay is one round arc")],
        k="u",
        n="The spelling does not change, but the render does. The bay inside the U fills as one round arc to half its area. Today it fills with Delaunay triangles, as a V-shaped wedge.",
    ),
    dict(
        t="Holes",
        imgs=[img("holes-on", "The U blob with the two gray points cut out")],
        k="holes",
        n="<code>avoiding</code> moves onto <code>enclose</code>. The two gray points are cut out, each with clearance 8 px, the padding. <code>holes</code> keeps only a gap that the closing seals all the way around. The U's bay is open, so here <code>holes: true</code> and <code>false</code> draw this same outline, and the two Holes stories on main no longer differ.",
    ),
    dict(
        t="Munkres",
        imgs=[img("munkres", "Three points with three ovals and a spine around the outer two that routes under the middle one")],
        k="munkres",
        n="Only <code>avoiding</code> and <code>clearance</code> move. The story spells clearance 6, so it stays.",
    ),
    dict(
        t="Hyperedges",
        imgs=[img("hyper", "A graph with three colored bands along their nodes and edges")],
        k="hyper",
        n="Each set's members are its nodes and the edges between them. <code>avoiding</code> and <code>clearance</code> move onto <code>enclose</code>; the story's clearance of 3 stays.",
    ),
    dict(
        t="Bubble treemap",
        imgs=[img("bubble", "Countries packed by region and continent, with tight contours around each region and rounder ones around each continent")],
        k="bubble",
        n="<code>Shape.arcs</code> is renamed <code>Shape.fillet</code>. The regions use radius 0: the padded circles and nothing filled between them. The continents keep radius 12, so their regions stay one piece.",
    ),
    dict(
        t="ChartAccent, fillet radius 12",
        imgs=[
            img("ca-fillet-n0", "Fillet at radius 12 with no links: many separate pieces", "neck: 0"),
            img("ca-fillet-n05", "Fillet at radius 12 with links: fewer pieces joined by smooth channels", "neck: 0.5 (default)"),
        ],
        k="ca-fillet",
        n="At neck 0 there are no links, so the groups split as they do today. The default neck 0.5 links groups closer than 2 &middot; radius, so each channel meets its groups in smooth arcs and no horn is left.",
    ),
]

cards = []
for c in CARDS:
    pair = len(c["imgs"]) > 1
    imgs = f'<div class="pair">{"".join(c["imgs"])}</div>' if pair else c["imgs"][0]
    cards.append(
        f"""<article class="card">
<h3>{c['t']}</h3>
{imgs}
{code_block(c['k'])}
<p class="note">{c['n']}</p>
</article>"""
    )

API = html.escape(snip("api"), quote=False)
TEMPLATE = open(os.path.join(HERE, "page.template.html")).read()
page = TEMPLATE.replace("{{API}}", API).replace("{{CARDS}}", "\n".join(cards))
open(OUT, "w").write(page)
print("wrote", OUT, len(page))
