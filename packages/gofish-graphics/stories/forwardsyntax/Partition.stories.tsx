import type { Meta, StoryObj } from "@storybook/html";
import data from "vega-datasets";
import { initializeContainer } from "../helper";
import {
  Bin,
  chart,
  circle,
  Color,
  field,
  layer,
  partition,
  region,
  scatter,
  struct,
  text,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";

const meta: Meta = {
  title: "Forward Syntax/Partition",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

// The penguins with both a flipper length and a body mass.
const measured = penguins.filter(
  (d) => d["Flipper Length (mm)"] !== null && d["Body Mass (g)"] !== null
);

// Mirrors https://vega.github.io/vega-lite/examples/heatmap_histogram.html
export const MovieRatingsHeatmap: StoryObj<Args> = {
  args: { w: 480, h: 320 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "2D Histogram of Movie Ratings",
      description:
        "Movies binned by their IMDB rating and their Rotten Tomatoes rating, with each cell colored by how many movies fall in it.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const movies = (context.loaded.movies as any[]).filter(
      (d) => d["IMDB Rating"] != null && d["Rotten Tomatoes Rating"] != null
    );
    chart(movies, { color: Color.gradient("blues"), axes: true })
      .flow(
        partition({
          by: {
            x: field("IMDB Rating").bin({ step: 0.5 }),
            y: field("Rotten Tomatoes Rating").bin({ step: 5 }),
          },
        })
      )
      .mark(region({ fill: field("IMDB Rating").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// The product form and the nested form below draw the same cells: the
// product form is defined as the nested one.
export const ProductForm: StoryObj<Args> = {
  args: { w: 320, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { color: Color.gradient("blues"), axes: true })
      .flow(
        partition({
          by: {
            x: field("Flipper Length (mm)").bin({ step: 10 }),
            y: field("Body Mass (g)").bin({ step: 500 }),
          },
        })
      )
      .mark(region({ fill: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const NestedForm: StoryObj<Args> = {
  args: { w: 320, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { color: Color.gradient("blues"), axes: true })
      .flow(
        partition({
          by: field("Flipper Length (mm)").bin({ step: 10 }),
          dir: "x",
        }),
        partition({
          by: field("Body Mass (g)").bin({ step: 500 }),
          dir: "y",
        })
      )
      .mark(region({ fill: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const PenguinCellCounts: StoryObj<Args> = {
  args: { w: 420, h: 320 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguin Counts by Flipper Length and Body Mass",
      description:
        "Penguins binned by flipper length and body mass, with the number of penguins in each cell written at the cell's center.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { axes: true })
      .flow(
        partition({
          by: {
            x: field("Flipper Length (mm)").bin({ step: 10 }),
            y: field("Body Mass (g)").bin({ step: 500 }),
          },
        })
      )
      .mark(text({ text: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Hand-nested partitions place their children the same way in either order:
// each child is handed its x cell and its y cell, so a count of any width
// sits at the center of its rectangle. These two draw the same chart.
export const NestedFlipperThenMass: StoryObj<Args> = {
  args: { w: 420, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { axes: true })
      .flow(
        partition({
          by: field("Flipper Length (mm)").bin({ step: 10 }),
          dir: "x",
        }),
        partition({ by: field("Body Mass (g)").bin({ step: 500 }), dir: "y" })
      )
      .mark(text({ text: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const NestedMassThenFlipper: StoryObj<Args> = {
  args: { w: 420, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { axes: true })
      .flow(
        partition({ by: field("Body Mass (g)").bin({ step: 500 }), dir: "y" }),
        partition({
          by: field("Flipper Length (mm)").bin({ step: 10 }),
          dir: "x",
        })
      )
      .mark(text({ text: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// The airports of the contiguous United States, from vega-datasets.
const contiguous = (airports: any[]) =>
  airports.filter(
    (d) => d.longitude > -130 && d.latitude > 24 && d.latitude < 50
  );

// Twenty large hub airports, picked from the same table by their codes.
const HUBS = [
  "ATL", "BOS", "CLT", "DEN", "DFW", "DTW", "IAH", "JFK", "LAX", "MCI",
  "MIA", "MSP", "MSY", "ORD", "PDX", "PHX", "SEA", "SFO", "SLC", "STL",
];

export const AirportHexbin: StoryObj<Args> = {
  args: { w: 600, h: 360 },
  loaders: [async () => ({ airports: await data["airports.csv"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Hexbin of US Airports",
      description:
        "The airports of the contiguous United States binned into hexagons one degree of longitude and latitude in radius, each hexagon colored by how many airports fall in it.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    chart(contiguous(context.loaded.airports), {
      color: Color.gradient("blues"),
      axes: true,
    })
      .flow(
        partition({
          by: struct({ x: "longitude", y: "latitude" }).bin(
            Bin.hex({ radius: 1 })
          ),
        })
      )
      .mark(region({ fill: field("longitude").count(), stroke: "white" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Miles per gallon and weight have different units, so the hexagon's radius
// is given per axis: 1.5 mpg on x and 250 lbs on y.
export const CarHexbin: StoryObj<Args> = {
  args: { w: 480, h: 360 },
  loaders: [async () => ({ cars: await data["cars.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Hexbin of Car Mileage and Weight",
      description:
        "Cars binned by fuel economy and weight into hexagons with a radius per axis, since the two fields have different units, each hexagon colored by how many cars fall in it.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const cars = (context.loaded.cars as any[]).filter(
      (d) => d.Miles_per_Gallon != null && d.Weight_in_lbs != null
    );
    chart(cars, { color: Color.gradient("viridis"), axes: true })
      .flow(
        partition({
          by: struct({ x: "Miles_per_Gallon", y: "Weight_in_lbs" }).bin(
            Bin.hex({ radius: { x: 1.5, y: 250 } })
          ),
        })
      )
      .mark(region({ fill: field("Miles_per_Gallon").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Each airport goes to the nearest of twenty hubs (the black dots), and each
// hub's cell is colored by how many airports are nearer to it than to any
// other hub. Longitude and latitude are compared as plain numbers, so a
// degree of longitude counts as much as a degree of latitude.
export const AirportsByNearestHub: StoryObj<Args> = {
  args: { w: 600, h: 360 },
  loaders: [async () => ({ airports: await data["airports.csv"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "US Airports by Nearest Hub",
      description:
        "The Voronoi cells of twenty hub airports, each cell colored by how many of the contiguous United States' airports are nearer to its hub than to any other.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const airports = contiguous(context.loaded.airports);
    const hubs = airports.filter((d) => HUBS.includes(d.iata));
    layer([
      chart(airports, { color: Color.gradient("reds") })
        .flow(
          partition({
            by: struct({ x: "longitude", y: "latitude" }).bin(
              Bin.voronoi({ seeds: hubs })
            ),
          })
        )
        .mark(region({ fill: field("iata").count(), stroke: "white" })),
      chart(hubs)
        .flow(scatter({ x: "longitude", y: "latitude" }))
        .mark(circle({ r: 3, fill: "black" })),
    ]).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// The penguins with both beak measurements.
const beaked = penguins.filter(
  (d) => d["Beak Length (mm)"] !== null && d["Beak Depth (mm)"] !== null
);

// The Voronoi cells of the data itself (`seeds: data`): each penguin's cell
// is the part of the plot nearer to it than to any other penguin, the hover
// region of an interactive scatterplot. Both fields are in millimeters, so a
// distance in data is a distance in millimeters.
export const PenguinBeakVoronoi: StoryObj<Args> = {
  args: { w: 480, h: 360 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Voronoi Cells of a Scatterplot",
      description:
        "Penguins by beak length and beak depth, with the Voronoi cell of each penguin outlined behind its dot: the region nearer to it than to any other penguin.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const key = struct({ x: "Beak Length (mm)", y: "Beak Depth (mm)" });
    layer([
      chart(beaked)
        .flow(partition({ by: key.bin(Bin.voronoi({ seeds: beaked })) }))
        .mark(region({ fill: "#f4f1ea", stroke: "#b9b2a3", strokeWidth: 0.5 })),
      chart(beaked)
        .flow(scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
        .mark(circle({ r: 2.5, fill: "Species" })),
    ]).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// Each hexagon is a layer of its region and its count. The layer hands the
// hexagon it is given to both: the region draws it, and the text, which has a
// size of its own, sits at the center of its box, the hexagon's center.
export const AirportHexCounts: StoryObj<Args> = {
  args: { w: 600, h: 360 },
  loaders: [async () => ({ airports: await data["airports.csv"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Airport Counts in Hexagons",
      description:
        "The airports of the contiguous United States binned into hexagons three degrees in radius, with the number of airports in each hexagon written at its center.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const airports = contiguous(context.loaded.airports);
    chart(airports, { color: Color.gradient("blues") })
      .flow(
        partition({
          by: struct({ x: "longitude", y: "latitude" }).bin(
            Bin.hex({ radius: 3 })
          ),
        })
      )
      .mark(
        layer([
          region({ fill: field("iata").count(), stroke: "white" }),
          text({ text: field("iata").count(), fontSize: 10 }),
        ])
      )
      .render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};
