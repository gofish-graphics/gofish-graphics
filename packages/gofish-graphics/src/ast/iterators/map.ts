import _, { Dictionary } from "lodash";

export async function map<T, R>(
  data:
    | T[]
    | Record<string, T>
    | _.Collection<T>
    | _.Object<Dictionary<T>>
    | Map<any, T>,
  callback: (d: T, i: number | string) => R | Promise<R>
): Promise<R[]> {
  // Unwrap lodash wrapper objects
  if (_.isObject(data) && typeof (data as any).value === "function") {
    data = (data as any).value();
  }
  if (Array.isArray(data)) {
    return await Promise.all(data.map(callback));
  } else if (data instanceof Map) {
    return await Promise.all(
      Array.from(data.entries()).map(([key, value]) =>
        callback(value as T, key)
      )
    );
  } else if (typeof data === "object" && data !== null) {
    return await Promise.all(
      Object.entries(data).map(([key, value]) => callback(value as T, key))
    );
  } else {
    return [];
  }
}
