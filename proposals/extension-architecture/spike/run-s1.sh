#!/bin/sh
# Build and run S1 in all measurer modes; print a one-line summary per mode.
set -e
cd "$(dirname "$0")"
node build.mjs s1
for m in none stub opentype shim; do
  node out/s1.mjs "$m" > "out/s1-$m.log" 2>&1 || true
  node -e '
    const fs=require("fs"); const s=fs.readFileSync(process.argv[1],"utf8");
    const j=JSON.parse(s.slice(s.indexOf("{\n")));
    console.log(j.mode, Object.entries(j.specs).map(([k,v])=>k+":"+(v.error?"ERR "+v.error:v.ms+"ms/"+(v.bytes/1024).toFixed(0)+"KiB")).join("  "));
  ' "out/s1-$m.log"
done
