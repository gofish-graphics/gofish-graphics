/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";

import { color, color6, white } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { spreadX } from "../ast/graphicalOperators/spreadX";
import { frame } from "../ast/graphicalOperators/frame";
import { connectX } from "../ast/graphicalOperators/connectX";
import { ref } from "../ast/shapes/ref";
import { mix } from "spectral.js";
import { enclose } from "../ast/graphicalOperators/enclose";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testStacking = (size: { width: number; height: number }) =>
  gofish(
    { width: size.width, height: size.height },
    frame([
      enclose({}, [
        spreadX({ spacing: 64, sharedScale: true, alignment: "middle" }, [
          rect({ w: 32, h: 32 }).name("1"),
          rect({ w: 32, h: 64 }).name("2"),
          rect({ w: 32, h: 40 }).name("3"),
          // rect({ w: 32, h: 32 }),
          // rect({ w: 32, h: 32 }),
        ]),
      ]),

      // // connectX({ opacity: 0.7 }, [ref("1"), ref("2"), ref("3")]),
      // enclose({}, [ref("1"), ref("2"), ref("3")]),
    ])
  );
