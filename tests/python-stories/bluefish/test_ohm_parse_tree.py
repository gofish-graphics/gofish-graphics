"""Equivalent of bluefish/OhmParseTree.stories.tsx — Bluefish/Ohm Parse Tree.

A parse-derivation diagram for "3 + (4 * 5)": a hand-derived parse trace
(TRACE, a nested rule/terminal tree) is walked recursively (`walk`, mirroring
the JS `walk`), imperatively pushing marks into a flat `children` list and
constraint specs into a flat list, exactly like the JS original. Then one
top-level `layer(children).constrain(...)` ties everything together.

Dynamic-name constraint targeting: the trace generates ~30 runtime-only names
(`marker-{uid}`, `bar-{uid}`, `label-{uid}`, `lit-{uid}`, `underline-{uid}`),
not a fixed statically-known set a literal `lambda a, b: ...` destructure
could spell out (JS bypasses its destructured callback param for the same
reason, building raw `{name: token.__tag}` refs directly). The Python
`.constrain(callback)` already hands back one `RefSentinel` per named child
as a **kwarg** keyed by that child's `.name(...)` tag string — a `dict`
unpacked via `**refs` does not require its keys to be valid identifiers, so
a catch-all `lambda **refs: [...]` reaches every dynamically-named child by
indexing `refs["marker-7"]` etc., with no gap versus the JS mechanism.
Constraint specs are recorded as small closures (capturing tag strings, not
refs, at walk time) and only resolved against `refs` once `.constrain(...)`
actually runs.

The invisible `{x, w}`-positioned `marker` rects are ported as-is: JS found
that sourcing a `Constraint.align(x="span")` from a `layer` wrapping `ref()`s
into two already-placed character boxes reports the WRAPPER's own explicit
anchor as its absolute position (not the refs' true extent), so spans are
instead synthesized from the character row's known fixed pitch via small
literally-positioned invisible rects.
"""

import itertools

from gofish import Constraint, createName, layer, mark, rect, text

# ── Grammar constants (mirroring the original's BIG_FONT_*/LABEL_* consts) ──

CHAR_W = 60
END_W = 30
CHAR_H = 34
CHAR_GAP = 4
LABEL_H = 25
DEPTH_GAP = 4

RULE_COLOR = {
    "Exp": "#b148d2",
    "AddExp": "#FFBD27",
    "MulExp": "#5cc593",
    "PriExp": "#FF6302",
    "number": "#00B4D8",
    "end": "#EE092D",
}

BIG_FONT = {"fontFamily": "monospace", "fontWeight": 500, "fontSize": 25}
LABEL_FONT = {"fontFamily": "monospace", "fontWeight": 300, "fontSize": 14}
NOTE_FONT = {**LABEL_FONT, "fontStyle": "italic", "fill": "#777"}
SPECIAL_FONT = {**LABEL_FONT, "fill": "green"}


# ── Hand-derived parse trace for "3 + (4 * 5)" ───────────────────────────
# Char indices (0-based, inclusive spans): 0:'3' 1:' ' 2:'+' 3:' ' 4:'('
# 5:'4' 6:' ' 7:'*' 8:' ' 9:'5' 10:')'


def R(rule, from_, to, children=None, case=None):
    return {
        "kind": "rule",
        "rule": rule,
        "case": case,
        "from": from_,
        "to": to,
        "children": children or [],
    }


def L(text_, at):
    return {"kind": "terminal", "text": text_, "from": at}


# "3" reduces all the way down through the (pass-through) hierarchy.
number3 = R("number", 0, 0)
priExp3 = R("PriExp", 0, 0, [number3])
mulExp3 = R("MulExp", 0, 0, [priExp3])
addExp3 = R("AddExp", 0, 0, [mulExp3])

# "4" and "5" likewise, inside the parenthesized MulExp.
number4 = R("number", 5, 5)
priExp4 = R("PriExp", 5, 5, [number4])
mulExp4 = R("MulExp", 5, 5, [priExp4])
number5 = R("number", 9, 9)
priExp5 = R("PriExp", 9, 9, [number5])

mulExpTimes = R("MulExp", 5, 9, [mulExp4, L("*", 7), priExp5], case="times")
# Left-recursive rules trace their OWN generic application as a bare bar,
# nested one level above the case-named alternative that actually matched.
mulExpInner = R("MulExp", 5, 9, [mulExpTimes])
addExpInner = R("AddExp", 5, 9, [mulExpInner])
expInner = R("Exp", 5, 9, [addExpInner])
priExpParen = R("PriExp", 4, 10, [L("(", 4), expInner, L(")", 10)], case="paren")
# Same bare-wrapper pattern once more: a bare "PriExp" wraps "PriExp - paren".
priExpParenOuter = R("PriExp", 4, 10, [priExpParen])
mulExpParen = R("MulExp", 4, 10, [priExpParenOuter])

addExpPlus = R("AddExp", 0, 10, [addExp3, L("+", 2), mulExpParen], case="plus")
# Same pass-through-wrapper pattern as `mulExpInner` above.
addExpOuter = R("AddExp", 0, 10, [addExpPlus])
TRACE = R("Exp", 0, 10, [addExpOuter])


# ── Marks ─────────────────────────────────────────────────────────────────


@mark
def char_box(ch: str):
    return layer(
        [
            rect(w=CHAR_W, h=CHAR_H, fill="transparent").name("box"),
            text(text=ch, **BIG_FONT).name("glyph"),
        ]
    ).constrain(
        lambda box, glyph: [
            Constraint.align([box, glyph], x="middle", y="middle"),
        ]
    )


def label_text(main, note=None):
    """A rule name, plus an optional lighter/italic case note. Plain
    function, not `@mark` — mirrors JS `LabelText`, which is also a plain
    function (its second, un-aggregated `text()` mark would crash a `@mark`
    wrapper expecting an already-resolved node)."""
    if note:
        return layer(
            [
                text(text=main, **LABEL_FONT).name("main"),
                text(text=f"- {note}", **NOTE_FONT).name("note"),
            ]
        ).constrain(
            lambda main, note: [
                Constraint.align([main, note], y="middle"),
                Constraint.distribute([main, note], dir="x", spacing=4),
            ]
        )
    return text(text=main, **LABEL_FONT)


# ── Diagram assembly ─────────────────────────────────────────────────────


def story_ohm_parse_tree():
    uid_counter = itertools.count()
    children = []
    constraint_builders = []

    # ── Tier 1: the character row — a self-contained sub-layer with its own
    # `.constrain()` call, exactly the two-tier pattern house style uses.
    text_ = "3 + (4 * 5)"
    chars = list(text_)
    char_tokens = [createName(f"char-{i}") for i in range(len(chars))]
    end_tok = createName("end-box")

    row_ref_names = [t.tag for t in char_tokens] + [end_tok.tag]
    char_row_tok = createName("char-row")
    children.append(
        layer(
            [
                *[
                    char_box(ch=ch).name(char_tokens[i])
                    for i, ch in enumerate(chars)
                ],
                rect(w=END_W, h=CHAR_H, fill="transparent").name(end_tok),
            ],
            x=0,
            y=0,
        )
        .constrain(
            lambda **refs: [
                Constraint.align(
                    [refs[n] for n in row_ref_names], y="start"
                ),
                Constraint.distribute(
                    [refs[n] for n in row_ref_names],
                    dir="x",
                    spacing=CHAR_GAP,
                ),
            ]
        )
        .name(char_row_tok)
    )

    # ── Span sources for `Constraint.align(x="span")` ─────────────────────
    # See module docstring: spans are synthesized from the row's known fixed
    # pitch via small literal `{x, w}` invisible rects, not `ref()`-derived.
    CHAR_PITCH = CHAR_W + CHAR_GAP
    char_left = lambda i: i * CHAR_PITCH
    char_right = lambda i: char_left(i) + CHAR_W
    end_left = char_right(len(chars) - 1) + CHAR_GAP
    end_right = end_left + END_W

    def marker(left, right):
        tok = createName(f"marker-{next(uid_counter)}")
        children.append(
            rect(x=left, w=right - left, h=1, fill="transparent").name(tok)
        )
        return tok.tag

    def span_of(from_, to):
        return marker(char_left(from_), char_right(to))

    underline_row_tok = createName("row-underline")
    children.append(rect(h=1, y=CHAR_H, fill="gray").name(underline_row_tok))
    _row_underline_src = marker(char_left(0), end_right)
    _row_underline_tgt = underline_row_tok.tag
    constraint_builders.append(
        lambda refs, s=_row_underline_src, t=_row_underline_tgt: Constraint.align(
            [refs[s], refs[t]], x="span"
        )
    )

    # Depth (nesting level below the character row) → y. Set directly as a
    # literal instead of `Constraint.distribute` — see JS friction log:
    # `distribute(dir="y")` folds every y-pair in the flat constraint list
    # into ONE global order rather than keeping each branch's own chain
    # separate, which interleaves the "3" and "(4 * 5)" subtrees.
    ROW_TOP = CHAR_H + 1 + DEPTH_GAP
    ROW_PITCH = LABEL_H + DEPTH_GAP
    row_y = lambda depth: ROW_TOP + (depth - 1) * ROW_PITCH

    # ── The recursive trace walk (mirrors RenderTrace/RenderNode) ─────────
    def walk(node, depth):
        y = row_y(depth)
        if node["kind"] == "terminal":
            label_tok = createName(f"lit-{next(uid_counter)}")
            children.append(
                text(
                    text=f'"{node["text"]}"', y=y + 6, **SPECIAL_FONT
                ).name(label_tok)
            )
            label_name = label_tok.tag
            src = span_of(node["from"], node["from"])
            constraint_builders.append(
                lambda refs, s=src, t=label_name: Constraint.align(
                    [refs[s], refs[t]], x="middle"
                )
            )
            return label_name

        bar_tok = createName(f"bar-{next(uid_counter)}")
        label_tok = createName(f"label-{next(uid_counter)}")
        underlined = len(node["children"]) == 0

        children.append(
            rect(
                h=LABEL_H, y=y, fill=RULE_COLOR[node["rule"]], opacity=0.5
            ).name(bar_tok)
        )
        children.append(
            label_text(node["rule"], node["case"]).name(label_tok)
        )

        bar_name = bar_tok.tag
        label_name = label_tok.tag
        src = span_of(node["from"], node["to"])

        constraint_builders.append(
            lambda refs, s=src, t=bar_name: Constraint.align(
                [refs[s], refs[t]], x="span"
            )
        )
        constraint_builders.append(
            lambda refs, b=bar_name, l=label_name: Constraint.align(
                [refs[b], refs[l]], x="middle", y="middle"
            )
        )

        if underlined:
            underline_tok = createName(f"underline-{next(uid_counter)}")
            children.append(
                rect(h=2, y=y + LABEL_H - 2, fill="LightGray").name(
                    underline_tok
                )
            )
            underline_name = underline_tok.tag
            constraint_builders.append(
                lambda refs, s=src, t=underline_name: Constraint.align(
                    [refs[s], refs[t]], x="span"
                )
            )

        for child in node["children"]:
            walk(child, depth + 1)
        return bar_name

    # Root Exp bar, below the character row.
    walk(TRACE, 1)

    # Root-level "end" label, below the character row too (a sibling of Exp,
    # not nested under it).
    end_bar_tok = createName("end-bar")
    end_label_tok = createName("end-label")
    children.append(
        rect(h=LABEL_H, y=row_y(1), fill=RULE_COLOR["end"], opacity=0.5).name(
            end_bar_tok
        )
    )
    children.append(label_text("end").name(end_label_tok))
    _end_src = marker(end_left, end_right)
    _end_bar_name = end_bar_tok.tag
    _end_label_name = end_label_tok.tag
    constraint_builders.append(
        lambda refs, s=_end_src, t=_end_bar_name: Constraint.align(
            [refs[s], refs[t]], x="span"
        )
    )
    constraint_builders.append(
        lambda refs, b=_end_bar_name, l=_end_label_name: Constraint.align(
            [refs[b], refs[l]], x="middle", y="middle"
        )
    )

    return (
        layer(children, x=20, y=20).constrain(
            lambda **refs: [f(refs) for f in constraint_builders]
        ),
        {"w": 820, "h": 480},
    )
