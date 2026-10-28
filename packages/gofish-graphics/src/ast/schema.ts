// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { StackOrigin } from "./constraints/distribute";
import { loadTemporal, temporal } from "./calendar";
import { tagArray } from "./data";
import { DURATION, INSTANT, meetInto, type UnitOccurrence } from "./measure";
import { levelsDomain } from "../families/domain";

/**
 * Column types (#984): `chart(data, { schema })` declares, per column, the
 * classes (capabilities) its values have, in the style of typeclasses. The
 * engine reasons over the classes, never over the builder words that declare
 * them:
 *
 *  - {@link HasLevels}: the column's values are the levels of a finite
 *    domain, declared with a unit's `domain`:
 *    `Domain.discrete(levels)` or `Domain.ordered(levels)`. Every `by`
 *    split over the column lays its groups out in the order of the list, a
 *    categorical color scale over it lists its domain in that order, and a
 *    value outside the list is an error where the levels are used.
 *  - {@link HasOrder}: the levels are ordered, first to last. Declared with
 *    `Domain.ordered(levels)`. The levels of `Domain.discrete(levels)` are
 *    nominal: they keep the list's order for display, but an ordinal axis
 *    over them treats its groups as unordered (it centers its outer
 *    labels), and they cannot have a midpoint.
 *  - {@link HasMidpoint}: the order has a midpoint, a point along it.
 *    Declared with `Trait.diverging(midpoint?)` in the unit's `traits`,
 *    over a `Domain.ordered` domain. A stack over the column puts its
 *    origin (its 0) at the midpoint.
 *  - {@link HasUnit}: the column's values are amounts. Declared with a
 *    unit in the column's entry: a {@link Unit} definition (`Unit("USD")`),
 *    which says what unit the values are in and what the unit can do (its
 *    {@link UnitClasses}), or a unit's name alone (`"USD"`), which says
 *    nothing about what the unit can do. Without it a column's unit is
 *    unknown and unifies with any other (`measure.ts`). The unit's classes
 *    belong to the unit, not to the column: every occurrence of one unit's
 *    name is one unit, and their classes meet by one rule
 *    (`meetUnitClasses` in measure.ts), here among one chart's columns and
 *    in the type walk across the figure. A time is a column in a unit read
 *    on a calendar: `Unit.time({ zone })`, the instant, whose `zone` is a
 *    parameter of the unit. A column of JS `Date` values is in it without a
 *    schema entry. Its values become epoch milliseconds (UTC) when the
 *    schema is applied, and an axis over them is a time axis whose ticks are
 *    calendar cells (calendar.ts). An instant has no zero.
 *  - {@link HasQuantity}: what the column's values are amounts of, its
 *    quantity, when that is not the column's name. Declared with the
 *    `name` of a column record, `{ name: "Pay", unit: USD }`. The quantity
 *    titles the axis and names the unit variable.
 *  - {@link HasDomain}: the interval `[lo, hi]` the column's values span in
 *    the data it was typed with. Never declared: {@link applySchema} computes
 *    it for every column of finite numbers (a time's are epoch
 *    milliseconds), once, before any split, so every group of a split reads
 *    the same domain off its column type. The cells of `field(x).bin(p)` are
 *    over it (cells.ts).
 *  - {@link HasInteger}: the column's values are integers. JS has one number
 *    type, so a JS column never has it; a host's decode attaches it to a
 *    column that arrived as integers (a Python int64 column, decoded from
 *    Arrow), and the host's encode reads it to send the column back as
 *    integers. Nothing in the engine reads it.
 *
 * A unit definition ({@link Unit}) stands for every class but HasQuantity,
 * HasDomain and HasInteger: its name is the column's HasUnit (with CanAdd
 * when its traits say `Trait.summable()`), its `domain` is HasLevels (and
 * HasOrder for `Domain.ordered`), and `Trait.diverging()` is HasMidpoint.
 *
 * A column made from another keeps that column's type: the cells of
 * `field(x).bin(p)` are amounts of `x`'s quantity, in `x`'s unit, and a
 * `.count()` is a count.
 *
 * A column type is a record keyed by class name, so a later class (`HasZero`,
 * `HasCycle`, ...) is one more optional key. The record is also the wire form:
 * {@link columnTypeOf} turns every schema entry into it, {@link schemaToWire}
 * writes it, and `chart` accepts it as is (that is what arrives from Python,
 * which turns its entries into it the same way).
 *
 * The types ride the chart's data ARRAY under {@link COLUMN_TYPES}, so an
 * operator reads a column's type off the data it splits.
 */

/** One level of a column with a declared domain. */
export type Level = string | number;

/** The class of a column whose values are the levels of a finite domain,
 *  declared with a unit's `domain` (`Domain.discrete(levels)`,
 *  `Domain.ordered(levels)`). The list's order is the order its
 *  groups are laid out and listed in. */
export type HasLevels = { levels: readonly Level[] };

/** The class of a column whose levels ({@link HasLevels}) are ordered, first
 *  to last (`Domain.ordered(levels)`). It has no options: the order is the levels'
 *  list. It requires {@link HasLevels}. */
export type HasOrder = Record<string, never>;

/** The class of an ordered column whose order has a midpoint: the point `at`
 *  along the order, in edge coordinates. 0 is the first level's leading
 *  edge, `n` is the last level's trailing edge (`n` levels), and level `i`
 *  spans `[i, i + 1]`, so 2.25 has two levels and a quarter of the third
 *  before it. `Trait.diverging()` defaults it to `n / 2`: the middle of the
 *  middle level when `n` is odd, the boundary between the two middle levels
 *  when it is even. It requires {@link HasOrder}, and `0 <= at <= n`. */
export type HasMidpoint = { at: number };

/** The class of a column whose values are integers. It has no options. */
export type HasInteger = Record<string, never>;

/** The class of a column whose values are amounts in a declared unit:
 *
 *  - `unit`: the unit's name (`Unit("USD")`, or `"USD"`). Two units are the
 *    same when their names are equal, and two different units never share
 *    an axis. A column without this class has an unknown unit, a unit
 *    variable that unifies with any unit (`measure.ts`).
 *  - `symbol`: what an axis title appends to show the unit, "Pay (USD)". A
 *    unit the user declares has its name as its symbol. The engine's own
 *    units (the "count" of `.count()`) have none, so their axes add nothing.
 *  - `classes`: what the unit can do ({@link UnitClasses}), when it is
 *    known: a {@link Unit} definition's classes, or the engine's own for its
 *    units (an instant has none; a count, a share and a duration add up).
 *    Absent when the unit was declared by its name alone (`"USD"`): what it
 *    can do is unknown, so a sum of it passes, as a sum of a column with no
 *    declared unit does, until an occurrence of the same name that knows it
 *    is met (`meetUnitClasses` in measure.ts).
 *  - `zone`: set when the values are instants read on a calendar
 *    (`Unit.time({ zone })`): epoch milliseconds, UTC, read on the calendar
 *    of the IANA time zone `zone`. The zone decides where calendar cells
 *    start (a day starts at local midnight) and how labels read. It is a
 *    parameter of the unit, not part of its name: two time columns in
 *    different zones are both in the instant, and one axis over both is an
 *    error, since an axis reads one calendar (`unify` in measure.ts, where
 *    the two meet).
 *  - `difference`: the unit of a difference of two amounts in this one, when
 *    it is not this unit itself. A difference of two instants is a duration
 *    (`Unit.duration`), which adds up although instants do not. Absent, a
 *    difference is in the same unit: two amounts in USD differ by USD
 *    (`differenceUnits` in underlyingSpace.ts). Only the engine's own units
 *    set it today.
 */
export type HasUnit = {
  unit: string;
  symbol?: string;
  classes?: UnitClasses;
  zone?: string;
  difference?: HasUnit;
};

/** The class of a unit whose amounts can be added
 *  (`Unit(name, { traits: [Trait.summable()] })`):
 *  a sum of them is an amount in the same unit, and it starts from 0. It has
 *  no options. The instant, a time's unit, never has it, because two
 *  instants do not add. */
export type CanAdd = Record<string, never>;

/** The class of a column whose values are amounts of the quantity `name`
 *  (`{ name: "Pay", unit: USD }`), when that is not the column's own name.
 *  Columns of one quantity share one unit variable, and the quantity titles
 *  the axis: the five summary columns of a box plot can all be "Pay". */
export type HasQuantity = { name: string };

/** The class of a column of finite numbers (or instants, as epoch
 *  milliseconds): its DOMAIN, the interval `[lo, hi]` from its least value
 *  to its greatest in the data it was typed with (the chart's data, or a
 *  `derive`'s result), missing values aside. {@link applySchema} computes
 *  it; a split leaf and a `filter`'s result keep it with the rest of the
 *  column's type ({@link copyColumnTypes}), and a `derive` computes its
 *  result's own. A binned key's cells cover it (cells.ts), so every group
 *  of a split over the column has the same cells, whatever rows it holds. */
export type HasDomain = { lo: number; hi: number };

/** A column's type: the classes it has, keyed by class name. */
export type ColumnType = {
  HasLevels?: HasLevels;
  HasOrder?: HasOrder;
  HasMidpoint?: HasMidpoint;
  HasUnit?: HasUnit;
  HasQuantity?: HasQuantity;
  HasDomain?: HasDomain;
  HasInteger?: HasInteger;
};

/** Whether `v` is a time column's value as the engine reads it: epoch
 *  milliseconds, a finite number, or missing (null, undefined). */
const isEpochMs = (v: unknown): boolean =>
  v == null || (typeof v === "number" && Number.isFinite(v));

/** Which values each class accepts as they stand, without reinterpreting
 *  them, given the class's own record. A missing value (null, undefined)
 *  fits every class.
 *
 *  - `HasLevels`: text or numbers, the kinds its levels are. A value outside
 *    the levels still fits, so the levels stay and their stray-level error
 *    fires where they are used.
 *  - `HasOrder`, `HasMidpoint`: anything; their values are the levels'.
 *  - `HasUnit`: numbers, the amounts the unit measures. In a unit read on a
 *    calendar (one with a `zone`), an instant: epoch milliseconds (a finite
 *    number) or a valid `Date`. A `Date` is an instant, so turning it into
 *    epoch milliseconds reinterprets nothing; a string is not one, since
 *    reading it needs a zone (only a `schema` annotation converts strings).
 *  - `HasQuantity`: anything; a name says nothing about the values.
 *  - `HasDomain`: numbers from `lo` to `hi`.
 *  - `HasInteger`: integers. */
const ACCEPTS: {
  [K in keyof ColumnType]-?: (
    v: unknown,
    c: NonNullable<ColumnType[K]>
  ) => boolean;
} = {
  HasLevels: (v) => v == null || typeof v === "string" || typeof v === "number",
  HasOrder: () => true,
  HasMidpoint: () => true,
  HasUnit: (v, { zone }) =>
    v == null ||
    (zone !== undefined ? isEpochMs(v) || isDate(v) : typeof v === "number"),
  HasQuantity: () => true,
  HasDomain: (v, { lo, hi }) =>
    v == null || (typeof v === "number" && lo <= v && v <= hi),
  HasInteger: (v) => v == null || Number.isInteger(v),
};

/** Whether `v` is a valid `Date`. */
const isDate = (v: unknown): boolean =>
  v instanceof Date && Number.isFinite(v.getTime());

const CLASSES = Object.keys(ACCEPTS) as (keyof ColumnType)[];

/** The first class of `type` that does not accept `v` ({@link ACCEPTS}). */
const rejectingClass = (
  type: ColumnType,
  v: unknown
): keyof ColumnType | undefined =>
  CLASSES.find(
    (k) =>
      type[k] !== undefined &&
      !(ACCEPTS[k] as (v: unknown, c: unknown) => boolean)(v, type[k])
  );

/** Whether one value fits a column type as it stands: every class the type
 *  has accepts it ({@link ACCEPTS}). */
const fitsType =
  (type: ColumnType) =>
  (v: unknown): boolean =>
    rejectingClass(type, v) === undefined;

/** The column types of a dataset, keyed by column name. */
export type ColumnTypes = Record<string, ColumnType>;

/** The classes of a unit, what its amounts can do, keyed by class name: a
 *  {@link Unit} definition's, which every column in the unit shares. A later
 *  class of units (`HasZero`, ...) is one more optional key. */
export type UnitClasses = { CanAdd?: CanAdd };

/** A trait that the order of a unit's levels has a midpoint
 *  (`Trait.diverging(midpoint?)`): its columns have {@link HasMidpoint}. It
 *  needs an ordered domain (`Domain.ordered`). Without `midpoint`, the
 *  midpoint is the middle of the order. */
export type DivergingTrait = {
  readonly kind: "diverging";
  readonly midpoint?: number;
};

/** A trait that a unit's amounts add up (`Trait.summable()`): the unit has
 *  {@link CanAdd}. */
export type SummableTrait = { readonly kind: "summable" };

/** A capability of a unit's values, one entry of a unit definition's
 *  `traits` (the `Trait` family, `families/trait.ts`). */
export type Trait = DivergingTrait | SummableTrait;

/** The kinds of {@link Trait}. */
const TRAIT_KINDS: readonly Trait["kind"][] = ["diverging", "summable"];

/** A finite domain of levels, in the order to lay them out in: unordered
 *  (`Domain.discrete(levels)`, nominal) or ordered first to last
 *  (`Domain.ordered(levels)`, ordinal). */
export type LevelsDomain = {
  readonly kind: "discrete" | "ordered";
  readonly levels: readonly Level[];
};

/** What a unit's values are, a unit definition's `domain` (the `Domain`
 *  family, `families/domain.ts`). An interval (`Domain.continuous`) comes
 *  later. */
export type Domain = LevelsDomain;

/** What a unit definition takes besides its name: its `domain`, what its
 *  values are, and its `traits`, the capabilities they have. */
export type UnitOptions = {
  /** The unit's values: `Domain.discrete(levels)` or
   *  `Domain.ordered(levels)`. Without it, a named unit's values are
   *  amounts (numbers). */
  domain?: Domain;
  /** The capabilities of the unit's values: `Trait.diverging(midpoint?)`,
   *  `Trait.summable()`. */
  traits?: readonly Trait[];
};

/** The classes a unit definition gives every column in it: its name's
 *  {@link HasUnit}, its domain's {@link HasLevels}, and the classes its
 *  traits declare. */
export type UnitType = Pick<
  ColumnType,
  "HasUnit" | "HasLevels" | "HasOrder" | "HasMidpoint"
>;

/**
 * A unit definition (`Unit("USD", { traits: [Trait.summable()] })`,
 * `Unit.time()`): the classes every column in the unit has (`type`). It is
 * immutable, and is meant to be declared once and used by every column in
 * the unit.
 */
export class UnitDefinition {
  constructor(readonly type: UnitType) {
    for (const c of Object.values(type)) freezeDeep(c);
    Object.freeze(type);
    Object.freeze(this);
  }

  /** The unit's name, if it has one: two units are the same when their
   *  names are equal. */
  get name(): string | undefined {
    return this.type.HasUnit?.unit;
  }
}

/** Freeze a class record and every record and list in it, so every column in
 *  a unit shares the one record. */
function freezeDeep(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const v of Object.values(value)) freezeDeep(v);
  Object.freeze(value);
}

/** A unit definition ({@link UnitDefinition}). */
export type Unit = UnitDefinition;

/** How the unit `name` is written in a message. */
const unitWho = (name: string | undefined): string =>
  name === undefined ? "Unit" : `Unit(${JSON.stringify(name)})`;

/**
 * A unit: `Unit(name, { domain, traits })`, or `Unit({ domain, traits })`
 * with no name. Its name (`"USD"`, `"mm"`) is its identity: two units are
 * the same when their names are equal, and a unit the user names has its
 * name as its symbol, which an axis title appends ("Pay (USD)"). Its
 * `domain` is a list of the levels its values take, and its `traits` the
 * capabilities its values have (the `Trait` family). A unit with a domain
 * but no name is a type of levels for the columns that use it, with no
 * unit for an axis to show.
 */
export function Unit(name: string, options?: UnitOptions): UnitDefinition;
export function Unit(options: UnitOptions): UnitDefinition;
export function Unit(
  nameOrOptions: string | UnitOptions,
  options?: UnitOptions
): UnitDefinition {
  if (typeof nameOrOptions === "string")
    return new UnitDefinition(unitTypeOf(nameOrOptions, options ?? {}));
  // Python's `Unit` raises the same message, word for word.
  if (
    options !== undefined ||
    nameOrOptions === null ||
    typeof nameOrOptions !== "object" ||
    Array.isArray(nameOrOptions)
  )
    throw new Error(
      `Unit: the name must be a string, got ${String(nameOrOptions)}`
    );
  return new UnitDefinition(unitTypeOf(undefined, nameOrOptions));
}

/** The classes of the unit `name` with `options` ({@link UnitType}),
 *  checked. Python's `Unit` raises the same messages, word for word. */
function unitTypeOf(name: string | undefined, options: UnitOptions): UnitType {
  const who = unitWho(name);
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new Error(
      `${who}: the options must be { domain, traits }, got ${String(options)}.`
    );
  const unknown = Object.keys(options).filter(
    (k) => k !== "domain" && k !== "traits"
  );
  if (unknown.length > 0)
    throw new Error(
      `${who} has the unknown ${unknown.length === 1 ? "option" : "options"} ` +
        `${unknown.map((k) => JSON.stringify(k)).join(", ")}. A unit takes ` +
        `domain and traits.`
    );
  const { domain, traits = [] } = options;
  if (
    domain !== undefined &&
    !(
      domain !== null &&
      typeof domain === "object" &&
      (domain.kind === "discrete" || domain.kind === "ordered") &&
      Array.isArray(domain.levels)
    )
  )
    throw new Error(
      `${who}: domain must be a Domain: Domain.discrete(levels) or ` +
        `Domain.ordered(levels), got ${JSON.stringify(domain) ?? String(domain)}. ` +
        `A domain that is an interval is not supported yet.`
    );
  // A domain written as a record, not with `Domain`, gets the same checks.
  if (domain !== undefined) levelsDomain(domain.kind, domain.levels);
  if (name === undefined && domain === undefined)
    throw new Error(
      `Unit needs a name, a domain, or both: Unit("USD"), ` +
        `Unit({ domain: Domain.discrete(["low", "high"]) }).`
    );
  if (!Array.isArray(traits))
    throw new Error(`${who}: traits must be a list of Trait values.`);
  const kinds = new Set<Trait["kind"]>();
  let midpoint: number | undefined;
  for (const trait of traits) {
    const kind = (trait as { kind?: unknown } | null)?.kind;
    if (!TRAIT_KINDS.includes(kind as Trait["kind"]))
      throw new Error(
        `${who} has the trait ${JSON.stringify(trait) ?? String(trait)}. A ` +
          `unit's traits are Trait.diverging() and Trait.summable().`
      );
    if (kinds.has(kind as Trait["kind"]))
      throw new Error(`${who} lists Trait.${String(kind)}() twice.`);
    kinds.add(kind as Trait["kind"]);
    if (kind === "diverging") midpoint = (trait as DivergingTrait).midpoint;
  }
  if (kinds.has("diverging") && domain?.kind !== "ordered")
    throw new Error(
      domain === undefined
        ? `${who}: Trait.diverging() needs an ordered domain: a midpoint is ` +
          `a point along an order, so list the levels in ` +
          `Domain.ordered(levels). A midpoint on a unit's amounts is not ` +
          `supported yet.`
        : `${who}: Trait.diverging() needs an ordered domain, but ` +
          `Domain.discrete(levels) is unordered. A midpoint is a point ` +
          `along an order: use Domain.ordered(levels).`
    );
  if (kinds.has("summable") && name === undefined)
    throw new Error(
      `Unit: Trait.summable() needs a name. Whether amounts add up belongs ` +
        `to their unit, which is known by its name: ` +
        `Unit("USD", { traits: [Trait.summable()] }).`
    );
  const type: UnitType = {
    ...(name !== undefined
      ? {
          HasUnit: {
            unit: name,
            symbol: name,
            classes: kinds.has("summable") ? { CanAdd: {} } : {},
          },
        }
      : {}),
    ...(domain !== undefined
      ? { HasLevels: { levels: [...domain.levels] } }
      : {}),
    ...(domain?.kind === "ordered" ? { HasOrder: {} } : {}),
  };
  if (kinds.has("diverging")) {
    const levels = domain!.levels;
    const at = midpoint ?? levels.length / 2;
    checkMidpointOnOrder(levels, at);
    type.HasMidpoint = { at };
  }
  checkLevelsFit(who, type);
  return type;
}

/** The unit of instants read on the calendar of `zone`, an IANA time zone
 *  (`"UTC"` by default). A column in it is a time: a value may be an ISO 8601
 *  string ("2024-03-05" is the start of that day in `zone`; a string without
 *  an offset is a wall-clock time in `zone`), a `Date`, or epoch
 *  milliseconds, and an axis over it is a time axis. Instants do not add up;
 *  a difference of two is in {@link Unit.duration}. A column of JS `Date`
 *  values is in `Unit.time()` without a schema entry. */
Unit.time = ({ zone = "UTC" }: { zone?: string } = {}): UnitDefinition =>
  new UnitDefinition({ HasUnit: { ...INSTANT, zone } });

/** The unit of a span of time, a difference of two instants
 *  ({@link Unit.time}). Durations add up. */
Unit.duration = new UnitDefinition({ HasUnit: DURATION });

/** A column record in `chart`'s `schema`: the quantity the column's values
 *  are amounts of (`name`, `HasQuantity`), and the unit they are in
 *  (`unit`): a {@link Unit} definition, which gives the column every class
 *  of the unit's type ({@link UnitType}), or a unit's name alone. */
export type ColumnRecord = { name?: string; unit?: Unit | string };

/** The keys a {@link ColumnRecord} takes. */
const RECORD_KEYS: readonly string[] = ["name", "unit"];

/** What `chart`'s `schema` option takes per column: a column record, or
 *  one of its two shorthands: a {@link Unit} for `{ unit }`, and a unit's name for
 *  `{ unit: name }`. The engine also reads the record of classes every entry
 *  stands for (the wire form, which Python sends), which is not a user form.
 *  A column's domain ({@link HasDomain}) is computed from its values;
 *  declaring one is not supported yet. */
export type SchemaEntry =
  | Unit
  | string
  | ColumnRecord
  | Omit<ColumnType, "HasDomain">;

/** The classes of a column in `unit`: a definition's ({@link UnitType}), or
 *  a name alone, whose classes are unknown. */
const unitType = (unit: Unit | string): ColumnType =>
  typeof unit === "string" ? { HasUnit: { unit, symbol: unit } } : unit.type;

/** The record of classes a schema entry stands for, before any check: a
 *  unit's ({@link unitType}), a column record's, or the record itself (the
 *  wire form). An object with any other key throws. */
function classesOf(who: string, entry: SchemaEntry): ColumnType {
  if (entry instanceof UnitDefinition || typeof entry === "string")
    return unitType(entry);
  if (entry === null || typeof entry !== "object")
    throw new Error(
      `${who} has the entry ${String(entry)}. A column's entry is a Unit, a ` +
        `unit's name, or a column record { name, unit }.`
    );
  const keys = Object.keys(entry);
  if (keys.every((k) => (CLASSES as string[]).includes(k)))
    return entry as ColumnType;
  const unknown = keys.filter((k) => !RECORD_KEYS.includes(k));
  if (unknown.length > 0)
    throw new Error(
      `${who} has the unknown ${unknown.length === 1 ? "key" : "keys"} ` +
        `${unknown.map((k) => JSON.stringify(k)).join(", ")}. A column ` +
        `record takes name and unit: { name: "Pay", unit: Unit("USD") }.`
    );
  const { name, unit } = entry as ColumnRecord;
  if (name !== undefined && typeof name !== "string")
    throw new Error(`${who} has the name ${String(name)}, which is not text.`);
  if (
    unit !== undefined &&
    typeof unit !== "string" &&
    !(unit instanceof UnitDefinition)
  )
    throw new Error(
      `${who} has the unit ${String(unit)}, which is neither a Unit nor a ` +
        `unit's name.`
    );
  return {
    ...(name !== undefined ? { HasQuantity: { name } } : {}),
    ...(unit !== undefined ? unitType(unit) : {}),
  };
}

/** A schema as the wire carries it: each entry's record of classes
 *  ({@link classesOf}), as Python's `chart` writes it. */
export const schemaToWire = (
  schema: Record<string, SchemaEntry>
): Record<string, ColumnType> =>
  Object.fromEntries(
    Object.entries(schema).map(([column, entry]) => [
      column,
      classesOf(`schema: column "${column}"`, entry),
    ])
  );

/** The record a schema entry stands for ({@link classesOf}), checked for the
 *  rules `Unit` enforces (a record from the wire, as Python sends it, is
 *  not a `Unit`): its levels must fit ({@link checkLevelsFit}), an order
 *  needs levels, and a midpoint needs an order and must lie on it, with the
 *  same check `Trait.diverging()` runs. */
export function columnTypeOf(column: string, entry: SchemaEntry): ColumnType {
  const who = `schema: column "${column}"`;
  const type = classesOf(who, entry);
  if (type.HasDomain !== undefined)
    throw new Error(
      `${who} declares HasDomain ${JSON.stringify(type.HasDomain)}, but ` +
        `declaring a column's domain is not supported yet: a column's ` +
        `domain is computed from its values. Drop HasDomain from the ` +
        `schema.`
    );
  checkLevelsFit(who, type);
  if (type.HasOrder !== undefined && type.HasLevels === undefined)
    throw new Error(
      `${who} has HasOrder but no HasLevels. An order is an order of ` +
        `levels; declare them with a unit's domain: ` +
        `Unit({ domain: Domain.ordered(levels) }).`
    );
  if (type.HasMidpoint === undefined) return type;
  if (type.HasOrder === undefined)
    throw new Error(
      `${who} has HasMidpoint but no HasOrder. A midpoint is a point along ` +
        `an order; declare it with ` +
        `Unit({ domain: Domain.ordered(levels), traits: [Trait.diverging()] }).`
    );
  checkMidpointOnOrder(type.HasLevels!.levels, type.HasMidpoint.at);
  return type;
}

/** The rule that a column's levels fit its other classes: each level is one
 *  of the column's values, so every class must accept it ({@link ACCEPTS}).
 *  Text levels are not amounts, so `Unit("pts", { domain: Domain.discrete(["low", "high"]) })`
 *  throws, while a rating's levels `[1, 2, 3, 4, 5]` take a unit. Python's
 *  `Unit` and `chart` raise the same message. */
function checkLevelsFit(who: string, type: ColumnType): void {
  for (const level of type.HasLevels?.levels ?? []) {
    const rejects = rejectingClass(type, level);
    if (rejects !== undefined) {
      throw new Error(
        `${who} has the level ${showLevel(level)}, which is not a value ${rejects} accepts.`
      );
    }
  }
}

/** The loud error for a midpoint off its order: `at` must be a finite number
 *  from 0 to `n`, for `n` levels. Python's `Unit` raises the same two
 *  messages, word for word. */
function checkMidpointOnOrder(levels: readonly Level[], at: unknown): void {
  const n = levels.length;
  const order = `the edges of the order [${levels.map(showLevel).join(", ")}]`;
  if (typeof at !== "number" || !Number.isFinite(at)) {
    throw new Error(
      `diverging: midpoint must be a finite number from 0 to ${n}, ${order}.`
    );
  }
  if (at < 0 || at > n) {
    throw new Error(
      `diverging: midpoint ${String(at)} is outside 0..${n}, ${order}.`
    );
  }
}

/**
 * Well-known symbol under which a data ARRAY carries its column types. It
 * rides the array, not each row, and is non-enumerable, so it never leaks
 * into a `{...d}` spread.
 */
export const COLUMN_TYPES: unique symbol = Symbol.for("gofish.columnTypes");

/** The column types a data array carries, if any. */
export const getColumnTypes = (data: unknown): ColumnTypes | undefined =>
  data != null
    ? ((data as any)[COLUMN_TYPES] as ColumnTypes | undefined)
    : undefined;

/** The type of `column` in `data`, if the data declares one. */
export const columnType = (
  data: unknown,
  column: string | undefined
): ColumnType | undefined =>
  column === undefined ? undefined : getColumnTypes(data)?.[column];

/** Tag a data array with column types. */
export const setColumnTypes = <T>(data: T, types: ColumnTypes): T =>
  tagArray(data, COLUMN_TYPES, types);

/** Copy `source`'s column types onto `target` (both arrays), for every
 *  column `target` does not type itself. A split leaf or a filter's result
 *  is a fresh array, so it has to be told. Without it, a mark channel over a
 *  split leaf would lose its column's order, time, unit, and quantity (see
 *  `resolveColumn`), and a binned key its domain ({@link HasDomain}). */
export const copyColumnTypes = <T>(target: T, source: unknown): T => {
  const types = getColumnTypes(source);
  if (types === undefined) return target;
  const own = getColumnTypes(target);
  return setColumnTypes(
    target,
    own === undefined ? types : { ...types, ...own }
  );
};

const showLevel = (level: unknown): string =>
  typeof level === "string" ? JSON.stringify(level) : String(level);

/** The loud error for values of a column with levels that its levels do
 *  not list. The user defines the levels, so GoFish never guesses where a
 *  stray value goes. */
export function strayLevelsError(column: string, strays: unknown[]): Error {
  return new Error(
    `schema: column "${column}" has ${strays.length === 1 ? "a value" : "values"} ` +
      `outside its levels: ${strays.map(showLevel).join(", ")}. HasLevels ` +
      `(declared with a unit's \`domain\`) lists every level of the ` +
      `column, so add ${strays.length === 1 ? "it" : "them"} to the levels, ` +
      `filter those rows out, or, if a derive changed the values, annotate ` +
      `the derive's result type with \`derive(fn, { schema })\`.`
  );
}

/**
 * Type `rows` with `schema`: a copy of the array carrying the column types.
 * The types are, each winning over the one before:
 *
 *  1. `inherited` (an operator's input's, for its result), but its domains
 *     ({@link HasDomain}), each kept only
 *     when every value of its column fits it as it stands
 *     ({@link ACCEPTS}). The inherited types never reinterpret or check the
 *     values: a column that no longer fits (a date rewritten to "Mar") just
 *     has no type. A column the rows do not hold fits (it has no values).
 *     A time column of `Date`s fits its inherited time, zone and all, and
 *     its Dates become epoch milliseconds below. Fitting reads values, not
 *     meanings: a time recoded to plain numbers (years) still fits, since
 *     any finite number is epoch milliseconds (#1089); `schema` fixes it.
 *  2. The types the array already carries, but their domains.
 *  3. `schema`'s.
 *
 * A column none of these type is a time column (in `Unit.time()`, UTC) when
 * its first non-null value is a JS `Date` (a column is a key of the first
 * row): inference is local, from the value alone, and a missing value says
 * nothing about the column. Strings and numbers are never inferred as time;
 * they need `Unit.time()`. Every time column's values become epoch milliseconds (see
 * {@link toEpochMs}); the rows are copied only when some value is not one
 * already. The copy leaves the caller's array untagged, so one array can
 * feed charts with different schemas.
 *
 * Then every column whose values are all finite numbers (missing values
 * aside, a time's values as epoch milliseconds) gets its domain
 * ({@link HasDomain}): the interval from its least value to its greatest, in
 * the rows typed here, or, for a list of refs (`chart(selectAll(...))`), in
 * `reached`, the rows they stand for. So the domain is decided once, here,
 * for every split after it; a `derive`'s result gets its own, and never its
 * input's. A `schema` that declares a domain is an error
 * ({@link columnTypeOf}): declaring one is not supported yet.
 *
 * It does not check the values against an order: a value outside an order is
 * an error where the order is used (`orderByLevels`), so a `filter` in the
 * flow can drop it first.
 */
export async function applySchema<T>(
  rows: T[],
  schema: Record<string, SchemaEntry> = {},
  inherited?: ColumnTypes,
  reached?: readonly unknown[]
): Promise<T[]> {
  const own = getColumnTypes(rows);
  const records = rows as unknown as (Record<string, unknown> | null)[];
  const types: ColumnTypes = {};
  // A domain is of the rows it was computed over, never of these. A type
  // that was only a domain is no type.
  const withoutDomain = ({
    HasDomain: _,
    ...rest
  }: ColumnType): ColumnType | undefined =>
    Object.keys(rest).length > 0 ? rest : undefined;
  for (const [column, inheritedType] of Object.entries(inherited ?? {})) {
    const type = withoutDomain(inheritedType);
    if (type === undefined) continue;
    const fits = fitsType(type);
    if (
      records.every(
        (r) => r == null || typeof r !== "object" || fits(r[column])
      )
    )
      types[column] = type;
  }
  for (const [column, ownType] of Object.entries(own ?? {})) {
    const type = withoutDomain(ownType);
    if (type !== undefined) types[column] = type;
  }
  for (const [column, entry] of Object.entries(schema)) {
    types[column] = columnTypeOf(column, entry);
  }
  meetChartUnits(types);
  // Date inference, in one pass over the rows: each untyped column of the
  // first row is resolved by its first non-null value.
  const unresolved = new Set(
    Object.keys(records.find((r) => r != null) ?? {}).filter(
      (column) => types[column] === undefined
    )
  );
  for (const r of records) {
    if (unresolved.size === 0) break;
    if (r == null) continue;
    for (const column of unresolved) {
      const v = r[column];
      if (v == null) continue;
      if (v instanceof Date) types[column] = Unit.time().type;
      unresolved.delete(column);
    }
  }
  // The columns in a unit read on a calendar, with its zone.
  const timeColumns = Object.entries(types).flatMap(([column, t]) =>
    t.HasUnit?.zone !== undefined ? [[column, t.HasUnit.zone] as const] : []
  );
  const isConverted = (row: T): boolean =>
    row == null ||
    typeof row !== "object" ||
    timeColumns.every(([column]) =>
      isEpochMs((row as Record<string, unknown>)[column])
    );
  let out: T[] = [...rows];
  if (timeColumns.length > 0) {
    await loadTemporal();
    for (const [column, zone] of timeColumns) checkZone(column, zone);
  }
  if (!rows.every(isConverted)) {
    // Long-format data repeats its dates, so each string is parsed once per
    // zone (for this call only).
    const parsed = new Map<string, unknown>();
    const epochMs = (v: unknown, zone: string, column: string): unknown => {
      if (typeof v !== "string") return toEpochMs(v, zone, column);
      const key = `${zone}\n${v}`;
      if (!parsed.has(key)) parsed.set(key, toEpochMs(v, zone, column));
      return parsed.get(key);
    };
    out = rows.map((row) => {
      if (row == null || typeof row !== "object") return row;
      const copy = { ...(row as Record<string, unknown>) };
      for (const [column, zone] of timeColumns) {
        if (column in copy) {
          copy[column] = epochMs(copy[column], zone, column);
        }
      }
      return copy as T;
    });
  }
  for (const [column, domain] of columnDomains(reached ?? out))
    types[column] = { ...types[column], HasDomain: domain };
  return Object.keys(types).length === 0 ? out : setColumnTypes(out, types);
}

/**
 * The units of one chart's column types (its schema, and the types its data
 * carries or inherits) meet, in place: every column in units of one name is
 * in one unit, so their classes meet by THE rule (`meetUnitClasses` in
 * measure.ts). Two definitions that disagree throw, and a column whose unit
 * is a name alone takes the classes a definition of that name gives, so
 * `"USD"` beside `Unit("USD", { traits: [Trait.summable()] })` adds up.
 *
 * This is the chart's share of the meeting. A chart's channels sum their
 * rows while the chart is built, before the type walk, so they read the
 * unit as the chart knows it. The rest of the figure's occurrences meet in
 * the type walk (`Units` in measure.ts), where a stack's sum waits for
 * them. TODO(#1197 follow-up): a sum taken while a chart is built (a size
 * channel, `.sum()`, treemap, cut, normalize) cannot see a definition in
 * another chart, which is met only in the walk; checking it there needs
 * the chart to be built inside the figure's walk scope.
 */
function meetChartUnits(types: ColumnTypes): void {
  const known = new Map<string, UnitOccurrence>();
  for (const [column, t] of Object.entries(types)) {
    const unit = t.HasUnit;
    if (unit === undefined) continue;
    meetInto(known, unit.unit, {
      classes: unit.classes,
      who: { name: column, column },
    });
  }
  for (const [column, t] of Object.entries(types)) {
    const unit = t.HasUnit;
    if (unit === undefined || unit.classes !== undefined) continue;
    const classes = known.get(unit.unit)!.classes;
    if (classes !== undefined)
      types[column] = { ...t, HasUnit: { ...unit, classes } };
  }
}

/** The domain ({@link HasDomain}) of each column of `rows` whose values are
 *  all finite numbers, missing values aside. A column with any other value
 *  has none. It is the one pass of `applySchema` over every value: type
 *  inference reads a column's first non-null value only, and the time
 *  conversion runs only when some time value is not epoch milliseconds, so
 *  neither has a scan to fold it into (about 0.5 ms for 10,000 rows of six
 *  columns). */
function columnDomains(rows: readonly unknown[]): Map<string, HasDomain> {
  // A column whose values are not all finite numbers maps to null.
  const domains = new Map<string, HasDomain | null>();
  for (const row of rows) {
    if (row == null || typeof row !== "object") continue;
    for (const column in row) {
      const v = (row as Record<string, unknown>)[column];
      if (v == null) continue;
      const d = domains.get(column);
      if (d === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v))
        domains.set(column, null);
      else if (d === undefined) domains.set(column, { lo: v, hi: v });
      else if (v < d.lo) d.lo = v;
      else if (v > d.hi) d.hi = v;
    }
  }
  return new Map(
    [...domains].filter((e): e is [string, HasDomain] => e[1] !== null)
  );
}

/** The zones {@link checkZone} has found valid. */
const knownZones = new Set<string>();

/** The loud error for a time zone Temporal does not know. */
function checkZone(column: string, zone: string): void {
  if (knownZones.has(zone)) return;
  try {
    temporal().Now.zonedDateTimeISO(zone);
    knownZones.add(zone);
  } catch {
    throw new Error(
      `schema: column "${column}" has the time zone ${JSON.stringify(zone)}, ` +
        `which is not an IANA time zone (e.g. "UTC", "America/New_York").`
    );
  }
}

const DATE_ONLY = /^[+-]?\d{4,6}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)(?:\[.*\])?$/;

/**
 * One value of a time column as epoch milliseconds (UTC). A number is already
 * one; a `Date` is its time; a string is ISO 8601: a date alone is the start
 * of that day in `zone`, a date-time with an offset (`Z`, `+05:00`) is that
 * instant, and a date-time without one is that wall-clock time in `zone`.
 * Missing values (null, undefined) stay missing. Anything else is a loud
 * error naming the column.
 */
export function toEpochMs(v: unknown, zone: string, column: string): unknown {
  if (isEpochMs(v)) return v;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.getTime();
  if (typeof v === "string") {
    const T = temporal();
    const s = v.trim();
    try {
      if (DATE_ONLY.test(s)) {
        return T.PlainDate.from(s).toZonedDateTime({ timeZone: zone })
          .epochMilliseconds;
      }
      if (HAS_OFFSET.test(s) && /\d[T ]\d/.test(s)) {
        return T.Instant.from(s.replace(" ", "T")).epochMilliseconds;
      }
      return T.PlainDateTime.from(s.replace(" ", "T")).toZonedDateTime(zone)
        .epochMilliseconds;
    } catch {
      // fall through to the error below
    }
  }
  throw new Error(
    `schema: column "${column}" is a time (Unit.time()), but has the value ` +
      `${typeof v === "string" ? JSON.stringify(v) : String(v)}, which is not ` +
      `an ISO 8601 date or date-time ("2024-03-05", "2024-03-05T14:30:00Z"), ` +
      `a Date, or epoch milliseconds.`
  );
}

/** Each level of `levels`, mapped to its rank (its index in the list). */
const levelRanks = (levels: HasLevels): Map<unknown, number> =>
  new Map(levels.levels.map((level, i) => [level, i]));

/** `keys` in the order of `levels`. A key the levels do not list is a stray
 *  level (a loud error). */
export function orderByLevels<K>(
  column: string,
  levels: HasLevels,
  keys: K[]
): K[] {
  const rank = levelRanks(levels);
  const strays = keys.filter((k) => !rank.has(k));
  if (strays.length > 0) throw strayLevelsError(column, strays);
  return [...keys].sort((a, b) => rank.get(a)! - rank.get(b)!);
}

/**
 * The {@link StackOrigin} of a stack over `column`, its part a child index,
 * whose children are the groups `keys` (in child order, laid out reversed
 * when `reverse`): the midpoint of the column's order, when the column has
 * {@link HasMidpoint}; else undefined (the default origin). `split` is every
 * level of the order, in the order the split puts groups in (the level order
 * after any `field(...).sort()` or `.reverse()`), and `keys` are the levels
 * the data has, in that order.
 *
 * The midpoint is defined by the ORDER, not by the parts present: a group the
 * data lacks moves nothing. Level `i` spans `[i, i + 1]` in the midpoint's
 * edge coordinates. When the midpoint falls inside a level whose part is
 * present, the origin is that far through the part. Otherwise it falls on a
 * boundary between present parts (a level edge, or a level the data lacks):
 * the tail of the first part laid out past it, or the head of the last part
 * when every part lies before it. A stack that lays the order out against
 * its levels measures the fraction from the other end, so the midpoint `at`
 * lands at `n - at` along the layout. The side of the midpoint a level lands
 * on comes from `split`, not from the parts present, so a row with one part
 * puts it where a row with every part does.
 */
export function stackOrigin(
  column: string | undefined,
  type: ColumnType | undefined,
  split: unknown[],
  keys: unknown[],
  reverse = false
): StackOrigin<number> | undefined {
  if (column === undefined || !type?.HasMidpoint || keys.length === 0)
    return undefined;
  const rank = levelRanks(type.HasLevels!);
  const midpoint = type.HasMidpoint.at;
  // The order's ranks as the stack lays the levels out: along the order (+1)
  // or against it (−1). It must be one or the other, or "before the
  // midpoint" is not a prefix.
  const laidOut = (reverse ? [...split].reverse() : split).map(
    (level) => rank.get(level)!
  );
  const dir = laidOut.length > 1 ? Math.sign(laidOut[1] - laidOut[0]) : 1;
  for (let p = 1; p < laidOut.length; p++) {
    if (Math.sign(laidOut[p] - laidOut[p - 1]) !== dir) {
      throw new Error(
        `stack({ by: "${column}" }): a centered stack lays its parts out in ` +
          `the order of "${column}" (or its reverse), but its \`by\` puts ` +
          `the levels in the order ${split.map(showLevel).join(", ")}. ` +
          `HasMidpoint (declared with \`Trait.diverging()\`) puts the stack's 0 at ` +
          `a point along that order, which needs the parts on each side of ` +
          `it together. Drop the reordering of "${column}".`
      );
    }
  }
  // The parts present, in layout order.
  const order = keys.map((_, i) => (reverse ? keys.length - 1 - i : i));
  const ranks = order.map((i) => rank.get(keys[i])!);
  const at = (p: number, fraction: number): StackOrigin<number> => ({
    part: order[p],
    fraction,
    mirrored: true,
  });
  for (let p = 0; p < ranks.length; p++) {
    // The part's level spans [r, r + 1] along the order. Laid out against
    // the order, its tail is at r + 1.
    const r = ranks[p];
    if (r < midpoint && midpoint < r + 1)
      return at(p, dir > 0 ? midpoint - r : r + 1 - midpoint);
    // The first part laid out past the midpoint: the midpoint is its tail.
    if (dir > 0 ? r >= midpoint : r + 1 <= midpoint) return at(p, 0);
  }
  // Every part lies before the midpoint: it is the last part's head.
  return at(ranks.length - 1, 1);
}
