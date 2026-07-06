# ADR 0002: WebCodecs and Mediabunny video baseline

- Status: Accepted
- Date: 2026-07-06

## Context

The product needs one deterministic browser-only video export path without assuming
MP4 support. The path must render sequentially, keep frames bounded, mux audio, report
progress, and cancel cleanly.

## Decision

Use WebCodecs through Mediabunny `1.50.6` as the primary backend. Prefer VP9/Opus
WebM, then probe VP8/Opus. Canvas frames are submitted sequentially with awaited
backpressure. The bounded proof uses `BufferTarget` for a playable result Blob; the
production backend will use a streaming target where the selected browser/file API
allows it and otherwise retain only compressed output, never raw frame sequences.

MediaRecorder remains the compatibility backend. AVC/AAC and MP4 are exposed only
after video and audio configuration support plus mux/decode verification all pass.

## Proof evidence

Pinned Chromium 149 reported:

| Capability             | Result      |
| ---------------------- | ----------- |
| VP9 video + Opus audio | Supported   |
| VP8 video + Opus audio | Supported   |
| AVC video              | Supported   |
| AAC audio              | Unsupported |
| MediaRecorder WebM     | Supported   |

The deterministic proof encoded 150 frames at 960 × 540 and 30 fps with a generated
48 kHz mono tone. One measured VP9/Opus result was 870,948 bytes, reported 5.02 seconds
for a five-second target, and therefore had 20 ms duration drift. Other repeat runs
produced the same 150-frame structure and stayed within the 100 ms acceptance bound.

Cancellation calls the muxer's cancel path, discards partial output, and stops frame
scheduling. Cancellation followed by a successful export passed without reload.

## Consequences

- WebM is the baseline container; VP9 is preferred and VP8 is a probed alternative.
- MP4 is not currently offered because the proof browser lacked AAC encoding.
- `ffmpeg.wasm` is not triggered: WebCodecs produced valid output and MediaRecorder
  supplies the documented fallback class without its payload or virtual-filesystem
  memory cost.
- Exact long-track limits and a streaming production sink remain Phase 9/10 gates.
- Mediabunny is MPL-2.0; unmodified library distribution requires preserving its
  notices. Any future source modification must be published under MPL-2.0.

Hierarchical lyric alignment is unrelated to this proof and is not triggered. Its
objective Phase 3 fixture threshold remains the decision point.
