"""Equivalent of Partition.stories.tsx — Forward Syntax/Partition."""

from gofish import (
    Bin,
    Color,
    chart,
    circle,
    field,
    layer,
    partition,
    region,
    scatter,
    struct,
    text,
)
from python_stories.data import PENGUINS
from python_stories.vega_data_urls import read_csv, read_json

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


def _contiguous_airports():
    """The airports of the contiguous United States, from vega-datasets."""
    airports = read_csv("airports.csv")
    return airports[
        (airports["longitude"] > -130)
        & (airports["latitude"] > 24)
        & (airports["latitude"] < 50)
    ]


# Twenty large hub airports, picked from the same table by their codes.
HUBS = [
    "ATL", "BOS", "CLT", "DEN", "DFW", "DTW", "IAH", "JFK", "LAX", "MCI",
    "MIA", "MSP", "MSY", "ORD", "PDX", "PHX", "SEA", "SFO", "SLC", "STL",
]


def story_airport_hexbin():
    return (
        chart(_contiguous_airports(), color=Color.gradient("blues"), axes=True)
        .flow(
            partition(
                by=struct(x="longitude", y="latitude").bin(Bin.hex(radius=1))
            )
        )
        .mark(region(fill=field("longitude").count(), stroke="white")),
        {"w": 600, "h": 360},
    )


# Miles per gallon and weight have different units, so the hexagon's radius
# is given per axis: 1.5 mpg on x and 250 lbs on y.
def story_car_hexbin():
    cars = read_json("cars.json")
    cars = cars[cars["Miles_per_Gallon"].notna() & cars["Weight_in_lbs"].notna()]
    return (
        chart(cars, color=Color.gradient("viridis"), axes=True)
        .flow(
            partition(
                by=struct(x="Miles_per_Gallon", y="Weight_in_lbs").bin(
                    Bin.hex(radius={"x": 1.5, "y": 250})
                )
            )
        )
        .mark(region(fill=field("Miles_per_Gallon").count())),
        {"w": 480, "h": 360},
    )


# Each airport goes to the nearest of twenty hubs (the black dots), and each
# hub's cell is colored by how many airports are nearer to it than to any
# other hub.
def story_airports_by_nearest_hub():
    airports = _contiguous_airports()
    hubs = airports[airports["iata"].isin(HUBS)]
    return (
        layer(
            [
                chart(airports, color=Color.gradient("reds"))
                .flow(
                    partition(
                        by=struct(x="longitude", y="latitude").bin(
                            Bin.voronoi(seeds=hubs)
                        )
                    )
                )
                .mark(region(fill=field("iata").count(), stroke="white")),
                chart(hubs)
                .flow(scatter(x="longitude", y="latitude"))
                .mark(circle(r=3, fill="black")),
            ]
        ),
        {"w": 600, "h": 360, "axes": True},
    )


# The penguins with both beak measurements.
BEAKED = [
    d
    for d in PENGUINS
    if d["Beak Length (mm)"] is not None and d["Beak Depth (mm)"] is not None
]


# The Voronoi cells of the data itself (`seeds=data`): each penguin's cell is
# the part of the plot nearer to it than to any other penguin.
def story_penguin_beak_voronoi():
    key = struct(x="Beak Length (mm)", y="Beak Depth (mm)")
    return (
        layer(
            [
                chart(BEAKED)
                .flow(partition(by=key.bin(Bin.voronoi(seeds=BEAKED))))
                .mark(region(fill="#f4f1ea", stroke="#b9b2a3", stroke_width=0.5)),
                chart(BEAKED)
                .flow(scatter(x="Beak Length (mm)", y="Beak Depth (mm)"))
                .mark(circle(r=2.5, fill="Species")),
            ]
        ),
        {"w": 480, "h": 360, "axes": True},
    )


# A text mark has a size of its own, so it sits at the center of its
# hexagon's box, which is the hexagon's center.
def story_airport_hex_counts():
    airports = _contiguous_airports()
    return (
        chart(airports, color=Color.gradient("blues"))
        .flow(
            partition(
                by=struct(x="longitude", y="latitude").bin(Bin.hex(radius=3))
            )
        )
        .mark(
            layer(
                [
                    region(fill=field("iata").count(), stroke="white"),
                    text(text=field("iata").count(), font_size=10),
                ]
            )
        ),
        {"w": 600, "h": 360, "axes": True},
    )
