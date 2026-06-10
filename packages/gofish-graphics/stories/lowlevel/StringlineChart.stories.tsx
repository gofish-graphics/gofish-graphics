import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { caltrain, caltrainStopOrder } from "../../src/data/caltrain";
import { layer, spreadY, For, rect, ellipse, connectY, ref, v } from "../../src/lib";
import { groupBy, orderBy } from "lodash";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Stringline Chart",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 400 },
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
      w: args.w,
      h: args.h,
      axes: true,
    });
    return container;
  }
}
