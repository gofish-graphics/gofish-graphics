import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { caltrain, caltrainStopOrder } from "../../src/data/caltrain";
import { layer, spreadY, For, rect, ellipse, connectY, ref, v } from "../../src/lib";
import { groupBy, orderBy } from "lodash";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Stringline Chart",
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stringline Chart",
      description:
        "A Marey train schedule plotting Caltrain stations against time, with each colored diagonal line tracing a single northbound or southbound run.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const caltrainProcessed = caltrain.filter((d) => d.Type !== "Bullet");

    layer({}, [
      spreadY(
        {
          reverse: true,
          spacing: 8,
          alignment: "start",
        },
        For(
          groupBy(
            _.orderBy(
              caltrainProcessed,
              (d) => caltrainStopOrder.indexOf(d.Station),
              "desc"
            ),
            "Station"
          ),
          (d, key) =>
            layer({ key }, [
              rect({ w: 0, h: 0 }),
              For(d, (d) =>
                ellipse({ x: d.Time / 3, w: 4, h: 4, fill: v(d.Direction) }).name(
                  `${d.Train}-${d.Station}-${d.Time}`
                )
              ),
            ])
        )
      ),
      For(groupBy(caltrainProcessed, "Train"), (d) =>
        connectY(
          { strokeWidth: 1, mode: "center" },
          For(d, (d) => ref(`${d.Train}-${d.Station}-${d.Time}`))
        )
      ),
    ]).render(container, {
      axes: true,
    });
    return container;
  }
}
