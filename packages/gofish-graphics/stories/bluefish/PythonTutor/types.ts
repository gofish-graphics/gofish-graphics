export type Address = number;

export type Pointer = { type: "pointer"; value: Address };

export const pointer = (value: Address): Pointer => ({
  type: "pointer",
  value,
});

export type Value = string | number | Pointer;

export const isPointer = (v: Value): v is Pointer =>
  typeof v === "object" && v !== null && v.type === "pointer";

export const formatValue = (value: Value): string => {
  if (typeof value === "string" || typeof value === "number") {
    return `${value}`;
  }
  return String(value.value);
};

export type Tuple = { type: "tuple"; values: Value[] };

export const tuple = (values: Value[]): Tuple => ({ type: "tuple", values });

export type HeapObject = Tuple;

export type Binding = { variable: string; value: Value };

export const binding = (variable: string, value: Value): Binding => ({
  variable,
  value,
});
