"""Sources, expressions, the time surface and the kernel tier (#774, #1022):
what the Python surface writes to the IR, and how a host answers a call
that reads a source."""

import base64

import pytest

from gofish import (
    Animation,
    Curve,
    chart,
    circle,
    concat_str,
    derive,
    drag,
    field,
    filter,
    layer,
    pointer,
    rect,
    scatter,
    signal,
    spread,
    text,
    time,
    timer,
    wheel,
    when,
)
from gofish.arrow_utils import arrow_to_records, data_to_arrow_bytes
from gofish.ast import answer, ir_payload

ROWS = [{"cat": "a", "count": 30}, {"cat": "b", "count": 80}]


def _doc(builder):
    return builder.to_ir()


def _rows_b64(rows):
    return base64.b64encode(data_to_arrow_bytes(rows)).decode("ascii")


def _reply_rows(reply):
    return arrow_to_records(base64.b64decode(reply["tables"][reply["root"]["id"]]))


class TestExpressions:
    def test_operators_build_ops(self):
        dr = drag()
        cut = dr.y.clip(0, 95).fill_null(60)
        doc = _doc(
            chart(ROWS)
            .flow(spread(by="cat", dir="x"))
            .mark(
                rect(
                    h="count",
                    fill=when(field("count").sum() > cut)
                    .then("#d62728")
                    .otherwise("#6b9bd1"),
                )
            )
        )
        fill = doc["root"]["mark"]["fill"]
        assert fill == {
            "type": "when",
            "branches": [
                [
                    {
                        "type": "op",
                        "op": "gt",
                        "args": [
                            {"type": "field", "name": "count", "ops": [{"op": "sum"}]},
                            {
                                "type": "op",
                                "op": "fillNull",
                                "args": [
                                    {
                                        "type": "op",
                                        "op": "clip",
                                        "args": [
                                            {"type": "source", "id": "s0", "read": "y"},
                                            0,
                                            95,
                                        ],
                                    },
                                    60,
                                ],
                            },
                        ],
                    },
                    "#d62728",
                ]
            ],
            "otherwise": "#6b9bd1",
        }
        assert doc["sources"] == {"s0": {"kind": "drag"}}

    def test_reflected_and_boolean_operators(self):
        year = timer(domain=[0, 10])
        e = (1 + year) * 2 - 3 / year
        b = ~((year > 1) & (year <= 5) | (year == 7))
        doc = _doc(chart(ROWS).mark(rect(h=e, opacity=b)))
        assert doc["root"]["mark"]["h"]["op"] == "sub"
        assert doc["root"]["mark"]["opacity"]["op"] == "not"
        assert doc["root"]["mark"]["opacity"]["args"][0]["op"] == "or"

    def test_a_source_used_twice_is_declared_once(self):
        year = timer(domain=[1955, 2005], duration=10_000, playing=False, at=1997.5)
        doc = _doc(
            chart(ROWS)
            .flow(time.sequence(by="year", on=year))
            .mark(text(text=year.floor()))
        )
        assert doc["sources"] == {
            "s0": {
                "kind": "timer",
                "domain": [1955, 2005],
                "duration": 10000,
                "playing": False,
                "at": 1997.5,
            }
        }
        assert doc["root"]["operators"][0]["on"] == {"type": "source", "id": "s0"}

    def test_pointer_reads(self):
        hover = pointer()
        doc = _doc(
            chart(ROWS).mark(
                text(text=hover.field("cat").fill_null(""), fill=when(hover.over).then("red"))
            )
        )
        assert doc["root"]["mark"]["text"]["args"][0] == {
            "type": "source",
            "id": "s0",
            "read": "field",
            "arg": "cat",
        }

    def test_an_expression_is_not_a_bool(self):
        with pytest.raises(TypeError, match="when\\(condition\\)"):
            if field("x") > 3:
                pass
        with pytest.raises(TypeError, match="&"):
            (field("x") > 3) and (field("x") < 5)

    def test_an_expression_is_not_a_dict_key(self):
        with pytest.raises(TypeError, match="dict key"):
            {field("x") > 3: 1}
        with pytest.raises(TypeError, match="dict key"):
            {timer(): 1}

    def test_a_function_is_not_an_expression(self):
        with pytest.raises(TypeError, match="Python functions do not run"):
            when(lambda d: True)

    def test_a_record_source_is_not_an_expression_itself(self):
        with pytest.raises(TypeError, match=r"\.x, \.y"):
            field("x") > drag()

    def test_filter_takes_an_expression(self):
        day = timer(domain=[1, 365], step=1)
        doc = _doc(chart(ROWS).flow(filter(field("day") == day)).mark(rect()))
        assert doc["root"]["operators"][0]["predicate"] == {
            "type": "op",
            "op": "eq",
            "args": [{"type": "field", "name": "day"}, {"type": "source", "id": "s0"}],
        }


class TestTime:
    def test_sequence_on_a_non_clock_raises(self):
        with pytest.raises(TypeError, match="takes a timer"):
            time.sequence(by="year", on=wheel(range=[0, 1]))

    def test_transitions(self):
        doc = _doc(
            chart(ROWS)
            .flow(spread(by="cat", dir="x").transition(enter=time.stagger(lag=60)))
            .mark(rect(h="count").transition(enter=Animation.grow(duration=600)))
        )
        assert doc["root"]["operators"][0]["transition"] == {
            "enter": {"kind": "stagger", "lag": 60}
        }
        assert doc["root"]["mark"]["transition"] == {
            "enter": {"kind": "grow", "duration": 600}
        }

    def test_tween_and_wipe(self):
        m = circle(r=4).transition(update=Animation.tween(curve=Curve.monotone))
        assert _doc(m)["root"]["transition"] == {
            "update": {"kind": "tween", "curve": {"kind": "monotone"}}
        }
        t = time.transition(enter=Animation.wipe(from_="bottom"))
        assert _doc(t)["root"] == {"type": "time.transition", "enter": {"kind": "wipe", "from": "bottom"}}

    def test_a_function_ease_raises(self):
        with pytest.raises(TypeError, match="ease"):
            Animation.grow(ease=lambda t: t)

    def test_history_both_forms(self):
        op = time.history(last=20)
        m = time.history([circle(r=4)], last=20)
        assert _doc(chart(ROWS).flow(op).mark(rect()))["root"]["operators"][0] == {
            "type": "time.history",
            "last": 20,
        }
        assert _doc(m)["root"]["type"] == "time.history"

    def test_render_options_reach_the_widget(self):
        w = chart(ROWS).mark(rect()).render(w=100, h=100, playing=False, at=700)
        assert w.playing is False and w.at == 700


class TestKernelTier:
    def test_reading_while_building_raises(self):
        bins = wheel(range=[3, 40], initial=12)
        with pytest.raises(RuntimeError, match="while building the spec"):
            bins()

    def test_a_derive_reads_the_shipped_value_and_reports_it(self):
        bins = wheel(range=[3, 40], initial=12, round=True)
        seen = []

        def bin_rows(rows):
            seen.append(bins())
            return rows[: bins()]

        op = derive(bin_rows)
        doc, callbacks = ir_payload(
            chart(ROWS).flow(op).mark(rect()).layer(text(text=concat_str("bins: ", bins)))
        )
        # The caption declares the wheel, so JS ships its value.
        assert doc["sources"] == {"s0": {"kind": "wheel", "range": [3, 40], "initial": 12, "round": True}}
        reply = answer(callbacks, op.lambda_id, _rows_b64(ROWS), {"s0": 1})
        assert seen == [1]
        assert reply["reads"] == ["s0"]
        assert _reply_rows(reply) == ROWS[:1]

    def test_a_source_only_the_callback_names_is_declared_and_asked_for(self):
        head = timer(domain=[0, 199], step=1, duration=100_000)
        op = derive(lambda rows: rows[: head() + 1])
        doc, callbacks = ir_payload(chart(ROWS).flow(op).mark(rect()))
        assert "sources" not in doc
        # First call: JS has no value for it. The callback stops, and the
        # reply declares the source and names it as read.
        first = answer(callbacks, op.lambda_id, _rows_b64(ROWS), {})
        [sid] = first["reads"]
        assert first["sources"] == {sid: {"kind": "timer", "domain": [0, 199], "step": 1, "duration": 100000}}
        # Second call, with its value: the answer.
        second = answer(callbacks, op.lambda_id, _rows_b64(ROWS), {sid: 0})
        assert second["reads"] == [sid]
        assert _reply_rows(second) == ROWS[:1]
        # The same id names it on every call.
        third = answer(callbacks, op.lambda_id, _rows_b64(ROWS), {sid: 1})
        assert third["reads"] == [sid] and _reply_rows(third) == ROWS

    def test_a_record_source_cannot_be_read_in_the_kernel(self):
        dr = drag()
        op = derive(lambda rows: [dr()])
        _, callbacks = ir_payload(chart(ROWS).flow(op).mark(rect()))
        with pytest.raises(TypeError, match="several values"):
            answer(callbacks, op.lambda_id, _rows_b64(ROWS), {})

    def test_a_mark_function_reply_declares_its_sources_by_the_document_ids(self):
        year = signal(3)

        def glyph(rows):
            return text(text=year.round())

        doc, callbacks = ir_payload(
            chart(ROWS).flow(spread(by="cat", dir="x")).mark(glyph).layer(text(text=year))
        )
        assert doc["sources"] == {"s0": {"kind": "signal", "init": 3}}
        [lambda_id] = callbacks
        reply = answer(callbacks, lambda_id, _rows_b64(ROWS[:1]), {"s0": 3})
        assert reply["sources"] == {"s0": {"kind": "signal", "init": 3}}
        assert reply["root"]["text"] == {"type": "op", "op": "round", "args": [{"type": "source", "id": "s0"}]}
        assert reply["reads"] == []
