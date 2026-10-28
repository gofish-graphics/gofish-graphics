"""Equivalent of EncloseMembers.stories.tsx — Enclose/Members.

How `enclose` reads each kind of member: one blob per kind. A circle is an
exact disc, a line its pieces as wide as its stroke, a polygon or a ribbon
its closed outline with the inside filled.
"""

from gofish import (
    Curve,
    Shape,
    circle,
    enclose,
    layer,
    line,
    polygon,
    position,
    rect,
    ref,
    ribbon,
)

SIZE = {}


def _blob(members):
    return enclose(
        members,
        shape=Shape.blob(),
        padding=10,
        fill="#4c78a8",
        stroke="#1f3b63",
        stroke_width=1.5,
        fill_opacity=0.2,
    )


def _at(p, node):
    return position([node], x=p[0], y=p[1])


def story_circles():
    return (
        layer([
            _at([20, 40], circle(r=18, fill="#e45756").name("c1")),
            _at([110, 10], circle(r=10, fill="#e45756").name("c2")),
            _at([150, 70], circle(r=26, fill="#e45756").name("c3")),
        ]).relate(lambda **n: [_blob([n["c1"], n["c2"], n["c3"]])]),
        SIZE,
    )


A = [[20, 30], [80, 120], [150, 20], [210, 110]]
B = [[30, 150], [100, 170], [170, 140], [215, 160]]


def _dot(p, name):
    return _at([p[0] - 2, p[1] - 2], circle(r=2, fill="#333").name(name))


def _thick(children):
    return line(
        children, stroke="#54a24b", stroke_width=10, curve=Curve.catmull_rom()
    )


def story_thick_curves():
    return (
        layer([
            layer(
                [_dot(p, f"a{i}") for i, p in enumerate(A)]
                + [_dot(p, f"b{i}") for i, p in enumerate(B)]
            ).relate(lambda **n: [
                _thick([n[f"a{i}"] for i in range(len(A))]).name("la"),
                _thick([n[f"b{i}"] for i in range(len(B))]).name("lb"),
            ]),
        ]).relate(lambda: [_blob([ref("la"), ref("lb")])]),
        SIZE,
    )


L = [[0, 0], [22, 0], [22, 80], [70, 80], [70, 100], [0, 100]]
C = [[0, 0], [80, 0], [80, 22], [22, 22], [22, 78], [80, 78], [80, 100], [0, 100]]


def story_polygons():
    return (
        layer([
            _at([10, 10], polygon(points=L, fill="#f58518").name("pl")),
            _at([120, 30], polygon(points=C, fill="#f58518").name("pc")),
        ]).relate(lambda **n: [_blob([n["pl"], n["pc"]])]),
        SIZE,
    )


BARS = [[10, 60, 40], [80, 20, 90], [150, 90, 30], [220, 40, 70]]


def story_ribbon_band():
    return (
        layer([
            layer([
                _at([x, y], rect(w=14, h=h, fill="#b279a2").name(f"r{i}"))
                for i, (x, y, h) in enumerate(BARS)
            ]).relate(lambda **n: [
                ribbon(
                    [n[f"r{i}"] for i in range(len(BARS))],
                    fill="#b279a2",
                    opacity=0.6,
                ).name("band"),
            ]),
        ]).relate(lambda: [_blob([ref("band")])]),
        SIZE,
    )
