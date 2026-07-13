/**
 * textUtils.ts — small text-formatting helpers shared by storyExamples.ts
 * (TypeScript snippet synthesis) and pythonExamples.ts (Python snippet
 * synthesis). The two callers differ only in tab width (2 vs 4 spaces), which
 * is why dedent() takes it as a parameter rather than hardcoding one.
 */

/** Remove common leading indentation and trim blank edges. Tabs are expanded
 * to `tabWidth` spaces first so indentation comparisons are column-accurate
 * regardless of the source's tab/space mix. */
export function dedent(text: string, tabWidth: number): string {
  const lines = text.replace(/\t/g, " ".repeat(tabWidth)).split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const indents = lines
    .filter((l) => l.trim() !== "")
    .map((l) => l.match(/^ */)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

/** Prepend `pad` to every non-blank line. */
export function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((l) => (l.trim() === "" ? l : pad + l))
    .join("\n");
}
