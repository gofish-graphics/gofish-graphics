// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { ColumnType, HasCalendar, HasUnit } from "./schema";

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
 * A quantity whose unit is declared is that unit, a concrete term: two
 * charts that each declare their own "value" column, one USD and one EUR,
 * share nothing. Only an UNKNOWN unit is a variable, named by its QUANTITY:
 * the column's declared quantity (`HasQuantity`, from `Schema.quantity(name)`
 * or, for a column a transform derived from another such as `bin()`'s edges,
 * the source column's), else the column's name. The same name is the same
 * variable across the whole figure, and a binding holds for the whole
 * render: a column bound to USD on one axis is USD everywhere, so meeting
 * "count" on another axis is a clash. A declared unit and an unknown meet
 * only where `joinUnits` joins them. The substitution lives in one
 * {@link Units} per type walk, owned by the walk's root (the render
 * session's when there is one); the layout pass reads the same one.
 *
 * The unit decides which axes may share a scale. The quantity names title
 * the axis, followed by the unit's symbol when it has one: "Pay (USD)"
 * (`spaceTitle` in underlyingSpace.ts).
 */

/** What one channel's values are amounts of, as its column says (pure data,
 *  carried by a datum value). */
export type Quantity = {
  /** Titles the axis and names the unit variable. */
  name: string;
  /** The declared unit, if any. Absent: unknown, the variable `name`. */
  unit?: HasUnit;
  /** The column the values were read from, when they were read from one (a
   *  count or a share was not): what a schema declares a unit for. */
  column?: string;
  /** The calendar the values read on, when they are instants. */
  calendar?: HasCalendar;
};

// A declared unit is a `HasUnit` (schema.ts): its `unit` says which units
// are the same, and its `symbol` is what an axis title shows it by, "Pay
// (USD)". A unit the user declares (`Schema.unit(u)`) has the symbol `u`.
// The engine's own units (INSTANT, DURATION, COUNT, a normalize share) have
// none: a count or a share is a plain number, and a time axis's ticks
// already read as dates.

/** The unit a time column (`HasCalendar`) declares: an instant. Its zone is
 *  a display parameter, kept in the calendar. */
export const INSTANT: HasUnit = { unit: "instant" };

/** The unit of a difference of two instants: a duration. */
export const DURATION: HasUnit = { unit: "duration" };

/** The unit `.count()`, `.distinct()` and `bin()`'s `count` declare. */
export const COUNT: HasUnit = { unit: "count" };

/** The column type of a count column (`bin()`'s `count`). */
export const COUNT_COLUMN: ColumnType = { HasUnit: COUNT };

/** The {@link Quantity} of column `column`, whose type is `type`. */
export const columnQuantity = (
  column: string,
  type: ColumnType | undefined
): Quantity => {
  const unit = type?.HasUnit ?? (type?.HasCalendar ? INSTANT : undefined);
  return {
    name: type?.HasQuantity?.name ?? column,
    column,
    ...(unit !== undefined ? { unit } : {}),
    ...(type?.HasCalendar ? { calendar: type.HasCalendar } : {}),
  };
};

/**
 * A unit variable, as a node of the render's union-find. A root holds the
 * unit its class is bound to, if any, and the quantity names and columns in
 * its class (for messages). Read it with {@link resolveUnit}.
 */
export class UnitVar {
  /** @internal union-find parent; undefined at a root. */
  parent?: UnitVar;
  /** @internal at a root: the declared unit the class is bound to. */
  unit?: HasUnit;
  /** @internal at a root: the quantity names in the class. */
  names: string[];
  /** @internal at a root: the columns in the class, the keys a schema
   *  declares their unit by. */
  columns: string[];
  constructor(
    readonly name: string,
    column?: string
  ) {
    this.names = [name];
    this.columns = column === undefined ? [] : [column];
  }
  /** The resolved unit, so a printed or hashed space shows what it means. */
  toJSON(): string {
    const root = findRoot(this);
    return root.unit?.unit ?? `'${root.name}`;
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
 *  (named by one of its quantities). */
export type Unit =
  | ({ kind: "declared" } & HasUnit)
  | { kind: "unknown"; name: string };

/** What a unit variable stands for now. */
export const resolveUnit = (v: UnitVar): Unit => {
  const root = findRoot(v);
  return root.unit !== undefined
    ? { kind: "declared", ...root.unit }
    : { kind: "unknown", name: root.name };
};

/** Whether two unit variables are the same unit: one class, or two classes
 *  bound to the same declared unit. */
export const sameUnitVar = (a: UnitVar, b: UnitVar): boolean => {
  const ra = findRoot(a);
  const rb = findRoot(b);
  return ra === rb || (ra.unit !== undefined && ra.unit.unit === rb.unit?.unit);
};

/** A fresh unit variable for quantity `name` (read from `column`, if any),
 *  bound to `unit`, outside the substitution's names: a declared unit is a
 *  concrete term, so it binds no other quantity of that name. */
export const declaredVar = (
  name: string,
  unit: HasUnit,
  column?: string
): UnitVar => {
  const v = new UnitVar(name, column);
  v.unit = unit;
  return v;
};

/** `a` followed by the items of `b` it lacks, in order; `a` itself when `b`
 *  adds nothing. */
export const unionInOrder = <T>(a: T[], b: readonly T[]): T[] => {
  const added = b.filter((x, i) => !a.includes(x) && b.indexOf(x) === i);
  return added.length === 0 ? a : [...a, ...added];
};

/**
 * The unit substitution of one type walk: the variable of each unknown
 * quantity's name, and the union-find over them. One per walk, so a binding
 * made anywhere in the figure holds everywhere in it.
 */
export class Units {
  private readonly vars = new Map<string, UnitVar>();

  /** The variable of unknown quantity `q`'s name, shared by every unknown
   *  quantity of that name. */
  variable(q: Quantity): UnitVar {
    let v = this.vars.get(q.name);
    if (v === undefined) {
      v = new UnitVar(q.name);
      this.vars.set(q.name, v);
    }
    if (q.column !== undefined) {
      const root = findRoot(v);
      root.columns = unionInOrder(root.columns, [q.column]);
    }
    return v;
  }
}

/** The unit of quantity `q`: its declared unit, a fresh concrete term that
 *  needs no substitution; else the variable of its name in the installed
 *  one ({@link currentUnits}). */
export const unitOf = (q: Quantity): UnitVar =>
  q.unit !== undefined
    ? declaredVar(q.name, q.unit, q.column)
    : currentUnits().variable(q);

let current: Units | undefined;

/** Run `f` with `units` as the walk's substitution: every datum value that
 *  becomes a space inside `f` takes its unit variable from it. The root of
 *  the type walk (`GoFishNode.resolveUnderlyingSpace`) and of the layout pass
 *  (`GoFishNode.layout`) install the one the root owns. */
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

/** The installed substitution. Every read of a unit happens inside the type
 *  walk, the embedding pass or the layout pass, which install it, so a read
 *  outside them is an engine bug. */
export const currentUnits = (): Units => {
  if (current === undefined) {
    throw new Error(
      "Internal error: a unit was read outside the type walk, the embedding " +
        "pass and the layout pass, which install the walk's unit " +
        "substitution (withUnits in measure.ts)."
    );
  }
  return current;
};

/** Bind two unit variables to one class, for the whole render. Two classes
 *  bound to different declared units are a {@link MeasureClash}: two
 *  declared units on one shared axis, or one unknown bound to two declared
 *  units. */
export function unify(a: UnitVar, b: UnitVar, site: MeasureSite): UnitVar {
  const ra = findRoot(a);
  const rb = findRoot(b);
  if (ra === rb) return ra;
  if (ra.unit !== undefined && rb.unit !== undefined && !sameUnitVar(ra, rb)) {
    throw new MeasureClash(
      { unit: ra.unit.unit, names: ra.names, columns: ra.columns },
      { unit: rb.unit.unit, names: rb.names, columns: rb.columns },
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
  ra.names = unionInOrder(ra.names, rb.names);
  ra.columns = unionInOrder(ra.columns, rb.columns);
  return ra;
}

/** Where two measures meet: the axis (0 or 1) when the clash is on an axis,
 *  and a plain phrase for the composition, read as "(... )" in the message,
 *  e.g. "where marks are lined up". */
export type MeasureSite = { axis?: 0 | 1; where: string };

/** One side of a clash: its declared unit, and the quantities and columns
 *  bound to it (no columns when its values are a count or a share). */
export type ClashSide = { unit: string; names: string[]; columns: string[] };

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
    // A schema declares a unit by column, so the example names a column of
    // one side, given the other side's unit. A side with no column is a
    // count or a share, whose unit no schema declares.
    const [named, other] = a.columns.length > 0 ? [a, b] : [b, a];
    const same =
      named.columns.length > 0
        ? `If they are the same kind of quantity, declare the same unit for ` +
          `their columns in the chart's schema, e.g. ` +
          `schema: { "${named.columns[0]}": Schema.unit("${other.unit}") }.\n`
        : "";
    return (
      `${subject} two different units, ${side(a)} and ${side(b)} ` +
      `(${site.where}). One axis can show only one unit.\n` +
      same +
      `If they are different kinds of quantity, each needs its own axis: ` +
      `give the inner chart its own w and h so it scales on its own.`
    );
  }
}
