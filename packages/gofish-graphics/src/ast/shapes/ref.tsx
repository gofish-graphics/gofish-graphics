import { GoFishRef } from "../_ref";
import { GoFishNode } from "../_node";
import { isToken, Token } from "../createName";

/**
 * A chainable Ref. Property access (`.foo`, `[2]`) extends the path; `.path()`
 * is the variadic-segments escape hatch. The proxy *is* a GoFishRef
 * (`instanceof GoFishRef` holds), so it can be passed anywhere a Ref is
 * expected.
 *
 * Reserved names that can't be reached via dotted access (use `.path("name")`
 * or the array form `ref([token, "name", ...])` instead): see RESERVED_KEYS.
 */
export type RefProxy = GoFishRef & {
  path(...segments: (string | number)[]): RefProxy;
} & {
  readonly [k: string]: RefProxy;
};

/**
 * Names that pass through to the underlying GoFishRef instead of being
 * treated as path segments. Children registered with one of these names
 * cannot be reached via dotted access — fall back to `.path("name")` or
 * `ref([token, "name", ...])`.
 *
 * Includes:
 * - All instance fields of GoFishRef (public + private), derived from a
 *   sample instance so this stays in sync if fields are added/removed.
 * - All prototype members (methods, getters, private methods).
 * - Object.prototype names that JS/library code probes.
 * - `then` — must passthrough to undefined so the proxy isn't mistaken
 *   for a Promise by Solid reactivity / test runners.
 *
 * `path` is NOT in this set — it's the escape-hatch method, intercepted
 * before this lookup. Children named "path" need the array form.
 */
const SAMPLE_REF = new GoFishRef({ selection: ["__sample__"] });
const RESERVED_KEYS: ReadonlySet<string> = new Set<string>([
  // Instance fields of GoFishRef (public + private)
  ...(Reflect.ownKeys(SAMPLE_REF).filter(
    (k): k is string => typeof k === "string"
  ) as string[]),
  // Prototype methods + getters
  ...(Reflect.ownKeys(GoFishRef.prototype).filter(
    (k): k is string => typeof k === "string"
  ) as string[]),
  // Object.prototype members consulted by language/library code
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "__proto__",
  // Thenable-detection probe — must passthrough to undefined so the proxy
  // is never mistaken for a Promise.
  "then",
]);

const proxyFor = (selection: (Token | string | number)[]): RefProxy => {
  const target = new GoFishRef({ selection });
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(t, prop, receiver);
      if (prop === "path") {
        return (...segments: (string | number)[]) =>
          proxyFor([...selection, ...segments]);
      }
      if (RESERVED_KEYS.has(prop)) return Reflect.get(t, prop, receiver);
      // Numeric-string keys (proxy[2], proxy["3"]) coerce to number so
      // resolveSelection treats them as positional indices, not scope-tags.
      const seg: string | number = /^\d+$/.test(prop) ? Number(prop) : prop;
      return proxyFor([...selection, seg]);
    },
  }) as unknown as RefProxy;
};

export function ref(token: Token): RefProxy;
export function ref(
  selectionOrNode:
    | string
    | (Token | string | number)[]
    | GoFishNode
    | { __ref: GoFishNode }
): GoFishRef;
export function ref(selectionOrNode: any): GoFishRef {
  if (isToken(selectionOrNode)) {
    return proxyFor([selectionOrNode]);
  }
  if (typeof selectionOrNode === "string" || Array.isArray(selectionOrNode)) {
    return new GoFishRef({ selection: selectionOrNode });
  } else if ("__ref" in selectionOrNode) {
    return new GoFishRef({ node: selectionOrNode.__ref });
  } else {
    return new GoFishRef({ node: selectionOrNode });
  }
}
