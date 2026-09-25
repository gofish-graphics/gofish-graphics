"""Equivalent of bluefish/DFSCQ.stories.tsx — Bluefish/DFSCQ File System.

Port of the DFSCQ write-ahead log pipeline diagram, structured like
Pulley/QuantumCircuit: tier 1 (`_pipeline_head`) fully places every row via
nested `spread`s and `.constrain()`; tier 2 (funnels, the commit arrow, the
fan-out arrows, the tick marks/labels beneath DiskLog, and the side labels)
reads those placed nodes via `createName` tokens + `ref()`. Small
self-contained `layer([ref(anchor), fresh_shape]).constrain(...)` micro-layers
mirror the JS file's workaround for `.constrain()` destructures only reliably
reaching one level of nested plain layers deep — do not collapse them.
"""

from gofish import (
    Constraint,
    arrow,
    createName,
    enclose,
    layer,
    line,
    rect,
    ref,
    spread,
    text,
)

LEFT_COLUMN_WIDTH = 200
DISK_DATA_WIDTH = 440
BLUE = "#4582DE"
BLOCK_H = 40

# A fixed CONTENT width every stage row is padded up to, so all four stage
# boxes share the same right edge (what the "commit"/"flush"/"apply" action
# labels right-align against).
CONTENT_WIDTH = 680
FUNNEL_STUB = 18


# ── Small helpers (mirror Bluefish's withBluefish-wrapped components) ──────


def _block(w, color="black"):
    """A single 3px-black-stroked block (Bluefish's <Block>)."""
    return rect(w=w, h=BLOCK_H, fill=color, stroke="black", strokeWidth=3)


def _blocks(colors, width=18):
    """A flush row of same-colored-or-mixed blocks (Bluefish's <Blocks>)."""
    return spread(
        [_block(width, c) for c in colors], dir="x", spacing=0, anchor="edge"
    )


def _big_bracket(side):
    """Hand-drawn "[" / "]" bracket built from 3 thin black rects."""
    return spread(
        [
            rect(w=15, h=3, fill="black"),
            rect(w=3, h=70, fill="black"),
            rect(w=15, h=3, fill="black"),
        ],
        dir="y",
        spacing=0,
        alignment="start" if side == "left" else "end",
    )


def _big_comma():
    return text(text=",", fontFamily="monospace", fontSize=30)


def _with_min_width(width, content):
    return layer(
        [
            rect(w=width, h=0, fill="transparent").name("filler"),
            content.name("content"),
        ]
    ).constrain(
        lambda filler, content: [
            Constraint.align([filler, content], x="start", y="middle"),
        ]
    )


def _titled_background(title, content):
    """Section title inside a padded card (Bluefish's <TitledBackground>)."""
    return enclose(
        [
            spread(
                [
                    text(
                        text=title, fontFamily="serif", fontWeight=300, fontSize=20
                    ),
                    _with_min_width(CONTENT_WIDTH, content),
                ],
                dir="y",
                spacing=4,
                alignment="start",
            ),
        ],
        padding=15,
        fill="white",
        stroke="black",
        strokeWidth=3,
        rx=0,
        ry=0,
    )


def _action_text(t):
    return text(
        text=t, fontFamily="monospace", fontWeight=500, fontSize=20, fill=BLUE
    )


def _action_label(box_name, slot_name, label_text):
    """Right-aligns an action label against a stage box's right edge,
    vertically centered in the gap slot reserved for it."""
    return layer(
        [
            ref(box_name).name("box"),
            ref(slot_name).name("slot"),
            _action_text(label_text).name("t"),
        ]
    ).constrain(
        lambda box, slot, t: [
            Constraint.align([box, t], x="end"),
            Constraint.align([slot, t], y="middle"),
        ]
    )


def _boxed_align(width, content):
    """A fixed-width slot with its content right/middle-anchored inside it
    (Bluefish's <BoxedAlign alignment="centerRight">)."""
    return layer(
        [
            rect(w=width, h=0, fill="transparent").name("slot"),
            content.name("content"),
        ]
    ).constrain(
        lambda slot, content: [
            Constraint.align([slot, content], x="end", y="middle"),
        ]
    )


def _tick(anchor, side, tick_name=None):
    """A tick mark anchored via a global `ref(token)` (depth-independent),
    with its own local `.constrain()` — the fix for cross-tier destructures
    that stop resolving past one level of nesting (see the module docstring).
    `tick_name` (optional): a global token so a funnel side can `ref()` this
    tick later."""
    key = tick_name.tag if tick_name is not None else "t"
    return layer(
        [
            ref(anchor).name("a"),
            rect(w=3, h=13, fill="black").name(
                tick_name if tick_name is not None else "t"
            ),
        ]
    ).constrain(
        lambda **kw: [
            Constraint.distribute([kw["a"], kw[key]], dir="y", spacing=15),
            Constraint.align([kw["a"], kw[key]], x=side),
        ]
    )


def _label(anchor, label_text):
    return layer(
        [
            ref(anchor).name("a"),
            text(
                text=label_text, fontFamily="serif", fontWeight=300, fontSize=18
            ).name("t"),
        ]
    ).constrain(
        lambda a, t: [
            Constraint.distribute([a, t], dir="y", spacing=30),
            Constraint.align([a, t], x="middle"),
        ]
    )


def _label_lines(anchor, lines):
    """Two-line variant of `_label` (Bluefish wraps text onto two rows via a
    nested StackV)."""
    return layer(
        [
            ref(anchor).name("a"),
            spread(
                [
                    text(text=l, fontFamily="serif", fontWeight=300, fontSize=18)
                    for l in lines
                ],
                dir="y",
                spacing=0,
                alignment="middle",
            ).name("t"),
        ]
    ).constrain(
        lambda a, t: [
            Constraint.distribute([a, t], dir="y", spacing=30),
            Constraint.align([a, t], x="middle"),
        ]
    )


def _funnel_side(top_anchor, top_edge, bottom_anchor, bottom_edge, id_prefix):
    """One side of a dashed funnel (Bluefish's `DashedFunnel`): two tiny
    invisible "stub" markers placed a fixed offset off each anchor's edge,
    then three dashed `line()` segments — anchor-to-stub, stub-to-stub (the
    diagonal), stub-to-anchor."""
    top_stub = createName(f"{id_prefix}TopStub")
    bottom_stub = createName(f"{id_prefix}BottomStub")
    top_key = top_stub.tag
    bottom_key = bottom_stub.tag
    return [
        # Short vertical drop below the top anchor's edge.
        layer(
            [
                ref(top_anchor).name("a"),
                rect(w=1, h=1, fill="transparent").name(top_stub),
            ]
        ).constrain(
            lambda **kw: [
                Constraint.distribute(
                    [kw["a"], kw[top_key]], dir="y", spacing=FUNNEL_STUB
                ),
                Constraint.align([kw["a"], kw[top_key]], x=top_edge),
            ]
        ),
        # Short vertical entry above the bottom anchor's edge.
        layer(
            [
                rect(w=1, h=1, fill="transparent").name(bottom_stub),
                ref(bottom_anchor).name("b"),
            ]
        ).constrain(
            lambda **kw: [
                Constraint.distribute(
                    [kw[bottom_key], kw["b"]], dir="y", spacing=FUNNEL_STUB
                ),
                Constraint.align([kw["b"], kw[bottom_key]], x=bottom_edge),
            ]
        ),
        # Segment 1: vertical, anchor edge → top stub.
        line(
            [ref(top_anchor), ref(top_stub)],
            stroke="black",
            strokeWidth=2,
            strokeDasharray="5",
            source={"x": top_edge, "y": "end"},
        ),
        # Segment 2: diagonal, top stub → bottom stub.
        line(
            [ref(top_stub), ref(bottom_stub)],
            stroke="black",
            strokeWidth=2,
            strokeDasharray="5",
        ),
        # Segment 3: vertical, bottom stub → anchor edge.
        line(
            [ref(bottom_stub), ref(bottom_anchor)],
            stroke="black",
            strokeWidth=2,
            strokeDasharray="5",
            target={"x": bottom_edge, "y": "start"},
        ),
    ]


def story_dfscq():
    # ── Cross-tier names: funnels/arrows (tier 2) read these placed nodes
    # (tier 1), however deep they sit in the nested `spread` tree. ─────────
    active_txn_block = createName("activeTxnBlock")
    committed_txns_block = createName("committedTxnsBlock")
    bigleftbracket = createName("bigleftbracket")
    bigrightbracket = createName("bigrightbracket")
    mem = createName("mem")
    rect1 = createName("rect1")
    rect2 = createName("rect2")
    rect4 = createName("rect4")
    blocks1 = createName("blocks1")
    blocks2 = createName("blocks2")
    disklogleft = createName("disklogleft")
    applierleft = createName("applierleft")
    diskdata = createName("diskdata")
    diskdata_stack = createName("diskdataStack")
    diskdata1 = createName("diskdata1")
    diskdata2 = createName("diskdata2")
    diskdata3 = createName("diskdata3")
    diskdata4 = createName("diskdata4")
    diskdata5 = createName("diskdata5")
    fanout_anchor_name = createName("fanoutAnchor")
    blocks1_arrow_anchor_name = createName("blocks1ArrowAnchor")
    rect3 = createName("rect3")
    log_data_anchor = createName("logDataAnchor")
    # The two tick DIVIDERS beneath the disk-log row — Funnel 2's start
    # anchors (Bluefish's `disklogtick2`/`disklogtick3`).
    disklogtick2 = createName("disklogtick2")
    disklogtick3 = createName("disklogtick3")
    # Stage-box names + the vertical gap slots reserved for the action
    # labels in the main vertical stack.
    log_api_box = createName("logAPIBox")
    group_log_box = createName("groupLogBox")
    disk_log_box = createName("diskLogBox")
    applier_box = createName("applierBox")
    commit_slot = createName("commitSlot")
    flush_slot = createName("flushSlot")
    apply_slot = createName("applySlot")

    # ── Stage 1: LogAPI ──────────────────────────────────────────────────
    log_api_row = spread(
        [
            _boxed_align(
                LEFT_COLUMN_WIDTH,
                text(
                    text="activeTxn:",
                    fontFamily="monospace",
                    fontWeight=300,
                    fontSize=18,
                ),
            ),
            _blocks([BLUE, BLUE, BLUE], 18).name(active_txn_block),
        ],
        dir="x",
        spacing=12,
        alignment="middle",
    )

    # ── Stage 2: GroupLog ────────────────────────────────────────────────
    group_log_row = spread(
        [
            _boxed_align(
                LEFT_COLUMN_WIDTH,
                text(
                    text="committedTxns:",
                    fontFamily="monospace",
                    fontWeight=300,
                    fontSize=18,
                ),
            ),
            _big_bracket("left").name(bigleftbracket),
            spread(
                [_blocks(["gray"] * 2, 18), _big_comma()],
                dir="x",
                spacing=0,
                alignment="end",
            ),
            spread(
                [_blocks(["gray"] * 7, 18), _big_comma()],
                dir="x",
                spacing=0,
                alignment="end",
            ),
            spread(
                [_blocks(["gray"] * 4, 18), _big_comma()],
                dir="x",
                spacing=0,
                alignment="end",
            ),
            spread(
                [
                    _blocks([BLUE, BLUE, BLUE], 18).name(committed_txns_block),
                    _big_comma(),
                ],
                dir="x",
                spacing=0,
                alignment="end",
            ),
            _big_bracket("right").name(bigrightbracket),
        ],
        dir="x",
        spacing=8,
        alignment="middle",
    )

    # ── Stage 3: DiskLog ─────────────────────────────────────────────────
    # `mem` gets an explicit literal x/y (via spread's own dims) so it is
    # PINNED from construction — required to serve as the SPAN SITE's
    # already-placed source (Constraint.align "span" throws unless its
    # source is already placed when the constraint lowers).
    mem_row = spread(
        [
            _block(80, "black").name(rect1),
            _block(80, "LightGray").name(rect2),
            _block(80, "LightGray").name(rect3),
            _blocks(["gray"] * 7, 10).name(blocks1),
            _blocks([BLUE, BLUE, BLUE], 10).name(blocks2),
            _block(100, "white").name(rect4),
        ],
        dir="x",
        spacing=0,
        anchor="edge",
        x=0,
        y=0,
    ).name(mem)

    # Divider: the SPAN SITE. `mem` is a direct (one-level) named child of
    # `disk_log_inner`, the depth at which `.constrain()`'s cross-tier
    # lookup reliably resolves. `labelSpace`: an invisible spacer that
    # stretches `disk_log_inner`'s own bbox down far enough to include the
    # tick marks and label row beneath them (placed by tier-2 `_tick`/
    # `_label`/`_label_lines` layers, anchored via `ref()`, so they aren't
    # structurally nested here and wouldn't otherwise contribute to the
    # bbox).
    disk_log_inner = layer(
        [
            mem_row,
            rect(h=3, fill="black").name("line"),
            rect(w=1, h=1, fill="transparent").name("labelSpace"),
        ]
    ).constrain(
        lambda mem, line, labelSpace: [
            # ── SPAN SITE: the divider line adopts `mem`'s exact
            # horizontal extent.
            Constraint.distribute([mem, line], dir="y", spacing=20),
            Constraint.align([mem, line], x="span"),
            Constraint.distribute([mem, labelSpace], dir="y", spacing=80),
            Constraint.align([mem, labelSpace], x="start"),
        ]
    )

    disk_log_row = spread(
        [
            rect(w=LEFT_COLUMN_WIDTH, h=0, fill="transparent").name(disklogleft),
            disk_log_inner,
        ],
        dir="x",
        spacing=0,
        alignment="start",
    )

    # ── Stage 4: Applier ─────────────────────────────────────────────────
    disk_data_row = spread(
        [
            _block(50, "LightGray"),
            _blocks(["gray"] * 7, 10),
            _blocks([BLUE, BLUE, BLUE], 10),
        ],
        dir="x",
        spacing=0,
        anchor="edge",
        x=0,
        y=0,
    ).name(diskdata)

    # The 5 cells are borderless (a GoFish `rect()` defaults `strokeWidth`
    # to 0, so an unset stroke is invisible) — only the enclosing table
    # gets a border.
    disk_data_cells = spread(
        [
            rect(w=DISK_DATA_WIDTH / 5, h=40, fill="white").name(diskdata1),
            rect(w=DISK_DATA_WIDTH / 5, h=40, fill="white").name(diskdata2),
            rect(w=DISK_DATA_WIDTH / 5, h=40, fill="white").name(diskdata3),
            rect(w=DISK_DATA_WIDTH / 5, h=40, fill="white").name(diskdata4),
            rect(w=DISK_DATA_WIDTH / 5, h=40, fill="white").name(diskdata5),
        ],
        dir="x",
        spacing=0,
        anchor="edge",
    ).name(diskdata_stack)

    disk_data_table = enclose(
        [disk_data_cells], padding=5, fill="white", stroke="black", strokeWidth=3
    )

    applier_inner = layer(
        [
            disk_data_row,
            disk_data_table.name("diskDataTable"),
        ]
    ).constrain(
        lambda diskdata, diskDataTable: [
            Constraint.distribute([diskdata, diskDataTable], dir="y", spacing=50),
            # Centered (not start-aligned) so the disk-data row sits
            # directly above the fan-out arrows' shared, centered origin.
            Constraint.align([diskdata, diskDataTable], x="middle"),
        ]
    )

    applier_row = spread(
        [
            rect(w=LEFT_COLUMN_WIDTH, h=0, fill="transparent").name(applierleft),
            applier_inner,
        ],
        dir="x",
        spacing=0,
        alignment="start",
    )

    # The action labels themselves are placed in tier 2 (`_action_label`,
    # right-aligned against a stage box) — the vertical stack here only
    # reserves a same-height blank slot for each.
    pipeline_head = spread(
        [
            _titled_background("LogAPI", log_api_row).name(log_api_box),
            rect(w=1, h=24, fill="transparent").name(commit_slot),
            _titled_background("GroupLog", group_log_row).name(group_log_box),
            rect(w=1, h=24, fill="transparent").name(flush_slot),
            _titled_background("DiskLog", disk_log_row).name(disk_log_box),
            rect(w=1, h=24, fill="transparent").name(apply_slot),
            _titled_background("Applier", applier_row).name(applier_box),
        ],
        dir="y",
        spacing=10,
        alignment="start",
    )

    # Side labels ("disk log:"/"disk data:" monospace captions) + the
    # fan-out arrow anchor above the 5-cell table.
    disk_log_label = text(
        text="disk log:", fontFamily="monospace", fontWeight=300, fontSize=18
    ).name("diskLogLabel")
    disk_data_label = text(
        text="disk data:", fontFamily="monospace", fontWeight=300, fontSize=18
    ).name("diskDataLabel")
    # Two more small self-contained ref-anchored layers (same pattern as
    # `_tick`/`_label`): a placeholder point above the 5-cell table for the
    # fan-out arrows, and one above DiskLog's blocks1 group for the
    # trailing "flush" callout arrow.
    fanout_anchor_layer = layer(
        [
            rect(w=80, h=1, fill="transparent").name(fanout_anchor_name),
            ref(diskdata_stack).name("target"),
        ]
    ).constrain(
        lambda fanoutAnchor, target: [
            Constraint.distribute([fanoutAnchor, target], dir="y", spacing=50),
            Constraint.align([target, fanoutAnchor], x="middle"),
        ]
    )
    blocks1_arrow_layer = layer(
        [
            rect(w=10, h=10, fill="transparent").name(blocks1_arrow_anchor_name),
            ref(blocks1).name("target"),
        ]
    ).constrain(
        lambda blocks1ArrowAnchor, target: [
            Constraint.distribute(
                [blocks1ArrowAnchor, target], dir="y", spacing=70
            ),
            Constraint.align([target, blocks1ArrowAnchor], x="middle"),
        ]
    )

    # The "Log data" tick label centers under the actual log-data SPAN
    # (rect2 through blocks2), not under rect2 alone. `mem`'s row is a
    # fixed, deterministic pixel layout, so the span's width is a known
    # constant; a fresh same-height rect of that width, left-aligned to
    # rect2, stands in as the anchor `_label` centers under.
    LOG_DATA_WIDTH = (
        80  # rect2
        + 80  # rect3
        + 7 * 10  # blocks1
        + 3 * 10  # blocks2
    )
    log_data_anchor_layer = layer(
        [
            ref(rect2).name("a"),
            rect(w=LOG_DATA_WIDTH, h=BLOCK_H, fill="transparent").name(
                log_data_anchor
            ),
        ]
    ).constrain(
        lambda a, logDataAnchor: [
            Constraint.align([a, logDataAnchor], x="start", y="start"),
        ]
    )

    return (
        layer(
            [
                pipeline_head,
                _tick(rect1, "start"),
                _tick(rect2, "start", disklogtick2),
                _tick(rect4, "start", disklogtick3),
                _tick(rect4, "end"),
                _label(rect1, "Log header"),
                log_data_anchor_layer,
                _label(log_data_anchor, "Log data"),
                _label_lines(rect4, ["Available log", "space"]),
                # "commit"/"flush"/"apply" action labels — right-aligned
                # against the stage box that follows them.
                _action_label(group_log_box, commit_slot, "commit"),
                _action_label(disk_log_box, flush_slot, "flush"),
                _action_label(applier_box, apply_slot, "apply"),
                # "disk log:" / "disk data:" side labels — small,
                # self-contained, ref-anchored (same reasoning as
                # `_tick`/`_label` above).
                layer(
                    [
                        ref(disklogleft).name("a"),
                        ref(mem).name("m"),
                        disk_log_label,
                    ]
                ).constrain(
                    lambda a, m, diskLogLabel: [
                        Constraint.align([m, diskLogLabel], y="middle"),
                        Constraint.align([a, diskLogLabel], x="end"),
                    ]
                ),
                layer(
                    [
                        ref(applierleft).name("a"),
                        ref(diskdata_stack).name("s"),
                        disk_data_label,
                    ]
                ).constrain(
                    lambda a, s, diskDataLabel: [
                        Constraint.align([s, diskDataLabel], y="middle"),
                        Constraint.align([a, diskDataLabel], x="end"),
                    ]
                ),
                # Funnel 1: GroupLog's committedTxns ARRAY (the full
                # bracketed extent) converges onto DiskLog's gray+blue run.
                *_funnel_side(bigleftbracket, "start", blocks1, "start", "funnel1L"),
                *_funnel_side(bigrightbracket, "end", blocks2, "end", "funnel1R"),
                # Funnel 2: the two tick DIVIDERS beneath the disk-log row
                # converge onto Applier's gray+blue disk-data row.
                *_funnel_side(
                    disklogtick2, "middle", diskdata, "start", "funnel2L"
                ),
                *_funnel_side(disklogtick3, "middle", diskdata, "end", "funnel2R"),
                # commit arrow: LogAPI's active txn → GroupLog's tracked
                # committed txn.
                arrow(
                    [ref(active_txn_block), ref(committed_txns_block)], stretch=0
                ),
                # 5-cell fan-out + the blocks1 callout arrow.
                fanout_anchor_layer,
                blocks1_arrow_layer,
                arrow([ref(fanout_anchor_name), ref(diskdata1)], stretch=0, bow=0),
                arrow([ref(fanout_anchor_name), ref(diskdata2)], stretch=0, bow=0),
                arrow([ref(fanout_anchor_name), ref(diskdata3)], stretch=0, bow=0),
                arrow([ref(fanout_anchor_name), ref(diskdata4)], stretch=0, bow=0),
                arrow([ref(fanout_anchor_name), ref(diskdata5)], stretch=0, bow=0),
                arrow(
                    [ref(blocks1_arrow_anchor_name), ref(blocks1)],
                    stretch=0,
                    bow=0,
                ),
            ],
            x=20,
            y=20,
        ),
        {"w": 900, "h": 900},
    )
