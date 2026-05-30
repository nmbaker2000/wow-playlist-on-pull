# WoW Pull Playlist

WoW Pull Playlist is a Windows desktop app that starts music when a World of Warcraft combat pull begins.

It watches your active combat log, detects raid pull starts, and opens a small player window with either a YouTube cue or local audio queue. It is built for players who want boss-specific pull music without running a browser tab by hand.

This project is early but usable. Expect rough edges, especially around unsigned Windows builds and YouTube playback behavior.

![WoW Pull Playlist dashboard](docs/images/dashboard.png)

For a screenshot-backed setup walkthrough, see [docs/instructions.md](docs/instructions.md).

## Install on Windows

1. Open the [latest GitHub Release](https://github.com/nmbaker2000/wow-playlist-on-pull/releases).
2. Download the `WoW Pull Playlist-Setup-...-x64.exe` installer.
3. Download `SHA256SUMS.txt` from the same release.
4. Optional but recommended: verify the installer hash in PowerShell.

```powershell
Get-FileHash -Algorithm SHA256 ".\WoW Pull Playlist-Setup-*-x64.exe"
Get-Content ".\SHA256SUMS.txt"
```

The hash from `Get-FileHash` should match the hash listed for the installer in `SHA256SUMS.txt`.

If the release is unsigned, Windows SmartScreen may warn that the publisher is unknown. That warning is expected for unsigned builds and does not by itself mean the installer was changed. Verifying the checksum helps confirm the downloaded file matches the release asset.

## First Run

In World of Warcraft, enable combat logging:

```text
/combatlog
```

Then open WoW Pull Playlist and:

1. Select the active combat log file. It is usually under `World of Warcraft\_retail_\Logs\WoWCombatLog.txt`.
2. Pick a playlist provider.
3. Add a default cue, and optionally add boss-specific cues as encounters are detected.
4. Arm the watcher before the pull.

Supported playback sources:

- YouTube playlist URLs, playlist IDs, and video URLs.
- YouTube account playlists after connecting a YouTube Data API OAuth client in Settings.
- Local audio files or folders with `.mp3`, `.wav`, `.flac`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.opus`, or `.webm` files.

For YouTube playback without ads, sign in with a YouTube Premium account from the YouTube account section in the app. The app reuses that local browser session for playback.

## Privacy and Local Data

The app stores settings in Electron's app data folder on your computer. YouTube OAuth client credentials are written separately with Electron `safeStorage` when secure storage is available.

The embedded YouTube session is local to the app. It can store normal browser session data such as cookies, cache, and sign-in state so YouTube playback can reuse your account.

The YouTube browser session uses `@ghostery/adblocker-electron` with ads-and-tracking filter lists. The app also blocks unexpected permission prompts, downloads, popups, and top-level navigation outside YouTube or Google sign-in pages.

That protection is best effort. It is not a guarantee that YouTube ads will be removed, and YouTube may interrupt playback when it detects request blocking. YouTube Premium is the supported path for dependable no-ad playback.

## Developing

Use Node.js 22.12 or newer.

```powershell
npm ci
npm run dev
```

Useful commands:

```powershell
npm run typecheck
npm run test
npm run build
npm run dist:win
```

`npm run dist:win` writes the Windows installer to `release/`.

Playlist providers live under `src/main/playlistProviders`. The current providers are YouTube and local media. Combat-log detection and playlist selection are kept separate so new providers can be added without changing pull detection.

To regenerate the README and instructions screenshots after UI changes:

```powershell
npm run build
.\node_modules\.bin\electron.cmd scripts\capture-readme-screenshots.cjs
```

## Releases

The Windows release workflow builds an NSIS installer and a `SHA256SUMS.txt` checksum file. Tag builds also publish those files to GitHub Releases.

Release signing details are in [docs/windows-release-signing.md](docs/windows-release-signing.md).

## Contributing

Bug reports and feature requests are welcome. Use the issue templates so reports include enough detail to reproduce the problem.

Before opening a pull request, run:

```powershell
npm run typecheck
npm run test
```

## License

MIT. See [LICENSE](LICENSE).
