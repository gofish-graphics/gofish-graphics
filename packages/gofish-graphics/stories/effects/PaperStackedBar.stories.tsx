import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, type CatchData } from "../../src/data/catch";
import { chart, spread, rect, stack } from "../../src/lib";

/*
 * A stacked bar chart drawn as if each segment were a separate scrap of
 * crumpled paper.
 *
 * Mechanism: rect() takes a `filter` option that becomes the SVG `filter`
 * attribute, and `.render(..., { defs })` places Solid JSX elements inside
 * the chart's <defs>. The story defines one SVG filter per bar segment
 * ("paper-0", "paper-1", ...) and points each segment at its own filter.
 *
 * Why one filter per segment: filter noise is laid out in page coordinates,
 * so with a single shared filter the creases would run straight across
 * neighboring segments and the whole bar would look like one sheet. Giving
 * each segment its own noise seeds (and a slightly different light angle)
 * makes every segment its own piece of paper, with creases that stop at its
 * edge. `filter` is a per-datum channel, so an accessor picks each
 * segment's filter. (primitiveUnits="objectBoundingBox" looks like the
 * obvious alternative, but Chrome keeps feTurbulence frequencies in pixels
 * under it, so the texture breaks up into a fine grid.)
 *
 * Each filter does four things:
 *   1. crumple: a height map lit by a distant light. Crumpled paper has long,
 *      fairly straight creases, so the height map is "turbulence" noise
 *      (which has sharp V-shaped valleys) stretched along x in one layer and
 *      along y in another, plus broad smooth dents. The lit result multiplies
 *      the fill, so the segment keeps its color on average; creases mostly
 *      add shade, with only mild highlights and a faint sheen on the ridges.
 *   2. paper grain: fine noise lightly lifts and darkens the fill,
 *   3. ragged edges: a small displacement map wobbles the outline,
 *   4. a soft, light drop shadow under each piece.
 *
 * Animation (SMIL): a two-frame "line boil", like stop-motion or hand-drawn
 * animation. Once a second every sheet snaps to its other drawing: the noise
 * seeds behind the ragged outline and the creases switch, and the shadow
 * jumps a fraction of a pixel. Every flip uses calcMode="discrete" with two
 * values over 2s, so nothing ever interpolates, and all flips share one
 * clock, so the whole chart changes frame at once.
 *
 * The defs are built fresh inside render(), because a JSX element is a single
 * DOM node and would be moved, not copied, if two charts shared it.
 */

// One stop-motion frame change per second: two values over two seconds,
// held (not interpolated), all on the same clock.
const flip = (attributeName: string, a: string | number, b: string | number) => (
  <animate
    attributeName={attributeName}
    values={`${a};${b}`}
    calcMode="discrete"
    dur="2s"
    repeatCount="indefinite"
  />
);

// Two seeds per noise layer, one for each frame.
const seeds = (seed: number) => [seed, seed + 50] as const;

const paperFilter = (piece: number) => {
  // Spread the light angle a little from piece to piece, so neighboring
  // sheets catch the light differently.
  const azimuth = 50 + ((piece * 37) % 21) - 10;
  const [hA, hB] = seeds(3 * piece + 1);
  const [vA, vB] = seeds(3 * piece + 2);
  const [dA, dB] = seeds(3 * piece + 3);
  return (
    <filter
      id={`paper-${piece}`}
      x="-15%"
      y="-15%"
      width="140%"
      height="140%"
      color-interpolation-filters="sRGB"
    >
      {/* 1. Crumple height map: long creases in two directions plus dents.
          Each layer flips between two seeds, so the crumple is redrawn on
          every frame. */}
      <feTurbulence
        type="turbulence"
        baseFrequency="0.01 0.03"
        numOctaves="3"
        seed={hA}
        result="creasesH"
      >
        {flip("seed", hA, hB)}
      </feTurbulence>
      <feTurbulence
        type="turbulence"
        baseFrequency="0.03 0.01"
        numOctaves="3"
        seed={vA}
        result="creasesV"
      >
        {flip("seed", vA, vB)}
      </feTurbulence>
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.015"
        numOctaves="2"
        seed={dA}
        result="dents"
      >
        {flip("seed", dA, dB)}
      </feTurbulence>
      <feComposite
        in="creasesH"
        in2="creasesV"
        operator="arithmetic"
        k2="0.5"
        k3="0.5"
        result="creases"
      />
      <feComposite
        in="creases"
        in2="dents"
        operator="arithmetic"
        k2="0.65"
        k3="0.35"
        result="crumpleHeight"
      />

      {/* Light the height map with a fixed distant light. */}
      <feDiffuseLighting
        in="crumpleHeight"
        surfaceScale="8"
        diffuseConstant="1.1"
        lighting-color="#f2eee6"
        result="crumpleLight"
      >
        <feDistantLight azimuth={azimuth} elevation="50" />
      </feDiffuseLighting>
      <feSpecularLighting
        in="crumpleHeight"
        surfaceScale="8"
        specularConstant="0.6"
        specularExponent="18"
        lighting-color="#ffffff"
        result="crumpleSheen"
      >
        <feDistantLight azimuth={azimuth} elevation="50" />
      </feSpecularLighting>

      {/* Shade the fill, fill * (0.9 * light + 0.29). A flat patch comes out
          near the plain fill, and since the light term is at most about 1,
          a crease can brighten the fill only slightly but darken it a lot.
          Then add a very faint sheen on the crease ridges. */}
      <feComposite
        in="SourceGraphic"
        in2="crumpleLight"
        operator="arithmetic"
        k1="0.9"
        k2="0.29"
        result="shaded"
      />
      <feComposite
        in="shaded"
        in2="crumpleSheen"
        operator="arithmetic"
        k2="1"
        k3="0.05"
        result="sheened"
      />

      {/* 2. Fine paper grain: a small +/- lift, then clip to the piece. */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.9"
        numOctaves="2"
        seed="7"
        result="grainNoise"
      />
      <feColorMatrix
        in="grainNoise"
        type="matrix"
        values="0.33 0.33 0.33 0 0
                0.33 0.33 0.33 0 0
                0.33 0.33 0.33 0 0
                0    0    0    0 1"
        result="grainGray"
      />
      <feComposite
        in="sheened"
        in2="grainGray"
        operator="arithmetic"
        k2="1"
        k3="0.1"
        k4="-0.06"
        result="grained"
      />
      <feComposite
        in="grained"
        in2="SourceGraphic"
        operator="in"
        result="crumpled"
      />

      {/* 3. Ragged edges: single-octave low-frequency noise nudges the
          outline. Multi-octave noise at a large scale cuts blocky notches.
          This seed flip is the heart of the boil: the outline jumps between
          two hand-drawn versions of itself. */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.07"
        numOctaves="1"
        seed={piece + 100}
        result="edgeNoise"
      >
        {flip("seed", piece + 100, piece + 200)}
      </feTurbulence>
      <feDisplacementMap
        in="crumpled"
        in2="edgeNoise"
        scale="3.5"
        xChannelSelector="R"
        yChannelSelector="G"
        result="paper"
      />

      {/* 4. Soft shadow: blur the paper's alpha, offset it, tint it warm.
          The offset jitters between two nearby positions with each frame. */}
      <feGaussianBlur in="paper" stdDeviation="2" result="shadowBlur" />
      <feOffset in="shadowBlur" dx="2" dy="2.5" result="shadowOffset">
        {flip("dx", 2, 2.5)}
        {flip("dy", 2.5, 3)}
      </feOffset>
      <feFlood flood-color="#3b2f1e" flood-opacity="0.3" result="shadowColor" />
      <feComposite
        in="shadowColor"
        in2="shadowOffset"
        operator="in"
        result="shadow"
      />

      <feMerge>
        <feMergeNode in="shadow" />
        <feMergeNode in="paper" />
      </feMerge>
    </filter>
  );
};

const meta: Meta = {
  title: "Effects/Paper Stacked Bar",
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

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { axes: true })
      .flow(
        spread({ by: "lake", dir: "x" }), //
        stack({ by: "species", dir: "y" })
      )
      .mark(
        rect({
          h: "count",
          fill: "species",
          // Each datum is one bar segment, so its row index names its sheet.
          filter: (d: CatchData) => `url(#paper-${seafood.indexOf(d)})`,
        })
      )
      .render(container, {
        w: args.w,
        h: args.h,
        defs: seafood.map((_, piece) => paperFilter(piece)),
      });

    return container;
  },
};
