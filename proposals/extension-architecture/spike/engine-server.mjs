// The subprocess fallback for S3: a line-delimited JSON server around the
// same engine bundle. Run as `node engine-server.mjs` (or `deno run
// engine-server.mjs`); each stdin line is {doc, opts}, each stdout line is
// the display list JSON (or {"error": ...}). Line 0 may be {charWidths}.
import { scene, setCharWidths } from "./out/engine.mjs";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  try {
    const msg = JSON.parse(line);
    if ("charWidths" in msg) {
      setCharWidths(msg.charWidths ? JSON.stringify(msg.charWidths) : null);
      process.stdout.write("{}\n");
      continue;
    }
    process.stdout.write(
      (await scene(JSON.stringify(msg.doc), JSON.stringify(msg.opts))) + "\n"
    );
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ error: String(e?.stack ?? e) }) + "\n"
    );
  }
}
