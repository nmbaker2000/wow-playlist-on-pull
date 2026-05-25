# Runtime Inventory

- App type: Electron desktop app (`package.json`, main entry `dist/main/main.js`).
- Main process: `src/main/main.ts`.
- Preload bridge: `src/main/preload.ts`.
- Renderer UI: `src/renderer/index.html`, `src/renderer/renderer.ts`, `src/renderer/styles.css`.
- Local media player UI: `src/renderer/localPlayer.html`, `src/renderer/localPlayer.ts`.
- YouTube browser privacy controls: `src/main/youtubeSessionPrivacy.ts`.
- YouTube playlist library OAuth/API client: `src/main/playlistProviders/youtubeLibrary.ts`.
- Playlist URL builders: `src/main/playlistProviders/youtubeProvider.ts`, `src/main/playlistProviders/localMediaProvider.ts`.
- Local filesystem surfaces: `src/main/combatLogTailer.ts`, `src/main/combatLogDiscovery/windowsCombatLogDiscovery.ts`, `src/main/localMediaResolver.ts`, `src/main/settingsStore.ts`.
- Combat-log parser and pull detector: `src/main/pullDetector.ts`.
- Settings/rule selection: `src/main/playlistRules.ts`.

Security-sensitive controls observed:

- `contextIsolation: true`, `nodeIntegration: false`, explicit `sandbox: true` after this scan's hardening patch.
- Main UI preload exposes only named IPC calls.
- YouTube privacy session blocks permissions, downloads, popups, and disallowed navigations.
- OAuth uses random `state`, loopback `127.0.0.1`, and safeStorage-backed token persistence.
- Local media scanning uses extension allowlist and track/entry limits.
- Renderer uses `textContent` for dynamic app/user-controlled values; `innerHTML` uses clearing or static markup only.
- CSP added to both renderer HTML entrypoints in this scan.
