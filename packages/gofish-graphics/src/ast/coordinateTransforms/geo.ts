import { CoordinateTransform } from "./coord";
import { interval, type Interval } from "../../util/interval";
import { computeTransformedBoundingBox } from "./coordUtils";

/** What `fit` returns — the budget plus the budget-to-pixels map. */
type Fitted = ReturnType<NonNullable<CoordinateTransform["fit"]>>;

/** Lattice resolution for measuring a window's projected extent. */
const FIT_SAMPLES = 24;

/**
 * A map projection: longitude/latitude in degrees to a point on the plane. Two
 * are built in by name; anything else is supplied as a function, which is also
 * how a d3-geo projection is passed (they are callable with `[lon, lat]`).
 */
export type Projection =
  | "equalEarth"
  | "mercator"
  | ((lonLat: [number, number]) => [number, number]);

const RADIANS = Math.PI / 180;

// Equal Earth (Šavrič, Patterson & Jenny 2018), the closed-form polynomial
// d3-geo's `equalEarth.js` uses. Input radians, output plane units.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

const equalEarthRaw = ([lon, lat]: [number, number]): [number, number] => {
  const lambda = lon * RADIANS;
  const phi = lat * RADIANS;
  const l = Math.asin(M * Math.sin(phi));
  const l2 = l * l;
  const l6 = l2 * l2 * l2;
  return [
    (lambda * Math.cos(l)) /
      (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2))),
    l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2)),
  ];
};

// Web Mercator, with latitude clamped to the conventional ±85° so the poles
// (which the projection sends to infinity) stay finite.
const MERCATOR_MAX_LAT = 85;

const mercatorRaw = ([lon, lat]: [number, number]): [number, number] => {
  const clamped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  return [
    lon * RADIANS,
    Math.log(Math.tan(Math.PI / 4 + (clamped * RADIANS) / 2)),
  ];
};

const projectionOf = (
  projection: Projection
): ((lonLat: [number, number]) => [number, number]) => {
  if (projection === "equalEarth") return equalEarthRaw;
  if (projection === "mercator") return mercatorRaw;
  if (typeof projection === "function") return projection;
  throw new Error(
    `geo(...): unknown projection "${projection}" — use "equalEarth", ` +
      `"mercator", or a function [lon, lat] => [x, y].`
  );
};

export type GeoOptions = {
  /** Longitude window in degrees. Defaults to the data's own extent. */
  lon?: [number, number];
  /** Latitude window in degrees. Defaults to the data's own extent. */
  lat?: [number, number];
};

/**
 * Geographic coordinate transform: children lay out in DEGREES (alias `lon` on
 * x, `lat` on y) and the projection maps that window onto the chart box.
 *
 * Unlike the polar family, whose children lay out in a synthetic coordinate
 * budget (radians x pixels of radius), a geo space's coordinate units ARE its
 * data units. That is what `fit` says: the content budget is the window's span
 * in degrees, so the position scale a child sees is the identity in degrees —
 * no nicing, no zero inclusion, no padding, because the domain is the declared
 * window and the map takes it to a range of the same width. The projection then
 * fits the window's projected extent into the pixel box with ONE scale factor,
 * so the map keeps its aspect ratio.
 *
 * `lon`/`lat` fix the window; omitted, it is the union of the data extents in
 * scope (`dataWindow` leaves that axis to the children, as `coord` computes it).
 */
export const geo = (
  projection: Projection,
  opts: GeoOptions = {}
): CoordinateTransform => {
  const project = projectionOf(projection);
  const lonWindow: Interval | null = opts.lon
    ? interval(opts.lon[0], opts.lon[1])
    : null;
  const latWindow: Interval | null = opts.lat
    ? interval(opts.lat[0], opts.lat[1])
    : null;

  // `fit` is called on every layout pass, and both its results — the projected
  // extent and the budget-to-pixels closure — depend only on the pixel box, the
  // padding and the resolved window. Memoize on exactly those so a re-render at
  // the same size hands back the SAME closure (a new one per frame would make
  // `transformRef` in coord.tsx churn) and re-projects nothing.
  let memo: { key: string; value: Fitted } | undefined;

  const space: CoordinateTransform = {
    type: "geo",
    aliases: { x: "lon", y: "lat" },
    dataWindow: [lonWindow, latWindow],
    // Used only before `fit` has run (e.g. a bare `transform` call in a test):
    // the unfitted projection of absolute degrees.
    transform: project,
    domain: [
      lonWindow ?? { min: -180, max: 180, size: 360 },
      latWindow ?? { min: -90, max: 90, size: 180 },
    ],
    fit: ({ size, padding, window }) => {
      const [lon, lat] = window;
      const key = `${size[0]},${size[1]},${padding},${lon.min},${lon.max},${lat.min},${lat.max}`;
      if (memo?.key === key) return memo.value;

      const lonSpan = lon.max - lon.min;
      const latSpan = lat.max - lat.min;

      // The projected extent of the window. A projection curves in both axes,
      // so it takes a LATTICE over the window rather than its four corners or
      // its boundary — see `sampleBoundingBoxPoints`'s `gridSamples`. This is
      // the space's one measurement of its own window: it is handed back as
      // `extent` (scaled to pixels) so coord.tsx frames the space against the
      // same box the scale factor came from, instead of re-measuring it with
      // the boundary-only sampler and getting a smaller one.
      const {
        minX,
        minY,
        width: projW,
        height: projH,
      } = computeTransformedBoundingBox(
        lon.min,
        lon.max,
        lat.min,
        lat.max,
        space,
        FIT_SAMPLES
      );

      const boxW = Math.max(size[0] - 2 * padding, 1);
      const boxH = Math.max(size[1] - 2 * padding, 1);
      // ONE scale for both axes: a map is not stretched to fill its frame.
      const scale = Math.min(boxW / (projW || 1), boxH / (projH || 1));

      const value = {
        // Children lay out in degrees offset from the window's low corner, so
        // their position scale is the identity in degrees.
        budget: [lonSpan, latSpan] as [number, number],
        transform: ([u, v]: [number, number]): [number, number] => {
          const [px, py] = project([lon.min + u, lat.min + v]);
          return [(px - minX) * scale, (py - minY) * scale];
        },
        // `transform` puts the window's low corner at the origin, so its pixel
        // extent runs [0, projW*scale] x [0, projH*scale].
        extent: { width: projW * scale, height: projH * scale },
      };
      memo = { key, value };
      return value;
    },
  };
  return space;
};
