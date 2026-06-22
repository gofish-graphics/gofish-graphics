import { createNodeOperator } from "../withGoFish";
import { GoFishAST } from "../_ast";
import { positionNode, type PositionNodeOptions } from "./positionNode";

export const position = createNodeOperator(
  (
    childrenOrOptions: PositionNodeOptions | GoFishAST[],
    maybeChildren?: GoFishAST[]
  ) => {
    const options = Array.isArray(childrenOrOptions) ? {} : childrenOrOptions;
    const children = Array.isArray(childrenOrOptions)
      ? childrenOrOptions
      : maybeChildren || [];
    return positionNode(options, children);
  }
);
