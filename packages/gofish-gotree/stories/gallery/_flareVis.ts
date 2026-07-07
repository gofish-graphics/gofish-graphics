// flare-vis hierarchy — the classic Flare "vis" package tree (util subtree),
// vendored from BIT-VIS/gotree (app/hierarchicalData/flare-vis.json, MIT).
// 47 nodes: 1 root → 19 children → 27 grandchildren, in uneven fans. Used by
// the radial-deep gallery story as the data-position layout's input.

export type FlareNode = {
  name: string;
  class?: string;
  value?: number;
  children?: FlareNode[];
};

export const flareVis: FlareNode = {
  name: "util",
  class: "O",
  children: [
    { name: "Arrays", class: "O", value: 8258 },
    {
      name: "Colors",
      class: "B",
      children: [
        { name: "red", class: "B", value: 6001 },
        { name: "green", class: "B", value: 4000 },
      ],
    },
    {
      name: "Dates",
      class: "C",
      children: [
        { name: "Spring", class: "C", value: 4000 },
        { name: "autumn", class: "C", value: 4217 },
      ],
    },
    { name: "Displays", class: "O", value: 12555 },
    { name: "Filter", class: "O", value: 2324 },
    {
      name: "Geometry",
      class: "D",
      children: [
        { name: "rect", class: "D", value: 4000 },
        { name: "rect", class: "D", value: 6993 },
      ],
    },
    {
      name: "heap",
      class: "E",
      children: [
        { name: "FibonacciHeap", class: "E", value: 9354 },
        { name: "HeapNode", class: "E", value: 1233 },
      ],
    },
    { name: "IEvaluable", class: "O", value: 3335 },
    { name: "IPredicate", class: "O", value: 5383 },
    { name: "IValueProxy", class: "O", value: 2874 },
    {
      name: "math",
      class: "F",
      children: [
        { name: "DenseMatrix", class: "F", value: 3165 },
        { name: "IMatrix", class: "F", value: 2815 },
        { name: "SparseMatrix", class: "F", value: 3366 },
      ],
    },
    {
      name: "Maths",
      class: "G",
      children: [
        { name: "Algebra", class: "G", value: 4000 },
        { name: "Numerical", class: "G", value: 10000 },
        { name: "Fundamental", class: "G", value: 2000 },
        { name: "Quantification", class: "G", value: 1705 },
      ],
    },
    { name: "Orientation", class: "O", value: 3486 },
    {
      name: "palette",
      class: "H",
      children: [
        { name: "ColorPalette", class: "H", value: 6367 },
        { name: "Palette", class: "H", value: 1229 },
        { name: "ShapePalette", class: "H", value: 2059 },
        { name: "SizePalette", class: "H", value: 2291 },
      ],
    },
    { name: "Property", class: "O", value: 5559 },
    {
      name: "Shapes",
      class: "I",
      children: [
        { name: "Triangle", class: "I", value: 4000 },
        { name: "Rectangle", class: "I", value: 3000 },
        { name: "Circle", class: "I", value: 5000 },
        { name: "Ellipse", class: "I", value: 7000 },
      ],
    },
    { name: "Sort", class: "O", value: 6887 },
    { name: "Stats", class: "O", value: 6557 },
    {
      name: "Strings",
      class: "J",
      children: [
        { name: "SingleChar", class: "J", value: 2026 },
        { name: "Length20", class: "J", value: 6000 },
        { name: "Length50", class: "J", value: 5000 },
        { name: "Length100", class: "J", value: 8000 },
      ],
    },
  ],
};
