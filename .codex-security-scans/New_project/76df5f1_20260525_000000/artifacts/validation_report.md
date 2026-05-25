# Validation Report

## Rubric

- [x] Identify attacker-controlled source and trust boundary.
- [x] Identify sink or broken control.
- [x] Check closest existing mitigation.
- [x] Prefer local tests/build/audit where useful.
- [x] Preserve exact closure rows for non-findings.

## Validation Notes

No reportable vulnerability candidates survived discovery. Defense-in-depth rows were validated by code review and by running project checks after the hardening patch.

Commands:

- `npm run typecheck`: passed.
- `npm run test`: passed, 61 tests.
- `npm audit --audit-level=moderate`: found 0 vulnerabilities.

## Validation Closure

| Ledger row | Instance key | Root-control file:line | Entrypoint/source | Sink/control | Disposition | Counterevidence or proof gap | Survives |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RW-001 | electron-ipc:src/main/preload.ts:63 | `src/main/preload.ts:63` | Local renderer | IPC bridge | suppressed | Narrow explicit methods; no Node primitives; explicit sandbox added in `main.ts`. | no |
| RW-002 | embedded-youtube:src/main/youtubeSessionPrivacy.ts:69 | `src/main/youtubeSessionPrivacy.ts:69` | YouTube remote content | Permissions/downloads/popups/navigation | suppressed | Permissions denied, downloads prevented, popups denied, navigation allowlisted. | no |
| RW-003 | embedded-oauth:src/main/playlistProviders/youtubeLibrary.ts:304 | `src/main/playlistProviders/youtubeLibrary.ts:304` | Google OAuth remote content | Permissions/downloads/popups/navigation | suppressed | Hardening patch added explicit controls and sandbox. | no |
| RW-004 | oauth-callback:src/main/playlistProviders/youtubeLibrary.ts:215 | `src/main/playlistProviders/youtubeLibrary.ts:270` | Loopback OAuth callback | State validation | suppressed | Random state generated and checked before accepting code. | no |
| RW-005 | secret-storage:src/main/settingsStore.ts:99 | `src/main/settingsStore.ts:99` | User settings and OAuth tokens | Local storage | suppressed | `safeStorage` required before saving sensitive values; token storage rejects refresh-token persistence without secure storage. | no |
| RW-006 | playlist-url:src/main/playlistProviders/youtubeProvider.ts:53 | `src/main/playlistProviders/youtubeProvider.ts:53` | User playlist input | Browser navigation | suppressed | Canonicalizes to YouTube URL and validates identifiers. | no |
| RW-007 | local-media:src/main/localMediaResolver.ts:117 | `src/main/localMediaResolver.ts:117` | User-selected media paths | Local file playback | suppressed | Extension allowlist, file check, no file-byte IPC/network exposure. | no |
| RW-008 | local-media-dos:src/main/localMediaResolver.ts:6 | `src/main/localMediaResolver.ts:6` | User-selected folders | Recursive scan | suppressed | Track and scanned-entry caps exist and are tested. | no |
| RW-009 | combat-log:src/main/combatLogTailer.ts:5 | `src/main/combatLogTailer.ts:5` | Combat log contents | Parser/UI | suppressed | Remainder cap, event filtering, no eval/HTML insertion. | no |
| RW-010 | renderer-dom:src/renderer/renderer.ts:710 | `src/renderer/renderer.ts:710` | Settings, logs, playlist labels | DOM rendering | suppressed | Dynamic values use `textContent`; CSP added. | no |
| RW-011 | dependencies:package-lock.json | `package-lock.json` | Installed npm dependencies | Known advisories | suppressed | `npm audit --audit-level=moderate` returned 0 vulnerabilities. | no |
