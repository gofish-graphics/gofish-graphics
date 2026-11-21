/**
 * The single-file engine for embedded runtimes (S3): frontend IR in, display
 * list out, as JSON strings, with no DOM and no host APIs.
 *
 * Text measurement: the host passes a per-character advance table (em units,
 * measured by the host with any font library) via `setCharWidths`; without
 * one, a fixed 0.55 em advance is used. Kerning is ignored.
 *
 * Async: `toDisplayList` returns a promise. `sceneStart` kicks it off and
 * parks the result in `lastScene`, so a host that cannot await JS promises
 * can poll `sceneResult()` after the microtask queue drains.
 */
import {
  Serialize,
  setTextMeasurer,
} from "../../../packages/gofish-graphics/src/lib";

type Table = {
  ascent: number;
  descent: number;
  fallback: number;
  widths: Record<string, number>;
};
let table: Table | undefined;

setTextMeasurer((text, font) => {
  const s = font.size;
  if (!table) {
    return {
      width: text.length * s * 0.55,
      height: s,
      ascent: s * 0.8,
      descent: -s * 0.2,
    };
  }
  let w = 0;
  for (const ch of text) w += table.widths[ch] ?? table.fallback;
  const ascent = table.ascent * s;
  const descent = table.descent * s;
  return { width: w * s, height: ascent - descent, ascent, descent };
});

export function setCharWidths(json: string | null) {
  table = json ? JSON.parse(json) : undefined;
}

/** IR document JSON + render options JSON -> display list JSON. */
export async function scene(
  docJson: string,
  optsJson: string
): Promise<string> {
  const doc = Serialize.readIR(docJson) as any;
  const opts = JSON.parse(optsJson);
  const dl = await Serialize.buildIR(doc).toDisplayList(opts);
  return JSON.stringify(dl);
}

let lastScene: { ok?: string; err?: string } | undefined;
export function sceneStart(docJson: string, optsJson: string) {
  lastScene = undefined;
  scene(docJson, optsJson).then(
    (ok) => (lastScene = { ok }),
    (e) => (lastScene = { err: `${e}\n${e?.stack ?? ""}` })
  );
}
export const sceneResult = () => (lastScene ? JSON.stringify(lastScene) : null);
