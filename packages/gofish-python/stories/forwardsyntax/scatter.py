"""Forward Syntax V3/Scatter — mirrors Scatter.stories.tsx

Basic scatter plot only. Connected and WithPieGlyphs variants require
layer support (not yet in Python wrapper).
"""

from gofish import chart, scatter, circle
from stories.data.seafood import catch_locations_array

TITLE = "Forward Syntax V3/Scatter"


def basic(w=400, h=400):
    """Basic scatter plot: lake catch locations as circles."""
    return (
        chart(catch_locations_array)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(circle(r=5))
    )
