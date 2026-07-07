# Privacy And Local Data

BOLT95 is local-first. Audio, lyrics, transcripts, projects, and generated files stay in the browser and are not uploaded by the application.

Runtime network requests are limited to same-origin static assets and model files that the user chooses to download from the deployed Pages artifact. The app does not include analytics, accounts, runtime secrets, or upload APIs.

## Stored Data

The browser may store:

- Autosaved projects in IndexedDB.
- Downloaded or user-supplied Whisper model files in IndexedDB.
- Versioned app-shell files in the Cache API when service workers are enabled.

The app-shell service worker never caches model binaries, user media, blobs, OPFS data, lyrics, transcripts, project JSON, or rendered output.

## Deletion

Use Help -> Diagnostics -> Clear local data to delete BOLT95 autosaves, cached models, and app-shell caches. Browser site settings can also clear all storage for the Pages origin.

## Diagnostics

Copied diagnostics include only app version, commit hash, schema/renderer versions, browser string, and capability booleans. They intentionally exclude lyrics, transcript text, media bytes, file names, local paths, project titles, and rendered output.
