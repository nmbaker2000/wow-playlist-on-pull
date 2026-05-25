# Threat Model

## Overview

This repository is an Electron desktop app for WoW players. It watches a user-selected World of Warcraft combat log, detects raid encounter start/end events, and starts either YouTube playback or local audio playback. Primary runtime code is under `src/main` and `src/renderer`; tests, `dist`, and `node_modules` are not product source for this scan.

Important assets are the user's local filesystem privacy, YouTube browser cookies/session data, YouTube OAuth tokens/client credentials, and the integrity of the local Electron process. The app is not a multi-user server and does not expose a network API except a loopback OAuth callback listener during YouTube playlist-library connection.

## Threat Model, Trust Boundaries, and Assumptions

Trust boundaries:

- Local renderer to Electron main process via `preload.ts` and `ipcMain` handlers in `main.ts`.
- Main process to local filesystem for combat logs, settings, encrypted OAuth material, and local media paths.
- Main process to remote web content in YouTube, Google OAuth, and YouTube Data API flows.
- Main process to loopback HTTP callback during OAuth.
- User-selected or discovered WoW combat log content and local media filenames/folders.

Attacker-controlled or semi-controlled inputs:

- Combat log file contents if another local process, addon, or copied log can write to the selected file.
- YouTube playlist/video identifiers pasted by the user or chosen from an account library.
- Remote YouTube/Google web content loaded in embedded windows.
- Local media filenames and folder trees selected by the user.
- Settings JSON if a local attacker can write to the app user-data directory.

Operator-controlled inputs:

- YouTube OAuth client ID and client secret.
- Selected combat log path and local media paths.
- Playlist rules and encounter mappings.

Assumptions:

- The app is run by a local player on their own Windows machine.
- Other WoW players may receive or review the app, but they do not get remote shell access to the user's machine through the app.
- Local malware or a user with write access to the app data directory is mostly out of scope except where the app amplifies that access into token theft, arbitrary code execution, or broader filesystem exposure.

## Attack Surface, Mitigations, and Attacker Stories

Security-relevant surfaces:

- Electron windows in `main.ts` for the main UI, YouTube playback/login, and local player.
- OAuth installed-app flow in `playlistProviders/youtubeLibrary.ts`, including a loopback server and browser window.
- YouTube session privacy controls in `youtubeSessionPrivacy.ts`.
- Local file reads through `combatLogTailer.ts`, `windowsCombatLogDiscovery.ts`, and `localMediaResolver.ts`.
- Renderer DOM updates in `renderer.ts` and `localPlayer.ts`.

Existing mitigations:

- Renderer windows use `contextIsolation: true`, `nodeIntegration: false`, and now explicit `sandbox: true`.
- Main UI exposes a narrow preload API rather than Node primitives.
- YouTube session denies permission prompts, downloads, popups, and disallowed navigations.
- OAuth state uses `randomBytes(16)` and verifies the returned state before accepting a code.
- OAuth refresh tokens and configured OAuth credentials are stored through Electron `safeStorage` when available.
- YouTube playlist/video inputs are converted to canonical YouTube URLs rather than loading arbitrary user-provided URLs.
- Renderer output uses `textContent` for untrusted labels and paths rather than HTML insertion.
- Local media resolution limits supported extensions, caps tracks at 1,000, and caps scan entries at 50,000.
- Combat log tailing bounds the buffered remainder length.

Realistic attacker stories:

- A malicious webpage loaded in an embedded browser tries to escape renderer isolation, open popups, download files, or navigate away to phishing pages.
- A crafted combat log attempts to trigger unexpected playlist rules, UI injection, excessive buffering, or parser crashes.
- A crafted local media folder attempts to exhaust resources through a huge recursive tree or misleading filenames.
- A malicious or accidental settings file attempts to point the app at sensitive local files.
- A compromised OAuth/browser flow tries to steal or misuse Google account session state.

Out-of-scope or lower-likelihood stories:

- A remote internet attacker directly calling app IPC; there is no remote IPC or HTTP API for the app.
- Other WoW players directly controlling the user's local files unless the user installs their files or shares a writable folder.
- Local malware already able to read app data, unless the app stores secrets unnecessarily or in plaintext.

## Severity Calibration (Critical, High, Medium, Low)

Critical would require a realistic path to arbitrary code execution in the main process, Electron sandbox escape, theft of Google OAuth refresh tokens or YouTube cookies by remote content, or arbitrary read/write of sensitive local files from an in-scope remote input.

High would include a proven embedded-web-content escape from YouTube/Google into privileged Electron APIs, accepting an OAuth callback without state validation, loading attacker-controlled non-YouTube URLs into privileged windows, or an arbitrary file write to startup/executable locations.

Medium would include durable privacy leaks, weak OAuth/session storage, app-controlled navigation to phishing surfaces, or local file reads with meaningful but bounded disclosure under user-assisted preconditions.

Low includes defense-in-depth hardening such as missing CSP, missing explicit sandbox flags where defaults probably help, or broader-than-needed local file selection when no exfiltration path is present.
