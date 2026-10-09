"""Equivalent of Noise.stories.tsx — Forward Syntax/Noise."""

from gofish import chart, circle, scatter, spread, Overlap
from python_stories.data import DENSE_MASSES, PENGUINS

WEIGHED = [p for p in PENGUINS if p["Body Mass (g)"] is not None]


def story_penguin_mass():
    return (
        chart(WEIGHED, axes=True)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(x="Body Mass (g)", alignment="middle", overlap=Overlap.noise()),
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 320},
    )


def story_penguin_mass_sina():
    return (
        chart(WEIGHED, axes=True)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(x="Body Mass (g)", alignment="middle", overlap=Overlap.sina()),
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 320},
    )


def story_penguin_mass_jitter():
    return (
        chart(WEIGHED, axes=True)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(x="Body Mass (g)", alignment="middle", overlap=Overlap.jitter()),
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
    return _dense(Overlap.noise(padding=0.5))


def story_dense_smoothing():
    return _dense(Overlap.noise(padding=0.5, smoothing=100))


def story_dense_quasi():
    return _dense(Overlap.noise(padding=0.5, randomness="quasi"))


def story_dense_sina():
    return _dense(Overlap.sina(padding=0.5))


def story_dense_jitter():
    return _dense(Overlap.jitter(padding=0.5))
