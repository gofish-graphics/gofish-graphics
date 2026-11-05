// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { ColumnType, HasUnit, UnitTraits } from "./schema";

/**
 * Measures: what the values along an axis are amounts of, and in what unit.
 *
 * Units are checked by gradual typing with inference, in the style of F#'s
 * units of measure (and Siek and Vachharajani's gradual typing with
 * unification-based inference, 2008): a column whose
 * unit nobody declared has an UNKNOWN unit, a unit variable, which unifies
 * with anything. A declared unit (`Unit("USD")` or `"USD"` in a schema, `Unit.time()`'s
 * "instant", the "count" of `.count()`) is concrete, and two different
 * concrete units on one shared axis are a type error ({@link MeasureClash};
 * the join itself is `joinUnits` in underlyingSpace.ts).
 *
 * A quantity whose unit is declared is that unit, a concrete term: two
 * charts that each declare their own "value" column, one USD and one EUR,
 * share nothing. Only an UNKNOWN unit is a variable, named by its QUANTITY:
 * the column's declared quantity (`HasQuantity`, the `name` of its record),
 * else the column's name. The cells of `field(x).bin(p)` are amounts of
 * `x`'s quantity, in `x`'s unit. The same name is the same
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
 *
 * A unit also says what its amounts can do, its traits: whether they add
 * up (`CanAdd`, #1197). The traits belong to the unit, not to a column
 * (`HasUnit.traits`): `Unit(name, { traits: [Trait.summable()] })` defines
 * them, and a unit's name alone (`"USD"`) leaves them unknown. A unit is
 * its name, so every occurrence of one name is one unit, and where two
 * occurrences meet their
 * traits meet by one rule ({@link meetUnitTraits}): unknown and known is
 * known, and two known definitions that disagree are a loud error. They
 * meet in two places: among the columns of one chart, when its schema is
 * applied (`applySchema` in schema.ts), and across the whole figure, in the
 * type walk's {@link Units}. Every place that sums values checks the unit
 * of the values it sums ({@link checkSummable}).
 */

/** What one channel's values are amounts of, as its column says (pure data,
 *  carried by a datum value). */
export type Quantity = {
  /** Titles the axis and names the unit variable. */
  name: string;
  /** The declared unit, if any, with its traits when they are known.
   *  Absent: unknown, the variable `name`. */
  unit?: HasUnit;
  /** The column the values were read from, when they were read from one (a
   *  count or a share was not): what a schema declares a unit for. */
  column?: string;
};

// A declared unit is a `HasUnit` (schema.ts): its `unit` says which units
// are the same, and its `symbol` is what an axis title shows it by, "Pay
// (USD)". A unit the user declares (`Unit(u)`, or `u`) has the symbol `u`.
// The engine's own units (INSTANT, DURATION, COUNT, a normalize share) have
// none: a count or a share is a plain number, and a time axis's ticks
// already read as dates. The engine's units are definitions: their traits
// are known.

/** The unit of a difference of two instants, `Unit.duration`: a duration,
 *  which adds up. */
export const DURATION = {
  unit: "duration",
  traits: { CanAdd: {} },
} satisfies HasUnit;

/** The unit of a time column, an instant, without its zone: `Unit.time({
 *  zone })` adds the zone, the calendar its values read on. Instants do not
 *  add up, and their difference is a duration (`difference`, which
 *  `differenceUnits` in underlyingSpace.ts reads). */
export const INSTANT = {
  unit: "instant",
  traits: {},
  difference: DURATION,
} satisfies HasUnit;

/** The unit `.count()` and `.distinct()` declare. Counts add up. */
export const COUNT = {
  unit: "count",
  traits: { CanAdd: {} },
} satisfies HasUnit;

/** The quantities {@link columnQuantity} has made, by column type and
 *  column: one object per column, so the marks that read a column share its
 *  quantity, and a list of quantities (`summands` in underlyingSpace.ts, the
 *  sums waiting in {@link Units}) holds it once. */
const columnQuantities = new WeakMap<ColumnType, Map<string, Quantity>>();

/** The {@link Quantity} of column `column`, whose type is `type`: its
 *  declared unit, with the unit's zone when its values are instants. */
export const columnQuantity = (
  column: string,
  type: ColumnType | undefined
): Quantity => {
  if (type === undefined) return { name: column, column };
  let byColumn = columnQuantities.get(type);
  if (byColumn === undefined) {
    byColumn = new Map();
    columnQuantities.set(type, byColumn);
  }
  let q = byColumn.get(column);
  if (q === undefined) {
    q = {
      name: type.HasQuantity?.name ?? column,
      column,
      ...(type.HasUnit !== undefined ? { unit: type.HasUnit } : {}),
    };
    byColumn.set(column, q);
  }
  return q;
};

/** `xs` quoted and joined, for a message: `"a", "b"`. */
const quoteList = (xs: readonly string[]): string =>
  xs.map((x) => `"${x}"`).join(", ");

/** Whether values of quantity `q` may be summed (#1197): its unit has
 *  `CanAdd`, or it has no declared unit, or its unit's traits are unknown
 *  (a unit's name alone): gradual typing (#1125), what its unit can do is
 *  unknown, so it passes. */
export const addsUp = (q: Quantity): boolean =>
  q.unit?.traits === undefined || q.unit.traits.CanAdd !== undefined;

/**
 * Check that `where` may sum values of quantity `q` ({@link addsUp}). Else
 * the loud error names the column (or, for values read from none, the
 * quantity) and the unit, and says how to fix it. A unit whose difference
 * is in a unit of its own that adds up (an instant's, a duration) is summed
 * by its differences: the error says to subtract a reference first.
 */
export function checkSummable(q: Quantity | undefined, where: string): void {
  if (q === undefined || addsUp(q)) return;
  const what = whoOf(q);
  const unit = q.unit!.unit; // declared, or it would add up
  const difference = q.unit!.difference;
  if (difference?.traits?.CanAdd !== undefined)
    throw new Error(
      `${where} sums ${what}, in the unit "${unit}", which cannot be ` +
        `summed: two amounts in it do not add up, but their difference, in ` +
        `"${difference.unit}", does. Subtract a reference first, e.g. ` +
        `derive a column ${q.column ?? "value"} - start, or give the mark ` +
        `two positions (x: "start", x2: "end").`
    );
  throw new Error(
    `${where} sums ${what}, in the unit "${unit}", which cannot be ` +
      `summed: it has no CanAdd. If its amounts add up (money, counts, ` +
      `lengths), declare it with ` +
      `Unit("${unit}", { traits: [Trait.summable()] }). If ` +
      `they do not (temperatures, prices, rates), average them instead, ` +
      `e.g. field("${q.column ?? q.name}").mean().`
  );
}

/** One occurrence of a unit's definition, as {@link meetUnitTraits} reads
 *  it: the unit's traits there (undefined when they are unknown, a unit's
 *  name alone) and the values it is the unit of, which a message names
 *  ({@link whoOf}) only when it throws. */
export type UnitOccurrence = { traits?: UnitTraits; who: Quantity };

/** Who the values of quantity `q` are, for a message: its column, or, for
 *  values read from none (a count, a share), its name. */
export const whoOf = (q: Quantity): string =>
  q.column !== undefined
    ? `the column "${q.column}"`
    : `the values of "${q.name}"`;

/** How a definition of unit `name` with `traits` is written. */
const definitionOf = (name: string, traits: UnitTraits): string =>
  traits.CanAdd !== undefined
    ? `Unit(${JSON.stringify(name)}, { traits: [Trait.summable()] })`
    : `Unit(${JSON.stringify(name)})`;

/** Whether two known sets of traits are the same. */
const sameTraits = (a: UnitTraits, b: UnitTraits): boolean => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
};

/**
 * THE rule for two occurrences of the unit `name` that meet: a unit is its
 * name, so they are one unit, and its traits are what either knows.
 * Unknown traits (a unit's name alone) and known ones are the known ones;
 * two known definitions that disagree are a loud error naming both, since
 * one unit cannot both add up and not. It runs wherever occurrences meet:
 * among one chart's columns (`applySchema` in schema.ts) and across the
 * figure ({@link Units}).
 */
export function meetUnitTraits(
  name: string,
  a: UnitOccurrence,
  b: UnitOccurrence
): UnitOccurrence {
  if (b.traits === undefined) return a;
  if (a.traits === undefined) return b;
  if (sameTraits(a.traits, b.traits)) return a;
  const [yes, no] = a.traits.CanAdd !== undefined ? [a, b] : [b, a];
  throw new Error(
    `${capitalize(whoOf(yes.who))} and ${whoOf(no.who)} are both in the unit ` +
      `${JSON.stringify(name)}, but they define it differently: ` +
      `${definitionOf(name, yes.traits!)} and ` +
      `${definitionOf(name, no.traits!)}. A unit either adds up or does ` +
      `not: define it once and use it for both, e.g. const ` +
      `${identifierFor(name)} = ${definitionOf(name, yes.traits!)}.`
  );
}

const capitalize = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Meet `occurrence` with the occurrences of unit `name` in `met`
 *  ({@link meetUnitTraits}), and store what they meet to: the one
 *  store-or-meet over a map of a unit's occurrences by name. Returns the
 *  met occurrence. */
export function meetInto(
  met: Map<string, UnitOccurrence>,
  name: string,
  occurrence: UnitOccurrence
): UnitOccurrence {
  const before = met.get(name);
  const after =
    before === undefined
      ? occurrence
      : meetUnitTraits(name, before, occurrence);
  if (after !== before) met.set(name, after);
  return after;
}

/** A JS identifier a unit's definition could be bound to in an example, in
 *  a message: the unit's name when it is one, else `unit`. */
const identifierFor = (name: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : "unit";

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
export type UnitTerm =
  | ({ kind: "declared" } & HasUnit)
  | { kind: "unknown"; name: string };

/** The declared unit a unit variable's class is bound to, if any: what
 *  {@link resolveUnit} reads, without building a term. */
export const rootUnit = (v: UnitVar): HasUnit | undefined => findRoot(v).unit;

/** What a unit variable stands for now. */
export const resolveUnit = (v: UnitVar): UnitTerm => {
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

/** A string that names a unit: equal for two units iff they are one unit
 *  (as {@link sameUnitVar} decides for their variables). */
export const unitKey = (unit: UnitTerm): string =>
  unit.kind === "declared" ? `declared:${unit.unit}` : `unknown:${unit.name}`;

/**
 * The unit substitution of one type walk: the variable of each unknown
 * quantity's name, and the union-find over them. One per walk, so a binding
 * made anywhere in the figure holds everywhere in it.
 *
 * It is also where the figure's units meet: every declared unit the walk
 * reads ({@link unitOf}) meets the other occurrences of its name
 * ({@link meetUnitTraits}), wherever in the figure they are, and a sum the
 * walk takes ({@link Units.sum}) checks the unit's traits as the figure
 * knows them. A sum of a unit whose traits are still unknown waits, and is
 * checked when an occurrence that knows them is met, so the order in which
 * the walk meets them does not matter.
 */
export class Units {
  private readonly vars = new Map<string, UnitVar>();
  /** Each unit's traits as its occurrences have met so far, by name. */
  private readonly definitions = new Map<string, UnitOccurrence>();
  /** The sums of each unit, by name, that wait on its traits. */
  private readonly waiting = new Map<
    string,
    { q: Quantity; where: string }[]
  >();

  /** Meet the declared unit of quantity `q` with the figure's other
   *  occurrences of its name ({@link meetUnitTraits}), and check the sums
   *  that waited on its traits once they are known. */
  meet(q: Quantity): void {
    const unit = q.unit;
    if (unit === undefined) return;
    const name = unit.unit;
    const known = this.definitions.get(name);
    // Unknown traits, or the very traits already met, change nothing.
    if (
      known !== undefined &&
      (unit.traits === undefined || unit.traits === known.traits)
    )
      return;
    const { traits } = meetInto(this.definitions, name, {
      traits: unit.traits,
      who: q,
    });
    if (traits === undefined) return;
    const waiting = this.waiting.get(name);
    if (waiting === undefined) return;
    this.waiting.delete(name);
    if (traits.CanAdd !== undefined) return;
    for (const s of waiting) checkSummable(withTraits(s.q, traits), s.where);
  }

  /** Check that `where` may sum values of quantity `q`
   *  ({@link checkSummable}), with its unit's traits as the figure knows
   *  them. While they are unknown the check waits for an occurrence that
   *  knows them ({@link Units.meet}). */
  sum(q: Quantity, where: string): void {
    if (q.unit === undefined) return;
    this.meet(q);
    const name = q.unit.unit;
    const { traits } = this.definitions.get(name)!;
    if (traits !== undefined) {
      if (traits.CanAdd === undefined)
        checkSummable(withTraits(q, traits), where);
      return;
    }
    const waiting = this.waiting.get(name);
    if (waiting === undefined) this.waiting.set(name, [{ q, where }]);
    else if (!waiting.some((s) => s.q === q && s.where === where))
      waiting.push({ q, where });
  }

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

/** `q` with its unit's traits set to `traits`. */
const withTraits = (q: Quantity, traits: UnitTraits): Quantity => ({
  ...q,
  unit: { ...q.unit!, traits },
});

/** The unit of quantity `q`: its declared unit, a fresh concrete term that
 *  needs no substitution, which meets the figure's other occurrences of its
 *  name ({@link Units.meet}); else the variable of its name in the installed
 *  substitution ({@link currentUnits}). */
export const unitOf = (q: Quantity): UnitVar => {
  if (q.unit === undefined) return currentUnits().variable(q);
  currentUnits().meet(q);
  return declaredVar(q.name, q.unit, q.column);
};

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
 *  units. Two bound to one unit meet ({@link meetUnits}), so two instants in
 *  different zones throw. */
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
  const unit = ra.unit && rb.unit ? meetUnits(ra.unit, rb.unit) : undefined;
  rb.parent = ra;
  ra.unit = unit ?? ra.unit ?? rb.unit;
  ra.names = unionInOrder(ra.names, rb.names);
  ra.columns = unionInOrder(ra.columns, rb.columns);
  return ra;
}

/**
 * Two declared occurrences of one unit (one name) that meet in a class of
 * the union-find: the one `HasUnit` the class is bound to. It keeps a
 * symbol either side gives, so the title does not depend on which side met
 * first, and the zone either side reads its instants on. Two instants in
 * different zones are an error: the class lies on one axis, and an axis
 * reads one calendar.
 */
const meetUnits = (a: HasUnit, b: HasUnit): HasUnit => {
  const unit = a.symbol === undefined ? b : a;
  const zone = a.zone ?? b.zone;
  if (a.zone !== undefined && b.zone !== undefined && a.zone !== b.zone)
    throw new Error(
      `Two time columns on one axis are read in different time zones, ` +
        `"${a.zone}" and "${b.zone}". One axis reads one calendar: give both ` +
        `columns the same zone in Unit.time({ zone }).`
    );
  return unit.zone === zone ? unit : { ...unit, zone };
};

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
    const side = (s: ClashSide) => `"${s.unit}" (${quoteList(s.names)})`;
    // A schema declares a unit by column, so the example names a column of
    // one side, given the other side's unit. A side with no column is a
    // count or a share, whose unit no schema declares.
    const [named, other] = a.columns.length > 0 ? [a, b] : [b, a];
    const same =
      named.columns.length > 0
        ? `If they are the same kind of quantity, declare the same unit for ` +
          `their columns in the chart's schema, e.g. ` +
          `schema: { "${named.columns[0]}": "${other.unit}" }.\n`
        : "";
    return (
      `${subject} two different units, ${side(a)} and ${side(b)} ` +
      `(${site.where}). One axis can show only one unit.\n` +
      same +
      `If they are different kinds of quantity, each needs its own axis: ` +
      `place one chart apart from the other (e.g. with Constraint.position) ` +
      `so they do not share the axis. Two units on one shared axis wait on ` +
      `dual axes (#528).`
    );
  }
}
