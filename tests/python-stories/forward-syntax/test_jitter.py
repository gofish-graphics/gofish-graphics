"""Equivalent of Jitter.stories.tsx — Forward Syntax/Jitter."""

import math

from gofish import chart, circle, jitter, scatter, spread
from python_stories.data import DENSE_MASSES, PENGUINS

WEIGHED = [p for p in PENGUINS if p["Body Mass (g)"] is not None]


def story_penguin_mass():
    return (
        chart(WEIGHED, axes=True)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(x="Body Mass (g)", alignment="middle", overlap=jitter()),
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 320},
    )


def _dense(overlap):
    return (
        chart(DENSE_MASSES, axes=True)
        .flow(
            spread(by="group", dir="y", spacing=16),
            scatter(x="mass", alignment="middle", overlap=overlap),
        )
        .mark(circle(r=2, fill="group")),
        {"w": 640, "h": 420},
    )


def story_dense_default():
    return _dense(jitter(padding=0.5))


def story_dense_smoothing():
    return _dense(jitter(padding=0.5, smoothing=300))


def story_dense_quasi():
    return _dense(jitter(padding=0.5, randomness="quasi"))


def story_dense_uniform_flat():
    return _dense(jitter(padding=0.5, randomness="uniform", smoothing=math.inf))
