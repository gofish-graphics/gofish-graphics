// markdown-it inline rule: `[[slug]]` / `[[slug|label]]` → a link to the
// internals essay whose filename is `slug`. Unresolved slugs are left as
// literal text (so a broken link stays visible, as before). Obsidian-style:
// default visible text is the slug; `|label` overrides it.
//
// Targets are supplied by the caller (built by scanning the internals tree in
// config.mts) so this stays a pure, synchronous markdown-it rule.

export type WikiTarget = { link: string; title: string };

export default function wikilink(
  md: any,
  targets: Map<string, WikiTarget>
): void {
  md.inline.ruler.before("link", "wikilink", (state: any, silent: boolean) => {
    const src: string = state.src;
    const start: number = state.pos;
    // Need "[[".
    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b)
      return false;
    const close = src.indexOf("]]", start + 2);
    if (close < 0) return false;
    const inner = src.slice(start + 2, close);
    // Keep it simple and safe: single-line, no nested brackets.
    if (/[[\]\n]/.test(inner)) return false;

    const bar = inner.indexOf("|");
    const slug = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
    const label = bar >= 0 ? inner.slice(bar + 1).trim() : slug;
    const target = targets.get(slug);
    // Unknown slug: leave the literal "[[…]]" untouched (visible = broken).
    if (target === undefined) return false;

    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrs = [["href", target.link]];
      const text = state.push("text", "", 0);
      text.content = label;
      state.push("link_close", "a", -1);
    }
    state.pos = close + 2;
    return true;
  });
}
