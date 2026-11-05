/**
 * The charts the landing page shows as pictures: the phone and tablet hero
 * collage, and the "simple when you want, complex when you need" row.
 *
 * This list is the one source of truth for them. LandingPage.vue renders it,
 * and the docs build's capture script (tests/scripts/capture-docs-images.ts)
 * imports it to know which gallery examples to picture, so a card and its PNG
 * cannot drift apart. Each card names only its gallery example: the card links
 * to that example's page and shows its picture (`exampleImagePath(id)`).
 *
 * Keep this module free of Node and Vue imports: both the browser and the
 * capture script load it.
 */

export interface LandingCard {
  /** Gallery example id: the card links to `/<lang>/examples/<id>` and shows its picture. */
  id: string;
  /** Handwritten caption under the card. */
  caption: string;
  /** Alt text for the picture. */
  alt: string;
  /**
   * Width / height of the card's picture box, so the page does not jump while
   * the picture loads. Close to the captured PNG's own shape; the picture is
   * fit inside it.
   */
  aspect: number;
  /** Card tilt and tape tilt, in degrees. */
  tilt: number;
  tape: number;
  /** Collage: spans both columns. */
  wide?: boolean;
  /** Collage: spans two rows (centered against the cards beside it). */
  tall?: boolean;
  /** Collage: pixels to drop the card below its row's top, for a loose pile. */
  drop?: number;
}

/**
 * The hero collage, in grid order (two columns, filled row by row): the
 * croissant chart, then the pulley diagram spanning two rows beside it and the
 * bottle fill chart; then the bubble treemap and flower chart; then two
 * full-width cards.
 */
export const COLLAGE: LandingCard[] = [
  {
    id: "croissant",
    caption: "a croissant chart",
    alt: "Croissant chart: a normal curve cut into five equal-probability slices, each with a dot at its median",
    aspect: 2.28,
    tilt: -1.8,
    tape: 4,
  },
  {
    id: "pulley-diagram",
    caption: "a pulley diagram",
    alt: "Pulley diagram: two weights hanging from a system of three pulleys",
    aspect: 0.78,
    tilt: 2.2,
    tape: -3,
    tall: true,
  },
  {
    id: "bottle-fill-chart",
    caption: "a bottle fill chart",
    alt: "Bottle fill chart: four wine bottles filled to 30, 60, 75 and 100 percent",
    aspect: 1.84,
    tilt: 1.4,
    tape: -2,
  },
  {
    id: "bubble-treemap",
    caption: "a bubble treemap",
    alt: "Bubble treemap: circles packed into nested blobs, one color per group",
    aspect: 1.18,
    tilt: -2.2,
    tape: 3,
  },
  {
    id: "flower-chart",
    caption: "a flower chart",
    alt: "Flower chart: flowers on stems of different heights, with petals sized by value",
    aspect: 1.14,
    tilt: 2,
    tape: -5,
    drop: 18,
  },
  {
    id: "chartaccent-sub-saharan-africa",
    caption: "a region annotation",
    alt: "Scatterplot of countries with the Sub-Saharan Africa points enclosed in a labeled region",
    aspect: 1.9,
    tilt: 0.9,
    tape: 2,
    wide: true,
  },
  {
    id: "python-tutor-memory-diagram",
    caption: "a Python Tutor memory diagram",
    alt: "Python Tutor memory diagram: a global frame with arrows into nested tuples on the heap",
    aspect: 4,
    tilt: -0.8,
    tape: 3,
    wide: true,
  },
];

/** The spectrum row, simple to complex, all on the same seafood data. */
export const SPECTRUM: LandingCard[] = [
  {
    id: "bar-chart",
    caption: "a bar chart",
    alt: "Bar chart of fish catch by lake",
    aspect: 1,
    tilt: -2,
    tape: -6,
  },
  {
    id: "stacked-bar-chart",
    caption: "a stacked bar chart",
    alt: "Stacked bar chart of fish catch by lake and species",
    aspect: 1,
    tilt: 1.5,
    tape: 6,
  },
  {
    id: "ribbon-chart",
    caption: "a ribbon chart",
    alt: "Ribbon chart of fish catch by lake, with species reordered at each lake",
    aspect: 1,
    tilt: -1,
    tape: 5,
  },
  {
    id: "polar-ribbon-chart",
    caption: "a polar ribbon chart",
    alt: "Polar ribbon chart of the same fish catch, bent around a circle",
    aspect: 1,
    tilt: 2,
    tape: -7,
  },
];

/** Every landing card, for the capture script. */
export const LANDING_CARDS: LandingCard[] = [...COLLAGE, ...SPECTRUM];
