/**
 * DOM normalization for snapshot comparison.
 *
 * Both JS (Storybook) and Python (harness) DOM output go through this
 * pipeline so that superficial differences (attribute order, whitespace,
 * generated IDs, float precision) don't cause false negatives.
 */

// ---------------------------------------------------------------------------
// 1. Strip wrapper markup — keep only the chart container innerHTML
// ---------------------------------------------------------------------------

/**
 * Extract the meaningful chart content from wrapper divs.
 * Storybook wraps charts in `#storybook-root > div[style="margin: 20px"]`.
 * The gotree gallery stories additionally wrap in a
 * `div[style="margin: 16px; width: ...px; height: ...px"]` via
 * `initializeContainer()` (packages/gofish-gotree/stories/helper.ts).
 * The harness wraps in `#gofish-harness-root`.
 *
 * Rather than fingerprint each scaffolding variant, strip *any* outermost
 * `<div style="...">...</div>` wrapper that fully encloses the content —
 * scaffolding is, by construction, a styled div wrapper around the real
 * chart markup. Applied iteratively so nested scaffolding wrappers (e.g. a
 * Storybook margin div around a gotree helper margin div) all get peeled.
 */
export function stripWrapper(html: string): string {
  let s = html.trim();

  const styledDivWrap = /^<div\s+style="[^"]*">\s*([\s\S]*?)\s*<\/div>$/i;
  for (;;) {
    const m = s.match(styledDivWrap);
    if (!m) break;
    s = m[1].trim();
  }

  return s;
}

// ---------------------------------------------------------------------------
// 1b. Strip display-projection attributes from the ROOT <svg> only
// ---------------------------------------------------------------------------

const ROOT_SVG_PROJECTION_ATTRS = new Set([
  "width",
  "height",
  "viewbox",
  "preserveaspectratio",
]);

/**
 * Strip `width`, `height`, `viewBox`, and `preserveAspectRatio` from the
 * ROOT `<svg>` element only (nested `<svg>` elements, if any, are untouched).
 *
 * Parity compares content geometry, not display sizing. The root svg's
 * width/height/viewBox/preserveAspectRatio are a *display projection* —
 * how the chart's already-solved coordinate space gets mapped onto the
 * page/viewport — and story scaffolding legitimately rewrites them (e.g.
 * gotree's `fitToContent` sets `width="100%" height="100%"` plus a
 * content-fitted `viewBox` on a RAF after mount; the Python harness path
 * never runs that scaffolding). Any real sizing bug in the chart itself
 * shows up in the content coordinates (x/y/d/transform/etc. on the actual
 * marks) that layout solved against, which this normalizer still compares
 * byte-for-byte. So this rule is applied uniformly to every capture, JS and
 * Python alike, before the two sides are ever diffed.
 */
export function stripRootSvgProjectionAttrs(html: string): string {
  let replaced = false;
  return html.replace(/<svg\b([^>]*)>/i, (whole, attrs: string) => {
    if (replaced) return whole; // only the first (root) <svg>
    replaced = true;
    const kept = attrs.replace(
      /\s+([\w:.-]+)="[^"]*"/g,
      (attrMatch: string, name: string) =>
        ROOT_SVG_PROJECTION_ATTRS.has(name.toLowerCase()) ? "" : attrMatch
    );
    return `<svg${kept}>`;
  });
}

// ---------------------------------------------------------------------------
// 2. Round floating-point numbers in SVG attributes & path data
// ---------------------------------------------------------------------------

const NUMERIC_ATTRS = new Set([
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "dx",
  "dy",
  "font-size",
  "stroke-width",
  "stroke-dashoffset",
  "stroke-dasharray",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
]);

/**
 * Round a single number string to `decimals` places, preserving any trailing
 * unit suffix (`%`, `px`, `em`, ...) rather than silently dropping it —
 * `width="100%"` must stay `100%`, not become `100`.
 */
function roundNum(numStr: string, decimals: number): string {
  const m = numStr.match(/^(-?\d+\.?\d*(?:e[+-]?\d+)?)([a-z%]*)$/i);
  const [numPart, unit] = m ? [m[1], m[2]] : [numStr, ""];
  const n = parseFloat(numPart);
  if (Number.isNaN(n)) return numStr;
  // Avoid -0
  const rounded = Math.round(n * 10 ** decimals) / 10 ** decimals;
  const roundedStr = Object.is(rounded, -0) ? "0" : String(rounded);
  return roundedStr + unit;
}

/** Round numbers inside an SVG `d` attribute (path data). */
function roundPathData(d: string, decimals: number): string {
  return d.replace(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi, (m) => roundNum(m, decimals));
}

/** Round numbers in a `transform` attribute. */
function roundTransform(t: string, decimals: number): string {
  return t.replace(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi, (m) => roundNum(m, decimals));
}

/** Round numbers in a `viewBox` attribute. */
function roundViewBox(vb: string, decimals: number): string {
  return vb
    .split(/\s+/)
    .map((v) => roundNum(v, decimals))
    .join(" ");
}

/**
 * Round floating-point values in SVG-related attributes to `decimals` places.
 */
export function roundFloats(html: string, decimals = 4): string {
  // Process attribute="value" pairs
  return html.replace(
    /(\s)([\w-]+)="([^"]*)"/g,
    (_match, space, attr, value) => {
      const attrLower = attr.toLowerCase();

      if (attrLower === "d") {
        return `${space}${attr}="${roundPathData(value, decimals)}"`;
      }
      if (attrLower === "transform") {
        return `${space}${attr}="${roundTransform(value, decimals)}"`;
      }
      if (attrLower === "viewbox") {
        return `${space}${attr}="${roundViewBox(value, decimals)}"`;
      }
      if (NUMERIC_ATTRS.has(attrLower)) {
        return `${space}${attr}="${roundNum(value, decimals)}"`;
      }
      // Also handle style properties with numeric values
      if (attrLower === "style") {
        const rounded = value.replace(
          /:\s*(-?\d+\.?\d*(?:e[+-]?\d+)?)(px|em|rem|%|)/gi,
          (_m: string, num: string, unit: string) =>
            `: ${roundNum(num, decimals)}${unit}`
        );
        return `${space}${attr}="${rounded}"`;
      }
      return `${space}${attr}="${value}"`;
    }
  );
}

// ---------------------------------------------------------------------------
// 3. Normalize generated IDs (UUIDs / counters → sequential)
// ---------------------------------------------------------------------------

/**
 * Replace generated IDs (UUIDs, numeric counters, etc.) with stable sequential
 * identifiers so that DOM diffs are deterministic.
 *
 * Handles both `id="..."` and references like `url(#...)`, `href="#..."`,
 * `clip-path="url(#...)"`, etc.
 */
export function normalizeIds(html: string): string {
  // Collect all id values in document order
  const idRegex = /\bid="([^"]+)"/g;
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = idRegex.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }

  // Build old→new map
  const idMap = new Map<string, string>();
  ids.forEach((old, i) => {
    idMap.set(old, `__id${i}__`);
  });

  // Replace id definitions
  let out = html.replace(/\bid="([^"]+)"/g, (_m, id) => {
    const newId = idMap.get(id) ?? id;
    return `id="${newId}"`;
  });

  // Replace references: url(#old) → url(#new)
  out = out.replace(/url\(#([^)]+)\)/g, (_m, id) => {
    const newId = idMap.get(id) ?? id;
    return `url(#${newId})`;
  });

  // Replace href="#old" → href="#new"
  out = out.replace(/href="#([^"]+)"/g, (_m, id) => {
    const newId = idMap.get(id) ?? id;
    return `href="#${newId}"`;
  });

  // Replace xlink:href="#old" → xlink:href="#new"
  out = out.replace(/xlink:href="#([^"]+)"/g, (_m, id) => {
    const newId = idMap.get(id) ?? id;
    return `xlink:href="#${newId}"`;
  });

  return out;
}

// ---------------------------------------------------------------------------
// 3b. Normalize <image> hrefs (build-hashed / absolute asset URLs → basename)
// ---------------------------------------------------------------------------

/**
 * Reduce an asset URL to its hash-stripped basename so that the same image
 * matches across environments. Vite serves assets differently depending on
 * mode: the dev server emits absolute `/@fs/<abs-path>/wilsonblanco.png`
 * URLs, while a production/Storybook-static build emits content-hashed
 * `/assets/wilsonblanco-Bf3k2.png` names. Both must collapse to
 * `wilsonblanco.png` for an image-bearing story's DOM to byte-match between
 * the JS Storybook capture and the Python harness.
 *
 * `data:` URIs are returned untouched (they carry the bytes inline and are
 * already environment-independent).
 */
function imageHrefBasename(url: string): string {
  // Take the basename, dropping any query/fragment suffix.
  const base = url.split(/[?#]/)[0].split("/").pop() ?? url;
  const dot = base.lastIndexOf(".");
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? "" : base.slice(dot);
  // Strip a trailing `-<hash>` segment (the final hyphen-delimited group)
  // when it looks like a build content hash rather than part of the real
  // filename. Vite hashes mix letters and digits (e.g. `Bf3k2`); semantic
  // filename words/segments such as `isolated` or `2451180_1280` do not.
  const stripped = stem.replace(/-([A-Za-z0-9_]+)$/, (match, seg) => {
    const hasLetter = /[A-Za-z]/.test(seg);
    const hasDigit = /\d/.test(seg);
    const looksLikeHash =
      hasLetter && hasDigit && (/[A-Z]/.test(seg) || seg.length >= 8);
    return looksLikeHash ? "" : match;
  });
  return stripped + ext;
}

/**
 * Normalize `href` / `xlink:href` on `<image>` elements to their hash-stripped
 * basename. Only `<image>` hrefs are touched; `data:` URIs and fragment refs
 * (`#...`, handled by {@link normalizeIds}) are left alone.
 */
export function normalizeImageHrefs(html: string): string {
  return html.replace(/<image\b[^>]*>/gi, (tag) =>
    tag.replace(/\bhref="([^"]*)"/g, (whole, val) => {
      if (val.startsWith("data:") || val.startsWith("#")) return whole;
      return `href="${imageHrefBasename(val)}"`;
    })
  );
}

// ---------------------------------------------------------------------------
// 4. Sort attributes alphabetically per element
// ---------------------------------------------------------------------------

/**
 * Sort attributes of each HTML/SVG element alphabetically.
 * This prevents diffs from attribute-order variations across renders.
 */
export function sortAttributes(html: string): string {
  // Match opening tags: <tagname attr1="v1" attr2="v2" ...>
  return html.replace(
    /<(\w[\w-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g,
    (_m, tag, attrs, selfClose) => {
      if (!attrs || !attrs.trim()) {
        return selfClose ? `<${tag} />` : `<${tag}>`;
      }
      // Parse attributes
      const attrList: [string, string][] = [];
      const attrRegex = /([\w:.-]+)="([^"]*)"/g;
      let am: RegExpExecArray | null;
      while ((am = attrRegex.exec(attrs)) !== null) {
        attrList.push([am[1], am[2]]);
      }
      // Sort alphabetically by attribute name
      attrList.sort((a, b) => a[0].localeCompare(b[0]));
      const sortedAttrs = attrList.map(([k, v]) => `${k}="${v}"`).join(" ");
      return selfClose
        ? `<${tag} ${sortedAttrs} />`
        : `<${tag} ${sortedAttrs}>`;
    }
  );
}

// ---------------------------------------------------------------------------
// 5. Normalize whitespace — consistent indentation
// ---------------------------------------------------------------------------

/**
 * Normalise whitespace: collapse runs of whitespace between tags to a single
 * newline, trim lines, and re-indent with 2-space indentation based on nesting.
 */
export function normalizeWhitespace(html: string): string {
  // Split on `><` boundaries to get one tag per line
  let s = html.replace(/>\s+</g, ">\n<");
  // Also break after text nodes
  s = s.replace(/>([^<]+)</g, ">$1\n<");

  const lines = s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const result: string[] = [];
  let depth = 0;

  for (const line of lines) {
    // Closing tag → decrease depth before printing
    if (/^<\//.test(line)) {
      depth = Math.max(0, depth - 1);
    }

    result.push("  ".repeat(depth) + line);

    // Self-closing tag → no depth change
    if (/\/>$/.test(line)) {
      // no change
    }
    // Opening tag (not closing, not self-closing) → increase depth
    else if (/^<[^/]/.test(line) && !/<\/[^>]+>$/.test(line)) {
      depth++;
    }
  }

  return result.join("\n");
}

// ---------------------------------------------------------------------------
// 6. Full normalization pipeline
// ---------------------------------------------------------------------------

export interface NormalizeOptions {
  /** Number of decimal places for float rounding (default: 4) */
  decimals?: number;
}

/**
 * Run the full normalization pipeline on raw innerHTML.
 */
export function normalizeDom(
  html: string,
  options: NormalizeOptions = {}
): string {
  const { decimals = 4 } = options;

  let s = html;
  s = stripWrapper(s);
  s = stripRootSvgProjectionAttrs(s);
  s = roundFloats(s, decimals);
  s = normalizeIds(s);
  s = normalizeImageHrefs(s);
  s = sortAttributes(s);
  s = normalizeWhitespace(s);

  return s;
}
