import _ from "lodash";
import { caltrain, caltrainStopOrder } from "../data/caltrain";
import {
  line,
  ellipse,
  For,
  frame,
  groupBy,
  rect,
  ref,
  stackY,
  v,
} from "../lib";

const caltrainProcessed = caltrain.filter((d) => d.Type !== "Bullet");

export const testStringLine = () =>
  frame({}, [
    stackY(
      {
        spacing: 8,
        alignment: "start",
      },
      For(
        groupBy(
          _.orderBy(
            caltrainProcessed,
            (d) => caltrainStopOrder.indexOf(d.Station),
            "asc"
          ),
          "Station"
        ),
        (d, key) =>
          frame({ key }, [
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
      line(
        { dir: "y", strokeWidth: 1, curve: "bezier" },
        For(d, (d) => ref(`${d.Train}-${d.Station}-${d.Time}`))
      )
    ),
  ]);
