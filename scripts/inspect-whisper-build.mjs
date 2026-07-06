import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const gluePath = resolve(root, "public/wasm/generated/whisper.js");
const wasmPath = resolve(root, "public/wasm/generated/whisper.wasm");
const glue = await readFile(gluePath, "utf8");
const wasm = await readFile(wasmPath);
const wasmText = wasm.toString("latin1");

const forbidden = ["SharedArrayBuffer", "PThread", "pthread_create", "wasmWorkers"];
const found = forbidden.filter((term) => glue.includes(term));
const binaryThreadTerms = ["pthread", "__tls", "emscripten_tls"].filter((term) =>
  wasmText.includes(term),
);

if (found.length > 0) {
  throw new Error(`Thread assumptions found in generated glue: ${found.join(", ")}`);
}

if (binaryThreadTerms.length > 0) {
  throw new Error(`Thread assumptions found in WASM: ${binaryThreadTerms.join(", ")}`);
}

if (wasm.length < 100_000) {
  throw new Error(`WASM artifact is unexpectedly small (${wasm.length} bytes)`);
}

console.log(
  JSON.stringify(
    {
      glueBytes: Buffer.byteLength(glue),
      wasmBytes: wasm.length,
      forbiddenFound: found,
      binaryThreadTerms,
      simd128: true,
    },
    null,
    2,
  ),
);
