// markdown-it containers for the chapters of "Under the Sea"
// (docs/under-the-sea/). Styled by theme/book.css. See
// apps/docs/book/README.md for how a chapter uses them.
//
//   ::: not-yet-true            a calm box headed "Not yet true": where the code
//   - **Polar axes …** …        and the intended design part ways.
//   :::
//
//   ::: code-map                a two-column list: the bold lead of each item is
//   - **Build** `chartBuilder.ts` `resolve()` 983
//   :::                         "what", the rest is "file, symbol, line".
//
//   ::: rule A wrapper is invisible.
//   wrap(*n*) = layer{transparent}[ *n*, parts… ]\
//   <small>and</small> name(wrap(*n*)) = none
//
//   The wrapped node stays in slot 0 and keeps its name.
//   :::
//     A formal rule: the name (after `rule`), the rule (every paragraph but the
//     last, in the text face, *x* for a variable, <small> for a muted word),
//     and one plain sentence (the last paragraph). Consecutive rules read as
//     one block.

import container from "markdown-it-container";

type Token = any;

function wrap(
  md: any,
  name: string,
  open: (info: string) => string,
  close: string
) {
  md.use(container, name, {
    render(tokens: Token[], idx: number) {
      const t = tokens[idx];
      return t.nesting === 1
        ? open(t.info.trim().slice(name.length).trim())
        : close;
    },
  });
}

export default function book(md: any): void {
  wrap(
    md,
    "not-yet-true",
    () =>
      '<aside class="book-not-yet-true">\n<h2 id="not-yet-true" tabindex="-1">Not yet true</h2>\n',
    "</aside>\n"
  );
  wrap(md, "code-map", () => '<div class="book-code-map">\n', "</div>\n");
  wrap(
    md,
    "rule",
    (name) =>
      `<div class="book-rule">\n<div class="book-rule__name">${md.renderInline(name)}</div>\n<div class="book-rule__math">\n`,
    "</div>\n</div>\n"
  );

  // Rewrite the tokens inside the code-map and rule containers once inline
  // parsing is done.
  md.core.ruler.push("book-containers", (state: any) => {
    const tokens: Token[] = state.tokens;
    const html = (content: string, block: boolean) => {
      const t = new state.Token(block ? "html_block" : "html_inline", "", 0);
      t.content = content;
      return t;
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      // code-map: split each item's inline content at its bold lead.
      if (t.type === "container_code-map_open") {
        for (let j = i + 1; j < tokens.length; j++) {
          const u = tokens[j];
          if (u.type === "container_code-map_close") break;
          if (u.type !== "inline" || !u.children?.length) continue;
          // markdown-it may leave an empty text token before the bold lead.
          const kids: Token[] = u.children.filter(
            (k: Token) => !(k.type === "text" && k.content === "")
          );
          if (kids[0]?.type !== "strong_open") continue;
          const end = kids.findIndex((k) => k.type === "strong_close");
          if (end < 0) continue;
          u.children = [
            html('<span class="book-code-map__what">', false),
            ...kids.slice(1, end),
            html('</span><span class="book-code-map__where">', false),
            ...kids.slice(end + 1),
            html("</span>", false),
          ];
        }
      }

      // rule: the last paragraph is the plain sentence.
      if (t.type === "container_rule_open") {
        let close = -1;
        let lastPara = -1;
        for (let j = i + 1; j < tokens.length; j++) {
          const u = tokens[j];
          if (u.type === "container_rule_close" && u.level === t.level) {
            close = j;
            break;
          }
          if (u.type === "paragraph_open" && u.level === t.level + 1)
            lastPara = j;
        }
        if (close < 0) continue;
        // Count the paragraphs at the rule's own level; with only one, there
        // is no plain sentence.
        const paras = tokens
          .slice(i + 1, close)
          .filter(
            (u: Token) => u.type === "paragraph_open" && u.level === t.level + 1
          ).length;
        if (paras >= 2 && lastPara > 0)
          tokens.splice(
            lastPara,
            0,
            html('</div>\n<div class="book-rule__plain">\n', true)
          );
      }
    }
  });
}
