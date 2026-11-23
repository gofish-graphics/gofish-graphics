import { olympicMedals } from "../data/olympic-medals";
import { map, groupBy, rect, stackY, v, spreadX } from "../lib";

export const testOlympicMedalsStackedBars = () => {
  return spreadX(
    { spacing: 0},
    map(groupBy(olympicMedals, "Country_Code"), (d, key) =>
      stackY(
        { key: key as string},
        map(d, (d) => rect({ w: 20, h: v(d.Count), fill: v(d.Medal_Type) }))
      )
    )
  );
};
