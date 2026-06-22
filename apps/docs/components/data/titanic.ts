/**
 * Contingency counts for Titanic passengers (class × sex × survived).
 *
 * For per-passenger rows (with fare) see `gofish-graphics` `titanicPassengers`
 * (intuinno/unit `titanic3.csv`).
 * Competition-style source: https://www.kaggle.com/datasets/dimplebathija/titanic-machine-learning-from-disaster
 *
 * `fareMean` is cohort-level representative GBP for aggregate-only charts.
 */
export type Titanic = {
  class: "First" | "Second" | "Third" | "Crew";
  sex: "Female" | "Male";
  survived: "Yes" | "No";
  count: number;
  /** Representative mean fare for this stratum (GBP), for visualization only. */
  fareMean: number;
};

export const titanic: Titanic[] = [
  {
    class: "First",
    sex: "Female",
    survived: "Yes",
    count: 141,
    fareMean: 72,
  },
  {
    class: "First",
    sex: "Male",
    survived: "Yes",
    count: 62,
    fareMean: 88,
  },
  {
    class: "Second",
    sex: "Female",
    survived: "Yes",
    count: 93,
    fareMean: 23,
  },
  {
    class: "Second",
    sex: "Male",
    survived: "Yes",
    count: 25,
    fareMean: 26,
  },
  {
    class: "Third",
    sex: "Female",
    survived: "Yes",
    count: 90,
    fareMean: 12,
  },
  {
    class: "Third",
    sex: "Male",
    survived: "Yes",
    count: 88,
    fareMean: 11,
  },
  {
    class: "Crew",
    sex: "Female",
    survived: "Yes",
    count: 20,
    fareMean: 0,
  },
  {
    class: "Crew",
    sex: "Male",
    survived: "Yes",
    count: 192,
    fareMean: 0,
  },
  {
    class: "First",
    sex: "Female",
    survived: "No",
    count: 4,
    fareMean: 55,
  },
  {
    class: "First",
    sex: "Male",
    survived: "No",
    count: 118,
    fareMean: 62,
  },
  {
    class: "Second",
    sex: "Female",
    survived: "No",
    count: 13,
    fareMean: 20,
  },
  {
    class: "Second",
    sex: "Male",
    survived: "No",
    count: 154,
    fareMean: 22,
  },
  {
    class: "Third",
    sex: "Female",
    survived: "No",
    count: 106,
    fareMean: 9,
  },
  {
    class: "Third",
    sex: "Male",
    survived: "No",
    count: 422,
    fareMean: 10,
  },
  {
    class: "Crew",
    sex: "Female",
    survived: "No",
    count: 3,
    fareMean: 0,
  },
  {
    class: "Crew",
    sex: "Male",
    survived: "No",
    count: 670,
    fareMean: 0,
  },
];
