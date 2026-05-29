# Security Policy

## Supported Versions

Security fixes are handled on the latest released version and the current default development branch.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Report security problems by contacting the repository owner through GitHub. Include:

- The affected version or commit.
- Clear reproduction steps.
- The expected impact.
- Any relevant logs, screenshots, or proof-of-concept details.

Issues involving OAuth credentials, stored YouTube session data, local file access, release artifacts, or installer integrity should be treated as security-sensitive.

## Local Data and Credentials

WoW Pull Playlist stores app settings locally. YouTube OAuth client credentials are encrypted with Electron `safeStorage` when secure storage is available on the machine. YouTube browser session data is stored in the app's Electron session partition so playback can reuse sign-in state.

Do not attach real OAuth client secrets, refresh tokens, cookies, or combat logs from private raids to public issues.
