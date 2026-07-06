# BOLT95

BOLT95 is a static, local-first lyric timing and lyric-video application. Media,
lyrics, transcripts, projects, and generated output stay in the browser.

The production site is built for `https://x.github.io/BOLT95/` and does not require
a server, API, account, runtime secret, or cross-origin isolation.

## Development

Requirements: Node.js 24, npm, Docker, and a current Chromium browser.

```sh
npm ci
npm run dev
```

The development server listens on <http://127.0.0.1:8000>.

## Quality gates

```sh
npm run format:check
npm run lint
npm run typecheck
npm run unit
npm run test:e2e
npm run build
```

Browser tests run against both `/` and `/BOLT95/`. Generated Whisper models, WASM,
fixtures, browser artifacts, and production builds are intentionally not committed.

See [PLAN.md](PLAN.md), [DESIGN.md](DESIGN.md), and
[docs/compatibility.md](docs/compatibility.md) for implementation and compatibility
details.
