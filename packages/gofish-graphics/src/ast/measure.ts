// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { ColumnType, HasCalendar } from "./schema";

/**
 * Measures: what the values along an axis are amounts of, and in what unit.
 *
 * Units are checked by gradual typing with inference, in the style of F#'s
 * units of measure (and Siek and Vachharajani's gradual typing with
 * unification-based inference, 2008): a column whose
 * unit nobody declared has an UNKNOWN unit, a unit variable, which unifies
 * with anything. A declared unit (`Schema.unit("USD")`, `Schema.time()`'s
 * "instant", the "count" of `.count()`) is concrete, and two different
 * concrete units on one shared axis are a type error ({@link MeasureClash};
 * the join itself is `joinUnits` in underlyingSpace.ts).
 *
 * A unit variable is named by its QUANTITY: the column's declared quantity
 * (`HasQuantity`, from `Schema.quantity(name)` or, for a column a transform
 * derived from another such as `bin()`'s edges, the source column's), else
 * the column's name. The same name is the same variable across the whole figure, and
 * a binding holds for the whole render: a column bound to USD on one axis is
 * USD everywhere, so meeting "count" on another axis is a clash. The
 * substitution lives in one {@link Units} per render (`RenderSession.units`).
 *
 * The unit decides which axes may share a scale. The quantity names title
 * the axis, followed by the unit's symbol when it has one: "Pay (USD)"
 * (`spaceTitle` in underlyingSpace.ts).
 */

/** What one channel's values are amounts of, as its column says (pure data,
 *  carried by a datum value). */
export type Quantity = {
  /** The quantity's name: its column's declared quantity (`HasQuantity`,
   *  which a transform writes for a column it derives from another), else
   *  the column's name, or a pipeline's (`"count"`). It titles the axis and
   *  names the unit variable. */
  name: string;
  /** The declared unit, if any. Absent: unknown, the variable `name`. */
  unit?: DeclaredUnit;
  /** The calendar the values read on, when they are instants. */
  calendar?: HasCalendar;
};

/** A declared unit: its `name`, which says which units are the same, and
 *  the `symbol` an axis title shows it by, "Pay (USD)". A unit the user
 *  declares (`Schema.unit(u)`) has the symbol `u`. The engine's own units
 *  ({@link INSTANT}, {@link COUNT}, a normalize share) have none: a count or
 *  a share is a plain number, and a time axis's ticks already read as
 *  dates. */
export type DeclaredUnit = { name: string; symbol?: string };

/** The unit a time column (`HasCalendar`) declares: an instant. Its zone is
 *  a display parameter, kept in the calendar. */
export const INSTANT: DeclaredUnit = { name: "instant" };

/** The unit `.count()`, `.distinct()` and `bin()`'s `count` declare. */
export const COUNT: DeclaredUnit = { name: "count" };

/** The {@link Quantity} of column `column`, whose type is `type`: named by
 *  the type's `HasQuantity` (declared, or a derived column's source), else
 *  the column; in the declared unit of `HasUnit`, else an instant for a time
 *  column, else unknown. */
export const columnQuantity = (
  column: string,
  type: ColumnType | undefined
): Quantity => {
  const declared = type?.HasUnit;
  const unit: DeclaredUnit | undefined = declared
    ? {
        name: declared.unit,
        ...(declared.symbol !== undefined ? { symbol: declared.symbol } : {}),
      }
    : type?.HasCalendar
      ? INSTANT
      : undefined;
  return {
    name: type?.HasQuantity?.name ?? column,
    ...(unit !== undefined ? { unit } : {}),
    ...(type?.HasCalendar ? { calendar: type.HasCalendar } : {}),
  };
};

/**
 * A unit variable, as a node of the render's union-find. A root holds the
 * unit its class is bound to, if any, and the quantity names in its class
 * (for messages). Read it with {@link resolveUnit}.
 */
export class UnitVar {
  /** @internal union-find parent; undefined at a root. */
  parent?: UnitVar;
  /** @internal at a root: the declared unit the class is bound to. */
  unit?: DeclaredUnit;
  /** @internal at a root: the quantity names in the class. */
  names: string[];
  constructor(readonly name: string) {
    this.names = [name];
  }
  /** The resolved unit, so a printed or hashed space shows what it means. */
  toJSON(): string {
    const root = findRoot(this);
    return root.unit?.name ?? `'${root.name}`;
  }
}

const findRoot = (v: UnitVar): UnitVar => {
  let root = v;
  while (root.parent !== undefined) root = root.parent;
  // Path compression.
  while (v.parent !== undefined) {
    const next: UnitVar = v.parent;
    v.parent = root;
    v = next;
  }
  return root;
};

/** A unit variable's representative in the union-find: its declared unit
 *  when its class is bound to one, else the unknown its class stands for
 *  (named by one of its quantities). Two units are the same iff
 *  {@link sameUnit}. */
export type Unit =
  | { kind: "declared"; name: string; symbol?: string }
  | { kind: "unknown"; name: string };

/** What a unit variable stands for now. */
export const resolveUnit = (v: UnitVar): Unit => {
  const root = findRoot(v);
  return root.unit !== undefined
    ? { kind: "declared", ...root.unit }
    : { kind: "unknown", name: root.name };
};

/** Whether two units are the same: equal declared units, or one class of
 *  unknowns. An absent unit is the same as nothing. */
export const sameUnit = (a: Unit | undefined, b: Unit | undefined): boolean =>
  a !== undefined && b !== undefined && a.kind === b.kind && a.name === b.name;

/**
 * The unit substitution of one render: the variable of each quantity name,
 * and the union-find over them. One per render, so a binding made anywhere
 * in the figure holds everywhere in it.
 */
export class Units {
  private readonly vars = new Map<string, UnitVar>();

  /** The unit variable of `q`'s name, bound to `q`'s declared unit. */
  of(q: Quantity): UnitVar {
    let v = this.vars.get(q.name);
    if (v === undefined) {
      v = new UnitVar(q.name);
      this.vars.set(q.name, v);
    }
    if (q.unit !== undefined) {
      const declared = new UnitVar(q.name);
      declared.unit = q.unit;
      unify(v, declared, {
        where: `where the column "${q.name}" has its unit declared`,
      });
    }
    return v;
  }
}

let current: Units | undefined;

/** Run `f` with `units` as the render's substitution: every datum value that
 *  becomes a space inside `f` takes its unit variable from it. The type walk
 *  (`GoFishNode.resolveUnderlyingSpace`) installs the render session's. */
export function withUnits<T>(units: Units, f: () => T): T {
  const prev = current;
  current = units;
  try {
    return f();
  } finally {
    current = prev;
  }
}

/** Whether a substitution is installed ({@link withUnits}). */
export const hasUnits = (): boolean => current !== undefined;

/** The render's substitution, or a fresh one outside a render (where
 *  nothing is shared). */
export const currentUnits = (): Units => current ?? new Units();

/** Bind two unit variables to one class, for the whole render. Two classes
 *  bound to different declared units are a {@link MeasureClash}: two
 *  declared units on one shared axis, or one unknown bound to two declared
 *  units. */
export function unify(a: UnitVar, b: UnitVar, site: MeasureSite): UnitVar {
  const ra = findRoot(a);
  const rb = findRoot(b);
  if (ra === rb) return ra;
  if (
    ra.unit !== undefined &&
    rb.unit !== undefined &&
    ra.unit.name !== rb.unit.name
  ) {
    throw new MeasureClash(
      { unit: ra.unit.name, names: ra.names },
      { unit: rb.unit.name, names: rb.names },
      site
    );
  }
  rb.parent = ra;
  // One unit declared twice keeps a symbol either side gives it, so the
  // title does not depend on which side met first.
  ra.unit =
    ra.unit && rb.unit && ra.unit.symbol === undefined
      ? rb.unit
      : (ra.unit ?? rb.unit);
  for (const n of rb.names) if (!ra.names.includes(n)) ra.names.push(n);
  return ra;
}

/** Where two measures meet: the axis (0 or 1) when the clash is on an axis,
 *  and a plain phrase for the composition, read as "(... )" in the message,
 *  e.g. "where marks are lined up". */
export type MeasureSite = { axis?: 0 | 1; where: string };

/** One side of a clash: its declared unit and the quantities bound to it. */
export type ClashSide = { unit: string; names: string[] };

/**
 * The error for two different declared units on one axis. It is raised where
 * the units meet, which knows the axis index but not the axis's name (`x`,
 * `y`, or a coordinate space's own name such as `r`). The node whose type
 * hook raised it names the axis from where it sits in the tree
 * ({@link MeasureClash.named}) before it reaches the user.
 */
export class MeasureClash extends Error {
  constructor(
    readonly a: ClashSide,
    readonly b: ClashSide,
    readonly site: MeasureSite,
    readonly axisName?: string
  ) {
    super(MeasureClash.message(a, b, site, axisName));
    this.name = "MeasureClash";
  }

  /** This clash with its axis named, or itself when it has no axis or is
   *  already named. */
  named(name: (axis: 0 | 1) => string): MeasureClash {
    return this.site.axis === undefined || this.axisName !== undefined
      ? this
      : new MeasureClash(this.a, this.b, this.site, name(this.site.axis));
  }

  static message(
    a: ClashSide,
    b: ClashSide,
    site: MeasureSite,
    axisName: string | undefined
  ): string {
    const subject =
      site.axis === undefined
        ? "This chart combines"
        : `The ${axisName ?? (site.axis === 0 ? "x" : "y")} axis combines`;
    const side = (s: ClashSide) =>
      `"${s.unit}" (${s.names.map((n) => `"${n}"`).join(", ")})`;
    return (
      `${subject} two different units, ${side(a)} and ${side(b)} ` +
      `(${site.where}). One axis can show only one unit.\n` +
      `If they are the same kind of quantity, declare the same unit for ` +
      `their columns in the chart's schema, e.g. ` +
      `schema: { "${a.names[0]}": Schema.unit("${a.unit}") }.\n` +
      `If they are different kinds of quantity, each needs its own axis: ` +
      `give the inner chart its own w and h so it scales on its own.`
    );
  }
}
