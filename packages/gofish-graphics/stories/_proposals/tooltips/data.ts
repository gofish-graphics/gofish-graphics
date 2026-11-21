/**
 * PROTOTYPE(#1395): invented data for the issue's "Top 15 path types" bar
 * chart. Only the first row is from the issue's screenshot (VO→VO, length 2,
 * n 11,902, n_articles 195, share 13.0%); the rest are plausible fillers that
 * keep share = n / total with the same total.
 */
const TOTAL = 91_554;
const raw: [string, number, number][] = [
  ["VO→VO", 11_902, 195],
  ["INF→INF", 9_811, 188],
  ["other→other", 8_240, 201],
  ["VO→INF", 6_590, 172],
  ["PK→PK", 5_310, 160],
  ["VO→VO→VO", 4_670, 151],
  ["INF→VO", 4_120, 149],
  ["PK→VO", 3_480, 133],
  ["VO→PK", 3_110, 128],
  ["INF→INF→INF", 2_740, 117],
  ["other→VO", 2_290, 109],
  ["VO→other", 1_950, 98],
  ["PK→INF", 1_610, 87],
  ["INF→PK", 1_330, 74],
  ["VO→INF→VO", 1_090, 66],
];

export type PathRow = {
  path: string;
  length: number;
  n: number;
  n_articles: number;
  share: number;
};

export const pathTypes: PathRow[] = raw.map(([path, n, n_articles]) => ({
  path,
  length: path.split("→").length,
  n,
  n_articles,
  share: n / TOTAL,
}));
