import type { Meta, StoryObj } from "@storybook/html";
import { confusionMatrix } from "../src";
import { initializeContainer } from "./helper";
import { animalsFlat, animalsHierarchical, checkoutMultiOutput } from "./data";

const meta: Meta = {
  title: "Neo/Confusion Matrix",
};
export default meta;

// Every story renders into an oversized container; `initializeContainer`
// auto-fits the SVG's viewBox to content on the next frame, so we don't need
// to hand-compute the composed node's exact pixel footprint here.
const CONTAINER_SIZE = { w: 900, h: 700 };

function renderInto(build: () => Promise<any>) {
  const container = initializeContainer(CONTAINER_SIZE);
  (async () => {
    const node = await build();
    node.render(container, CONTAINER_SIZE);
  })();
  return container;
}

export const Flat: StoryObj = {
  name: "Flat",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Confusion Matrix",
      description:
        "A hierarchical confusion matrix for a flat 5-class animal classifier, with tree-shaped row/column margins and per-class precision/recall/accuracy strips.",
    },
  },
  render: () => {
    return renderInto(() =>
      confusionMatrix({ classes: ["animal"] }, animalsFlat)
    );
  },
};

export const Hierarchical: StoryObj = {
  name: "Hierarchical",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Hierarchical Confusion Matrix",
      description:
        "A confusion matrix over a 2-level animal-class hierarchy (mammal/bird/reptile groups), where the tree-shaped margins make within-group confusion (cat/dog/fox) visually distinct from rarer across-group mistakes.",
    },
  },
  render: () => {
    return renderInto(() =>
      confusionMatrix(
        { classes: ["animal"], measures: ["precision", "recall", "accuracy"] },
        animalsHierarchical
      )
    );
  },
};

export const CollapsedSubtree: StoryObj = {
  name: "Collapsed Subtree",
  render: () =>
    renderInto(() =>
      confusionMatrix(
        { classes: ["animal"], collapsed: ["animal:mammal"] },
        animalsHierarchical
      )
    ),
};

export const SizeEncoding: StoryObj = {
  name: "Size Encoding",
  render: () =>
    renderInto(() =>
      confusionMatrix(
        { classes: ["animal"], encoding: "size" },
        animalsHierarchical
      )
    ),
};

export const RowNormalized: StoryObj = {
  name: "Row Normalized",
  render: () =>
    renderInto(() =>
      confusionMatrix(
        { classes: ["animal"], normalization: "row" },
        animalsHierarchical
      )
    ),
};

export const MultiOutputNested: StoryObj = {
  name: "Multi-Output Nested",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Multi-Output Confusion Matrix",
      description:
        "A checkout classifier's beverage and size predictions nested into a single matrix — size confusions surface within each beverage's own block instead of being averaged away.",
    },
  },
  render: () => {
    return renderInto(() =>
      confusionMatrix({ classes: ["beverage", "size"] }, checkoutMultiOutput)
    );
  },
};

export const Conditioned: StoryObj = {
  name: "Conditioned",
  render: () =>
    renderInto(() =>
      confusionMatrix(
        {
          classes: ["beverage"],
          where: { qualifier: "actual", label: "size", is: "size:large" },
        },
        checkoutMultiOutput
      )
    ),
};
