/**
 * Passenger-level Titanic rows (one person per record) for unit charts.
 *
 * Source file: `titanicPassengers.json`, generated from:
 * https://github.com/intuinno/unit/blob/master/app/data/titanic3.csv
 * (raw: `https://raw.githubusercontent.com/intuinno/unit/master/app/data/titanic3.csv`)
 *
 * Columns include **`pclass`**, **`fare`**, **`survived`**, **`sex`**, **`age`**, etc.
 * If a row lacks a usable `fare`, a **cabin-tier proxy** from `class` / `Class`
 * is used when present; otherwise `pclass` maps to a default tier. Rows with
 * `pclass` outside 1–3 are skipped.
 *
 * Regenerate JSON: `pnpm --filter gofish-graphics run fetch-titanic-passengers`
 */
import raw from "./titanicPassengers.json";

const rowsRaw = raw as unknown;
const rowsList: Record<string, string>[] = Array.isArray(rowsRaw)
  ? (rowsRaw as Record<string, string>[])
  : (rowsRaw as { default?: Record<string, string>[] }).default ?? [];

/** Tier weights when CSV has no numeric `fare`. */
const TIER_FARE: Record<string, number> = {
  First: 85,
  Second: 40,
  Third: 14,
  Crew: 4,
};

function classToPclass(cls: string): 1 | 2 | 3 | null {
  const c = cls.trim();
  if (c === "First") return 1;
  if (c === "Second") return 2;
  if (c === "Third") return 3;
  return null;
}

function pclassToClassName(pc: number): string {
  if (pc === 1) return "First";
  if (pc === 2) return "Second";
  return "Third";
}

export type TitanicPassenger = {
  survived: 0 | 1;
  pclass: 1 | 2 | 3;
  sex: string;
  /** Ticket price when present; else tier proxy (see module doc). */
  fare: number;
  class: string;
  alive?: string;
  age?: string;
};

function parsePassengers(
  rows: Record<string, string>[]
): TitanicPassenger[] {
  const out: TitanicPassenger[] = [];
  for (const r of rows) {
    const clsRaw = (r.class ?? r.Class ?? "").trim();
    const pcRaw = r.pclass;
    const pcNum =
      pcRaw !== undefined && pcRaw !== "" && !Number.isNaN(Number(pcRaw))
        ? Number(pcRaw)
        : NaN;
    const pcFromClass = classToPclass(clsRaw);
    const pc = Number.isFinite(pcNum)
      ? pcNum
      : pcFromClass !== null
        ? pcFromClass
        : NaN;
    if (pc !== 1 && pc !== 2 && pc !== 3) continue;

    const cls = clsRaw || pclassToClassName(pc);

    const fareCell = r.fare ?? r.Fare;
    const fareNum =
      fareCell !== undefined && fareCell !== ""
        ? Number(fareCell)
        : Number.NaN;
    const fare = Number.isFinite(fareNum) && fareNum >= 0 ? fareNum : TIER_FARE[cls] ?? 1;

    const surv = (r.survived ?? r.Survived ?? "").toString().trim();
    const st = (r.survived_text ?? r.survivedText ?? "").toString().trim();
    const lived =
      surv === "1" ||
      surv === "Yes" ||
      surv === "yes" ||
      surv === "true" ||
      st.toUpperCase() === "YES"
        ? 1
        : 0;

    const sex = (r.sex ?? r.Sex ?? "").trim();
    const age = (r.age ?? r.Age ?? "").trim() || undefined;
    const aliveRaw = (r.alive ?? r.Alive ?? surv ?? st).toString().toLowerCase();

    out.push({
      survived: lived,
      pclass: pc as 1 | 2 | 3,
      sex,
      fare,
      class: cls,
      alive: aliveRaw === "yes" || aliveRaw === "1" ? "yes" : "no",
      age,
    });
  }
  return out;
}

export const titanicPassengers: TitanicPassenger[] = parsePassengers(rowsList);
