/**
 * Text measurers for the spike, none of which needs a DOM.
 *
 *  - none:     inject nothing; the library's own non-DOM fallback runs
 *              (text.tsx: 0.6 em advance per character).
 *  - stub:     a fixed advance per character, passed in via the patched
 *              `setTextMeasurer` hook (engine.patch).
 *  - opentype: real advance widths from a font file read by opentype.js,
 *              passed in via the same hook.
 *  - fontkit:  real advance widths from fontkit, with a variable font's
 *              optical-size axis set to the font size (what Chrome does).
 *  - shim:     NO source patch: fake `globalThis.document` whose canvas
 *              context's measureText is opentype-backed. This is the hack
 *              the library allows today; it is not a proper seam.
 */
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import * as fontkit from "fontkit";
import * as GoFish from "../../../packages/gofish-graphics/src/lib";

export const FONT_PATH =
  process.env.GOFISH_FONT ?? "/System/Library/Fonts/SFNS.ttf";

type Dims = { width: number; height: number; ascent: number; descent: number };

export function opentypeMeasurer(path = FONT_PATH) {
  const buf = readFileSync(path);
  const font = opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  );
  const upm = font.unitsPerEm;
  // fontBoundingBox* in Chrome come from hhea ascender/descender.
  const asc = font.tables.hhea.ascender / upm;
  const desc = -font.tables.hhea.descender / upm;
  return (text: string, fontSize: number): Dims => {
    const width = font.getAdvanceWidth(text, fontSize, { kerning: true });
    const ascent = asc * fontSize;
    const descent = -desc * fontSize;
    return { width, height: ascent - descent, ascent, descent };
  };
}

/** fontkit with the variable font's optical-size axis set to the font size,
 *  which is what Chrome (CoreText) does for system-ui. opentype.js 2 reads
 *  only the default instance, so its SF widths run 5-15% narrow. */
export function fontkitMeasurer(path = FONT_PATH) {
  const base = fontkit.openSync(path) as any;
  const cache = new Map<number, any>();
  const at = (size: number) => {
    let f = cache.get(size);
    if (!f) {
      f =
        "opsz" in (base.variationAxes ?? {})
          ? base.getVariation({ opsz: size })
          : base;
      cache.set(size, f);
    }
    return f;
  };
  return (text: string, fontSize: number): Dims => {
    const f = at(fontSize);
    const run = f.layout(text);
    let adv = 0;
    for (const p of run.positions) adv += p.xAdvance;
    const width = (adv / f.unitsPerEm) * fontSize;
    const ascent = (f.ascent / f.unitsPerEm) * fontSize;
    const descent = (f.descent / f.unitsPerEm) * fontSize;
    return { width, height: ascent - descent, ascent, descent };
  };
}

export const stubMeasurer = (text: string, fontSize: number): Dims => ({
  width: text.length * fontSize * 0.55,
  height: fontSize,
  ascent: fontSize * 0.8,
  descent: -fontSize * 0.2,
});

export const MEASURERS = {
  none: null,
  stub: null,
  opentype: null,
  fontkit: null,
  shim: null,
} as const;

export function installMeasurer(mode: keyof typeof MEASURERS) {
  const set = (GoFish as any).setTextMeasurer as undefined | ((m: any) => void);
  if (mode === "stub" || mode === "opentype" || mode === "fontkit") {
    if (!set)
      throw new Error(
        "setTextMeasurer missing: apply spike/engine.patch first"
      );
    const m =
      mode === "stub"
        ? stubMeasurer
        : mode === "fontkit"
          ? fontkitMeasurer()
          : opentypeMeasurer();
    set((text: string, font: { size: number }) => m(text, font.size));
  }
  if (mode === "shim") {
    const m = opentypeMeasurer();
    const ctx = {
      font: "",
      measureText(text: string) {
        const size = +(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
        const d = m(text, size);
        return {
          width: d.width,
          fontBoundingBoxAscent: d.ascent,
          fontBoundingBoxDescent: -d.descent,
        };
      },
    };
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag !== "canvas")
          throw new Error(`shim: document.createElement(${tag})`);
        return { getContext: () => ctx };
      },
    };
  }
}
