/**
 * The JS half of a Python host: the one Arrow codec both hosts use, the
 * notebook widget (anywidget traitlets) and the parity harness (HTTP).
 *
 * A Python host ships a frontend-IR document with its `tables` as base64
 * Arrow IPC streams by id (`ir_payload` in `gofish/ast.py`).
 * {@link decodeDocument} decodes them into the rows `Serialize.buildIR`
 * reads, so Arrow is only an encoding of `tables`, and reads the rest as
 * JSON (`Serialize.readIR`). The bridge's one call
 * ({@link arrowBridge}) sends the rows and the refs they hold as base64
 * Arrow, and the reply is a document of the same shape (Python's
 * `answer`), decoded the same way.
 */

import * as Arrow from "apache-arrow";
import { Serialize } from "gofish-graphics";
import { buildArrowTable } from "./arrowTransport";
import { decodeTables } from "./arrowDecode";

/** A document (or a bridge call's reply) as a Python host ships it: its
 *  `tables` as base64 Arrow IPC streams by id. */
export type ShippedDocument<D extends { tables?: Record<string, unknown[]> }> =
  Omit<D, "tables"> & { tables?: Record<string, string> };

/** Read a shipped document: its JSON as JSON is read (`Serialize.readIR`,
 *  which decodes the tagged non-finite numbers the JSON encoding wrote), and
 *  its tables, which are Arrow, into rows (see `arrowDecode.ts`). */
export function decodeDocument<
  D extends { tables?: Record<string, unknown[]> },
>(doc: ShippedDocument<D>): D {
  const { tables, ...json } = doc;
  return {
    ...Serialize.readIR(json),
    tables: decodeTables(tables ?? {}),
  } as unknown as D;
}

/** The list `items` as one base64 Arrow IPC stream (see
 *  `arrowTransport.ts`). */
export function rowsToArrowB64(items: readonly unknown[]): string {
  const bytes = Arrow.tableToIPC(buildArrowTable(items), "stream");
  // Chunked, so a large table does not overflow the argument list.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** A call's input as a host's transport sends it: the rows, and the datum
 *  of each ref the rows hold, by its index, each as base64 Arrow (Python's
 *  `answer` reads them). */
export interface ShippedCall {
  rows_b64: string;
  refs_b64: string;
}

/** How a host's transport sends one call: the callback's lambda id and its
 *  input, answered by the shipped reply. */
export type SendCall = (
  lambdaId: string,
  call: ShippedCall
) => Promise<ShippedDocument<Serialize.BridgeReply>>;

/** The bridge over a host's transport: one call, its rows and refs out as
 *  Arrow, the reply's tables decoded from Arrow. */
export function arrowBridge(send: SendCall): Serialize.DeriveBridge {
  return {
    async call(lambdaId, rows, refs) {
      return decodeDocument<Serialize.BridgeReply>(
        await send(lambdaId, {
          rows_b64: rowsToArrowB64(rows),
          refs_b64: rowsToArrowB64(refs),
        })
      );
    },
  };
}
