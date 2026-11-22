/**
 * Throwaway "1-bit scan" filters for the theming proposal: the whole figure
 * (marks, patterns, axes, text) goes through one SVG filter applied to a <g>
 * that wraps every child of the rendered <svg>.
 *
 * Proposed spelling, one list of effects on the figure:
 *   Filter.roughen()                                   -> "roughen"
 *   [Filter.roughen(), Filter.threshold()]             -> "scan"
 *   [Filter.roughen(), Filter.threshold(), Filter.grain()] -> "xerox"
 *
 * Each proposed member is one stage below; a list is the stages chained.
 */

export type Wear = "none" | "roughen" | "scan" | "xerox" | "pixel";

/**
 * Experiment: the feFlood + feTile + feComposite + feMorphology pixelate
 * trick on the 1-bit ink, so the scan grid is `cell` user units whatever
 * the device pixel ratio. It point-samples one `dot`-sized spot per cell
 * (it cannot area-average) and dilates the spot to fill the cell.
 */
const pixelate = (inp: string, out: string, cell = 1, dot = 0.5) => `
  <feGaussianBlur in="${inp}" stdDeviation="${cell / 2.5}" result="xPre"/>
  <feComponentTransfer in="xPre" result="xPre2"><feFuncA type="discrete" tableValues="0 0 1 1 1"/></feComponentTransfer>
  <feFlood x="${dot}" y="${dot}" width="${dot}" height="${dot}" flood-color="black" result="xDot"/>
  <feComposite in="xDot" in2="xDot" operator="over" x="0" y="0" width="${cell}" height="${cell}" result="xCell"/>
  <feTile in="xCell" result="xGrid"/>
  <feComposite in="xPre2" in2="xGrid" operator="in" result="xSamp"/>
  <feMorphology in="xSamp" operator="dilate" radius="${(cell - dot) / 2}" result="${out}"/>`;

/** Filter.roughen(): displace every pixel by a small fractal-noise offset. */
const roughen = (inp: string, out: string, o = { scale: 1.0, freq: 0.3 }) => `
  <feTurbulence type="fractalNoise" baseFrequency="${o.freq}" numOctaves="2" seed="3" result="rNoise"/>
  <feDisplacementMap in="${inp}" in2="rNoise" scale="${o.scale}" xChannelSelector="R" yChannelSelector="G" result="${out}"/>`;

/**
 * Filter.threshold(): ink coverage = alpha minus luminance (so black ink is 1,
 * white paper and transparency are 0), spread it with a small blur, shift
 * it by low-frequency noise so weight varies across the figure, then cut it
 * at a hard threshold. Output: pure-black ink as alpha ("ink" result).
 */
const threshold = (
  inp: string,
  out: string,
  o = { spread: 0.45, cut: 0.4, jitter: 0.08 }
) => `
  <feColorMatrix in="${inp}" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 1 0" result="tInk"/>
  <feGaussianBlur in="tInk" stdDeviation="${o.spread}" result="tSpread"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="1" seed="12" result="tWeight"/>
  <feColorMatrix in="tWeight" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="tWeightA"/>
  <feComposite in="tSpread" in2="tWeightA" operator="arithmetic" k2="1" k3="${o.jitter}" k4="${(0.5 - o.cut - o.jitter / 2).toFixed(3)}" result="tShifted"/>
  <feComponentTransfer in="tShifted" result="${out}">
    <feFuncA type="discrete" tableValues="0 1"/>
  </feComponentTransfer>`;

/**
 * Filter.grain(): photocopy specks and dropouts on 1-bit ink. Two sparse
 * masks cut from high-frequency noise: specks are added as ink, dropouts
 * are punched out of the ink.
 */
const grain = (
  inp: string,
  out: string,
  o = { specks: 0.004, dropouts: 0.03 }
) => `
  <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="41" result="gN1"/>
  <feColorMatrix in="gN1" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="gN1a"/>
  <feComponentTransfer in="gN1a" result="gSpeck">
    <feFuncA type="discrete" tableValues="${tab(1 - o.specks)}"/>
  </feComponentTransfer>
  <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="77" result="gN2"/>
  <feColorMatrix in="gN2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="gN2a"/>
  <feComponentTransfer in="gN2a" result="gDrop">
    <feFuncA type="discrete" tableValues="${tab(1 - o.dropouts)}"/>
  </feComponentTransfer>
  <feComposite in="${inp}" in2="gDrop" operator="out" result="gHoled"/>
  <feMerge result="${out}"><feMergeNode in="gHoled"/><feMergeNode in="gSpeck"/></feMerge>`;

/** A discrete table that is 0 below quantile q of the noise alpha and 1 above.
 *  fractalNoise alpha clusters around 0.5, so q is mapped onto [0.5, 0.75]. */
function tab(q: number): string {
  const n = 100;
  const at = 0.5 + 0.25 * q; // noise rarely exceeds ~0.75
  return Array.from({ length: n }, (_, i) => ((i + 0.5) / n > at ? 1 : 0)).join(
    " "
  );
}

/** 1-bit ink back to paint: black where ink, white paper everywhere else. */
const toPaper = (inkResult: string) => `
  <feFlood flood-color="black" result="pInk"/>
  <feComposite in="pInk" in2="${inkResult}" operator="in" result="pBlack"/>
  <feFlood flood-color="white" result="pPaper"/>
  <feMerge><feMergeNode in="pPaper"/><feMergeNode in="pBlack"/></feMerge>`;

export function wearFilter(
  id: string,
  wear: Wear,
  w: number,
  h: number,
  x0 = 0,
  y0 = 0
): string {
  const head = `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x0 - 4}" y="${y0 - 4}" width="${w + 8}" height="${h + 8}" color-interpolation-filters="sRGB">`;
  let body = "";
  if (wear === "roughen") body = roughen("SourceGraphic", "rough");
  if (wear === "scan")
    body =
      roughen("SourceGraphic", "rough") +
      threshold("rough", "ink") +
      toPaper("ink");
  if (wear === "xerox")
    body =
      roughen("SourceGraphic", "rough") +
      threshold("rough", "ink") +
      grain("ink", "ink2") +
      toPaper("ink2");
  if (wear === "pixel")
    body =
      roughen("SourceGraphic", "rough") +
      threshold("rough", "ink") +
      pixelate("ink", "ink2") +
      toPaper("ink2");
  return `${head}${body}</filter>`;
}

const SVGNS = "http://www.w3.org/2000/svg";

/** Wrap every child of `svg` in one <g filter>, so the filter sees the
 *  whole figure at once. */
export function applyWear(svg: SVGSVGElement, wear: Wear, id = `wear-${wear}`) {
  if (wear === "none") return;
  // the filter region, in the svg's user space (its viewBox when it has one)
  const vb = svg.viewBox.baseVal;
  const has = !!vb && vb.width > 0;
  const w = has ? vb.width : Number(svg.getAttribute("width"));
  const h = has ? vb.height : Number(svg.getAttribute("height"));
  const uid = `${id}-${Math.random().toString(36).slice(2, 7)}`;
  const defs = document.createElementNS(SVGNS, "defs");
  defs.innerHTML = wearFilter(uid, wear, w, h, has ? vb.x : 0, has ? vb.y : 0);
  const g = document.createElementNS(SVGNS, "g");
  while (svg.firstChild) g.appendChild(svg.firstChild);
  g.setAttribute("filter", `url(#${uid})`);
  svg.appendChild(defs);
  svg.appendChild(g);
  svg.style.overflow = "visible";
}
