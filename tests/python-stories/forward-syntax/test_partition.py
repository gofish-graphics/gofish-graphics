"""Equivalent of Partition.stories.tsx — Forward Syntax/Partition."""

from gofish import Color, chart, field, partition, region, text
from python_stories.data import PENGUINS
from python_stories.vega_data_urls import read_json

# The penguins with both a flipper length and a body mass.
MEASURED = [
    d
    for d in PENGUINS
    if d["Flipper Length (mm)"] is not None and d["Body Mass (g)"] is not None
]


def story_movie_ratings_heatmap():
    # Mirrors https://vega.github.io/vega-lite/examples/heatmap_histogram.html
    movies = read_json("movies.json").astype({"Title": str})
    movies = movies[
        movies["IMDB Rating"].notna() & movies["Rotten Tomatoes Rating"].notna()
    ]
    return (
        chart(movies, color=Color.gradient("blues"), axes=True)
        .flow(
            partition(
                by={
                    "x": field("IMDB Rating").bin(step=0.5),
                    "y": field("Rotten Tomatoes Rating").bin(step=5),
                }
            )
        )
        .mark(region(fill=field("IMDB Rating").count())),
        {"w": 480, "h": 320},
    )


# The product form and the nested form below draw the same cells: the
# product form is defined as the nested one.
def story_product_form():
    return (
        chart(MEASURED, color=Color.gradient("blues"), axes=True)
        .flow(
            partition(
                by={
                    "x": field("Flipper Length (mm)").bin(step=10),
                    "y": field("Body Mass (g)").bin(step=500),
                }
            )
        )
        .mark(region(fill=field("Body Mass (g)").count())),
        {"w": 320, "h": 320},
    )


def story_nested_form():
    return (
        chart(MEASURED, color=Color.gradient("blues"), axes=True)
        .flow(
            partition(by=field("Flipper Length (mm)").bin(step=10), dir="x"),
            partition(by=field("Body Mass (g)").bin(step=500), dir="y"),
        )
        .mark(region(fill=field("Body Mass (g)").count())),
        {"w": 320, "h": 320},
    )


def story_penguin_cell_counts():
    return (
        chart(MEASURED, axes=True)
        .flow(
            partition(
                by={
                    "x": field("Flipper Length (mm)").bin(step=10),
                    "y": field("Body Mass (g)").bin(step=500),
                }
            )
        )
        .mark(text(text=field("Body Mass (g)").count())),
        {"w": 420, "h": 320},
    )


# Hand-nested partitions place their children the same way in either order:
# each child is handed its x cell and its y cell, so a count of any width
# sits at the center of its rectangle. These two draw the same chart.
def story_nested_flipper_then_mass():
    return (
        chart(MEASURED, axes=True)
        .flow(
            partition(by=field("Flipper Length (mm)").bin(step=10), dir="x"),
            partition(by=field("Body Mass (g)").bin(step=500), dir="y"),
        )
        .mark(text(text=field("Body Mass (g)").count())),
        {"w": 420, "h": 320},
    )


def story_nested_mass_then_flipper():
    return (
        chart(MEASURED, axes=True)
        .flow(
            partition(by=field("Body Mass (g)").bin(step=500), dir="y"),
            partition(by=field("Flipper Length (mm)").bin(step=10), dir="x"),
        )
        .mark(text(text=field("Body Mass (g)").count())),
        {"w": 420, "h": 320},
    )
