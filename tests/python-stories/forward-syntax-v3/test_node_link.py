"""Equivalent of NodeLink.stories.tsx — Forward Syntax V3/NodeLink."""

from gofish import chart, circle, line, resolve, scatter, selectAll

NODES = [
    {"id": "a", "grp": 0},
    {"id": "b", "grp": 1},
    {"id": "c", "grp": 1},
    {"id": "d", "grp": 2},
    {"id": "e", "grp": 2},
]

EDGES = [
    {"source": "a", "target": "b"},
    {"source": "a", "target": "c"},
    {"source": "b", "target": "d"},
    {"source": "c", "target": "d"},
    {"source": "c", "target": "e"},
]


def story_basic():
    return (
        chart(NODES)
        .flow(scatter(by="id", x="grp", y="id"))
        .mark(circle(r=14, fill="#4e79a7").name("nodes"))
        .layer(
            chart(EDGES)
            .flow(resolve(["source", "target"], from_=selectAll("nodes")))
            .mark(line(from_="source", to="target", stroke="#888", strokeWidth=1.5))
        ),
        {"w": 400, "h": 400},
    )
