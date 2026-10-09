"""Equivalent of TimeBenchmarkPorts.stories.tsx — Forward Syntax/Time/Benchmark Ports.

CircleTimeline is exempt: it sizes each circle in a JS function mark.
"""

from datetime import datetime, timezone

from gofish import chart, scatter, stack, group, ribbon, line, blank, Schema, Color, Curve

# A synthetic store's sales per category and quarter (the benchmark's
# `quarterly-sales.json`).
QUARTERLY_SALES = [
    {"date": "2016-03-01", "category": "Furniture", "sales": 25467},
    {"date": "2016-03-01", "category": "Office Supplies", "sales": 19116},
    {"date": "2016-03-01", "category": "Technology", "sales": 22865},
    {"date": "2016-06-01", "category": "Furniture", "sales": 21497},
    {"date": "2016-06-01", "category": "Office Supplies", "sales": 32774},
    {"date": "2016-06-01", "category": "Technology", "sales": 43646},
    {"date": "2016-09-01", "category": "Furniture", "sales": 36563},
    {"date": "2016-09-01", "category": "Office Supplies", "sales": 39131},
    {"date": "2016-09-01", "category": "Technology", "sales": 54133},
    {"date": "2016-12-01", "category": "Furniture", "sales": 55789},
    {"date": "2016-12-01", "category": "Office Supplies", "sales": 56485},
    {"date": "2016-12-01", "category": "Technology", "sales": 71076},
    {"date": "2017-03-01", "category": "Furniture", "sales": 31301},
    {"date": "2017-03-01", "category": "Office Supplies", "sales": 28874},
    {"date": "2017-03-01", "category": "Technology", "sales": 25230},
    {"date": "2017-06-01", "category": "Furniture", "sales": 41683},
    {"date": "2017-06-01", "category": "Office Supplies", "sales": 32169},
    {"date": "2017-06-01", "category": "Technology", "sales": 44406},
    {"date": "2017-09-01", "category": "Furniture", "sales": 39416},
    {"date": "2017-09-01", "category": "Office Supplies", "sales": 48872},
    {"date": "2017-09-01", "category": "Technology", "sales": 47540},
    {"date": "2017-12-01", "category": "Furniture", "sales": 71471},
    {"date": "2017-12-01", "category": "Office Supplies", "sales": 67254},
    {"date": "2017-12-01", "category": "Technology", "sales": 87038},
    {"date": "2018-03-01", "category": "Furniture", "sales": 25032},
    {"date": "2018-03-01", "category": "Office Supplies", "sales": 26332},
    {"date": "2018-03-01", "category": "Technology", "sales": 49207},
    {"date": "2018-06-01", "category": "Furniture", "sales": 40282},
    {"date": "2018-06-01", "category": "Office Supplies", "sales": 54781},
    {"date": "2018-06-01", "category": "Technology", "sales": 53644},
    {"date": "2018-09-01", "category": "Furniture", "sales": 51247},
    {"date": "2018-09-01", "category": "Office Supplies", "sales": 55562},
    {"date": "2018-09-01", "category": "Technology", "sales": 56646},
    {"date": "2018-12-01", "category": "Furniture", "sales": 92905},
    {"date": "2018-12-01", "category": "Office Supplies", "sales": 85371},
    {"date": "2018-12-01", "category": "Technology", "sales": 109679},
]

# The US federal surplus (+) or deficit (-) per month, 2017 to 2018, in
# millions of dollars (US Treasury, Monthly Treasury Statement). Public domain.
BUDGET_BALANCE = [
    {"date": "2017-01-01", "balance": 51257},
    {"date": "2017-02-01", "balance": -192044},
    {"date": "2017-03-01", "balance": -176233},
    {"date": "2017-04-01", "balance": 182428},
    {"date": "2017-05-01", "balance": -88423},
    {"date": "2017-06-01", "balance": -90233},
    {"date": "2017-07-01", "balance": -42939},
    {"date": "2017-08-01", "balance": -107689},
    {"date": "2017-09-01", "balance": 7886},
    {"date": "2017-10-01", "balance": -63214},
    {"date": "2017-11-01", "balance": -138547},
    {"date": "2017-12-01", "balance": -23192},
    {"date": "2018-01-01", "balance": 49237},
    {"date": "2018-02-01", "balance": -215239},
    {"date": "2018-03-01", "balance": -208744},
    {"date": "2018-04-01", "balance": 214255},
    {"date": "2018-05-01", "balance": -146796},
    {"date": "2018-06-01", "balance": -74858},
    {"date": "2018-07-01", "balance": -76865},
    {"date": "2018-08-01", "balance": -214148},
    {"date": "2018-09-01", "balance": 119116},
    {"date": "2018-10-01", "balance": -100491},
    {"date": "2018-11-01", "balance": -204903},
    {"date": "2018-12-01", "balance": -13539},
]



def _epoch_ms(date):
    d = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(d.timestamp() * 1000)


def story_stacked_area():
    return (
        chart(QUARTERLY_SALES, schema={"date": Schema.time()}, axes=True)
        .flow(scatter(by="date", x="date"), stack(by="category", dir="y"))
        .mark(ribbon(h="sales", fill="category", curve=Curve.linear())),
        {"w": 520, "h": 330},
    )


def story_surplus_deficit_line():
    # Dates as epoch milliseconds, so a crossing can be placed between two
    # months by interpolating the time.
    rows = [
        {"date": _epoch_ms(d["date"]), "balance": d["balance"]}
        for d in BUDGET_BALANCE
    ]
    # Add a zero point at each crossing, so each side's area ends there.
    pts = []
    for i, d in enumerate(rows):
        prev = rows[i - 1] if i > 0 else None
        if prev and prev["balance"] * d["balance"] < 0:
            f = prev["balance"] / (prev["balance"] - d["balance"])
            pts.append(
                {"date": prev["date"] + f * (d["date"] - prev["date"]), "balance": 0}
            )
        pts.append(d)
    # Each side's area is the balance clamped to that side of zero.
    area = [
        row
        for d in pts
        for row in (
            {"date": d["date"], "side": "Surplus", "balance": max(d["balance"], 0)},
            {"date": d["date"], "side": "Deficit", "balance": min(d["balance"], 0)},
        )
    ]
    schema = {"date": Schema.time()}
    return (
        chart(
            area,
            schema=schema,
            axes=True,
            color=Color.palette({"Surplus": "#2a9d8f", "Deficit": "#e76f51"}),
        )
        .flow(group(by="side"), scatter(by="date", x="date"))
        .mark(ribbon(h="balance", fill="side", curve=Curve.linear()))
        # The line: invisible anchors at the monthly values, then a line
        # through them.
        .layer(
            chart(rows, schema=schema)
            .flow(scatter(by="date", x="date", y="balance"))
            .mark(blank())
        )
        .layer(line(stroke="#222", stroke_width=1.5, curve=Curve.linear())),
        {"w": 560, "h": 340},
    )
