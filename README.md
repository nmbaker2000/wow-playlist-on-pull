# WoW Pull Playlist

Desktop app scaffold for starting a playlist when a World of Warcraft combat pull begins.

The app supports YouTube playlist playback and local audio files/folders, with the playback layer shaped so additional providers can be added later.

## What It Does

- Watches a selected WoW combat log file.
- Detects pull starts from combat-log lines.
- Opens/updates a desktop player window with the configured YouTube playlist or local media queue.
- Lets you sign in to YouTube in the app so YouTube Premium applies to playback for that account.
- Applies built-in privacy guardrails and Ghostery-powered request blocking to the YouTube browser session.
- Keeps playlist providers separate from combat-log detection.

## Run

```powershell
npm install
npm run dev
```

## YouTube Premium

Use the YouTube account section in the app to open a YouTube sign-in window. The app stores that browser session locally and reuses it for playlist playback, so a signed-in Premium account is the supported, reliable path for playback without YouTube ads.

## YouTube Browser Privacy

The YouTube browser session uses `@ghostery/adblocker-electron` with ads-and-tracking filter lists. The app also blocks unexpected permission prompts, downloads, popups, and top-level navigation outside YouTube/Google sign-in pages.

This is a best-effort privacy and request-blocking safety layer for the embedded browser, not a YouTube ad-removal guarantee. YouTube may detect ad blockers and interrupt or block playback. For dependable no-ad playback, sign in with a YouTube Premium account.

## Combat Log Setup

In World of Warcraft, enable combat logging with:

```text
/combatlog
```

Then select the active log file in this app. It is usually under:

```text
World of Warcraft\_retail_\Logs\WoWCombatLog.txt
```

## Future Playlist Providers

Add providers under `src/main/playlistProviders`. Each provider implements:

```ts
export interface PlaylistProvider {
  readonly id: PlaylistProviderId;
  readonly label: string;
  buildPlaybackUrl(input: PlaylistInput): string;
}
```

The UI and pull detector do not need to know whether a playlist is YouTube, Spotify, or another future platform.
