# Supported Browsers, Formats, And Limits

## Browsers

BOLT95 targets current desktop Chromium for release. Firefox and Safari are best effort and driven by runtime capability probes rather than browser names. Mobile browsers are compatibility mode because memory, background execution, file handling, and codecs vary widely.

The baseline workflow must remain functional without `SharedArrayBuffer`, cross-origin isolation, OPFS, persistent-storage grants, preferred video codecs, or service workers.

## Formats

Input:

- MP3 audio through browser decode support.
- UTF-8 TXT and LRC lyrics.
- BOLT95 project JSON exported by the same schema version.
- Exact GGML Whisper model files listed in the model registry.

Output:

- LRC.
- Enhanced LRC when word timing is available.
- SRT.
- WebVTT.
- BOLT95 project JSON.
- WebM video through WebCodecs or MediaRecorder when capability probes pass.

Unsupported video formats are hidden or disabled with a reason.

## Practical Limits

| Device class | Recommended use                                                                             |
| ------------ | ------------------------------------------------------------------------------------------- |
| Low resource | Tiny model, short tracks up to 3 minutes, subtitles or draft export.                        |
| Medium       | Tiny/base model, tracks up to 6 minutes, draft export and capability-qualified full export. |
| High         | Base model, tracks up to 8 minutes, full export presets after risk acknowledgement.         |

BOLT95 does not silently reduce quality. If a job is high risk, the app asks for acknowledgement or recommends a smaller model, shorter track, draft export, or subtitle export.

## Accessibility And Keyboard

The app uses semantic controls, visible focus, dialogs with close buttons, and keyboard-operable workflow navigation. Standard browser keyboard behavior applies: Tab/Shift+Tab moves focus, Enter/Space activates controls, arrow keys operate native range and select controls, and Esc closes modal dialogs.
