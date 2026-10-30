import { JSX } from "solid-js/jsx-runtime";

const dropShadowFilter = (
  <filter id="filter-drop-shadow">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
    <feOffset in="blur" dx="4" dy="4" result="offsetBlur" />
    <feMerge>
      <feMergeNode in="offsetBlur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

const mossFilter = (
  <filter id="filter-moss">
    <feTurbulence
      id="SvgjsFeTurbulence2264"
      baseFrequency=".02 .02"
      numOctaves="5"
      type="fractalNoise"
      result="3ZV0pG"
    ></feTurbulence>
    <feMorphology operator="dilate" radius="1" result="XA3zhS" />
    <feConvolveMatrix
      id="SvgjsFeConvolveMatrix2267"
      kernelMatrix="1 1 1 1 2 1 1 -9 1"
      preserveAlpha="true"
      result="H3faOM"
    />
    <feColorMatrix
      id="SvgjsFeColorMatrix2268"
      values=".4 .8 .6 0 0 1 1 1 0 0 .1 .2 .3 0 0 0 0 0 0 1"
      result="cOUnce"
    />
    <feComposite
      id="SvgjsFeComposite2269"
      in2="SourceGraphic"
      operator="in"
      result="prVofN"
    />
  </filter>
);

const watercolorFilter = (
  <filter id="filter-watercolor">
    {/* Generate mossy texture as alpha mask */}
    <feTurbulence
      baseFrequency=".02 .02"
      numOctaves="5"
      type="fractalNoise"
      result="mossNoise"
    />
    <feMorphology
      in="mossNoise"
      operator="dilate"
      radius="1"
      result="mossDilated"
    />
    <feConvolveMatrix
      in="mossDilated"
      kernelMatrix="1 1 1 1 2 1 1 -9 1"
      preserveAlpha="true"
      result="mossEdges"
    />
    {/* Convert moss texture to alpha only, so it acts as a mask */}
    <feColorMatrix
      in="mossEdges"
      type="matrix"
      values="
    0 0 0 0 0
    0 0 0 0 0
    0 0 0 0 0
    0 0 0 0.5 0
  "
      result="mossAlpha"
    />
    {/* Use the alpha mask to let the background show through, making the moss effect mostly transparent */}
    <feComposite
      in="SourceGraphic"
      in2="mossAlpha"
      operator="in"
      result="masked"
    />
    {/* Lower the overall opacity for extra subtlety */}
    {/* <feComponentTransfer in="masked" result="finalMoss">
  <feFuncA type="linear" slope="0.3" />
</feComponentTransfer> */}
  </filter>
);

const crumpledPaperFilter = (
  <filter id="filter-displacement">
    {/* Create subtle texture with turbulence (shape-preserving) */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.05"
      numOctaves="4"
      seed="3"
      result="noise"
    />

    {/* Significantly reduce displacement to preserve element shape */}
    <feDisplacementMap
      in="SourceGraphic"
      in2="noise"
      scale="4"
      xChannelSelector="R"
      yChannelSelector="G"
      result="displacedPaper"
    />

    {/* Add light effect with lighting */}
    {/* Instead of feDiffuseLighting (which creates grayscale shading), use feColorMatrix to subtly enhance contrast while preserving original color */}
    <feColorMatrix
      in="displacedPaper"
      type="matrix"
      values="
      1.1 0   0   0 0
      0   1.1 0   0 0
      0   0   1.1 0 0
      0   0   0   1 0
    "
      result="diffLight1"
    />

    {/* Adjust the contrast of the lighting */}
    <feComposite
      in="diffLight"
      in2="displacedPaper"
      operator="arithmetic"
      k1="0.3"
      k2="0"
      k3="0"
      k4="0"
      result="lightedPaper"
    />

    {/* Blend the lighting with the displaced image */}
    <feBlend
      in="displacedPaper"
      in2="lightedPaper"
      mode="multiply"
      result="crumpledPaper"
    />

    {/* Add subtle color variation to simulate paper fibers, and make the result slightly transparent */}
    <feColorMatrix
      in="crumpledPaper"
      type="matrix"
      values="
    0.9 0.1 0.1 0 0
    0.1 0.9 0.1 0 0
    0.1 0.1 0.9 0 0
    0   0   0   0.8 0"
      result="coloredPaper"
    />

    {/* Use SourceAlpha to create an outline, colorize it with the element's color, and blend it over the result */}
    {/* <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="outline" />
  <feComposite in="outline" in2="SourceAlpha" operator="out" result="outlineOnly" />
  <feFlood flood-color="inherit" flood-opacity="0.1" result="outlineColor" />
  <feComposite in="outlineColor" in2="outlineOnly" operator="in" result="coloredOutline" />
  <feMerge>
    <feMergeNode in="coloredPaper" />
    <feMergeNode in="coloredOutline" />
  </feMerge> */}
  </filter>
);

const weakBlurFilter = (
  <filter id="filter-weak-blur">
    <feGaussianBlur stdDeviation={2} />
  </filter>
);

const strongBlurFilter = (
  <filter id="filter-strong-blur">
    <feGaussianBlur stdDeviation={10} />
  </filter>
);

const invertFilter = (
  <filter id="filter-invert">
    <feComponentTransfer>
      <feFuncR type="table" tableValues="1 0" />
      <feFuncG type="table" tableValues="1 0" />
      <feFuncB type="table" tableValues="1 0" />
    </feComponentTransfer>
  </filter>
);

const softShadowFilter = (
  <filter id="filter-shadow-soft" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="softBlur" />
    <feOffset in="softBlur" dx="6" dy="6" result="softOffset" />
    <feColorMatrix
      in="softOffset"
      type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"
    />
    <feBlend in="SourceGraphic" in2="softOffset" mode="normal" />
  </filter>
);

const glassFilter = (
  <filter id="filter-glass" x="-25%" y="-25%" width="150%" height="150%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="gBlur" />
    <feColorMatrix
      in="gBlur"
      type="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0"
      result="gTint"
    />
    <feSpecularLighting
      in="SourceAlpha"
      surfaceScale="1"
      specularConstant="0.5"
      specularExponent="15"
      result="specular"
    >
      <fePointLight x="100" y="-50" z="150" />
    </feSpecularLighting>
    <feComposite
      in="specular"
      in2="SourceAlpha"
      operator="in"
      result="specMask"
    />
    <feBlend in="gTint" in2="SourceGraphic" mode="screen" />
  </filter>
);

const waterColorSplotchFilter = (
  <filter id="watercolor-splotch" color-interpolation-filters="sRGB">
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.02"
      numOctaves="4"
      result="noise"
    />
    <feColorMatrix
      in="noise"
      type="matrix"
      values="
      0 0 0 0 0
      0 0 0 0 0
      0 0 0 0 0
      0 0 0 -0.9 1.2"
      result="texture"
    />
    <feComposite
      in="SourceGraphic"
      in2="texture"
      operator="in"
      result="splotch"
    />
  </filter>
);

// A soft, fibrous felt-like texture that gently tints and displaces the source
// Works best applied to filled shapes; use with `filter="url(#filter-felt)"`
const feltFilter = (
  <filter
    id="filter-felt"
    x="-10%"
    y="-10%"
    width="120%"
    height="120%"
    color-interpolation-filters="sRGB"
  >
    {/* Base fiber noise */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.012 0.02"
      numOctaves="4"
      seed="11"
      result="fiberNoise"
    />

    {/* Slight directional blur to blend fibers */}
    <feGaussianBlur in="fiberNoise" stdDeviation="0.6" result="softNoise" />

    {/* Subtle colorization toward a warm felt tint (near-neutral) */}
    <feColorMatrix
      in="softNoise"
      type="matrix"
      values="
        0.92 0.02 0.02 0 0
        0.04 0.92 0.02 0 0
        0.03 0.02 0.92 0 0
        0     0    0    1 0"
      result="tintedNoise"
    />

    {/* Mask texture by the source alpha so texture only appears over the shape */}
    <feComposite
      in="tintedNoise"
      in2="SourceAlpha"
      operator="in"
      result="shapeTexture"
    />

    {/* Slight displacement to give a soft, felt surface relief without warping shape */}
    <feDisplacementMap
      in="SourceGraphic"
      in2="softNoise"
      scale="2"
      xChannelSelector="R"
      yChannelSelector="G"
      result="displaced"
    />

    {/* Blend texture into the displaced source using multiply for a natural fiber look */}
    <feBlend
      in="displaced"
      in2="shapeTexture"
      mode="multiply"
      result="felted"
    />

    {/* Gentle inner shadow for plush depth */}
    <feGaussianBlur in="SourceAlpha" stdDeviation="0.7" result="shadowBlur" />
    <feOffset in="shadowBlur" dx="0" dy="0.5" result="shadowOffset" />
    <feComposite
      in="shadowOffset"
      in2="SourceAlpha"
      operator="out"
      result="innerShadow"
    />
    <feColorMatrix
      in="innerShadow"
      type="matrix"
      values="
        0 0 0 0 0
        0 0 0 0 0
        0 0 0 0 0
        0 0 0 0.25 0"
      result="softInnerShadow"
    />

    {/* Final merge: felt texture + inner softness */}
    <feMerge>
      <feMergeNode in="felted" />
      <feMergeNode in="softInnerShadow" />
    </feMerge>
  </filter>
);

const leatherFilter = (
  <filter
    id="watercolor"
    x="-20%"
    y="-20%"
    width="140%"
    height="140%"
    color-interpolation-filters="sRGB"
  >
    {/* 1) Paper grain (fractal noise) */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.9"
      numOctaves={4}
      seed={11}
      result="paperNoise"
    />
    {/* Map grain to subtle light/dark */}
    <feColorMatrix
      in="paperNoise"
      type="matrix"
      values={`
        0 0 0 0  0
        0 0 0 0  0
        0 0 0 0  0
        0 0 0 0.8 0
      `}
      result="paperAlpha"
    />
    {/* use luminance of grain as alpha mask */}
    <feComponentTransfer in="paperAlpha" result="paperMask">
      <feFuncA type="gamma" amplitude={1} exponent={1.5} offset={0} />
    </feComponentTransfer>

    {/* 2) Slight desaturation + light wash */}
    <feColorMatrix
      in="SourceGraphic"
      type="saturate"
      values={`1`}
      result="washed"
    />
    <feComponentTransfer in="washed" result="washed">
      <feFuncR type="linear" slope={1.06} />
      <feFuncG type="linear" slope={1.06} />
      <feFuncB type="linear" slope={1.06} />
      <feFuncA type="linear" slope={0.7} />
    </feComponentTransfer>

    {/* 3) Pigment bleed: grow + blur outward */}
    <feGaussianBlur in="washed" stdDeviation={3.0} result="bleedBlur" />
    <feMorphology in="washed" operator="dilate" radius={1.2} result="dilate" />
    <feMerge result="bleedLayer">
      <feMergeNode in="bleedBlur" />
      <feMergeNode in="dilate" />
      <feMergeNode in="washed" />
    </feMerge>

    {/* 4) Edge wobble (paper buckling) */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.012"
      numOctaves={1}
      seed={7}
      result="displNoise"
    />
    <feDisplacementMap
      in="bleedLayer"
      in2="displNoise"
      xChannelSelector="R"
      yChannelSelector="G"
      scale={5.0}
      result="wobbled"
    />

    {/* 5) Pooling at edges (darken where alpha is high) */}
    {/* Extract alpha edges */}
    <feGaussianBlur in="washed" stdDeviation={1.2} result="edgeBlur" />
    <feComposite
      in="edgeBlur"
      in2="washed"
      operator="arithmetic"
      k2={1}
      k3={-1}
      result="edgeOnly"
    />
    <feColorMatrix
      in="edgeOnly"
      type="matrix"
      values={`
        0.85 0 0 0 0
        0 0.85 0 0 0
        0 0 0.85 0 0
        0 0 0 0.7 0
      `}
      result="poolShade"
    />

    {/* 6) Multiply pigment with paper grain */}
    <feBlend
      in="wobbled"
      in2="paperMask"
      mode="multiply"
      result="pigmentOnPaper"
    />

    {/* 7) Final composite: pigment + edge pooling, clipped to original alpha */}
    <feComposite
      in="pigmentOnPaper"
      in2="poolShade"
      operator="arithmetic"
      k1={0}
      k2={1}
      k3={1}
      k4={0}
      result="withPooling"
    />
    <feComposite
      in="withPooling"
      in2="SourceAlpha"
      operator="in"
      result="finalPaint"
    />

    <feComponentTransfer in="finalPaint" result="final">
      <feFuncA type="linear" slope={0.7} />
    </feComponentTransfer>
  </filter>
);

const testFilter = (
  <filter
    id="paperPatch"
    x="-15%"
    y="-15%"
    width="130%"
    height="130%"
    color-interpolation-filters="sRGB"
  >
    {/* Crumple heightmap */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.012 0.028"
      numOctaves="3"
      seed="2"
      result="noiseCoarse"
    />
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.08"
      numOctaves="2"
      seed="9"
      result="noiseFine"
    />
    <feBlend
      in="noiseCoarse"
      in2="noiseFine"
      mode="multiply"
      result="heightmap"
    />

    {/* Displace only the source graphic, not a background */}
    <feDisplacementMap
      in="SourceGraphic"
      in2="heightmap"
      scale="12"
      xChannelSelector="R"
      yChannelSelector="G"
      result="displaced"
    />

    {/* Lighting for crumple effect */}
    <feDiffuseLighting
      in="heightmap"
      surfaceScale="4"
      kernelUnitLength="1"
      lighting-color="#ffffff"
      result="diffuse"
    >
      <feDistantLight azimuth="225" elevation="55" />
    </feDiffuseLighting>
    <feSpecularLighting
      in="heightmap"
      surfaceScale="1.6"
      specularConstant="0.6"
      specularExponent="20"
      lighting-color="#ffffff"
      result="spec"
    >
      <feDistantLight azimuth="225" elevation="55" />
    </feSpecularLighting>
    <feComposite
      in="diffuse"
      in2="spec"
      operator="arithmetic"
      k1="0"
      k2="1"
      k3="0.35"
      k4="0"
      result="light"
    />

    {/* Paper grain */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.55"
      numOctaves="3"
      seed="3"
      result="grain"
    />
    <feColorMatrix in="grain" type="saturate" values="0.7" result="grainSat" />

    {/* Instead of multiply, use 'lighten' to preserve color, then boost saturation and alpha */}
    <feBlend in="displaced" in2="light" mode="lighten" result="lit" />
    <feBlend in="lit" in2="grainSat" mode="multiply" result="withGrain" />

    {/* Inner shadow for shape */}
    <feGaussianBlur in="SourceAlpha" stdDeviation="0" result="shadowBlur" />
    <feOffset in="shadowBlur" dx="0" dy="0" result="shadowOffset" />
    <feComposite
      in="shadowOffset"
      in2="SourceAlpha"
      operator="out"
      result="innerShadow"
    />
    <feComposite
      in="withGrain"
      in2="innerShadow"
      operator="arithmetic"
      k1="0"
      k2="1"
      k3="0.7"
      k4="0"
      result="paper"
    />

    {/* White edge ring for highlight */}
    <feMorphology
      in="SourceAlpha"
      operator="dilate"
      radius="2.5"
      result="expanded"
    />
    <feComposite in="expanded" in2="SourceAlpha" operator="out" result="ring" />
    <feDisplacementMap
      in="ring"
      in2="heightmap"
      scale="8"
      xChannelSelector="R"
      yChannelSelector="G"
      result="roughRing"
    />
    <feFlood flood-color="white" result="whiteFill" />
    <feComposite
      in="whiteFill"
      in2="roughRing"
      operator="in"
      result="whiteEdge"
    />

    {/* Boost color/sat, but mask to original alpha so background is transparent */}
    <feColorMatrix
      in="paper"
      type="matrix"
      values="
      1.3 0   0   0 0
      0   1.3 0   0 0
      0   0   1.3 0 0
      0   0   0   0.85 0"
      result="paperSat"
    />
    {/* Mask everything to original alpha to ensure transparent background */}
    <feComposite
      in="paperSat"
      in2="SourceAlpha"
      operator="in"
      result="paperSatMasked"
    />
    <feComposite
      in="whiteEdge"
      in2="SourceAlpha"
      operator="in"
      result="whiteEdgeMasked"
    />

    <feMerge>
      <feMergeNode in="paperSat" />
      <feMergeNode in="whiteEdge" />
    </feMerge>
  </filter>
);

const testFilter2 = (
  <filter id="testFilter2">
    {/* Create subtle texture with turbulence (shape-preserving) */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.05"
      numOctaves="4"
      seed="3"
      result="noise"
    />

    {/* Significantly reduce displacement to preserve element shape */}
    <feDisplacementMap
      in="SourceGraphic"
      in2="noise"
      scale="4"
      xChannelSelector="R"
      yChannelSelector="G"
      result="displacedPaper"
    />

    {/* Add light effect with lighting */}
    <feDiffuseLighting
      in="noise"
      surfaceScale="3"
      diffuseConstant="1"
      result="diffLight"
    >
      <feDistantLight azimuth="45" elevation="60" />
    </feDiffuseLighting>

    {/* Adjust the contrast of the lighting */}
    <feComposite
      in="diffLight"
      in2="displacedPaper"
      operator="arithmetic"
      k1="1"
      k2="0"
      k3="0"
      k4="0"
      result="lightedPaper"
    />

    {/* Blend the lighting with the displaced image */}
    <feBlend
      in="displacedPaper"
      in2="lightedPaper"
      mode="multiply"
      result="crumpledPaper"
    />

    {/* Add subtle color variation to simulate paper fibers */}
    <feColorMatrix
      in="crumpledPaper"
      type="matrix"
      values="
  0.9 0.1 0.1 0 0
  0.1 0.9 0.1 0 0
  0.1 0.1 0.9 0 0
  0   0   0   1 0"
      result="coloredPaper"
    />
  </filter>
);

// TODO: Make all the filter definitions into an array
// then add the filter tags at the end of the array

export const filter_defs: JSX.Element[] = [
  testFilter2,
  dropShadowFilter,
  softShadowFilter,
  glassFilter,
  mossFilter,
  crumpledPaperFilter,
  weakBlurFilter,
  strongBlurFilter,
  invertFilter,
  feltFilter,
  waterColorSplotchFilter,
  leatherFilter,
  testFilter,
];
