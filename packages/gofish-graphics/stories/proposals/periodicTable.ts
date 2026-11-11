// Prototype data for the periodic-table layouts proposal (#1347). Throwaway:
// lives with the proposal stories, not in src/data.
//
// f-block convention: La-Yb (57-70) and Ac-No (89-102) are the f-block, and
// Lu (71) and Lr (103) sit in group 3 under Sc and Y. This is the convention
// Janet's left-step table uses, and the one IUPAC's 2021 provisional report
// favors. He is put in the s block (its electron configuration is 1s2).

export type Block = "s" | "p" | "d" | "f";

export type Element = {
  z: number;
  symbol: string;
  name: string;
  period: number;
  /** 1-18, or null for the 28 f-block elements. */
  group: number | null;
  block: Block;
};

const SYMBOLS = (
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni " +
  "Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I " +
  "Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt " +
  "Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr " +
  "Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
).split(" ");

const NAMES = (
  "Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine " +
  "Neon Sodium Magnesium Aluminium Silicon Phosphorus Sulfur Chlorine Argon " +
  "Potassium Calcium Scandium Titanium Vanadium Chromium Manganese Iron " +
  "Cobalt Nickel Copper Zinc Gallium Germanium Arsenic Selenium Bromine " +
  "Krypton Rubidium Strontium Yttrium Zirconium Niobium Molybdenum Technetium " +
  "Ruthenium Rhodium Palladium Silver Cadmium Indium Tin Antimony Tellurium " +
  "Iodine Xenon Caesium Barium Lanthanum Cerium Praseodymium Neodymium " +
  "Promethium Samarium Europium Gadolinium Terbium Dysprosium Holmium Erbium " +
  "Thulium Ytterbium Lutetium Hafnium Tantalum Tungsten Rhenium Osmium " +
  "Iridium Platinum Gold Mercury Thallium Lead Bismuth Polonium Astatine " +
  "Radon Francium Radium Actinium Thorium Protactinium Uranium Neptunium " +
  "Plutonium Americium Curium Berkelium Californium Einsteinium Fermium " +
  "Mendelevium Nobelium Lawrencium Rutherfordium Dubnium Seaborgium Bohrium " +
  "Hassium Meitnerium Darmstadtium Roentgenium Copernicium Nihonium " +
  "Flerovium Moscovium Livermorium Tennessine Oganesson"
).split(" ");

/** The first z of each period 1-7. */
const PERIOD_START = [1, 3, 11, 19, 37, 55, 87, 119];

const periodOf = (z: number) => PERIOD_START.findIndex((s) => s > z);

/** Group 1-18 by z, or null for the f-block (La-Yb, Ac-No). */
const groupOf = (z: number): number | null => {
  const p = periodOf(z);
  const k = z - PERIOD_START[p - 1]; // 0-based place in the period
  if (p === 1) return z === 1 ? 1 : 18;
  if (p <= 3) return k < 2 ? k + 1 : k + 11;
  if (p <= 5) return k + 1;
  // Periods 6 and 7: 2 s, 14 f, then groups 3-18.
  if (k < 2) return k + 1;
  if (k < 16) return null;
  return k - 13;
};

const blockOf = (z: number, group: number | null): Block => {
  if (group === null) return "f";
  if (group <= 2 || z === 2) return "s";
  if (group <= 12) return "d";
  return "p";
};

export const elements: Element[] = SYMBOLS.map((symbol, i) => {
  const z = i + 1;
  const group = groupOf(z);
  return {
    z,
    symbol,
    name: NAMES[i],
    period: periodOf(z),
    group,
    block: blockOf(z, group),
  };
});

/** Block fill colors, shared by every story. */
export const BLOCK_COLORS: Record<Block, string> = {
  s: "#f4a261",
  p: "#e9c46a",
  d: "#8ecae6",
  f: "#b5a4e0",
};

/** The azimuthal quantum number of each block. */
export const L_OF: Record<Block, number> = { s: 0, p: 1, d: 2, f: 3 };

/**
 * The principal quantum number n of an element's outermost subshell of its
 * block: s and p are n = period, d is period - 1, f is period - 2.
 */
export const nOf = (e: Element): number =>
  e.period - (e.block === "d" ? 1 : e.block === "f" ? 2 : 0);

/** The 0-based place of an element within its block's run in its period
 *  (He counts as the second s element). */
export const placeInBlock = (e: Element): number => {
  const run = elements.filter(
    (o) => o.period === e.period && o.block === e.block
  );
  return run.indexOf(e);
};

/**
 * The usual 18-column wall chart: `col` 1-18 and `row` 1-7, with the
 * f-block detached on rows 9 and 10 at cols 3-16 (row 8 stays empty, as the
 * gap).
 */
export const standardTable = (rows: Element[] = elements) =>
  rows.map((e) =>
    e.group !== null
      ? { ...e, col: e.group, row: e.period }
      : { ...e, col: 3 + placeInBlock(e), row: e.period + 3 }
  );

/**
 * Janet's left-step table: 32 columns, f(14) d(10) p(6) s(2) from left to
 * right; rows are n + l, 1-8 (row 8 is 5f 6d 7p, and its 8s pair is not
 * yet discovered, so cols 31-32 of row 8 are empty). Within a row z rises
 * left to right, and each row's last element is followed by the next row's
 * first, so the rows read as one sequence.
 *
 * `col` 1-32, `row` 1-8, plus `n` and `l`. He sits in the s block above Be.
 */
export const leftStepTable = (rows: Element[] = elements) => {
  const BLOCK_START: Record<Block, number> = { f: 1, d: 15, p: 25, s: 31 };
  return rows.map((e) => {
    const l = L_OF[e.block];
    const row = nOf(e) + l;
    // He is the second s element of period 1, so it sits at the s block's
    // second column, above Be.
    const col = BLOCK_START[e.block] + placeInBlock(e);
    return { ...e, col, row, n: nOf(e), l };
  });
};

/**
 * Benfey's spiral as a grid: `col` 1-32 in the order the band runs, s1 s2,
 * f1-f14, d1-d10, p1-p6, and `track` = period minus the first period of the
 * element's block (s 1, p 2, d 4, f 6), so track 0 is the one nearest the
 * center or the block's slit.
 */
export const benfeyTable = (rows: Element[] = elements) => {
  const START: Record<Block, number> = { s: 1, f: 3, d: 17, p: 27 };
  const FIRST: Record<Block, number> = { s: 1, p: 2, d: 4, f: 6 };
  return rows.map((e) => ({
    ...e,
    col: START[e.block] + placeInBlock(e),
    track: e.period - FIRST[e.block],
  }));
};

/**
 * Approximate abundance in the Earth's crust, in mg/kg (ppm), from memory
 * of the CRC Handbook table: good to a factor of a few, not for citing. 0
 * marks an element with no measurable natural abundance (Tc, Pm, and
 * everything past U except the traces below).
 */
const CRUST_PPM: number[] = [
  1400, 0.008, 20, 2.8, 10, 200, 19, 461000, 585, 0.005, // H-Ne
  23600, 23300, 82300, 282000, 1050, 350, 145, 3.5, // Na-Ar
  20900, 41500, 22, 5650, 120, 102, 950, 56300, 25, 84, 60, 70, // K-Zn
  19, 1.5, 1.8, 0.05, 2.4, 1e-4, // Ga-Kr
  90, 370, 33, 165, 20, 1.2, 0, 0.001, 0.001, 0.015, 0.075, 0.15, // Rb-Cd
  0.25, 2.3, 0.2, 0.001, 0.45, 3e-5, // In-Xe
  3, 425, 39, 66.5, 9.2, 41.5, 0, 7.05, 2, 6.2, 1.2, 5.2, 1.3, 3.5, 0.52,
  3.2, 0.8, // Cs-Lu
  3, 2, 1.25, 7e-4, 0.0015, 0.001, 0.005, 0.004, 0.085, // Hf-Hg
  0.85, 14, 0.0085, 2e-10, 3e-20, 4e-13, // Tl-Rn
  1e-18, 9e-7, 5.5e-10, 9.6, 1.4e-6, 2.7, // Fr-U
];

/** The floor of the log scale: 10^-6 ppm. Rarer and synthetic elements get
 *  the floor, so every element keeps a cell. */
const FLOOR = -6;

/**
 * `abundance` = log10(crustal ppm) - FLOOR + 1, so it runs from 1 (the
 * floor: synthetic or vanishingly rare) to about 12.7 (oxygen). A weight
 * for area: O's cell is about 12x the floor's, not 10^18x.
 */
export const withAbundance = <T extends Element>(rows: T[]) =>
  rows.map((e) => {
    const ppm = CRUST_PPM[e.z - 1] ?? 0;
    const lg = ppm > 0 ? Math.max(FLOOR, Math.log10(ppm)) : FLOOR;
    return { ...e, ppm, abundance: lg - FLOOR + 1 };
  });

/** Plain z order: `seq` 0-117 alongside `period`. */
export const sequence = (rows: Element[] = elements) =>
  rows.map((e) => ({ ...e, seq: e.z - 1 }));

/** The left-step table read as one sequence of 32 per row: `seq` =
 *  (row - 1) · 32 + col, so the holes are missing seq values. */
export const leftStepSequence = (rows: Element[] = elements) =>
  leftStepTable(rows).map((e) => ({ ...e, seq: (e.row - 1) * 32 + e.col }));

/**
 * Six years of a synthetic monthly series (no dataset in src/data has a
 * plain seasonal monthly value): a yearly cosine peaking in July, a rising
 * trend, and a little fixed wobble. `t` 0-71, `year` 1-6, `month` 1-12.
 */
export const seasons = () =>
  Array.from({ length: 72 }, (_, t) => {
    const year = Math.floor(t / 12) + 1;
    const month = (t % 12) + 1;
    const value =
      30 +
      15 * Math.cos((2 * Math.PI * (month - 7)) / 12) +
      2 * (year - 1) +
      3 * Math.sin(t * 2.3);
    return { t, year, month, value: Math.round(value * 10) / 10 };
  });
