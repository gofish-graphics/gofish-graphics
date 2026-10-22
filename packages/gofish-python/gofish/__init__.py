"""
GoFish Graphics in Python
"""

from .ast import (
    chart,
    ChartBuilder,
    mark,
    create_name,
    Token,
    LayerBuilder,
    layer,
    enclose,
    position,
    Constraint,
    Schema,
    ColumnSchema,
    ref,
    arrow,
    over,
    intersect,
    exclude,
    subtract,
    paint,
    mask,
    cut,
    offset,
    spread,
    stack,
    derive,
    compose,
    resolve,
    join,
    filter,
    group,
    scatter,
    treemap,
    pack,
    partition,
    table,
    log,
    select_all,
    assign_gradient_color,
    normalize,
    repeat,
    rect,
    circle,
    line,
    ribbon,
    blank,
    region,
    ellipse,
    petal,
    text,
    image,
    polygon,
    datum,
    field,
    struct,
    chunk,
)
from .datum_projection import pluck
from .charts import bar_chart

# Sources (declared here, run by the browser) and expressions over them.
from .sources import timer, signal, wheel
from .readers import pointer, drag, click
from .expr import when, concat_str

# The time surface, a namespace like JS `time` (`time.sequence(...)`).
from . import time

# Strategy families (#1013): one module per family, with a lowercase file
# name, bound here under its capitalized name. `Curve.monotone` and
# `from gofish.curve import monotone` are the same function.
from . import bin as Bin
from . import calendar as Calendar
from . import color as Color
from . import coord as Coord
from . import curve as Curve
from . import overlap as Overlap
from . import shape as Shape
from . import tile as Tile
from . import animation as Animation

__all__ = [
    "chart",
    "ChartBuilder",
    "mark",
    "create_name",
    "Token",
    "LayerBuilder",
    "layer",
    "enclose",
    "position",
    "Constraint",
    "Schema",
    "ColumnSchema",
    "Calendar",
    "ref",
    "arrow",
    "over",
    "intersect",
    "exclude",
    "subtract",
    "paint",
    "mask",
    "cut",
    "offset",
    "spread",
    "stack",
    "derive",
    "compose",
    "resolve",
    "join",
    "filter",
    "group",
    "scatter",
    "treemap",
    "pack",
    "partition",
    "table",
    "log",
    "select_all",
    "assign_gradient_color",
    "normalize",
    "repeat",
    "rect",
    "circle",
    "line",
    "ribbon",
    "blank",
    "region",
    "ellipse",
    "petal",
    "text",
    "image",
    "polygon",
    "datum",
    "field",
    "struct",
    "chunk",
    "pluck",
    "bar_chart",
    "Bin",
    "Color",
    "Coord",
    "Curve",
    "Overlap",
    "Shape",
    "Tile",
    "Animation",
    "timer",
    "signal",
    "wheel",
    "pointer",
    "drag",
    "click",
    "when",
    "concat_str",
    "time",
]

__version__ = "0.1.0"
