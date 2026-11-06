/**
 * The charts the landing page shows as pictures: the hero's cards (a collage
 * on phones and tablets, floating around the title on wide screens) and the
 * "simple when you want, complex when you need" row.
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
  /** Handwritten caption under the card. The floating hero cards hide it. */
  caption?: string;
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
}

/** A card of the hero: in the phone and tablet collage, and floating around the title on wide screens. */
export interface HeroCard extends LandingCard {
  /**
   * Where the card goes in the collage (1100px and below): the left or right
   * column (two independent stacks, so each column's card edges fall where
   * its own cards' heights put them), or full width under both columns.
   */
  column: "left" | "right" | "wide";
  /**
   * Where the card floats on wide screens (above 1100px): `y` pixels below
   * the hero's top, and `x` pixels in from its left or right edge, or centered
   * under the install command. The width, in pixels, shrinks with the hero
   * (landing.css).
   */
  float:
    | { side: "left" | "right"; x: number; y: number; width: number }
    | { side: "center"; y: number; width: number };
}

/**
 * The hero's cards. Phones and tablets show them as a collage under the
 * buttons; wide screens float the same cards around the title.
 *
 * The collage shows each column's cards in list order, then the full-width
 * cards. The order is picked so the two columns' card edges fall far apart:
 * the tall pulley diagram spans the place where a phone or tablet screen
 * ends, so the first screen always cuts through a card.
 */
export const HERO: HeroCard[] = [
  {
    id: "croissant",
    caption: "a croissant chart",
    alt: "Croissant chart: a normal curve cut into five equal-probability slices, each with a dot at its median",
    aspect: 2.28,
    tilt: -1.8,
    tape: 4,
    column: "left",
    float: { side: "left", x: 35, y: 55, width: 245 },
  },
  {
    id: "bubble-treemap",
    caption: "a bubble treemap",
    alt: "Bubble treemap: circles packed into nested blobs, one color per group",
    aspect: 1.18,
    tilt: -2.2,
    tape: 3,
    column: "left",
    float: { side: "left", x: 85, y: 215, width: 170 },
  },
  {
    id: "bottle-fill-chart",
    caption: "a bottle fill chart",
    alt: "Bottle fill chart: four wine bottles filled to 30, 60, 75 and 100 percent",
    aspect: 1.84,
    tilt: 1.4,
    tape: -2,
    column: "left",
    float: { side: "left", x: 35, y: 410, width: 230 },
  },
  {
    id: "flower-chart",
    caption: "a flower chart",
    alt: "Flower chart: flowers on stems of different heights, with petals sized by value",
    aspect: 1.14,
    tilt: 2,
    tape: -5,
    column: "right",
    float: { side: "right", x: 55, y: 55, width: 170 },
  },
  {
    id: "pulley-diagram",
    caption: "a pulley diagram",
    alt: "Pulley diagram: two weights hanging from a system of three pulleys",
    aspect: 0.78,
    tilt: 2.2,
    tape: -3,
    column: "right",
    float: { side: "right", x: 95, y: 245, width: 125 },
  },
  {
    id: "chartaccent-sub-saharan-africa",
    caption: "a region annotation",
    alt: "Scatterplot of countries with the Sub-Saharan Africa points enclosed in a labeled region",
    aspect: 1.9,
    tilt: 0.9,
    tape: 2,
    column: "wide",
    float: { side: "right", x: 35, y: 455, width: 220 },
  },
  {
    id: "python-tutor-memory-diagram",
    caption: "a Python Tutor memory diagram",
    alt: "Python Tutor memory diagram: a global frame with arrows into nested tuples on the heap",
    aspect: 4,
    tilt: -0.8,
    tape: 3,
    column: "wide",
    float: { side: "center", y: 445, width: 360 },
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
export const LANDING_CARDS: LandingCard[] = [...HERO, ...SPECTRUM];
