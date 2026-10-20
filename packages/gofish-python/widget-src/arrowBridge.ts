/**
 * The JS half of a Python host: the one Arrow codec both hosts use, the
 * notebook widget (anywidget traitlets) and the parity harness (HTTP).
 *
 * A Python host ships a frontend-IR document with its `tables` as base64
 * Arrow IPC streams by id (`ir_payload` in `gofish/ast.py`).
 * {@link decodeDocument} decodes them into the rows `Serialize.buildIR`
 * reads, so Arrow is only an encoding of `tables`. The bridge's one call
 * ({@link arrowBridge}) sends the rows as base64 Arrow, and the reply is a
 * document of the same shape (Python's `answer`), decoded the same way.
 */

import * as Arrow from "apache-arrow";
import type { Serialize } from "gofish-graphics";
import type { Frontend } from "gofish-ir";
import { buildArrowTable } from "./arrowTransport";
import { decodeTables } from "./arrowDecode";

/** A document (or a bridge call's reply) as a Python host ships it: its
 *  `tables` as base64 Arrow IPC streams by id. */
export type ShippedDocument<D extends { tables?: Frontend.Tables }> = Omit<
  D,
  "tables"
> & { tables?: Record<string, string> };

/** Decode a shipped document's tables into rows (see `arrowDecode.ts`). */
export function decodeDocument<D extends { tables?: Frontend.Tables }>(
  doc: ShippedDocument<D>
): D {
  return { ...doc, tables: decodeTables(doc.tables ?? {}) } as unknown as D;
}

/** `rows` as one base64 Arrow IPC stream (see `arrowTransport.ts`). */
export function rowsToArrowB64(rows: readonly Record<string, any>[]): string {
  const bytes = Arrow.tableToIPC(buildArrowTable(rows), "stream");
  // Chunked, so a large table does not overflow the argument list.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** How a host's transport sends one call: the callback's lambda id and the
 *  rows as base64 Arrow, answered by the shipped reply. */
export type SendCall = (
  lambdaId: string,
  rowsB64: string
) => Promise<ShippedDocument<Serialize.BridgeReply>>;

/** The bridge over a host's transport: one call, rows out as Arrow, the
 *  reply's tables decoded from Arrow. */
export function arrowBridge(send: SendCall): Serialize.DeriveBridge {
  return {
    async call(lambdaId, rows) {
      return decodeDocument<Serialize.BridgeReply>(
        await send(lambdaId, rowsToArrowB64(rows))
      );
    },
  };
}
