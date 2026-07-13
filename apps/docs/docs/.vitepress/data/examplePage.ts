/**
 * examplePage.ts — shared page-content builder for the per-example pages.
 *
 * `js/examples/[id].paths.ts` and `python/examples/[id].paths.ts` both emit
 * one VitePress route per gallery example, sharing the same scaffold: a back
 * link, an H1 + description, a live `<GoFishExample>` render, optional
 * language-specific "actions" HTML (the JS page's "Open in live editor"
 * button), optional italic note paragraphs, and an optional static code
 * fence (+ collapsed dataset fence). The two pages differ only in *what*
 * feeds those slots — see the callers for the JS/Python-specific pieces.
 *
 * NB: `code`/`datasetCode` strings frequently contain backticks (template
 * literals in chart code), so they are pushed as plain array elements and
 * never interpolated into a template literal.
 *
 * Only imported by the two `[id].paths.ts` files (which VitePress itself
 * loads at build time) — not by `check-story-examples.mjs`, so that script's
 * transpile-and-import loader needs no changes for this module.
 */

export interface ExamplePageOptions {
  /** Gallery listing to link back to, e.g. "/js/examples/". */
  backHref: string;
  /** H1 text. */
  title: string;
  /** Optional lead paragraph under the H1. */
  description?: string;
  /** Gallery story id, passed to `<GoFishExample id="...">`. */
  exampleId: string;
  /** Optional HTML lines rendered right after the live render (e.g. the JS
   * page's "Open in live editor" button). */
  actionsHtml?: string[];
  /** Italic markdown note paragraphs (already fully formed, e.g. wrapped in
   * `_..._`), rendered in order before the code fence. */
  notes?: string[];
  /** Fence language for both the code and dataset fences, e.g. "ts" / "python". */
  fenceLang: string;
  /** Static snippet source. When null/undefined, the code fence (and dataset
   * fence) are omitted entirely. */
  code?: string | null;
  /** `<summary>` label for the collapsed dataset fence, e.g. "dataset.ts". */
  datasetLabel?: string;
  /** Collapsed dataset snippet, shown only when `code` is also present. */
  datasetCode?: string | null;
}

export interface ExamplePageRoute {
  params: { id: string; title: string };
  content: string;
}

export function buildExamplePage(opts: ExamplePageOptions): ExamplePageRoute {
  const parts: string[] = [];

  // Back link to the gallery, above the title.
  parts.push(
    `<a class="example-back" href="${opts.backHref}">← Examples</a>`,
    ""
  );

  parts.push(`# ${opts.title}`, "");
  if (opts.description) {
    parts.push(opts.description, "");
  }

  // Live render of the real story module (client-only; no code echo).
  parts.push(`<GoFishExample id="${opts.exampleId}" />`, "");

  if (opts.actionsHtml && opts.actionsHtml.length) {
    parts.push(...opts.actionsHtml, "");
  }

  for (const note of opts.notes ?? []) {
    parts.push(note, "");
  }

  if (opts.code != null) {
    // Static code fence (push code as a plain element — may contain backticks).
    parts.push(
      "```" + opts.fenceLang,
      opts.code.replace(/\n+$/, ""),
      "```",
      ""
    );

    if (opts.datasetCode) {
      parts.push(
        '<details class="example-dataset">',
        `<summary>${opts.datasetLabel}</summary>`,
        "",
        "```" + opts.fenceLang,
        opts.datasetCode.replace(/\n+$/, ""),
        "```",
        "",
        "</details>",
        ""
      );
    }
  }

  return {
    params: { id: opts.exampleId, title: opts.title },
    content: parts.join("\n"),
  };
}
