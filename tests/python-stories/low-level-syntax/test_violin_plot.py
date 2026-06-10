"""Equivalent of lowlevel/ViolinPlot.stories.tsx — Low Level Syntax/Violin Plot.

A violin plot of penguin body mass per species. For each species we estimate a
density curve, place one zero-height `rect` per grid point (vertical position =
mass, width = density), and trace the silhouette with a `connect`. The species
are spread side by side on a shared scale.

The JS story uses `fast-kde`'s `density1d`; this port uses the idiomatic
`scipy.stats.gaussian_kde` instead, so the curve may differ slightly from the
JS baseline — that divergence is expected and evaluated via the parity diff.
"""

import numpy as np
from scipy.stats import gaussian_kde

from gofish import layer, spread, stack, connect, rect, ref, datum
from python_stories.data import PENGUINS
from python_stories._lowlevel_helpers import group_by

# Number of grid points along each species' density curve. Matches fast-kde's
# default resolution so the JS and Python violins have comparable smoothness
# (the curve values still differ — different KDE implementation/bandwidth).
_GRID = 512


def _density(masses):
    """(grid_value, density) points across the data range via Gaussian KDE."""
    kde = gaussian_kde(masses)
    grid = np.linspace(min(masses), max(masses), _GRID)
    return list(zip(grid.tolist(), kde(grid).tolist()))


def story_default():
    def _violin(species, rows):
        masses = [r["Body Mass (g)"] for r in rows if r["Body Mass (g)"] is not None]
        points = _density(masses)
        names = [f"{species}-{x}" for x, _y in points]
        return layer(
            [
                stack(
                    [
                        rect(
                            y=x / 40, w=y * 100000, h=0, fill=datum(species)
                        ).name(name)
                        for (x, y), name in zip(points, names)
                    ],
                    dir="y",
                    alignment="middle",
                ),
                connect(
                    [ref(name) for name in names],
                    direction="y",
                    opacity=1,
                    mixBlendMode="normal",
                ),
            ]
        )

    return (
        spread(
            [
                _violin(species, rows)
                for species, rows in group_by(PENGUINS, "Species").items()
            ],
            dir="x",
            spacing=64,
            sharedScale=True,
        ),
        {"w": 500, "h": 300, "axes": True},
    )
