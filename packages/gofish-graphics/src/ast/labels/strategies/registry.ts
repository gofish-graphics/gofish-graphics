import type { LabelKind, LabelStrategy } from "./types";
import { boxStrategy } from "./box";
import { pointStrategy } from "./point";
import { areaStrategy } from "./area";
import { ribbonStrategy } from "./ribbon";
import { pathStrategy } from "./path";

export const strategies: Record<LabelKind, LabelStrategy> = {
  box: boxStrategy,
  point: pointStrategy,
  area: areaStrategy,
  ribbon: ribbonStrategy,
  path: pathStrategy,
};
