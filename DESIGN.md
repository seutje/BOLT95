# DESIGN.md

# BOLT95: Browser-Only Lyric Timing (and Video Export Application)

**Document status:** Initial implementation design  
**Target deployment:** GitHub Pages only  
**Application type:** Static, client-side web application  
**Primary stack:** React, TypeScript, Vite, Web Workers, WebAssembly  
**Primary processing libraries:** `whisper.cpp` compiled to WebAssembly; `ffmpeg.wasm` or equivalent browser media tooling  
**Audience:** Coding agent responsible for producing and executing a multi-phase implementation plan
**Visual Style:** Old Windows 95 Application

---

## 1. Purpose

This document defines the product, architecture, constraints, interfaces, data model, processing pipeline, user experience, testing strategy, deployment model, and acceptance criteria for a browser-only application that:

1. Accepts an audio file, initially MP3.
2. Accepts optional plain-text lyrics.
3. Runs Whisper transcription locally in the browser.
4. Uses supplied lyrics as the authoritative text when available.
5. Aligns supplied lyrics to Whisper-derived timestamps.
6. Provides an interface for reviewing and correcting lyric timing.
7. Exports timed lyric formats.
8. Renders lyric videos in multiple aspect ratios.
9. Runs entirely as static files hosted by GitHub Pages.
10. Does not upload user media, lyrics, transcripts, or rendered output to any server.

The coding agent receiving this document must create a multi-phase implementation plan before implementation. The plan should preserve the architectural boundaries and scope controls defined here.

---

## 2. Product Summary

The application is a local-first lyric timing and lyric-video generator. A user loads an audio track and may paste or load lyrics. The application transcribes the audio with a browser-compiled Whisper model, aligns the transcript to the supplied lyrics, lets the user correct timing, previews a lyric video, and exports subtitles or a video.

The central product value is not raw transcription. The central value is **reliable timing of known lyrics against an audio recording**, followed by convenient correction and media export.

When lyrics are supplied:

- The supplied lyrics are treated as canonical text.
- Whisper output is used primarily as timing evidence.
- Whisper wording must not silently replace supplied lyric wording.
- Mismatches must be represented through confidence scores and review markers.
- Repeated sections must be handled explicitly rather than aligned greedily.

When lyrics are not supplied:

- Whisper output becomes the initial editable lyric text.
- The user can correct text and timing manually.
- The same project and export pipeline is used.

---

## 3. Non-Negotiable Constraints

### 3.1 GitHub Pages only

The production application must be deployable as a GitHub Pages site.

The implementation must not require:

- A custom web server.
- Server-side rendering.
- API routes.
- A database server.
- Cloud functions.
- A media-processing backend.
- Server-controlled response headers.
- Authentication infrastructure.
- A proxy service.
- Runtime secrets.
- Paid hosted APIs.

GitHub Actions may be used for build, test, packaging, and GitHub Pages deployment.

### 3.2 Static application

All runtime resources must be downloadable as static assets:

- HTML.
- JavaScript.
- CSS.
- Web Workers.
- WASM binaries.
- Model metadata.
- Optional model files.
- Fonts and icons.
- Service-worker files.
- Application manifests.

External assets are permitted only when they are optional, have compatible CORS behavior, and do not compromise offline/local-first operation. First-party hosting from the GitHub Pages artifact is preferred.

### 3.3 Browser-only processing

Audio decoding, transcription, alignment, timeline editing, preview rendering, encoding, and export must occur in the browser.

No media or lyric content may be uploaded.

### 3.4 Single-threaded baseline

The application must function without `SharedArrayBuffer`, cross-origin isolation, or WebAssembly threads.

This is required because GitHub Pages does not provide general control over COOP/COEP response headers. A service-worker-based cross-origin-isolation shim may be investigated as an optional enhancement, but:

- It must not be required for core functionality.
- The application must detect whether it is active.
- The application must retain a non-isolated compatibility path.
- Failure of the shim must not make the app unusable.
- The initial implementation should prioritize the compatibility path.

### 3.5 Privacy

The UI must state clearly that processing happens locally.

The application must not include analytics that capture:

- Audio contents.
- Lyrics.
- Transcripts.
- Project files.
- File names without explicit consent.
- Rendered output.

Any future telemetry must be opt-in, content-free, and outside the initial scope.

---

## 4. Goals

### 4.1 Primary goals

1. Produce useful line-level lyric timing from an MP3 and optional lyrics.
2. Preserve supplied lyric text exactly except for reversible normalization.
3. Make alignment errors easy to identify and correct.
4. Export LRC, SRT, WebVTT, and project JSON.
5. Export lyric videos in square, portrait, and landscape formats.
6. Keep the browser responsive during expensive work.
7. Recover gracefully from memory pressure, unsupported features, and partial failures.
8. Deploy reliably to a GitHub Pages project site or user/organization site.
9. Support a configurable base path.
10. Avoid hidden dependence on server features.
11. Don't commit any models that can be downloaded during the gh-actions build step.

### 4.2 Secondary goals

1. Cache selected Whisper models locally.
2. Persist projects locally.
3. Support word-level highlighting when timestamp quality permits.
4. Provide low-resolution draft exports.
5. Resume interrupted editing sessions.
6. Offer an installable PWA where practical.
7. Permit offline operation after required assets and models have been cached.

---

## 5. Non-Goals for the Initial Product

The initial product is not intended to provide:

- Perfect syllable-level karaoke synchronization.
- Vocal/instrumental source separation.
- Multi-speaker diarization.
- Cloud project synchronization.
- User accounts.
- Collaborative editing.
- DRM-protected audio support.
- Direct publishing to YouTube, TikTok, Instagram, or other services.
- Native mobile applications.
- Full non-linear video editing.
- Arbitrary FFmpeg command execution.
- Unlimited track duration or resolution.
- Guaranteed real-time transcription.
- Guaranteed H.264 output in every browser.
- Server-side fallbacks.
- Licensed distribution of copyrighted model or media assets without review.
- Automatic acquisition of lyrics from third-party services.
- Automatic identification of songs.
- Translation of lyrics.

These may be considered later but must not influence the initial architecture in ways that delay the core workflow.

---

## 6. Assumptions

1. Most users will use a modern desktop Chromium browser.
2. Firefox and Safari should receive best-effort support.
3. Mobile browsers may be constrained by memory, file handling, background suspension, and codec support.
4. Songs are harder to transcribe than ordinary speech.
5. Browser-only encoding may be several times slower than playback duration.
6. Small Whisper models are the practical default for GitHub Pages distribution and browser execution.
7. Users are willing to make manual corrections when automatic timing confidence is low.
8. Audio tracks will commonly be three to six minutes long.
9. The app must set clear expectations before starting expensive processing.
10. Browser capabilities vary enough that feature detection is mandatory.

---

## 7. User Personas

### 7.1 Casual creator

Wants a portrait lyric video for social media. Has an MP3 and lyrics. Expects a guided workflow and sensible defaults.

### 7.2 Musician or producer

Wants timed lyrics or subtitle files for an original song. Values privacy, accuracy, and editable timing.

### 7.3 Power user

Wants detailed timing controls, project JSON, confidence data, repeatable exports, and keyboard shortcuts.

### 7.4 Low-resource user

Uses a device with limited memory or CPU. Needs a compatibility mode, smaller model, draft resolution, and failure-safe behavior.

---

## 8. Core User Flows

### 8.1 Audio plus supplied lyrics

1. User opens the application.
2. Capability checks run.
3. User selects an MP3.
4. User pastes lyrics or selects a text/LRC file.
5. App validates the inputs.
6. User chooses language and model.
7. App decodes and resamples the audio.
8. App runs Whisper locally.
9. App normalizes and aligns supplied lyrics to Whisper output.
10. App shows alignment results and confidence warnings.
11. User reviews playback and corrects line or word timing.
12. User chooses subtitle or video export.
13. App renders locally.
14. User downloads the output.

### 8.2 Audio without supplied lyrics

1. User selects an MP3.
2. App transcribes locally.
3. Transcript is converted into editable lyric lines.
4. User edits text and line breaks.
5. User corrects timing.
6. User exports subtitles or video.

### 8.3 Existing project

1. User loads a project JSON file or resumes a locally stored project.
2. App validates schema version.
3. App asks for the audio file again if the browser did not persist access to it.
4. App verifies the audio fingerprint where possible.
5. User continues editing or exports.

---

## 9. Functional Requirements

### 9.1 Audio import

The app must:

- Accept MP3 in the first implementation.
- Use file picker and drag-and-drop.
- Display file name, size, detected duration, and format.
- Reject zero-byte and obviously invalid files.
- Warn before processing files that exceed tested thresholds.
- Decode audio using browser facilities or a bundled fallback.
- Convert input to the PCM format required by Whisper.
- Preserve the original audio for export where possible.
- Avoid unnecessary full-buffer copies.

Future-compatible design should allow WAV, M4A/AAC, OGG, and FLAC.

### 9.2 Lyrics input

The app must support:

- Plain text pasted into an editor.
- `.txt` import.
- Existing `.lrc` import.
- Existing `.srt` or `.vtt` import as a later extension.
- UTF-8 and Unicode text.
- Section labels such as `[Verse 1]` and `[Chorus]`.
- Blank lines and stanza structure.
- Optional metadata lines.

The input parser must distinguish lyric content from structural annotations. Structural annotations must be retained in the project but excluded from normal word alignment unless explicitly configured.

### 9.3 Whisper model selection

The interface must support a model registry instead of hard-coding one model.

Each model entry should define:

```ts
export interface WhisperModelDescriptor {
  id: string;
  displayName: string;
  fileName: string;
  url: string;
  sizeBytes?: number;
  sha256?: string;
  languageMode: "multilingual" | "english-only";
  recommendedDeviceClass: "low" | "medium" | "high";
  bundled: boolean;
}
```

Initial recommendations:

- Tiny multilingual or quantized tiny as the low-resource option.
- Base multilingual or quantized base as the normal option.
- Larger models may be supported only as user-supplied model files or experimental downloads.

The design must allow:

- Bundled model assets.
- Model download on demand.
- User-supplied compatible model files.
- Local model caching.
- Model cache clearing.
- Model integrity checking when hashes are available.

The coding agent must verify current `whisper.cpp` browser/WASM model compatibility before selecting exact model artifacts.

### 9.4 Transcription

Transcription must run outside the main UI thread.

The transcription subsystem must:

- Accept mono PCM at the required sample rate.
- Report initialization, model loading, processing, and completion progress.
- Support cancellation.
- Return segment timestamps.
- Return token or word timestamps where supported and reliable.
- Return detected language or language confidence where available.
- Surface recoverable errors.
- Dispose WASM state after use or when switching models.
- Avoid keeping duplicate model buffers in memory.

A normalized internal output is required:

```ts
export interface TranscriptWord {
  id: string;
  text: string;
  normalizedText: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  segmentId: string;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  words: TranscriptWord[];
}

export interface TranscriptResult {
  language?: string;
  durationMs: number;
  segments: TranscriptSegment[];
  modelId: string;
  engineVersion: string;
}
```

If only token timestamps are available, the adapter must convert them into the closest safe word representation. It must preserve the original timing evidence so alignment can be revisited.

### 9.5 Lyrics normalization

Normalization must produce an alignment representation without modifying canonical display text.

The normalizer should support:

- Unicode normalization.
- Case folding.
- Whitespace collapse.
- Punctuation removal for matching.
- Apostrophe normalization.
- Dash normalization.
- Optional diacritic-insensitive comparison.
- Number-word equivalence.
- Common contraction equivalence.
- Repeated punctuation.
- Parenthetical backing-vocal notation.
- Section headings.
- Common vocal fillers such as “oh,” “ooh,” “ah,” “yeah,” and “la.”
- Configurable language-specific rules.

Each canonical token must retain source offsets:

```ts
export interface CanonicalLyricToken {
  id: string;
  lineId: string;
  canonicalText: string;
  normalizedText: string;
  sourceStart: number;
  sourceEnd: number;
  tokenType: "word" | "vocalization" | "annotation";
}
```

Normalization must be deterministic and unit tested.

### 9.6 Alignment

The alignment engine is a core domain module and must not depend on React.

It must align canonical lyric tokens to timed transcript words.

The implementation should use dynamic programming or another globally optimized sequence-alignment method. A purely greedy word matcher is not acceptable.

The scoring system should consider:

- Exact normalized match.
- Alternate normalized match.
- Edit-distance similarity.
- Phonetic similarity where practical.
- Common Whisper confusions.
- Insertion and deletion penalties.
- Lower penalties for optional vocalizations.
- Timing continuity.
- Line boundaries.
- Segment boundaries.
- Repeated lyric sections.
- Large unmatched gaps.
- Confidence of Whisper observations.

The output must represent match type rather than only a final timestamp:

```ts
export type AlignmentSource =
  | "exact"
  | "normalized"
  | "fuzzy"
  | "phonetic"
  | "interpolated"
  | "extrapolated"
  | "manual"
  | "unresolved";

export interface AlignedLyricWord {
  id: string;
  lineId: string;
  canonicalText: string;
  startMs: number | null;
  endMs: number | null;
  source: AlignmentSource;
  confidence: number;
  transcriptWordIds: string[];
}
```

#### Repeated sections

Repeated choruses and refrains are a major failure mode. The alignment engine must not assume that the first textual match is the correct occurrence.

At minimum, it must:

- Preserve full lyric order.
- Preserve transcript time order.
- Penalize backward time movement.
- Prefer globally consistent paths.
- Detect suspiciously large jumps.
- Expose ambiguous regions.

A later phase may add section-aware alignment, where repeated blocks are first aligned at section level and then at word level.

#### Interpolation

Unmatched canonical words between reliable anchors should receive interpolated timing.

Interpolation rules:

- Never overlap adjacent anchored words.
- Respect line boundaries.
- Use character, phoneme, or syllable weights when available.
- Use equal weighting only as a fallback.
- Enforce a minimum word duration.
- Avoid assigning timing into detected long silence unless the line spans it.
- Mark interpolated words with reduced confidence.

Words before the first anchor and after the last anchor may be extrapolated only within conservative limits.

#### Line timing

Line start and end should derive from aligned words but remain editable.

Default rule:

- `line.startMs` = first timed word start.
- `line.endMs` = last timed word end plus optional display tail.
- Adjacent lines must not overlap unless a theme explicitly supports overlapping display.
- Instrumental gaps remain gaps.

### 9.7 Confidence and review

Every line must receive a confidence score derived from:

- Percentage of exact or strong matches.
- Number of interpolated words.
- Timing continuity.
- Whisper confidence.
- Ambiguity of repeated sections.
- Presence of large unmatched spans.
- Manual edits.

Suggested confidence states:

- High: no review marker.
- Medium: subtle warning.
- Low: mandatory review marker.
- Unresolved: export warning.

The UI must provide “next low-confidence line” navigation.

### 9.8 Timeline editor

The editing interface must include:

- Audio playback.
- Play/pause.
- Current time.
- Scrubbing.
- Waveform or simplified amplitude overview.
- Zoomable timeline where practical.
- Lyric line list.
- Active-line highlighting.
- Editable line text.
- Editable line start and end times.
- Nudge controls.
- Split line.
- Merge with previous or next line.
- Re-run alignment for a selected region where feasible.
- Mark timing as reviewed.
- Undo and redo.
- Keyboard shortcuts.
- Autosave.

Word-level editing can be phased after reliable line-level editing.

Minimum keyboard controls:

- Space: play/pause.
- Left/right: seek.
- Shift plus left/right: fine seek.
- Enter or assigned shortcut: set selected line start to playhead.
- Another explicit shortcut: set line end.
- Up/down: select previous/next line.
- Undo/redo using platform conventions.

All shortcuts must be disabled while typing in a text field unless appropriate.

### 9.9 Project persistence

Projects must be serializable to JSON and optionally persisted locally.

Use a schema with explicit versioning:

```ts
export interface LyricVideoProject {
  schemaVersion: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;

  audio: ProjectAudioReference;
  transcript?: TranscriptResult;
  lyrics: ProjectLyrics;
  alignment: ProjectAlignment;
  visual: VisualConfiguration;
  exportDefaults: ExportConfiguration;
  historyMetadata?: HistoryMetadata;
}
```

Do not embed the full audio file in ordinary project JSON.

The audio reference should include:

```ts
export interface ProjectAudioReference {
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  durationMs: number;
  fingerprint?: string;
}
```

The application may persist media blobs to IndexedDB or OPFS if practical, but must handle browsers that evict storage.

The app must support:

- Export project JSON.
- Import project JSON.
- Schema validation.
- Migration between supported schema versions.
- Clear error messages for unsupported future versions.
- Re-linking an audio file.
- Audio fingerprint mismatch warning.

### 9.10 Subtitle export

Required outputs:

- Plain LRC.
- Enhanced LRC when word timing exists.
- SRT.
- WebVTT.
- Project JSON.

Export behavior must define:

- Timestamp rounding.
- Minimum cue duration.
- Overlap handling.
- Empty-line handling.
- Annotation handling.
- Unicode output.
- File naming.
- Metadata inclusion.
- Whether low-confidence cues produce warnings.

Subtitle export should not require FFmpeg.

### 9.11 Video preview

Preview must be separate from final encoding.

Use a canvas-based renderer with a deterministic render function:

```ts
export interface RenderFrameContext {
  timeMs: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  project: Readonly<LyricVideoProject>;
  audioAnalysis?: AudioAnalysisFrame;
}

export interface FrameRenderer {
  render(ctx: CanvasRenderingContext2D, frame: RenderFrameContext): void;
}
```

The same layout logic should be shared between preview and export to prevent visual mismatch.

The renderer must not depend on the live DOM for individual frames.

### 9.12 Visual presets

Required aspect-ratio presets:

| Name | Ratio | Default output |
|---|---:|---:|
| Square | 1:1 | 1080 × 1080 |
| Portrait | 9:16 | 1080 × 1920 |
| Landscape | 16:9 | 1920 × 1080 |
| Draft Square | 1:1 | 540 × 540 |
| Draft Portrait | 9:16 | 540 × 960 |
| Draft Landscape | 16:9 | 960 × 540 |

The application should initially include a small number of robust themes rather than a broad template system.

Initial theme:

- Background color or image.
- Optional blurred image treatment.
- Current lyric line.
- Previous and next line.
- Current word highlighting when available.
- Text alignment.
- Font family.
- Font size.
- Text and highlight colors.
- Outline or shadow.
- Safe-area padding.
- Transition duration.

The project schema should allow future themes without breaking old projects.

### 9.13 Video export

Video export must be capability-driven and may have multiple backends.

Preferred architecture:

```ts
export interface VideoExportBackend {
  id: string;
  isSupported(capabilities: RuntimeCapabilities): Promise<boolean>;
  estimate(job: VideoExportJob): Promise<VideoExportEstimate>;
  export(
    job: VideoExportJob,
    events: ExportEventSink,
    signal: AbortSignal
  ): Promise<VideoExportResult>;
}
```

Potential backends:

1. WebCodecs plus a browser-compatible muxer.
2. MediaRecorder canvas capture plus remuxing.
3. Single-thread `ffmpeg.wasm`.
4. Limited compatibility export, such as WebM.

The exact implementation order belongs in the coding agent’s phase plan, but the application must not assume that a single codec or container works in every browser.

Required behavior:

- Feature-detect codecs.
- Offer only valid export combinations.
- Provide a low-resolution draft option.
- Display expected workload without promising exact completion time.
- Report frame and encoding progress.
- Permit cancellation.
- Release frames and buffers promptly.
- Warn before high-memory exports.
- Prevent the screen from appearing frozen.
- Preserve audio synchronization.
- Verify output duration within a defined tolerance.
- Download the output as a Blob.

#### Initial output policy

A realistic first production target is:

- WebM/VP8 or VP9 where browser-native encoding is available.
- MP4 only where a tested browser path is available.
- Single-thread FFmpeg fallback for supported jobs.
- Clear browser-specific messaging.

“Various formats” should mean both aspect-ratio presets and available container/codec combinations. The UI must not promise MP4 on platforms where the browser cannot generate it reliably.

### 9.14 Cancellation

All expensive operations must be cancellable:

- Model download.
- Model loading.
- Audio preprocessing.
- Transcription.
- Alignment.
- Waveform generation.
- Video rendering.
- Encoding.

Cancellation must leave the project in a valid state. Worker termination is acceptable when an underlying library does not provide cooperative cancellation.

### 9.15 Error handling

Errors must be categorized:

- Unsupported browser capability.
- Invalid input.
- Decode failure.
- Model download failure.
- Model integrity failure.
- WASM initialization failure.
- Out of memory.
- Transcription failure.
- Alignment failure.
- Render failure.
- Codec unavailable.
- Storage quota exceeded.
- User cancellation.
- Project schema mismatch.

Each category needs:

- User-facing message.
- Technical diagnostic.
- Recovery action where possible.
- Logging without media content.

---

## 10. Runtime Capability Model

The app must run a capability check at startup and before export.

```ts
export interface RuntimeCapabilities {
  webAssembly: boolean;
  webWorkers: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  wasmThreadsLikely: boolean;
  offscreenCanvas: boolean;
  transferableStreams: boolean;
  webCodecs: boolean;
  videoEncoder: boolean;
  audioEncoder: boolean;
  mediaRecorder: boolean;
  indexedDb: boolean;
  opfs: boolean;
  serviceWorker: boolean;
  fileSystemAccess: boolean;
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  supportedVideoConfigs: SupportedVideoConfig[];
}
```

Capabilities must be used to select paths rather than only display warnings.

Suggested user-facing modes:

- **Standard mode:** single-thread transcription and supported browser encoding.
- **Enhanced mode:** optional cross-origin-isolated or thread-capable path.
- **Compatibility mode:** reduced model, draft export, limited codec choices.

Do not infer support only from browser names.

---

## 11. GitHub Pages Architecture

### 11.1 Base paths

Vite must be configured to support:

- `https://owner.github.io/`
- `https://owner.github.io/repository-name/`
- Custom domains pointing to GitHub Pages.

All URLs for:

- Workers.
- WASM.
- Models.
- Icons.
- Service workers.
- Dynamic imports.

must resolve correctly under a non-root base path.

No code may assume `/` is the application root.

### 11.2 Client-side routing

A single-page app deployed to GitHub Pages cannot rely on arbitrary server rewrites.

Preferred options:

1. Hash-based routing.
2. A single-screen application with internal state and no URL router.
3. A carefully implemented `404.html` redirect workaround only if deep links become essential.

For the initial app, prefer no router or hash routing.

### 11.3 Deployment workflow

Use the official GitHub Pages deployment workflow pattern:

- Checkout.
- Set up Node.
- Install dependencies with a lockfile.
- Lint.
- Type-check.
- Test.
- Build.
- Upload Pages artifact.
- Deploy Pages artifact.

The workflow must use least-privilege permissions and deployment concurrency.

Illustrative shape:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --run
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

The coding agent must confirm current action major versions during implementation.

### 11.4 Cross-origin isolation

Core functionality must not depend on it.

An optional `coi-serviceworker`-style approach may be evaluated in a separate phase. If used:

- It must be isolated behind a feature flag.
- It must not break first load.
- Reload behavior must be explained.
- All required resources must be same-origin or cross-origin embeddable.
- The non-isolated application must remain available.
- Browser tests must cover both paths.
- Security implications must be documented.
- The service worker must be versioned and update-safe.

### 11.5 Static asset size

Large assets must be planned deliberately.

The implementation plan must decide whether models are:

- Included in the Pages artifact.
- Downloaded from GitHub release assets.
- User supplied.
- Split across optional packages.

The app shell should remain usable before model download.

The UI must show:

- Model size.
- Download status.
- Storage usage.
- Delete-model controls.

Do not bundle multiple large models into the main JavaScript bundle.

---

## 12. Proposed Software Architecture

### 12.1 Layering

```text
UI layer
  React components, screens, dialogs, editor controls

Application layer
  Commands, workflow orchestration, state transitions, autosave

Domain layer
  Lyrics parser, normalization, alignment, timing rules, project schema

Media layer
  Audio decode, resample, waveform, playback, render, encode

Engine adapters
  whisper.cpp WASM adapter, ffmpeg.wasm adapter, WebCodecs adapter

Infrastructure layer
  Workers, IndexedDB/OPFS, downloads, capability detection, logging
```

Domain code must be testable without a browser UI.

### 12.2 Suggested source tree

```text
src/
  app/
    App.tsx
    routes-or-workflow/
    providers/
    state/
    commands/

  components/
    common/
    import/
    transcript/
    timeline/
    preview/
    export/
    settings/

  domain/
    project/
      schema.ts
      migrations.ts
      validation.ts
    lyrics/
      parser.ts
      tokenizer.ts
      normalizer.ts
      annotations.ts
    alignment/
      align.ts
      scoring.ts
      interpolation.ts
      confidence.ts
      repeated-sections.ts
    captions/
      lrc.ts
      enhanced-lrc.ts
      srt.ts
      vtt.ts
    rendering/
      layout.ts
      themes.ts
      typography.ts

  media/
    audio/
      decode.ts
      resample.ts
      waveform.ts
      fingerprint.ts
    transcription/
      types.ts
      whisper-adapter.ts
    export/
      backend.ts
      webcodecs/
      mediarecorder/
      ffmpeg/
    preview/
      renderer.ts

  workers/
    audio.worker.ts
    whisper.worker.ts
    alignment.worker.ts
    render.worker.ts
    ffmpeg.worker.ts
    protocol.ts

  infrastructure/
    capabilities/
    storage/
    downloads/
    service-worker/
    diagnostics/

  test/
    fixtures/
    helpers/

public/
  models/
  wasm/
  fonts/
  icons/
```

### 12.3 State management

State must distinguish:

- Persistent project state.
- Undoable editor state.
- Ephemeral UI state.
- Worker job state.
- Cached binary assets.

Do not store giant PCM arrays, model buffers, or video frames in ordinary React state.

A lightweight state library is acceptable. The project domain should remain serializable.

Suggested job state:

```ts
export type JobPhase =
  | "idle"
  | "preparing"
  | "downloading"
  | "loading"
  | "processing"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface BackgroundJobState {
  id: string;
  type: "decode" | "transcribe" | "align" | "render" | "encode";
  phase: JobPhase;
  progress?: number;
  message?: string;
  error?: AppError;
}
```

### 12.4 Worker protocol

Use typed message protocols.

```ts
export type WorkerRequest =
  | { type: "INIT"; requestId: string; payload: InitPayload }
  | { type: "RUN"; requestId: string; payload: RunPayload }
  | { type: "CANCEL"; requestId: string }
  | { type: "DISPOSE"; requestId: string };

export type WorkerResponse =
  | { type: "READY"; requestId: string }
  | { type: "PROGRESS"; requestId: string; progress: number; message?: string }
  | { type: "RESULT"; requestId: string; payload: unknown }
  | { type: "ERROR"; requestId: string; error: SerializedError }
  | { type: "CANCELLED"; requestId: string };
```

Use transferable `ArrayBuffer` objects wherever ownership can move safely.

Worker adapters must hide library-specific message formats from the application layer.

---

## 13. Audio Processing Design

### 13.1 Decode pipeline

```text
Input File
  → Validate
  → Decode to AudioBuffer or equivalent
  → Extract channels
  → Downmix to mono
  → Resample to Whisper rate
  → Normalize/clamp samples
  → Transfer PCM to Whisper worker
```

The original file should remain available for playback and export.

### 13.2 Resampling

Resampling must be deterministic and tested.

Possible implementations:

- `OfflineAudioContext`.
- Dedicated high-quality JS/WASM resampler.
- Whisper-side conversion if supported.

The initial implementation may use `OfflineAudioContext`, with a fallback if browser behavior is inadequate.

### 13.3 Chunking

A whole song may fit in memory on desktop but should not be assumed to do so universally.

The implementation plan must evaluate:

- Full-track transcription.
- Fixed-size overlapping chunks.
- Whisper context limits.
- Timestamp offset correction.
- Duplicate text at chunk boundaries.
- Silence-aware chunking.

A practical approach is to start with full-track processing for bounded durations and introduce chunking when required by measured memory limits.

If chunking is used:

- Include overlap.
- Merge duplicate boundary segments.
- Maintain absolute time.
- Preserve confidence.
- Avoid splitting through active vocal phrases where possible.

### 13.4 Audio analysis

For waveform and optional reactive visuals, compute compact derived data:

```ts
export interface WaveformData {
  durationMs: number;
  samplesPerSecond: number;
  min: Float32Array;
  max: Float32Array;
  rms?: Float32Array;
}
```

Do not retain full decoded PCM longer than necessary unless required for playback or export.

---

## 14. Alignment Algorithm Design

### 14.1 Pipeline

```text
Canonical lyrics
  → Parse structure
  → Tokenize
  → Normalize
  → Mark optional annotations/vocalizations

Whisper result
  → Extract timed words
  → Normalize
  → Repair obvious timestamp anomalies

Both sequences
  → Candidate generation
  → Global sequence alignment
  → Anchor selection
  → Gap interpolation
  → Line-time derivation
  → Confidence calculation
  → Review flags
```

### 14.2 Candidate scoring

For canonical token `L_i` and transcript token `T_j`, calculate a match score from weighted features.

Example:

```ts
score =
  exactWeight * exactMatch +
  normalizedWeight * normalizedMatch +
  editWeight * editSimilarity +
  phoneticWeight * phoneticSimilarity +
  confidenceWeight * transcriptConfidence -
  timingPenalty -
  sectionPenalty;
```

The precise scoring constants must be configurable and covered by fixture tests.

### 14.3 Dynamic programming

A Needleman–Wunsch-style global alignment is a reasonable baseline.

Requirements:

- Match/substitution operation.
- Lyric deletion operation: lyric word not heard.
- Transcript insertion operation: heard word not in supplied lyrics.
- Optional lower penalty for vocalizations.
- Backtracking to obtain the alignment path.
- Memory optimization for long sequences if necessary.
- Deterministic tie-breaking.

For very long inputs, banded alignment or hierarchical alignment may be required.

### 14.4 Hierarchical alignment

If flat word-level alignment performs poorly or uses excessive memory, use:

1. Section or line block matching.
2. Segment-to-line matching.
3. Word matching within matched regions.

The initial implementation plan should include test-driven criteria for when hierarchical alignment is needed.

### 14.5 Timing constraints

After sequence alignment:

- Matched transcript words provide anchors.
- Anchor times must be monotonically non-decreasing.
- Invalid zero or negative durations must be repaired.
- Extremely long word durations must be capped or flagged.
- Interpolated times must fit between anchors.
- Line ranges must remain within track duration.
- All values must be integer milliseconds in persisted state.

### 14.6 Manual overrides

Manual timing must supersede automatic timing.

Automatic re-alignment must not overwrite manual values unless the user explicitly requests it.

Track provenance:

```ts
export interface TimingValue {
  valueMs: number;
  source: "automatic" | "interpolated" | "manual";
  updatedAt?: string;
}
```

---

## 15. UI and Interaction Design

### 15.1 Workflow layout

Suggested top-level stages:

1. Import.
2. Transcribe.
3. Align.
4. Edit.
5. Style.
6. Export.

The app may present these as a stepper, but users must be able to return to previous stages without losing work.

### 15.2 Import screen

Include:

- Drop zone.
- File picker.
- Lyrics text area.
- Lyrics file picker.
- Model selection.
- Language setting.
- Local-processing privacy notice.
- Device capability summary.
- Estimated model download size.
- Start button.

Do not begin large model downloads without clear user action, unless the model is already cached.

### 15.3 Processing screen

Include:

- Current stage.
- Progress indicator.
- Stage details.
- Cancel action.
- Resource warning.
- A message explaining that processing remains local.
- Diagnostic details behind an expandable section.

Progress must not fake precision. Indeterminate stages should be shown as indeterminate.

### 15.4 Editor screen

Suggested layout:

- Top: transport and current time.
- Center: waveform/timeline.
- Left or lower panel: lyric lines.
- Right panel: selected-line controls and confidence.
- Preview pane: responsive, collapsible.

On narrow screens, use stacked panels.

### 15.5 Style screen

Keep initial controls constrained:

- Aspect ratio.
- Background color/image.
- Font.
- Font size.
- Text color.
- Highlight color.
- Outline/shadow.
- Vertical position.
- Safe-area overlay.
- Word highlight toggle.
- Preview quality.

### 15.6 Export screen

Include:

- Aspect ratio and resolution.
- Container/codec choices available on this device.
- Frame rate.
- Quality preset.
- Audio setting.
- Estimated memory risk class.
- Draft/full export.
- Export progress.
- Cancel.
- Download when complete.
- Warning for unresolved timing.

---

## 16. Accessibility

The app must:

- Be keyboard operable.
- Use semantic controls.
- Provide visible focus.
- Label icons.
- Avoid color-only confidence indicators.
- Meet reasonable contrast requirements.
- Respect reduced motion.
- Provide accessible progress announcements.
- Avoid trapping focus in processing screens.
- Provide text alternatives for waveform-only information.
- Permit timing entry as text.
- Support browser zoom.
- Avoid essential controls that depend only on drag gestures.

The video renderer should support optional high-contrast text treatment.

---

## 17. Performance and Memory Requirements

### 17.1 General

- Main-thread tasks should be kept below perceptible blocking thresholds where practical.
- Expensive work belongs in workers.
- Use transferables.
- Avoid cloning model and PCM buffers.
- Dispose WASM instances when no longer needed.
- Revoke object URLs.
- Close `VideoFrame` objects.
- Release canvas and encoder resources.
- Avoid storing frame sequences in memory.
- Stream or batch output where supported.

### 17.2 Graceful degradation

Before transcription or export, assess approximate risk using:

- File size.
- Duration.
- Model size.
- Resolution.
- Frame rate.
- Device memory where exposed.
- Browser capability.

Risk levels:

- Low.
- Moderate.
- High.
- Unsupported.

High-risk jobs may require explicit acknowledgement or force a lower preset.

### 17.3 Resource limits

Exact limits must be established through benchmarks. Until then, configurable defaults should include:

- Maximum recommended audio duration.
- Maximum accepted audio size.
- Maximum default model.
- Maximum full-resolution export duration.
- Mobile-specific restrictions.
- Draft-export fallback.

The app should warn rather than arbitrarily reject when safe recovery is possible.

---

## 18. Storage Design

### 18.1 IndexedDB

Use IndexedDB for:

- Project metadata.
- Autosaves.
- Model cache metadata.
- Optional model blobs.
- Optional waveform data.
- Optional audio blobs.

Use a versioned database schema and transactional updates.

### 18.2 OPFS

OPFS may be used for:

- Large model files.
- Temporary export files.
- Large media blobs.

It must be optional. IndexedDB or in-memory fallback is required.

### 18.3 Storage management UI

Provide:

- Cached model list.
- Model sizes.
- Project list.
- Last modified date.
- Delete project.
- Delete cached model.
- Clear all local data.
- Storage persistence request where supported.
- Warning that the browser may evict data.

---

## 19. Security and Privacy

### 19.1 Threat model

Relevant risks include:

- Malformed media files.
- Malformed project JSON.
- Excessive memory use.
- Untrusted lyric HTML.
- Untrusted imported file names.
- Compromised third-party dependencies.
- Service-worker cache poisoning.
- Cross-origin model assets.
- Object URL leakage.
- Export filename injection.

### 19.2 Requirements

- Treat lyric text as text, never HTML.
- Validate project JSON with a runtime schema.
- Sanitize file names.
- Pin dependencies through lockfiles.
- Use Dependabot or equivalent.
- Prefer same-origin assets.
- Verify model hashes when provided.
- Do not use `eval`.
- Use a restrictive Content Security Policy via a meta tag where feasible, acknowledging its limitations compared with headers.
- Review WASM and worker loading under the chosen CSP.
- Keep service-worker scope limited to the app.
- Do not cache user-generated media in the service worker.
- Provide a local-data deletion control.

---

## 20. Testing Strategy

### 20.1 Unit tests

Required modules:

- Lyrics parser.
- Tokenizer.
- Normalizer.
- Sequence alignment.
- Repeated-section fixtures.
- Interpolation.
- Confidence scoring.
- Line-time derivation.
- Project schema validation.
- Project migrations.
- LRC export.
- Enhanced LRC export.
- SRT export.
- VTT export.
- Time formatting and rounding.
- Base-path asset resolution.

### 20.2 Fixture corpus

Create legally distributable or synthetic fixtures covering:

- Clear vocals and exact lyrics.
- Whisper substitutions.
- Missing words.
- Extra vocalizations.
- Repeated chorus.
- Long instrumental intro.
- Instrumental bridge.
- Spoken intro.
- Overlapping backing vocals.
- Punctuation differences.
- Contractions.
- Numbers.
- Accented characters.
- Non-English lyrics.
- Very short track.
- Silence-only track.
- Corrupt MP3.
- Mismatched lyrics from another song.

Fixtures should include expected anchor ranges rather than brittle exact millisecond values where model output varies.

### 20.3 Integration tests

Test:

- Audio import to project creation.
- Worker initialization.
- Model download/cache flow.
- Transcription adapter with a small test model where CI permits.
- Project save/reload.
- Subtitle download.
- Preview renderer.
- Export backend selection.
- Cancellation.
- Failure recovery.
- GitHub Pages base path.

Heavy WASM tests may be separated from ordinary pull-request tests.

### 20.4 End-to-end tests

Use Playwright or equivalent for supported desktop browsers.

Critical paths:

1. Load app from a subdirectory base path.
2. Import short audio and lyrics.
3. Complete mocked or lightweight transcription.
4. Edit timing.
5. Export LRC.
6. Save and restore project.
7. Render a short draft video where CI browser support allows.
8. Reload with service worker enabled.
9. Run without `SharedArrayBuffer`.
10. Confirm no network upload of user media.

### 20.5 Visual regression

Use deterministic project fixtures to test:

- Square preview.
- Portrait preview.
- Landscape preview.
- Current-word highlighting.
- Long lines.
- Unicode lyrics.
- Safe-area layout.

### 20.6 Performance benchmarks

Measure on representative devices:

- Model load time.
- Peak memory during model load.
- Audio preprocessing time.
- Transcription factor relative to track duration.
- Alignment time.
- Preview frame rate.
- Export factor relative to video duration.
- Peak memory during export.
- Output synchronization error.

Performance results should guide UI warnings and supported presets.

---

## 21. Observability and Diagnostics

Because there is no backend, diagnostics must be local and privacy-preserving.

Provide an optional “copy diagnostics” function containing:

- App version.
- Commit hash.
- Browser and platform.
- Capability flags.
- Selected model ID.
- Input duration and size, not content.
- Job stage.
- Error code and stack where safe.
- Memory hints where available.
- Export settings.
- Whether cross-origin isolation is active.

Do not include:

- Lyrics.
- Transcript.
- Audio bytes.
- Project title unless explicitly selected.
- Local file paths.

Use structured error codes such as `TRANSCRIBE_WASM_INIT_FAILED`.

---

## 22. Versioning and Reproducibility

The build should expose:

- Application semantic version.
- Git commit hash.
- Project schema version.
- Alignment engine version.
- Whisper adapter version.
- Whisper model ID.
- Renderer version.

Exports may include non-visible metadata where the container permits, but must not expose sensitive local information.

Project files must retain enough version information to reproduce timing and diagnose changes.

---

## 23. Dependency Guidance

The coding agent must evaluate current versions and licenses before implementation.

Likely categories:

- React.
- TypeScript.
- Vite.
- State management library.
- Runtime schema validator.
- IndexedDB helper.
- Waveform visualization or custom canvas implementation.
- `whisper.cpp` WASM integration.
- `ffmpeg.wasm`.
- WebCodecs muxer.
- MP4 or WebM muxing library.
- Testing libraries.
- Playwright.

Selection criteria:

- Browser compatibility.
- Static-host compatibility.
- License compatibility.
- Bundle size.
- Maintenance status.
- Worker support.
- WASM asset-loading behavior.
- Base-path behavior.
- Ability to run without `SharedArrayBuffer`.

Avoid dependencies that require Node APIs at runtime.

---

## 24. Acceptance Criteria

### 24.1 Deployment

- The app builds through GitHub Actions.
- The app deploys through the official GitHub Pages mechanism.
- The app works under a repository subpath.
- Refreshing the entry URL works.
- No server other than GitHub Pages is required.
- No runtime secret is required.

### 24.2 Privacy

- Network inspection confirms imported media is not uploaded.
- Lyrics and transcript are not sent to external services.
- Local-data controls are present.
- Privacy behavior is stated in the UI.

### 24.3 Transcription

- A supported MP3 can be decoded and transcribed locally.
- UI remains responsive.
- Progress and cancellation work.
- Single-thread execution works without cross-origin isolation.
- Model cache can be cleared.

### 24.4 Alignment

- Supplied lyric wording remains canonical.
- Alignment uses globally ordered matching.
- Repeated sections have test coverage.
- Unmatched words receive provenance and confidence.
- Low-confidence lines are visible.
- Manual edits are preserved.

### 24.5 Editing

- User can play, seek, select lines, edit text, and adjust timings.
- User can set line boundaries from the playhead.
- Undo and redo work for editor changes.
- Project autosave does not block playback.
- Project can be exported and imported.

### 24.6 Subtitle exports

- LRC, enhanced LRC when possible, SRT, and VTT download correctly.
- Unicode lyrics survive round trips.
- Timestamps are monotonic and valid.
- Output has automated tests.

### 24.7 Video

- Preview matches final layout closely.
- Square, portrait, and landscape presets exist.
- At least one video export path works in the primary supported browser.
- Unsupported formats are hidden or disabled with explanations.
- Draft export exists.
- Cancellation releases resources.
- Audio/video duration mismatch remains within a documented tolerance.

### 24.8 Resilience

- Invalid files produce recoverable errors.
- Out-of-memory risk is communicated.
- Failed jobs do not destroy the project.
- Reload can restore an autosaved project.
- Missing audio can be re-linked.
- The application remains usable when service workers or advanced APIs are unavailable.

---

## 25. Risks and Mitigations

### 25.1 Browser memory exhaustion

**Risk:** Whisper models, decoded PCM, WASM heaps, canvases, and encoder buffers coexist.

**Mitigations:**

- Small default models.
- Sequential job lifecycle.
- Worker disposal.
- Transferable buffers.
- Draft export.
- Duration and resolution warnings.
- Avoid retained frame arrays.
- Benchmark-driven limits.

### 25.2 Poor transcription of singing

**Risk:** Whisper may misrecognize stretched or layered vocals.

**Mitigations:**

- Canonical supplied lyrics.
- Global sequence alignment.
- Fuzzy/phonetic matching.
- Confidence markers.
- Manual editor.
- Future optional vocal separation, outside initial scope.

### 25.3 Repeated chorus misalignment

**Risk:** Similar sections align to the wrong time occurrence.

**Mitigations:**

- Global monotonic alignment.
- Section-aware heuristics.
- Ambiguity scoring.
- Fixture tests.
- Region re-alignment tools.

### 25.4 Slow single-thread processing

**Risk:** GitHub Pages baseline cannot rely on WebAssembly threads.

**Mitigations:**

- Small model.
- Progress UI.
- Worker execution.
- Optional enhanced mode.
- Chunking.
- Strong user expectations.
- Avoid unnecessary transcoding.

### 25.5 Video codec fragmentation

**Risk:** Browser support differs.

**Mitigations:**

- Backend abstraction.
- Runtime codec probing.
- WebM baseline where appropriate.
- MP4 only on verified paths.
- Subtitle exports independent of video.
- Browser-specific tests.

### 25.6 GitHub Pages base-path errors

**Risk:** Workers, WASM, and model URLs break under `/repo/`.

**Mitigations:**

- Central asset URL helper.
- Vite `base`.
- CI test under subpath.
- No root-relative URLs.
- Avoid unsupported deep routing.

### 25.7 Model distribution size

**Risk:** Models make deployment large and slow.

**Mitigations:**

- Download on demand.
- One small default.
- Release assets or user-supplied files if compatible.
- Cache controls.
- Show size before download.
- Keep model outside application bundle.

### 25.8 Service-worker complexity

**Risk:** Stale assets or reload loops.

**Mitigations:**

- Core app does not require the service worker.
- Versioned caches.
- Explicit update UI.
- Narrow cache policy.
- Automated update tests.
- Optional isolation shim behind a feature flag.

---

## 26. Decisions Reserved for the Implementation Plan

The coding agent must explicitly decide and document:

1. Exact `whisper.cpp` integration method and pinned revision.
2. Exact compatible model formats.
3. Initial default model.
4. Whether models are in Pages assets, release assets, or user supplied.
5. Audio decoding and resampling implementation.
6. Initial alignment algorithm complexity.
7. Whether hierarchical alignment is needed in the first release.
8. State management library.
9. IndexedDB/OPFS library.
10. Waveform implementation.
11. First video export backend.
12. Baseline container and codec.
13. Role of `ffmpeg.wasm` in the first release.
14. Whether an optional cross-origin-isolation service worker is attempted.
15. Supported browser matrix.
16. Benchmark-based resource limits.
17. Testing fixture strategy for Whisper.
18. Licensing and attribution requirements.
19. PWA scope.
20. Exact GitHub Actions versions.

Each decision must be justified against the GitHub Pages constraint.

---

## 27. Required Multi-Phase Planning Output

Before writing production code, the coding agent should produce a phase plan containing, for every phase:

- Objective.
- User-visible outcome.
- Architecture changes.
- Modules created or modified.
- Dependencies introduced.
- Tests added.
- Risks.
- Exit criteria.
- Demo procedure.
- Estimated complexity, expressed relatively rather than as a delivery promise.

A recommended decomposition is:

- Foundation and GitHub Pages deployment.
- Audio import and preprocessing.
- Whisper WASM integration.
- Lyrics parsing and alignment.
- Timeline editor and persistence.
- Subtitle exports.
- Canvas preview and themes.
- Draft video export.
- Full export and capability fallbacks.
- Hardening, browser testing, and documentation.

The coding agent may alter the decomposition but must preserve incremental, demonstrable delivery.

No phase should combine Whisper integration, alignment, editor construction, and video export into a single untestable milestone.

---

## 28. Definition of Done

The initial product is done when a user can visit a GitHub Pages URL, load an MP3 and lyrics, perform local transcription, receive line timing based on canonical lyrics, review and edit timing, export standard timed-text formats, preview a lyric video in three aspect ratios, and create at least one tested video format without any backend service.

The implementation must remain functional in its baseline mode when:

- `window.crossOriginIsolated` is false.
- `SharedArrayBuffer` is unavailable.
- Advanced file-system APIs are unavailable.
- The site is hosted below a GitHub repository path.
- The user declines persistent storage.
- The browser does not support the preferred video codec.

---

## 29. References

The implementation agent should re-check these sources and current versions during planning:

- whisper.cpp repository and browser/WASM examples: https://github.com/ggml-org/whisper.cpp
- whisper.cpp browser example: https://ggml.ai/whisper.cpp/
- ffmpeg.wasm documentation: https://ffmpegwasm.netlify.app/docs/overview/
- ffmpeg.wasm performance notes: https://ffmpegwasm.netlify.app/docs/performance/
- GitHub Pages publishing source documentation: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub Pages deployment action: https://github.com/actions/deploy-pages
- GitHub community discussion concerning COOP/COEP headers on Pages: https://github.com/orgs/community/discussions/13309
- Service-worker-based COOP/COEP approach, for optional evaluation only: https://docs.wasmer.io/sdk/wasmer-js/how-to/coop-coep-headers

These references are informative. Pinned library versions, licenses, browser support, and deployment action versions must be verified at implementation time.
