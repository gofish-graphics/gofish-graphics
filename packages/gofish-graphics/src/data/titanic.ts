export type Titanic = {
  class: "First" | "Second" | "Third" | "Crew";
  sex: "Female" | "Male";
  survived: "Yes" | "No";
  count: number;
};

export const titanic: Titanic[] = [
  {
    class: "First",
    sex: "Female",
    survived: "Yes",
    count: 141,
  },
  {
    class: "First",
    sex: "Male",
    survived: "Yes",
    count: 62,
  },
  {
    class: "Second",
    sex: "Female",
    survived: "Yes",
    count: 93,
  },
  {
    class: "Second",
    sex: "Male",
    survived: "Yes",
    count: 25,
  },
  {
    class: "Third",
    sex: "Female",
    survived: "Yes",
    count: 90,
  },
  {
    class: "Third",
    sex: "Male",
    survived: "Yes",
    count: 88,
  },
  {
    class: "Crew",
    sex: "Female",
    survived: "Yes",
    count: 20,
  },
  {
    class: "Crew",
    sex: "Male",
    survived: "Yes",
    count: 192,
  },
  {
    class: "First",
    sex: "Female",
    survived: "No",
    count: 4,
  },
  {
    class: "First",
    sex: "Male",
    survived: "No",
    count: 118,
  },
  {
    class: "Second",
    sex: "Female",
    survived: "No",
    count: 13,
  },
  {
    class: "Second",
    sex: "Male",
    survived: "No",
    count: 154,
  },
  {
    class: "Third",
    sex: "Female",
    survived: "No",
    count: 106,
  },
  {
    class: "Third",
    sex: "Male",
    survived: "No",
    count: 422,
  },
  {
    class: "Crew",
    sex: "Female",
    survived: "No",
    count: 3,
  },
  {
    class: "Crew",
    sex: "Male",
    survived: "No",
    count: 670,
  },
];
