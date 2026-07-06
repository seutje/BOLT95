# Compatibility and measured proof baseline

Last verified: 2026-07-06

| Area | Required baseline | Phase 0 result |
|---|---|---|
| Hosting | Static files under `/` and `/BOLT95/` | Passed |
| Isolation | `crossOriginIsolated === false` | Passed |
| Shared memory | No `SharedArrayBuffer` | Passed |
| Whisper | Single-thread WASM SIMD, Tiny Q5_1 | Passed |
| Timing | Monotonic segment and token evidence | Passed |
| Video | Five-second 540p WebM with audio | VP9/Opus passed |
| Drift | At most 100 ms | 20 ms measured |
| Cancellation | Cancel and restart without reload | Whisper and video passed |

The release target is current desktop Chromium. Firefox and Safari are best-effort
and must be selected by capability probes, not browser-name checks. Subtitle and
project work must remain available when video APIs are missing.

Phase 0 measurements are architecture evidence, not final supported workload limits.
Phase 4 sets transcription limits; Phases 9 and 10 set video limits.

## Reproduce

```sh
npm ci
npm run build:whisper
node scripts/fetch-models.mjs tiny-multilingual-q5_1
npm run fetch:fixture
npm test
npm run test:e2e
BOLT95_BASE=/BOLT95/ BOLT95_REAL_WHISPER=1 npx playwright test --grep "real Whisper"
```

The browser servers started by the tests use port 8000.
