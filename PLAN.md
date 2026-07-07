# BOLT95 Implementation Plan

This plan turns [DESIGN.md](DESIGN.md) into incremental, testable work. Every task and phase exit criterion is a checkbox so implementation progress can be recorded in this file.

## How to use this plan

- A phase is complete only when all of its tasks and exit criteria are checked.
- Run the phase's automated checks and demo procedure before checking its exit criteria.
- Keep each phase independently usable; do not start a later phase by bypassing a failed gate.
- Record material architecture changes in an ADR under `docs/adr/` and update the decisions below.
- Do not commit Whisper models, user media, generated videos, build products, or browser-test artifacts.
- Browser demos use the installed `playwright-cli`; durable regression coverage uses `@playwright/test`.
- All browser tests must run once at `/` and once with a repository-style base path such as `/BOLT95/`.

## Overall progress

- [x] Phase 0 — Technical proof and architecture decisions
- [x] Phase 1 — Static application foundation and GitHub Pages
- [x] Phase 2 — Audio and lyrics import
- [x] Phase 3 — Canonical lyrics and alignment engine
- [x] Phase 4 — Local Whisper transcription
- [x] Phase 5 — Workflow integration and alignment review
- [x] Phase 6 — Timeline editor and project persistence
- [x] Phase 7 — Timed-text and project exports
- [x] Phase 8 — Deterministic preview and visual styling
- [x] Phase 9 — Draft video export
- [x] Phase 10 — Full export, fallbacks, and cancellation
- [ ] Phase 11 — Hardening, performance, PWA, and release

## Fixed implementation decisions

These are the starting decisions required by DESIGN.md section 26. A failed Phase 0 proof may change a decision through an ADR, but not silently.

| Area | Decision | Reason |
|---|---|---|
| Application | React + TypeScript + Vite, one state-driven screen flow with no URL router | Produces static assets and avoids GitHub Pages rewrite requirements. |
| Runtime | Node 24 for local tooling and CI; exact package versions committed in `package-lock.json` | Matches the available development runtime and makes builds reproducible. |
| UI style | Custom accessible Windows 95-inspired CSS using local/system fonts and semantic HTML | Meets the visual brief without a heavy component library or external assets. |
| State | Zustand for application/editor state; binary media never enters the store | Small API and serializable state while large buffers stay in media/worker owners. |
| Validation | Zod schemas at file, worker, storage, and project boundaries | Imported JSON and worker payloads are untrusted runtime data. |
| Storage | Dexie over IndexedDB; OPFS is optional and introduced only after measurement | IndexedDB is the broad baseline; Dexie supplies transactions and migrations. |
| Whisper | Build a thin adapter from `whisper.cpp` v1.8.6, initially pinned to tag `v1.8.6` (`23ee035` abbreviated upstream revision); record the full commit SHA and Emscripten container digest in Phase 0 | Upstream ships browser WASM examples, but the app needs its own typed worker protocol and an explicitly single-threaded build. |
| Whisper baseline | Separate, single-threaded WASM/JS assets with WASM SIMD; no pthreads, `SharedArrayBuffer`, cross-origin isolation, or isolation service-worker dependency | This is compatible with ordinary GitHub Pages headers and the design's required baseline. |
| Models | Multilingual `ggml-base-q5_1.bin` (about 57 MB) is normal mode; multilingual `ggml-tiny-q5_1.bin` (about 31 MB) is low-resource mode; compatible user-supplied GGML files are allowed | Multilingual models cover the required language range while quantization limits download and memory cost. |
| Model delivery | CI downloads exact model artifacts into the Pages artifact from the upstream model repository and verifies a checked-in SHA-256 manifest. Models are fetched by the app only after user action and then cached locally. No model binary is committed. | Same-origin runtime fetches avoid CORS fragility and satisfy the requirement not to commit downloadable models. |
| Audio decode | `AudioContext.decodeAudioData`, mono downmix, then a deterministic tested windowed-sinc resampler to 16 kHz Float32 PCM in a worker-compatible media module | Browser decode handles MP3 without shipping FFmpeg; a domain-owned resampler is reproducible. |
| Transcription size policy | Start with a bounded full-track path. Add overlapping, silence-aware chunks only when the Phase 4 memory benchmark crosses the recorded threshold | Avoids speculative chunk-boundary complexity while preserving a measured trigger for it. |
| Alignment | Deterministic Needleman-Wunsch-style global word alignment with configurable scores, monotonic anchors, weighted interpolation, and repeated-section ambiguity detection | Meets the non-greedy requirement and is testable independently of Whisper and React. |
| Hierarchical alignment | Not in the first pass. Add it only if repeated-section fixtures exceed 5% unresolved canonical words or exceed the Phase 3 time/memory budget | Provides an objective escalation criterion rather than premature complexity. |
| Waveform | Custom canvas rendering from compact min/max/RMS peaks | Shares rendering control with the editor and avoids a large visualization dependency. |
| Video | WebCodecs plus Mediabunny is the primary backend; WebM VP9/Opus is the baseline target, with VP8 as a probed alternative | Streaming WebCodecs avoids retaining frames and Mediabunny provides maintained browser muxing. |
| FFmpeg | `ffmpeg.wasm` is deferred. Add its single-thread core only if Phase 10 documents a required compatibility gap that MediaRecorder cannot cover within memory limits | Its payload and virtual filesystem memory cost are not justified for the first working backend. |
| Fallback export | MediaRecorder canvas capture to a browser-supported WebM type; subtitle export always remains available | Provides a lower-control compatibility path without promising unsupported MP4. |
| MP4 | Expose only after runtime `VideoEncoder.isConfigSupported` and an end-to-end mux/playback test pass for AVC + AAC on that browser | Container availability must be capability-driven, not browser-name driven. |
| Cross-origin isolation | No isolation shim in the initial release | Core behavior must work without it, and a service-worker shim adds update and reload failure modes. |
| Browser support | Current desktop Chromium is the release target; current Firefox and Safari are best-effort for import, editing, captions, and whichever export capability probes pass; mobile is compatibility mode | Matches the design's assumptions while keeping capability checks authoritative. |
| Fixtures | Synthetic/generated audio, public-domain spoken samples, and checked-in normalized transcript fixtures; heavy real-model tests run separately from PR tests | Keeps CI legal and deterministic while still testing the actual adapter. |
| PWA | Installable app shell and immutable first-party runtime assets only; never service-worker-cache user media or model files | Preserves local-first behavior without risking stale large assets or user content. |
| Actions | Begin with `checkout@v4`, `setup-node@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`, and `deploy-pages@v4`; verify current supported majors and pin full commit SHAs in Phase 1 | These are the official Pages workflow families; SHA pins reduce supply-chain drift. |
| Licensing | Track dependency licenses in `THIRD_PARTY_NOTICES.md`; preserve MPL-2.0 notices for Mediabunny and upstream notices for generated Whisper artifacts | Makes distribution obligations explicit before release. |

## Cross-phase engineering rules

- [ ] Canonical supplied lyrics are never overwritten by Whisper output.
- [ ] Lyrics are rendered as text, never injected as HTML.
- [ ] Expensive jobs use typed workers, progress events, `AbortSignal`, and deterministic cleanup.
- [ ] Model buffers, PCM, video frames, and generated blobs stay out of React/Zustand state.
- [ ] All asset URLs are derived from `import.meta.env.BASE_URL`; no root-relative runtime URLs.
- [ ] Persisted timestamps are integer milliseconds, monotonic, bounded by track duration, and carry provenance.
- [ ] Diagnostics exclude lyrics, transcript text, audio bytes, paths, and project titles.
- [ ] Object URLs, audio contexts, workers, WASM contexts, `VideoFrame`s, and encoders are released by their owner.
- [ ] Every user-facing failure has a stable code, safe message, local technical detail, and recovery action.
- [ ] Every screen is keyboard operable, has visible focus, works at 200% zoom, and respects reduced motion.
- [ ] Network assertions reject any request containing user media or lyric content.

---

## Phase 0 — Technical proof and architecture decisions

**Objective:** Retire the two highest technical risks before building product workflows: single-thread Whisper on ordinary static hosting and streaming browser video encoding.

**User-visible outcome:** None in the production app. Developers can run two isolated local proof pages that demonstrate local transcription and a short encoded lyric-video clip.

**Architecture changes:** Establish ADRs, reproducible third-party build scripts, asset manifests, capability probes, and disposable proof harnesses under `spikes/`.

**Modules created or modified:**

- `docs/adr/0001-whisper-wasm.md`
- `docs/adr/0002-video-export.md`
- `docs/compatibility.md`
- `scripts/build-whisper-wasm.*`
- `scripts/fetch-models.*`
- `config/models.json`
- `spikes/whisper/`
- `spikes/video-export/`

**Dependencies introduced:** Pinned Emscripten build container/toolchain, `whisper.cpp` v1.8.6 source fetched at build time, Mediabunny, and minimal Vite/TypeScript spike tooling. Exact hashes and licenses are recorded before acceptance.

**Tasks:**

- [x] Resolve `whisper.cpp` v1.8.6 to a full commit SHA and pin the build toolchain by immutable digest.
- [x] Build separate single-thread JS/WASM artifacts from a minimal C API; prove the produced code contains no pthread or `SharedArrayBuffer` requirement.
- [x] Load `ggml-tiny-q5_1.bin`, transcribe a short public-domain 16 kHz mono fixture, and return segment plus token timing from a Web Worker.
- [x] Verify the same proof with `crossOriginIsolated === false` and `typeof SharedArrayBuffer === "undefined"` in the page harness.
- [x] Measure WASM/model/PCM peak-memory approximations and context disposal over three repeated runs.
- [x] Create the checked-in model manifest with source URL, byte size, upstream revision, SHA-256, model type, and language mode.
- [x] Encode a deterministic five-second 540p canvas animation with audio through WebCodecs + Mediabunny, then play the resulting Blob.
- [x] Probe VP9/Opus, VP8/Opus, AVC/AAC, and MediaRecorder MIME support; save facts, not browser-name assumptions.
- [x] Measure output duration and audio/video drift, and prove cancellation closes frames and encoders.
- [x] Document whether FFmpeg or hierarchical alignment is triggered by evidence; default is “not triggered.”
- [x] Record license findings and redistribution requirements for Whisper, models, Mediabunny, and test media.

**Tests added:** Vitest checks for manifest validation and capability normalization; Playwright smoke specs for both proof pages; a script that inspects generated WASM glue for forbidden thread assumptions.

**Risks:** Upstream browser examples may assume isolation; quantized models may not expose useful word timing; browser audio codec encoding may be unavailable; model redistribution metadata may be insufficient.

**Exit criteria:**

- [x] A real model transcribes the fixture in Chromium from a plain static server with no isolation headers.
- [x] The result includes monotonic timing evidence adequate for later word assembly.
- [x] A playable five-second WebM is produced with duration drift no greater than 100 ms.
- [x] A cancelled proof leaves no running worker/encoder and can be started again without reload.
- [x] ADRs contain immutable upstream revisions, asset hashes, licenses, benchmark observations, and fallback decisions.

**Demo procedure:** Run the static spike server, open each proof with `playwright-cli`, assert `crossOriginIsolated` is false, transcribe the fixture, export the clip, play it to completion, inspect the network log, and cancel/restart each job once.

**Relative complexity:** High and uncertainty-heavy.

---

## Phase 1 — Static application foundation and GitHub Pages

**Objective:** Create the production shell, engineering gates, accessible Windows 95 visual system, and reproducible Pages deployment.

**User-visible outcome:** A responsive BOLT95 window opens under both root and repository subpaths, shows local-processing/privacy messaging, runtime capability status, and disabled workflow steps.

**Architecture changes:** Add the layered source tree, Zustand app state, typed errors/jobs, capability service, base-path URL helper, test harness, and deployment workflow.

**Modules created or modified:** `src/app/`, `src/components/common/`, `src/domain/project/`, `src/infrastructure/capabilities/`, `src/infrastructure/diagnostics/`, `src/styles/`, `.github/workflows/`, Vite/Vitest/Playwright/ESLint/TypeScript configuration.

**Dependencies introduced:** React, Zustand, Zod, Vitest, Testing Library, axe-core, ESLint, Prettier, Playwright Test. Use exact lockfile versions selected during implementation.

**Tasks:**

- [x] Scaffold strict TypeScript/Vite React without a runtime router.
- [x] Add scripts for format check, lint, typecheck, unit, E2E, build, and preview-under-subpath.
- [x] Implement the semantic Windows 95 shell, stage navigation, status bar, dialogs, focus styles, reduced motion, and responsive stacking.
- [x] Implement `RuntimeCapabilities` probes, including codec probes, and map them to standard/compatibility/unsupported modes.
- [x] Implement typed `AppError`, privacy-safe diagnostics, and background job state.
- [x] Centralize asset construction using `import.meta.env.BASE_URL` and test workers, dynamic imports, icons, WASM, and models under `/BOLT95/`.
- [x] Inject app version, commit hash, schema version, renderer version, and engine versions at build time.
- [x] Add a restrictive CSP meta tag that still permits the verified worker/WASM/blob paths.
- [x] Add CI checks and official GitHub Pages artifact deployment with least-privilege permissions and concurrency.
- [x] Verify action major versions, then pin actions by full commit SHA with a version comment.
- [x] Add Dependabot for npm and GitHub Actions.

**Tests added:** Unit tests for capability mapping, asset URLs, error serialization, and build metadata; component accessibility tests; Playwright root/subpath shell tests and baseline screenshots at desktop and narrow widths.

**Risks:** CSP can block workers or WASM; Windows 95 styling can reduce accessibility; subpath bugs may only appear in the production build.

**Exit criteria:**

- [x] Format, lint, typecheck, unit tests, E2E tests, and production build pass from a clean checkout.
- [x] The built app loads with no console errors at `/` and `/BOLT95/`.
- [x] Keyboard traversal, focus visibility, capability messaging, and privacy notice pass axe and manual checks.
- [x] The Pages workflow uploads only static files and needs no secret or server runtime.

**Demo procedure:** Serve `dist` at `/BOLT95/`, use `playwright-cli` to resize to desktop/mobile, navigate every shell control by keyboard, inspect capabilities/diagnostics, and confirm all network URLs retain the base path.

**Relative complexity:** Medium.

---

## Phase 2 — Audio and lyrics import

**Objective:** Safely turn an MP3 plus pasted or imported lyrics into a valid in-memory project input with compact audio analysis.

**User-visible outcome:** Users can drop/select an MP3, paste lyrics or load TXT/LRC, see metadata and waveform, receive clear validation/risk warnings, and cancel preprocessing.

**Architecture changes:** Add file validation, decode/downmix/resample pipeline, audio fingerprinting, compact waveform analysis, lyrics file ingestion, and an audio worker using transferable buffers.

**Modules created or modified:** `src/components/import/`, `src/media/audio/`, `src/workers/audio.worker.ts`, `src/workers/protocol.ts`, `src/domain/lyrics/parser.ts`, `src/domain/project/schema.ts`, `src/test/fixtures/`.

**Dependencies introduced:** No media runtime dependency unless Phase 0 proves browser MP3 decode insufficient. Use built-in Web Audio and Web Crypto first.

**Tasks:**

- [x] Implement picker and drag/drop with keyboard-equivalent controls.
- [x] Validate zero-byte, MIME/extension mismatch, corrupt, over-size, and over-duration inputs without trusting file names.
- [x] Decode MP3, downmix channels, resample to 16 kHz mono Float32 PCM, and transfer ownership to the worker/job owner.
- [x] Compute duration, SHA-256 audio fingerprint, and compact min/max/RMS waveform data.
- [x] Implement configurable low/moderate/high processing-risk estimates with acknowledgement for high risk.
- [x] Parse UTF-8 TXT and existing LRC while preserving blank lines, stanza boundaries, metadata, and section annotations.
- [x] Keep the original File/Object URL for playback while avoiding duplicate full-buffer copies.
- [x] Implement progress, cancellation, cleanup, and recovery after decode failure.
- [x] Create synthetic legal fixtures: short valid MP3, silence, stereo, corrupt bytes, zero-byte, Unicode lyrics, and LRC.

**Tests added:** Deterministic resampler and waveform unit tests; file/parser validation tests; worker cancellation/transfer integration tests; Playwright picker/drop/error/retry flows.

**Risks:** `decodeAudioData` varies by browser; fingerprinting and decode can spike memory; drag/drop is not an accessible primary interaction.

**Exit criteria:**

- [x] A valid fixture yields correct metadata, finite 16 kHz mono samples, fingerprint, and waveform.
- [x] Resampling frequency/duration error stays within the documented fixture tolerance.
- [x] Invalid and corrupt files leave the import screen usable with a recovery action.
- [x] Cancelling releases the job and a second import succeeds without reload.

**Demo procedure:** Import valid audio by picker and drop, import Unicode TXT/LRC, inspect metadata/waveform, then exercise corrupt, oversize-warning, cancellation, and retry paths with `playwright-cli`.

**Relative complexity:** High.

---

## Phase 3 — Canonical lyrics and alignment engine

**Objective:** Build and prove the core React-independent domain pipeline against deterministic transcript fixtures.

**User-visible outcome:** A developer fixture page displays canonical lyric lines with automatic times, match provenance, confidence, and repeated-section ambiguity markers. Supplied text remains byte-for-byte canonical.

**Architecture changes:** Add structured parsing/tokenization, reversible normalization, global alignment, interpolation, line-time derivation, confidence scoring, versions, and fixture evaluation tools.

**Modules created or modified:** `src/domain/lyrics/`, `src/domain/alignment/`, `src/domain/project/`, `src/test/fixtures/alignment/`, `scripts/evaluate-alignment.ts`.

**Dependencies introduced:** A small Unicode-aware edit-distance/phonetic helper only if it beats a simple internal implementation in bundle and fixture evaluation; otherwise none.

**Tasks:**

- [x] Define versioned canonical token, transcript, aligned word/line, timing provenance, and review schemas.
- [x] Parse annotations separately and retain source offsets, exact display text, whitespace, and stanza structure.
- [x] Implement deterministic Unicode/case/space/punctuation/apostrophe/dash/diacritic/number/contraction normalization with language hooks.
- [x] Classify vocalizations and annotations without deleting their canonical representation.
- [x] Implement configurable candidate scoring and deterministic global dynamic-programming alignment with ordered backtracking.
- [x] Add monotonic anchor repair, weighted gap interpolation/extrapolation, minimum durations, track bounds, and non-overlapping line derivation.
- [x] Detect repeated blocks, suspicious jumps, large unmatched spans, and ambiguous regions.
- [x] Calculate line confidence/review state and preserve manual timing over future automatic runs.
- [x] Add fixtures for exact, substitutions, missing/extra words, fillers, repeated chorus, instrumental gaps, contractions, numbers, accents, non-English, silence, and wrong-song lyrics.
- [x] Benchmark alignment time/memory and run the hierarchical-alignment trigger criteria.

**Tests added:** Table/property tests for all normalization and timing invariants; golden alignment fixtures with expected ranges/provenance; repeated-section regression tests; long-input benchmark.

**Risks:** Flat dynamic programming is O(n*m); phonetic rules are language-specific; weak Whisper evidence can make repeated choruses inherently ambiguous.

**Exit criteria:**

- [x] Canonical input reconstructs exactly after normalization/alignment.
- [x] All persisted times are integer, monotonic, non-negative, and within duration.
- [x] Repeated chorus fixtures align in order or are explicitly marked ambiguous; they never jump backward.
- [x] Manual values survive re-alignment unless the test explicitly requests replacement.
- [x] The benchmark either stays within the recorded budget or produces an ADR and checked task for hierarchical alignment.

**Demo procedure:** Run the fixture viewer, switch among exact/repeated/wrong-song cases, inspect source/confidence, and show the automated evaluation report.

**Relative complexity:** Very high.

---

## Phase 4 — Local Whisper transcription

**Objective:** Convert imported PCM into normalized transcript timing locally through a robust, cancellable worker and cached model registry.

**User-visible outcome:** Users choose a language/model, explicitly download or supply it, watch honest load/transcription progress, cancel, clear cache, and receive a local transcript.

**Architecture changes:** Promote the Phase 0 wrapper into a typed adapter; add model registry/cache/integrity services, worker lifecycle, token-to-word conversion, and model storage management.

**Modules created or modified:** `src/media/transcription/`, `src/workers/whisper.worker.ts`, `src/infrastructure/storage/models.ts`, `src/components/transcript/`, `config/models.json`, model/build scripts.

**Dependencies introduced:** Phase 0 Whisper artifacts and Dexie. No cloud API or runtime secret.

**Tasks:**

- [ ] Validate the registry and select models by language mode, device risk, and user choice rather than hard-coded URLs.
- [ ] Download same-origin model assets only after explicit action with byte progress and abort support.
- [ ] Verify SHA-256 before use, cache the verified Blob, display cache size, and clear individual/all models.
- [ ] Support a user-supplied compatible GGML file with format/version/size errors that do not crash the worker.
- [ ] Implement INIT/RUN/CANCEL/DISPOSE typed messages with request correlation and transferable PCM.
- [ ] Map upstream segments/tokens into `TranscriptResult`, preserve raw evidence, assemble safe word timing, and report detected language when available.
- [ ] Dispose contexts between model switches and recover by worker termination when cooperative cancellation is unavailable.
- [ ] Add bounded full-track processing plus memory instrumentation; implement chunking only if the recorded trigger is crossed.
- [ ] Ensure the app remains responsive and processing works with no SharedArrayBuffer/cross-origin isolation.
- [ ] Add model corruption, download interruption, WASM init failure, OOM-risk, cancellation, and retry paths.

**Tests added:** Mock-adapter PR tests; real tiny-model opt-in integration test; cache/integrity tests; worker protocol tests; Playwright model download/cancel/cache-clear/transcribe flows with network interception.

**Risks:** Model memory pressure, misleading progress from upstream code, timestamp quality for singing, and browser limits on large buffers.

**Exit criteria:**

- [ ] The supported MP3 fixture transcribes locally into monotonic segments/words in non-isolated Chromium.
- [ ] UI interaction remains responsive during the job.
- [ ] Download, processing, and model switch can each be cancelled and restarted.
- [ ] Corrupt models fail integrity validation before inference, and cached models can be removed.
- [ ] Network logs show model/static requests only and no request contains audio, lyrics, or transcript content.

**Demo procedure:** With an empty cache, use `playwright-cli` to download tiny, transcribe, cancel/retry, switch model, clear storage, and inspect network/console/diagnostics.

**Relative complexity:** Very high.

---

## Phase 5 — Workflow integration and alignment review

**Objective:** Join import, transcription, and domain alignment into a recoverable application workflow without yet building the full editor.

**User-visible outcome:** Audio with optional supplied lyrics produces reviewable timed lines; no-lyrics mode uses editable transcript text; low-confidence navigation and stage retry work.

**Architecture changes:** Add application commands/state transitions, alignment worker, orchestration/cancellation, selected-region job boundaries, and review UI.

**Modules created or modified:** `src/app/commands/`, `src/app/state/`, `src/components/transcript/`, `src/workers/alignment.worker.ts`, `src/domain/alignment/`.

**Dependencies introduced:** None expected.

**Tasks:**

- [x] Define guarded transitions across Import, Transcribe, Align, Review, and later stages.
- [x] Run alignment off the main thread and keep the last valid project after any job failure.
- [x] In supplied-lyrics mode, display exact canonical text and use Whisper only as timing evidence.
- [x] In no-lyrics mode, derive editable lines from transcript segments while preserving evidence.
- [x] Show confidence text/icon states, match provenance details, unresolved export warnings, and “next low-confidence line.”
- [x] Implement cancellation and retry for each stage without repeating completed prior stages.
- [x] Implement selected-region re-alignment without overwriting manual timing outside the region.
- [x] Announce progress accessibly without fake precision and keep diagnostics content-free.

**Tests added:** Workflow reducer/command tests; canonical-text non-mutation integration test; stage failure/retry/cancel tests; Playwright both core user flows and keyboard confidence navigation.

**Risks:** Ownership bugs can duplicate PCM/model buffers; retry may corrupt state; no-lyrics line splitting may be poor.

**Exit criteria:**

- [x] Both “audio + lyrics” and “audio only” fixture flows reach a valid review state.
- [x] Supplied lyrics match the imported canonical text exactly.
- [x] Failure/cancellation leaves a serializable project and retry succeeds.
- [x] Low/unresolved regions are discoverable without relying on color.

**Demo procedure:** Run both flows with mocked deterministic transcription, navigate warnings, cancel/retry alignment, and compare canonical input with displayed/exportable project text.

**Relative complexity:** High.

---

## Phase 6 — Timeline editor and project persistence

**Objective:** Make timing and text correction practical, undoable, autosaved, and recoverable.

**User-visible outcome:** Users play/seek audio, inspect waveform and active lines, edit text/times, nudge/split/merge, set boundaries from the playhead, undo/redo, resume autosaves, and relink missing audio.

**Architecture changes:** Add transport controller, zoomable canvas timeline, undoable editor command model, project schema/migrations, IndexedDB repository, autosave, and relinking/fingerprint checks.

**Modules created or modified:** `src/components/timeline/`, `src/media/audio/playback.ts`, `src/app/commands/editor/`, `src/domain/project/`, `src/infrastructure/storage/projects.ts`.

**Dependencies introduced:** Dexie production usage; no waveform library.

**Tasks:**

- [x] Implement one authoritative playback clock with play/pause, seek, current time, and active-line highlighting.
- [x] Render compact waveform/timeline with zoom, keyboard alternatives, and text timing inputs.
- [x] Add selection, line text/start/end edits, nudges, split, merge, reviewed state, and explicit manual provenance.
- [x] Add set-start/set-end-at-playhead and shortcuts: Space, arrows, Shift+arrows, up/down, platform undo/redo.
- [x] Suppress global shortcuts while typing except appropriate editor conventions.
- [x] Enforce timing bounds/non-overlap with clear validation and retain instrumental gaps.
- [x] Implement bounded undo/redo using commands/patches, not whole PCM/project copies.
- [x] Define project schema v1, runtime validation, migrations, future-version rejection, and atomic IndexedDB writes.
- [x] Autosave edits off the playback-critical path and restore after reload.
- [x] Export/import project JSON without audio; relink by metadata/fingerprint and warn on mismatch.
- [x] Add project list/delete and clear-local-data controls with storage-eviction messaging.

**Tests added:** Editor command/invariant tests; migration and malformed/future JSON tests; IndexedDB save/reload tests; Playwright keyboard editing, undo/redo, reload restore, relink match/mismatch, and local-data deletion.

**Risks:** Audio clock/UI drift, undo memory growth, autosave races, and browser storage eviction.

**Exit criteria:**

- [x] Every required line-level edit works by keyboard and undo/redo restores exact prior state.
- [x] Playback remains usable during autosave and active-line changes at the expected time.
- [x] Reload restores the last autosave; missing audio can be relinked with fingerprint verification.
- [x] Malformed/future project files cannot mutate stored state and show a recovery message.

**Demo procedure:** Edit the deterministic project entirely by keyboard, set timing during playback, undo/redo, reload, resume, export/import JSON, relink matching then mismatching audio, and clear local data.

**Relative complexity:** Very high.

---

## Phase 7 — Timed-text and project exports

**Objective:** Deliver reliable useful exports independently of video support.

**User-visible outcome:** Users preview and download LRC, enhanced LRC when word timing exists, SRT, VTT, and versioned project JSON with warnings for unresolved timing.

**Architecture changes:** Add pure caption serializers, central timing/filename policies, Blob download service, and export validation.

**Modules created or modified:** `src/domain/captions/`, `src/infrastructure/downloads/`, `src/components/export/`.

**Dependencies introduced:** None expected.

**Tasks:**

- [x] Define documented rounding, minimum cue duration, overlap repair, empty/annotation behavior, metadata, Unicode, and filename sanitation policies.
- [x] Implement plain LRC and enhanced LRC serializers.
- [x] Implement SRT and WebVTT serializers.
- [x] Implement project JSON export/import round-trip with version/build metadata and no embedded audio.
- [x] Validate monotonic output before enabling download and show low-confidence/unresolved warnings.
- [x] Generate Blob downloads, revoke object URLs, and reject filename/path injection.
- [x] Add text preview and accessible success/failure status.

**Tests added:** Golden serializer tests for Unicode, hours, rounding boundaries, overlaps, annotations, and word timing; property tests for monotonic timestamps; project round-trip; Playwright download/content checks.

**Risks:** Format conventions differ across players; repair policy could hide bad project timing; enhanced LRC variants are not fully standardized.

**Exit criteria:**

- [x] All four subtitle formats pass golden tests and download with safe names/UTF-8 content.
- [x] Every cue is valid, monotonic, and meets documented duration/overlap rules.
- [x] Project JSON round-trips without audio and preserves canonical text/manual provenance.
- [x] Subtitle export works with all video APIs disabled.

**Demo procedure:** Export every format from the Unicode/repeated-section fixture, inspect downloaded content and MIME/name, then disable video APIs and repeat LRC export.

**Relative complexity:** Medium.

---

## Phase 8 — Deterministic preview and visual styling

**Objective:** Create one deterministic canvas layout/rendering pipeline shared by live preview and eventual export.

**User-visible outcome:** Users preview lyrics in square, portrait, and landscape presets; adjust a constrained theme; see current/previous/next lines, optional word highlight, safe areas, and an optional local background image.

**Architecture changes:** Add pure layout/typography/theme domain modules, canvas frame renderer, preview loop, versioned visual configuration, and background-image lifecycle.

**Modules created or modified:** `src/domain/rendering/`, `src/media/preview/`, `src/components/preview/`, `src/components/style/`.

**Dependencies introduced:** None expected; use Canvas 2D and bundled/system fonts.

**Tasks:**

- [x] Define visual schema/defaults and all six design presets (three full and three draft).
- [x] Implement pure layout for safe areas, wrapping, long words, Unicode, current/adjacent lines, and high-contrast outline/shadow.
- [x] Implement a deterministic `FrameRenderer` independent of live DOM.
- [x] Share time-to-active-line/word logic with export and respect reduced motion.
- [x] Add background color/image, optional blur, font/size, colors, alignment, position, transition, and highlight controls.
- [x] Keep local image bytes out of ordinary project JSON; restore/relink safely and revoke URLs.
- [x] Add responsive preview scaling without changing logical output dimensions.
- [x] Add renderer version to project/build diagnostics.

**Tests added:** Layout unit tests; pixel/visual regression fixtures for every ratio, Unicode, long lines, current-word highlight, safe areas, and reduced motion; Playwright style interactions.

**Risks:** Font metrics differ across platforms; canvas snapshots can be noisy; preview scaling can diverge from export.

**Exit criteria:**

- [x] All required presets render correct logical dimensions and safe-area bounds.
- [x] The same frame input produces the same layout in preview and headless export harness.
- [x] Long/Unicode lines remain visible and high-contrast mode meets the recorded contrast target.
- [x] Visual baselines pass in the pinned Chromium environment.

**Demo procedure:** Load the deterministic project, cycle ratios/themes at fixed timestamps, compare snapshots, resize the browser, toggle reduced motion/high contrast, and inspect background cleanup.

**Relative complexity:** High.

---

## Phase 9 — Draft video export

**Objective:** Ship one bounded, tested, cancellable video path using the exact preview renderer.

**User-visible outcome:** Supported Chromium users can export a short 540p WebM draft with audio, progress, cancellation, workload/memory warnings, and a downloadable playable result.

**Architecture changes:** Add export backend interface/selector, frame scheduler, WebCodecs/Mediabunny implementation, audio pipeline, streaming output sink, estimates, and result verification.

**Modules created or modified:** `src/media/export/backend.ts`, `src/media/export/webcodecs/`, `src/workers/render.worker.ts`, `src/components/export/`.

**Dependencies introduced:** Pinned Mediabunny version with MPL-2.0 notice.

**Tasks:**

- [x] Implement backend support probing and expose only verified codec/container combinations.
- [x] Implement draft presets at a fixed documented frame rate and bounded duration.
- [x] Render frames sequentially from the shared renderer and close every `VideoFrame` after encode.
- [x] Encode/mux original decoded audio with timestamps derived from one media clock.
- [x] Stream/batch output rather than retaining frames or the full encoded chunk list where the muxer allows.
- [x] Report preparation/frame/flush/finalization progress without invented time remaining.
- [x] Estimate risk from duration, resolution, frame rate, device memory, and codec support.
- [x] Cancel by aborting scheduling, closing encoders/frames, discarding partial output, and returning to a valid project.
- [x] Verify the generated Blob can be decoded, duration drift is within 100 ms for the fixture, and the last lyric frame is present.
- [x] Disable the backend with an actionable explanation when capability probes fail.

**Tests added:** Backend selection and estimate tests; five-second integration encode/decode test; duration/sync assertion; cancellation/resource instrumentation; Playwright export/download/playback flow.

**Risks:** Audio encoding support differs from video support; WebCodecs may be exposed but reject a configuration; muxing can require seekable output; long main-thread canvas work can freeze UI.

**Exit criteria:**

- [x] A deterministic five-second 540p WebM with audio exports and plays in primary Chromium.
- [x] Preview and exported reference frames match within the documented pixel tolerance.
- [x] Audio/video duration mismatch is no greater than 100 ms on the fixture.
- [x] Cancellation releases resources and a second export succeeds without reload.
- [x] Unsupported environments retain all editing and subtitle functionality.

**Demo procedure:** Export each draft aspect ratio, inspect progress and playback, compare fixed-time screenshots with preview, cancel midway, restart, and emulate missing WebCodecs.

**Relative complexity:** Very high.

---

## Phase 10 — Full export, fallbacks, and cancellation

**Objective:** Expand export safely to measured full-resolution jobs and a compatibility backend without making unsupported format promises.

**User-visible outcome:** Users see only valid full/draft options for their device, can use MediaRecorder fallback where available, receive high-memory warnings, and can cancel any expensive operation.

**Architecture changes:** Add full preset policies, MediaRecorder backend, optional codec/container variants, global job/resource lifecycle audits, and benchmark-driven risk gates.

**Modules created or modified:** `src/media/export/mediarecorder/`, `src/media/export/webcodecs/`, `src/infrastructure/capabilities/`, all workers/job owners, export UI.

**Dependencies introduced:** None expected. Introduce single-thread `ffmpeg.wasm` only through a new ADR if measured coverage proves it necessary and bounded.

**Tasks:**

- [x] Benchmark square/portrait/landscape full presets and set recommended resolution/device limits without capping full-export duration.
- [x] Add full-resolution choices behind capability and risk gates; never silently lower quality.
- [x] Add MediaRecorder canvas fallback with probed MIME types, deterministic start/stop handling, and documented preview-rate limitations.
- [x] Evaluate AVC/AAC MP4 only through configuration support plus actual encode/mux/decode tests; hide it otherwise.
- [x] Audit cancellation for model download/load, preprocessing, transcription, alignment, waveform, render, and encode.
- [x] Audit cleanup for object URLs, buffers, workers, WASM state, contexts, frames, canvases, encoders, and temporary storage.
- [x] Verify failure of one backend permits another backend or timed-text export without project loss.
- [x] Establish output sync tolerance for longer fixtures and fail validation rather than download corrupt output.
- [x] Decide with evidence whether FFmpeg is needed; if yes, create a separately checkable implementation phase/ADR before adding it.

**Tests added:** Capability matrices with mocked APIs; backend failover; full-preset bounded integration tests; long-fixture sync; cancellation/restart for every expensive job; repeated-export leak smoke test.

**Risks:** Full portrait video is memory-intensive; MediaRecorder timing is less deterministic; browser codec claims may not match successful mux/playback.

**Exit criteria:**

- [x] All three full aspect ratios are offered only on benchmark-qualified configurations.
- [x] At least one production video path works in primary Chromium and one documented fallback behavior is verified.
- [x] Unsupported formats are hidden/disabled with a reason and never create a broken download.
- [x] All expensive jobs cancel to a valid state and can be restarted.
- [x] Repeated bounded exports show no unbounded resource growth in the recorded test.

**Demo procedure:** Exercise capability matrices, a full export, fallback selection, forced primary-backend failure, high-risk warning, and cancellation/restart while monitoring memory and downloaded playback.

**Relative complexity:** Very high.

---

## Phase 11 — Hardening, performance, PWA, and release

**Objective:** Validate the complete product against acceptance criteria, browsers, privacy/security constraints, and real deployment behavior.

**User-visible outcome:** A documented GitHub Pages release supports the end-to-end local workflow, local-data management, installable/offline shell where practical, and safe diagnostics.

**Architecture changes:** Add app-shell service worker/PWA manifest, release documentation, compatibility/limits table, security policy, benchmark harness, and final deployment gates.

**Modules created or modified:** `src/infrastructure/service-worker/`, `public/manifest.*`, `docs/`, `README.md`, `THIRD_PARTY_NOTICES.md`, CI/release workflows, full test corpus.

**Dependencies introduced:** A minimal Vite PWA helper only if it generates a narrower and more auditable service worker than the same small implementation in-house.

**Tasks:**

- [ ] Run the full acceptance matrix from DESIGN.md sections 24 and 28 and link evidence for every item.
- [ ] Run Chromium release tests plus Firefox/Safari best-effort matrices; document exact capability-derived differences.
- [ ] Verify `/BOLT95/` deployment, refresh, worker/WASM/model URLs, custom base configuration, and update from one app version to the next.
- [ ] Add an installable app shell with versioned immutable caches; exclude model URLs, blobs, IndexedDB, OPFS, and user media.
- [ ] Verify first load, offline shell reload, service-worker update, cache deletion, and operation with service workers disabled.
- [ ] Use Playwright network inspection to prove no imported content is uploaded and no third-party runtime request is required after deployment.
- [ ] Fuzz/boundary-test malformed lyrics, LRC, project JSON, file names, model metadata, and worker messages.
- [ ] Audit CSP, dependency advisories, licenses/notices, generated artifacts, filename sanitation, and absence of `eval`.
- [ ] Benchmark representative low/medium/high configurations and publish limits for duration, file size, model, and export presets.
- [ ] Add “copy diagnostics” with only approved fields and tests excluding content.
- [ ] Document privacy, supported browsers, model downloads/storage, local-data deletion, accessibility, keyboard shortcuts, formats, limitations, and recovery.
- [ ] Confirm no models/media/build outputs are tracked and reproduce CI from a clean checkout.
- [ ] Deploy the release candidate and run the production smoke test before tagging.

**Tests added:** Full E2E suite, privacy network assertions, accessibility scans/manual checklist, service-worker update/offline tests, visual regression, fuzz/boundary suite, benchmarks, and production Pages smoke test.

**Risks:** Service-worker updates can stale the app; performance varies widely; browser updates can change codecs; Pages asset delivery can expose base-path mistakes.

**Exit criteria:**

- [ ] A user can complete import → local transcribe → canonical alignment → edit → subtitle export → three-ratio preview → tested video export on the deployed Pages URL.
- [ ] The complete baseline works with no SharedArrayBuffer, cross-origin isolation, OPFS, persistent-storage grant, preferred codec, or service worker.
- [ ] Privacy, accessibility, resilience, deployment, and format acceptance checks all pass with linked evidence.
- [ ] Documentation and third-party notices match the shipped build and its measured limits.
- [ ] The clean-checkout build is reproducible and the production smoke test passes.

**Demo procedure:** From a clean browser profile on the production Pages URL, complete both core user flows, inspect network traffic, cancel/retry jobs, restore an autosave, export every timed-text format and one video, switch all ratios, clear local data, disable advanced APIs, and rerun the compatibility path.

**Relative complexity:** High.

---

## Acceptance coverage index

| Design acceptance area | Primary phase(s) |
|---|---|
| GitHub Pages/static deployment/base path | 1, 11 |
| Privacy and local-only network behavior | 1, 4, 11 |
| MP3 decode/preprocess | 2 |
| Whisper single-thread transcription | 0, 4 |
| Canonical alignment/repeated sections/confidence | 3, 5 |
| Editing/undo/autosave/relink | 6 |
| LRC/enhanced LRC/SRT/VTT/project JSON | 7 |
| Three-ratio canvas preview/themes | 8 |
| Draft and production video | 9, 10 |
| Cancellation/resource cleanup | 2, 4, 5, 9, 10 |
| Capability fallbacks/resilience | 1, 10, 11 |
| Accessibility/security/diagnostics/performance | all phases, final audit in 11 |

## Planning sources checked

Version-sensitive choices must be rechecked when their implementation phase starts. Planning review performed 2026-07-06:

- [`whisper.cpp` repository and browser examples](https://github.com/ggml-org/whisper.cpp)
- [`whisper.cpp` releases](https://github.com/ggml-org/whisper.cpp/releases)
- [`whisper.wasm` browser template](https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/index-tmpl.html)
- [Upstream converted GGML model repository](https://huggingface.co/ggerganov/whisper.cpp)
- [Mediabunny repository](https://github.com/Vanilagy/mediabunny)
- [`ffmpeg.wasm` repository](https://github.com/ffmpegwasm/ffmpeg.wasm)
- [Official `deploy-pages` action](https://github.com/actions/deploy-pages)
