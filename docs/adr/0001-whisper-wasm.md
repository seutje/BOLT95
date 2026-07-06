# ADR 0001: Single-thread whisper.cpp browser adapter

- Status: Accepted
- Date: 2026-07-06

## Context

BOLT95 must transcribe locally on ordinary GitHub Pages without COOP/COEP headers,
`SharedArrayBuffer`, or WebAssembly threads. The upstream `examples/whisper.wasm`
target in whisper.cpp v1.8.6 sets `USE_PTHREADS=1`, so it cannot be reused as the
baseline adapter.

## Decision

Build a small C ABI over whisper.cpp and call it from a dedicated typed Web Worker.
The baseline build is:

- whisper.cpp tag `v1.8.6`, commit
  `23ee03506a91ac3d3f0071b40e66a430eebdfa1d`.
- Emscripten `4.0.20`, image
  `emscripten/emsdk@sha256:460fff8f8ac87e11b16447fbd66538a686eafa0e4fb977aa0989ed19fe2079f7`.
- Separate ES-module JavaScript and WASM assets.
- `-msimd128`, one inference thread, memory growth, no pthread linker option.
- Model initialization from a transferred in-memory buffer rather than a virtual
  filesystem.
- Worker termination as the hard cancellation boundary. A fresh worker is created
  for restart because synchronous inference cannot process a cancel message.

The adapter returns segment text/times and raw token text/times/probability. The
later production adapter must preserve this evidence while assembling safe words.

The model registry is pinned to Hugging Face repository revision
`5359861c739e955e79d9a303bcbc70fb988958b1`:

| Model | Bytes | SHA-256 |
|---|---:|---|
| `ggml-tiny-q5_1.bin` | 32,152,673 | `818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7` |
| `ggml-base-q5_1.bin` | 59,707,625 | `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898` |

Models remain generated deployment assets and are never committed.

## Proof evidence

Pinned Chromium 149 ran at `crossOriginIsolated === false` with
`SharedArrayBuffer` unavailable. Tiny Q5_1 transcribed the 11-second public-domain
JFK fixture into one segment and monotonic token timing. Three complete worker
lifecycles measured 9,438 ms, 9,347 ms, and 9,373 ms (28,175 ms total).

Measured allocation indicators:

- generated glue: 36,969 bytes;
- generated WASM: 1,270,816 bytes;
- PCM input: 704,000 bytes;
- model file: 32,152,673 bytes;
- grown WASM heap after inference: 750,649,344 bytes.

The heap figure is an allocation ceiling, not resident-set measurement. It is high
enough to require the planned device-risk warning and tiny-model compatibility mode.
Three contexts were disposed by terminating their workers. Cancellation followed by
a complete restart passed without reloading the page.

The build gate disassembles the module and requires SIMD instructions. It also scans
the generated glue and binary strings for `SharedArrayBuffer`, PThread, pthread, TLS,
and Emscripten worker-thread assumptions.

## Consequences

- The required GitHub Pages baseline is viable.
- Tiny is the low-resource model and Base remains the normal model, but Base requires
  a separate Phase 4 memory benchmark before unrestricted use.
- The initial production path remains bounded full-track transcription. Chunking is
  triggered only if Phase 4 measurements cross its recorded limit.
- Cooperative cancellation inside one inference call is not promised.
- Generated glue/WASM must be rebuilt by the pinned script and included in the Pages
  artifact; neither is hand-edited.

## Licensing

whisper.cpp and the upstream Whisper model implementation are MIT-licensed. The
converted GGML model artifacts retain the upstream model obligations. Notices and
source/revision links are recorded in `THIRD_PARTY_NOTICES.md`.
