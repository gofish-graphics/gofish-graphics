/**
 * Path grammar and parser for Neo's colon-delimited label paths.
 *
 * Grammar:
 *   path  ::= label | multi | label ":" path
 *   multi ::= "[" path "," path ("," path)* "]"
 *   label ::= run of characters other than `:`, `,`, `[`, `]`
 *
 * A single path string can therefore describe a small *forest* of chains
 * (via the `multi` production), e.g. `"[a:b,c:d]"` describes two top-level
 * chains: `a:b` and `c:d`.
 */

/** A single token produced by {@link tokenize}. */
export type Token = ":" | "," | "[" | "]" | { label: string };

/**
 * Splits a path string into tokens. `:`, `,`, `[`, `]` are single-character
 * tokens; every other run of characters accumulates into a `{ label }`
 * token.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let buf = "";
  const flush = () => {
    if (buf.length > 0) {
      tokens.push({ label: buf });
      buf = "";
    }
  };
  for (const ch of input) {
    if (ch === ":" || ch === "," || ch === "[" || ch === "]") {
      flush();
      tokens.push(ch as Token);
    } else {
      buf += ch;
    }
  }
  flush();
  return tokens;
}

/** A parsed chain of labels, e.g. `"a:b:c"` → `["a", "b", "c"]`. */
export type Chain = string[];

/**
 * Parses one path string into a forest of label chains. Each top-level
 * chain is one root-to-leaf sequence of labels. `"a:b:c"` yields a single
 * chain `["a","b","c"]`; `"[a:b,c:d]"` yields two chains
 * `["a","b"], ["c","d"]`; `"[a:b,a:c]"` yields two *separate* chains that
 * both start with `"a"` — merging same-named roots is a tree-building
 * concern, not a parsing one (see labelTree.ts).
 */
export function parsePath(input: string): Chain[] {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const t = tokens[pos];
    if (t === undefined) throw new Error(`Unexpected end of path: "${input}"`);
    pos++;
    return t;
  };

  // A `segment` is either a single label or a bracketed multi-group; both
  // produce one or more chains rooted at that position.
  function parseSegment(): Chain[] {
    const t = peek();
    if (t === undefined) {
      throw new Error(`Unexpected end of path: "${input}"`);
    }
    if (t === "[") {
      next(); // consume "["
      const groups: Chain[] = [];
      groups.push(...parseTail());
      while (peek() === ",") {
        next(); // consume ","
        groups.push(...parseTail());
      }
      const closing = next();
      if (closing !== "]") {
        throw new Error(`Expected "]" in path: "${input}"`);
      }
      return groups;
    }
    if (typeof t === "object" && "label" in t) {
      next();
      return [[t.label]];
    }
    throw new Error(`Unexpected token in path: "${input}"`);
  }

  // A `tail` is a segment optionally followed by `: path`.
  function parseTail(): Chain[] {
    const heads = parseSegment();
    if (peek() === ":") {
      next(); // consume ":"
      const rests = parseTail();
      // Every head chain gets every rest chain appended (cross product),
      // matching Neo's semantics where a multi-group at a position expands
      // into parallel chains sharing the same suffix.
      const out: Chain[] = [];
      for (const head of heads) {
        for (const rest of rests) {
          out.push([...head, ...rest]);
        }
      }
      return out;
    }
    return heads;
  }

  const result = parseTail();
  if (pos !== tokens.length) {
    throw new Error(`Trailing tokens in path: "${input}"`);
  }
  return result;
}

/** Splits a colon-joined path string into its segments (no bracket parsing). */
export function segments(path: string): string[] {
  return path.split(":");
}

/** The dimension of a path is its first colon-delimited segment. */
export function dimension(path: string): string {
  return segments(path)[0] ?? path;
}

/**
 * True if `prefix` is a segment-aware prefix of `path`: either the two are
 * equal, or `path`'s leading segments exactly match all of `prefix`'s
 * segments. This is NOT substring matching — `"stat"` is not a prefix of
 * `"state:open"` even though it is a string prefix.
 */
export function isPathPrefix(prefix: string, path: string): boolean {
  const p = segments(prefix);
  const s = segments(path);
  if (p.length > s.length) return false;
  for (let i = 0; i < p.length; i++) {
    if (p[i] !== s[i]) return false;
  }
  return true;
}
