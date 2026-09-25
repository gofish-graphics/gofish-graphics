import { olympicMedals } from "../data/olympic-medals";
import { map, groupBy, rect, stackX, stackY, v } from "../lib";

export const testOlympicMedalsStackedBars = () => {
  return stackX(
    { spacing: 15, sharedScale: true },
    map(groupBy(olympicMedals, "Country_Code"), (d, key) =>
      stackY(
        { key: key as string, spacing: 0 },
        map(d, (d) => rect({ w: 20, h: v(d.Count), fill: v(d.Medal_Type) }))
      )
    )
  );
};
