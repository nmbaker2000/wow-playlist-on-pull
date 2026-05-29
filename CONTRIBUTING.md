# Contributing

Thanks for taking the time to improve WoW Pull Playlist.

## Setup

Use Node.js 22 or newer.

```powershell
npm ci
npm run dev
```

## Checks

Run these before opening a pull request:

```powershell
npm run typecheck
npm run test
```

For a local Windows installer build:

```powershell
npm run dist:win
```

The installer is written to `release/`.

## Project Notes

- Main-process Electron code lives under `src/main`.
- Renderer code lives under `src/renderer`.
- Playlist providers live under `src/main/playlistProviders`.
- Combat-log discovery and pull detection should stay independent from playback providers.
- Local media support should keep using file URLs produced by `localMediaResolver`.
- YouTube browser behavior should keep privacy and navigation guardrails in `youtubeSessionPrivacy`.

## Pull Requests

Keep changes focused. Include tests for behavior changes, especially pull detection, settings migration, playlist provider behavior, and local media resolution.

For documentation changes, check that install instructions match the current scripts and release workflow.
