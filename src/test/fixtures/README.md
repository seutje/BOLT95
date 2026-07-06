# Test fixtures

All fixtures in this directory are synthetic and may be redistributed with BOLT95.

- `audio/short-valid.mp3`: 1.25 s, 440 Hz mono sine at 44.1 kHz.
- `audio/silence.mp3`: 1 s mono silence at 48 kHz.
- `audio/stereo.mp3`: 1 s, 440 Hz left / 880 Hz right at 48 kHz.
- `audio/cancel-long.mp3`: 45 s stereo sine used to keep preprocessing cancellable in browser tests.
- `audio/corrupt.mp3` and `audio/zero-byte.mp3`: deterministic invalid-input fixtures.
- `lyrics/unicode.txt` and `lyrics/timed.lrc`: UTF-8, stanza, annotation, metadata, and LRC timing fixtures.

The generated MP3s use FFmpeg's `lavfi` sine/anullsrc inputs and `libmp3lame`; they contain no third-party recording. Resampler acceptance allows at most one target-rate sample of duration error and ±1 Hz in the two-second 440 Hz measurement fixture.
