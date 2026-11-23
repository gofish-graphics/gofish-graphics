"""Equivalent of BoxPlot.stories.tsx — Forward Syntax/Box Plot."""

import statistics

from gofish import chart, field, layer, rect, spread, Domain, Trait, Unit
from python_stories.data import GENDER_PAY_GAP, PAY_GRADE, PENGUINS


def story_gender_pay_gap():
    # Five columns on one y axis, all amounts of one quantity, Pay, in USD:
    # they share the axis and it is titled "Pay (USD)". (The dataset's
    # currency is not recorded; USD is illustrative.)
    pay = {"name": "Pay", "unit": Unit("USD")}
    return (
        chart(
            GENDER_PAY_GAP,
            schema={
                "Pay Grade": Unit(domain=Domain.discrete(PAY_GRADE), traits=[Trait.ordered()]),
                "Min": pay,
                "25-Percentile": pay,
                "Median": pay,
                "75-Percentile": pay,
                "Max": pay,
            },
            h=320,
        )
        .flow(
            spread(by="Pay Grade", dir="x", spacing=24),
            spread(dir="x", spacing=6),
        )
        .mark(
            layer(
                [
                    rect(x=7.5, w=1, y="Min", y2="Max", fill="gray"),
                    rect(w=16, y="25-Percentile", y2="75-Percentile", fill="Gender"),
                    rect(w=16, h=1.5, y="Median", fill="white"),
                ]
            )
        ),
        {},
    )


def _five_numbers(xs):
    # The five-number summary of the group's masses. "inclusive" is the
    # type-7 quantile, as d3's quantile in the JS story.
    xs = sorted(x for x in xs if x is not None)
    q1, median, q3 = statistics.quantiles(xs, n=4, method="inclusive")
    return {"lo": xs[0], "q1": q1, "median": median, "q3": q3, "hi": xs[-1]}


def story_penguin_body_mass():
    # The summary is computed from the raw rows, once per species, by a
    # reduce that returns a record; each mark reads one of its members.
    box = field("Body Mass (g)").reduce(_five_numbers, unit="g")
    return (
        chart(PENGUINS, h=320)
        .flow(spread(by="Species", dir="x", spacing=40))
        .mark(
            layer(
                [
                    rect(x=11.5, w=1, y=box.lo(), y2=box.hi(), fill="gray"),
                    rect(w=24, y=box.q1(), y2=box.q3(), fill="Species"),
                    rect(w=24, h=1.5, y=box.median(), fill="white"),
                ]
            )
        ),
        {},
    )
