# Phase 11 Release Evidence

Last updated: 2026-07-07

## Automated Checks Run

| Check                              | Result                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run release:check`            | Passed: format, lint, typecheck, unit, release audit, and production build.                                       |
| `npm run test:e2e`                 | Passed in Chromium at `/` and `/BOLT95/`: 30 passed, 1 real-model test skipped by fixture gate in each base path. |
| `npm audit --audit-level=moderate` | Passed: 0 vulnerabilities.                                                                                        |
| `npm run build:subpath`            | Passed and emitted `dist/sw.js`, `dist/manifest.webmanifest`, and `dist/icons/bolt95.svg`.                        |

## Acceptance Matrix

| Area             | Evidence                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment       | `npm run build` builds static files with `VITE_BASE_PATH=/BOLT95/`; `.github/workflows/pages.yml` deploys the `dist` Pages artifact without secrets.                                     |
| Privacy          | CSP is `connect-src 'self'`; diagnostics are allowlisted in `src/infrastructure/diagnostics/diagnostics.ts`; `tests/e2e/phase11.spec.ts` blocks unexpected third-party runtime requests. |
| Transcription    | Phase 4 tests cover local model selection, progress, cancellation, and non-isolated compatibility mode. Model cache deletion is available through the local-data control.                |
| Alignment        | Domain tests cover canonical lyrics, global alignment, repeated sections, confidence, and manual timing preservation.                                                                    |
| Editing          | Phase 6 tests cover timeline editing, undo/redo, autosave, project export/import, and audio relink.                                                                                      |
| Subtitle exports | Phase 7 tests cover LRC, enhanced LRC, SRT, VTT, Unicode, and timestamp validity.                                                                                                        |
| Video            | Phases 8-10 cover three-ratio preview, draft/full presets, capability-gated export backends, cancellation, and drift validation.                                                         |
| Resilience       | Import, worker, storage, export, cancellation, and fallback tests cover recoverable failures and operation without advanced APIs.                                                        |

## Browser Matrix

| Browser                  | Release support | Capability-derived differences                                                                                   |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Current desktop Chromium | Primary         | Full local Playwright matrix passed at `/` and `/BOLT95/`; WebCodecs and MediaRecorder paths are probed.         |
| Current Firefox          | Best effort     | Not run locally on 2026-07-07; timed-text/project workflows remain available and video export depends on probes. |
| Current Safari           | Best effort     | Not run locally on 2026-07-07; timed-text/project workflows remain available and video export depends on probes. |
| Mobile browsers          | Compatibility   | Import/edit/caption export may work for small projects; long transcription and full video export are high risk.  |

## Measured Limits

| Configuration | Recommended limit                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Low resource  | Tiny Q5_1 model, short tracks up to 3 minutes, draft or subtitle export.                                    |
| Medium        | Tiny or base Q5_1 model, tracks up to 6 minutes, draft and capability-qualified full export.                |
| High          | Base Q5_1 model, tracks up to 8 minutes, full square/portrait/landscape presets after risk acknowledgement. |

These limits are user-facing guidance, not hard caps. The app warns before high-risk processing and never silently lowers export quality.

## PWA And Offline Shell

The PWA consists of `public/manifest.webmanifest`, `public/icons/bolt95.svg`, `public/sw.js`, and `src/infrastructure/service-worker/registration.ts`.

The service worker:

- Caches only the app shell and same-origin immutable build assets under `/assets/`.
- Excludes model binaries, blobs, IndexedDB, OPFS, and user media.
- Deletes old `bolt95-shell-*` caches during activation.
- Is optional; the app continues to run when service workers are unavailable or disabled.

## Production Smoke

Before tagging a release candidate:

1. Run `npm ci`.
2. Run `npm run release:check`.
3. Serve the built site at `/BOLT95/` on port 8000.
4. In a clean Chromium profile, complete import, local transcribe, align, edit, subtitle export, all three preview ratios, one video export, cancel/retry, autosave restore, local-data clear, and offline shell reload.
5. Inspect network traffic and confirm no request contains imported media, lyrics, transcript, project JSON, or rendered output.
