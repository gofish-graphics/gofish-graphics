/**
 * static-server.ts
 *
 * Serves a directory of static files: `siteFile` and `serveFile` are the GET
 * side of the local review server (review-server.ts), and run as a script
 * this serves capture-diff's output, so its report can open stories live
 * (a page opened from disk cannot load the live harness; see live-view.ts).
 *
 * Usage: tsx scripts/static-server.ts <dir> [port]
 *   pnpm capture-diff:serve  serves tests/tmp/capture-diff on port 3006
 */

import { createServer, type ServerResponse } from "http";
import { existsSync, readFileSync, statSync } from "fs";
import { join, normalize, extname, sep, resolve } from "path";
import { pathToFileURL } from "url";

/** The content type of a served file, by its extension. The one table the
 *  local servers share (this one and ruler.ts's). */
export const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".woff2": "font/woff2",
};

/** The file under `dir` a GET of `pathname` names, or null when it names
 *  none. `exclude` lists subdirectories of `dir` never served. */
export function siteFile(
  dir: string,
  pathname: string,
  exclude: string[] = []
): string | null {
  const rel = pathname.endsWith("/")
    ? `${decodeURIComponent(pathname)}index.html`
    : decodeURIComponent(pathname);
  const file = normalize(join(dir, rel));
  if (!file.startsWith(dir + sep)) return null;
  if (exclude.some((d) => file.startsWith(join(dir, d) + sep))) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

export function respond(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer
): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

/** Answer with `file` (from `siteFile`), or a 404 when it is null. */
export function serveFile(res: ServerResponse, file: string | null): void {
  if (file === null) return respond(res, 404, "text/plain", "Not found");
  respond(
    res,
    200,
    // DOM diffs and specs are HTML fragments named `<story>.html`.
    CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    readFileSync(file)
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(process.argv[2] ?? ".");
  const port = Number(process.argv[3]) || 3006;
  createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", `http://localhost:${port}`);
    serveFile(res, req.method === "GET" ? siteFile(dir, pathname) : null);
  }).listen(port, () => {
    console.log(`Serving ${dir} at http://localhost:${port}/`);
    if (existsSync(join(dir, "report.html")))
      console.log(`  Report: http://localhost:${port}/report.html`);
  });
}
