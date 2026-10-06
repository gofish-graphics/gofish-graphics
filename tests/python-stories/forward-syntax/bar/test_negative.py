"""Equivalent of BarNegative.stories.tsx — Forward Syntax/Bar/Negative."""

from gofish import chart, spread, stack, group, rect
from python_stories.data import NEGATIVE_BAR_DATA

CASH_FLOWS = [
    {"quarter": "Q1", "flow": "Sales", "direction": "Inflow", "amount": 60},
    {"quarter": "Q1", "flow": "Refunds", "direction": "Outflow", "amount": -15},
    {"quarter": "Q1", "flow": "Services", "direction": "Inflow", "amount": 20},
    {"quarter": "Q1", "flow": "Costs", "direction": "Outflow", "amount": -40},
    {"quarter": "Q2", "flow": "Sales", "direction": "Inflow", "amount": 30},
    {"quarter": "Q2", "flow": "Refunds", "direction": "Outflow", "amount": -25},
    {"quarter": "Q2", "flow": "Services", "direction": "Inflow", "amount": 10},
    {"quarter": "Q2", "flow": "Costs", "direction": "Outflow", "amount": -50},
    {"quarter": "Q3", "flow": "Sales", "direction": "Inflow", "amount": 45},
    {"quarter": "Q3", "flow": "Refunds", "direction": "Outflow", "amount": -5},
    {"quarter": "Q3", "flow": "Services", "direction": "Inflow", "amount": 15},
    {"quarter": "Q3", "flow": "Costs", "direction": "Outflow", "amount": -20},
]


def story_default():
    return (
        chart(NEGATIVE_BAR_DATA, axes=True)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value")),
        {"w": 400, "h": 400},
    )


def story_unrounded_min():
    data = [
        {"category": "A", "value": 30},
        {"category": "B", "value": -20},
        {"category": "C", "value": 45},
        {"category": "D", "value": -35},
        {"category": "E", "value": 10},
        {"category": "F", "value": -5},
    ]
    return (
        chart(data, axes=True)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value")),
        {"w": 400, "h": 300},
    )


def story_all_negative():
    data = [
        {"category": "A", "value": -12},
        {"category": "B", "value": -37},
        {"category": "C", "value": -23},
        {"category": "D", "value": -8},
    ]
    return (
        chart(data, axes=True)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value")),
        {"w": 400, "h": 300},
    )


def story_signed_group():
    data = [
        {"quarter": "Q1", "flow": "Inflow", "amount": 67},
        {"quarter": "Q1", "flow": "Outflow", "amount": -33},
        {"quarter": "Q2", "flow": "Inflow", "amount": 54},
        {"quarter": "Q2", "flow": "Outflow", "amount": -46},
        {"quarter": "Q3", "flow": "Inflow", "amount": 48},
        {"quarter": "Q3", "flow": "Outflow", "amount": -52},
    ]
    return (
        chart(data, axes=True)
        .flow(spread(by="quarter", dir="y"), group(by="flow"))
        .mark(rect(w="amount", fill="flow")),
        {"w": 400, "h": 200},
    )


def story_mixed_sign_stack():
    return (
        chart(CASH_FLOWS, axes=True)
        .flow(spread(by="quarter", dir="x"), stack(by="flow", dir="y"))
        .mark(rect(h="amount", fill="flow")),
        {"w": 400, "h": 400},
    )


def story_all_negative_stack():
    outflows = [d for d in CASH_FLOWS if d["direction"] == "Outflow"]
    return (
        chart(outflows, axes=True)
        .flow(spread(by="quarter", dir="x"), stack(by="flow", dir="y"))
        .mark(rect(h="amount", fill="flow")),
        {"w": 400, "h": 300},
    )


def story_diverging_stack():
    return (
        chart(CASH_FLOWS, axes=True)
        .flow(
            spread(by="quarter", dir="x"),
            group(by="direction"),
            stack(by="flow", dir="y"),
        )
        .mark(rect(h="amount", fill="flow")),
        {"w": 400, "h": 400},
    )


def story_waterfall_column():
    data = [
        {"step": "Starting revenue", "change": 100},
        {"step": "Churn", "change": -30},
        {"step": "Expansion", "change": 20},
        {"step": "Contraction", "change": -50},
        {"step": "New business", "change": 10},
    ]
    return (
        chart(data, axes=True)
        .flow(stack(by="step", dir="y"))
        .mark(rect(w=40, h="change", fill="step")),
        {"w": 200, "h": 400},
    )
