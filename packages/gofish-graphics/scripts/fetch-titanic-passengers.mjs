import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "../src/data/titanicPassengers.json");
/** Passenger-level Titanic (intuinno/unit `titanic3.csv` — includes fare). */
const url =
  "https://raw.githubusercontent.com/intuinno/unit/master/app/data/titanic3.csv";

function get(u) {
  return new Promise((resolve, reject) => {
    https
      .get(u, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = [];
    let cur = "";
    let q = false;
    for (const ch of lines[i]) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        cols.push(cur);
        cur = "";
      } else cur += ch;
    }
    cols.push(cur);
    const o = {};
    header.forEach((k, j) => {
      o[k] = cols[j] ?? "";
    });
    rows.push(o);
  }
  return rows;
}

const text = await get(url);
const rows = parseCsv(text);
fs.writeFileSync(out, JSON.stringify(rows));
console.log("wrote", rows.length, "rows to", out);
