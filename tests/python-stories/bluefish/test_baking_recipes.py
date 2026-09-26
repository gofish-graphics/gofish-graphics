"""Equivalent of bluefish/BakingRecipes.stories.tsx — Bluefish/Baking Recipes.

An 8-nested-tier `layer(...).relate(...)` chain (`tier0`..`tier8`), each
tier wrapping the previous one as its first child, mirroring the JS story's
own order-dependent Bluefish alignment chain node-for-node. Each tier's
`.relate()` names cells from earlier, nested tiers directly: an operand
resolves anywhere inside the constraining layer. See the JS file's
header/friction-log comments for the full rationale.
"""

from gofish import Constraint, enclose, layer, ref, rect, text

GREEN = "#40A03F"


# Bluefish's `Pad`: padding 5, transparent background, wraps every text
# cell (title + 6 ingredients + 6 step cells).
def Pad(t: str):
    return enclose([text(text=t)], padding=5, fill="transparent", stroke="none")


# Bluefish's `<Group>`: a pure bbox union of named refs, no paint. It is a
# `.relate()` clause of the tier that holds the cells it unions.
def union(names: list, name: str):
    return enclose(
        [ref(n) for n in names], padding=0, fill="none", stroke="none"
    ).name(name)


# Bluefish's `CellBorder`: a transparent green-stroked rect whose x/y span
# are forced onto it by two `align(x="span")`/`align(y="span")` constraints
# declared by the caller (the rect itself has no w/h).
def border(name: str):
    return rect(fill="transparent", stroke=GREEN, strokeWidth=1).name(name)


def story_baking_recipes():
    # ── Tier 0: ingredient column, stacked top-to-bottom, left-aligned ──
    tier0 = layer(
        [
            Pad(
                "Preheat oven to 325°F (160°C) and butter a 9x13-in. baking pan"
            ).name("title"),
            Pad("6 oz. (170 g) 70% cacao chocolate").name("r0"),
            Pad("6 oz. (170 g) butter").name("r1"),
            Pad("1-1/2 cup (300 g) granulated sugar").name("r2"),
            Pad("3 large eggs").name("r3"),
            Pad("1 tsp. (5 mL) vanilla extract").name("r4"),
            Pad("1 cup (125 g) all-purpose flour").name("r5"),
        ]
    ).relate(
        lambda title, r0, r1, r2, r3, r4, r5: [
            Constraint.align([title, r0, r1, r2, r3, r4, r5], x="start"),
            Constraint.distribute(
                [title, r0, r1, r2, r3, r4, r5], dir="y", spacing=0
            ),
        ]
    )

    # ── Tier 1: row/column unions over the ingredient column ──
    tier1 = layer([tier0]).relate(
        lambda: [
            union(["r0", "r1", "r2", "r3", "r4", "r5"], "col0"),
            union(["r0", "r1"], "row0_1"),
            union(["r0", "r1", "r2"], "row0_2"),
            union(["r3", "r4"], "row3_4"),
            union(["r0", "r4"], "row0_4"),
            union(["r0", "r5"], "row0_5"),
        ]
    )

    # ── Tier 2: "melt in double boiler" (A1), "stir in" (B), "lightly
    # beat" (A2) — A1 sits right of col0 centered on rows 0-1; B sits
    # right of A1 centered on rows 0-2; A2 shares A1's column (left-
    # aligned to A1, not B) centered on rows 3-4.
    tier2 = layer(
        [
            tier1,
            Pad("melt in double boiler").name("A1"),
            Pad("stir in").name("B"),
            Pad("lightly beat").name("A2"),
        ]
    ).relate(
        lambda col0, row0_1, row0_2, row3_4, A1, B, A2, **_extra: [
            Constraint.distribute([col0, A1], dir="x", spacing=0),
            Constraint.align([row0_1, A1], y="middle"),
            Constraint.distribute([A1, B], dir="x", spacing=0),
            Constraint.align([row0_2, B], y="middle"),
            Constraint.align([row3_4, A2], y="middle"),
            Constraint.align([A1, A2], x="start"),
        ]
    )

    # ── Tier 3: col1_2 = union(A1, B, A2) — the column-group C is
    # distributed after.
    tier3 = layer([tier2]).relate(lambda: [union(["A1", "B", "A2"], "col1_2")])

    # ── Tier 4: "stir in" (C), right of col1_2, centered on rows 0-4 ──
    tier4 = layer(
        [
            tier3,
            Pad("stir in").name("C"),
        ]
    ).relate(
        lambda col1_2, row0_4, C, **_extra: [
            Constraint.distribute([col1_2, C], dir="x", spacing=0),
            Constraint.align([row0_4, C], y="middle"),
        ]
    )

    # ── Tier 5: col1_3 = union(col1_2, C) ──
    tier5 = layer([tier4]).relate(lambda: [union(["col1_2", "C"], "col1_3")])

    # ── Tier 6: "stir in" (D), right of C; "bake..." (E), right of D —
    # both centered on rows 0-5.
    tier6 = layer(
        [
            tier5,
            Pad("stir in").name("D"),
            Pad("bake 325°F (160°C) for 35 min.").name("E"),
        ]
    ).relate(
        lambda C, row0_5, D, E, **_extra: [
            Constraint.distribute([C, D], dir="x", spacing=0),
            Constraint.align([row0_5, D], y="middle"),
            Constraint.distribute([D, E], dir="x", spacing=0),
            Constraint.align([row0_5, E], y="middle"),
        ]
    )

    # ── Tier 7: col0_5 = union(r0, E) — full table width, used to span
    # the title's border underneath it.
    tier7 = layer([tier6]).relate(lambda: [union(["r0", "E"], "col0_5")])

    # ── Tier 8: the 12 cell borders, each sized by align's "span" value
    # against the horizontal/vertical group it bounds — the direct
    # translation of Bluefish's `CellBorder`'s two `LayoutFunction` calls.
    tier8 = layer(
        [
            tier7,
            border("bR0"),
            border("bR1"),
            border("bR2"),
            border("bR3"),
            border("bR4"),
            border("bR5"),
            border("bA1"),
            border("bB"),
            border("bA2"),
            border("bC"),
            border("bE"),
            border("bTitle"),
        ]
    ).relate(
        lambda col0,
        r0,
        r1,
        r2,
        r3,
        r4,
        r5,
        bR0,
        bR1,
        bR2,
        bR3,
        bR4,
        bR5,
        A1,
        row0_1,
        bA1,
        col1_2,
        row0_2,
        bB,
        row3_4,
        bA2,
        col1_3,
        row0_4,
        bC,
        E,
        row0_5,
        bE,
        col0_5,
        title,
        bTitle,
        **_extra: [
            # Each ingredient row: full col0 width x that row's own height.
            Constraint.align([col0, bR0], x="span"),
            Constraint.align([r0, bR0], y="span"),
            Constraint.align([col0, bR1], x="span"),
            Constraint.align([r1, bR1], y="span"),
            Constraint.align([col0, bR2], x="span"),
            Constraint.align([r2, bR2], y="span"),
            Constraint.align([col0, bR3], x="span"),
            Constraint.align([r3, bR3], y="span"),
            Constraint.align([col0, bR4], x="span"),
            Constraint.align([r4, bR4], y="span"),
            Constraint.align([col0, bR5], x="span"),
            Constraint.align([r5, bR5], y="span"),
            # "melt in double boiler": its own extent x rows 0-1.
            Constraint.align([A1, bA1], x="span"),
            Constraint.align([row0_1, bA1], y="span"),
            # "stir in" (B): spans A1+B+A2's combined column width x rows
            # 0-2 — Bluefish's own `col1_2` group, reused verbatim.
            Constraint.align([col1_2, bB], x="span"),
            Constraint.align([row0_2, bB], y="span"),
            # "lightly beat" (A2): same wide col1_2 span x rows 3-4.
            Constraint.align([col1_2, bA2], x="span"),
            Constraint.align([row3_4, bA2], y="span"),
            # "stir in" (C): col1_2+C's combined width x rows 0-4 (excludes
            # the flour row — matches Bluefish's `row0_4`/`col1_3` groups).
            Constraint.align([col1_3, bC], x="span"),
            Constraint.align([row0_4, bC], y="span"),
            # "bake...": its own column width x all 6 rows. (D, the second
            # "stir in", gets no border of its own in the original either —
            # faithfully reproduced, not an omission.)
            Constraint.align([E, bE], x="span"),
            Constraint.align([row0_5, bE], y="span"),
            # Title strip: full table width (col0_5 = col0 through E) x the
            # title cell's own height.
            Constraint.align([col0_5, bTitle], x="span"),
            Constraint.align([title, bTitle], y="span"),
        ]
    )

    table_bg = enclose(
        [tier8], padding=0, fill="#FFFFFF", stroke=GREEN, strokeWidth=3
    )

    # Bluefish's `Background` wraps the TITLE and the TABLE together (10px
    # gap between them, 50px padding around the pair) — the title sits
    # INSIDE the pale-green card, not floating above/outside it.
    titled_table = layer(
        [
            text(text="Dark Chocolate Brownies (makes 24 squares)").name(
                "recipeName"
            ),
            table_bg.name("table"),
        ]
    ).relate(
        lambda recipeName, table: [
            Constraint.align([recipeName, table], x="start"),
            Constraint.distribute([recipeName, table], dir="y", spacing=10),
        ]
    )

    green_bg = enclose(
        [titled_table], padding=50, fill="#7CD4AC", stroke="none", opacity=0.3
    )

    return layer([green_bg]), {}
