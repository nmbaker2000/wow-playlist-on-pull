# Windows Release and Signing

This project uses `electron-builder` to create a Windows NSIS installer.

## Build Locally

Use Node.js 22 or newer for release builds.

```powershell
npm ci
npm run typecheck
npm run test
npm run dist:win
```

The installer is written to `release/`.

For unsigned local test builds, set this first if electron-builder tries to discover a local signing certificate:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist:win
```

## GitHub Action

The workflow at `.github/workflows/windows-release.yml` runs when:

- you manually start it from the GitHub Actions tab
- you push a tag like `v0.1.0`

Every run uploads a `windows-installer` artifact containing only the setup `.exe` and `SHA256SUMS.txt`. Tag builds also publish those two files to the GitHub Release for that tag.

Manual runs are build-only by default. To publish a Release manually, set `publish_release` to `true` and provide a `release_tag` such as `v0.1.0`.

For tag builds and manual publish builds, the workflow updates the package version in CI from the release tag before packaging. For example, tag `v1.0.0` produces a setup installer with version `1.0.0`.

The workflow creates `SHA256SUMS.txt` so players can verify the downloaded setup installer.

## Unsigned Builds

If no signing secrets are configured, the workflow creates an unsigned installer. This is useful for internal testing, but Windows SmartScreen may warn players because the app has no trusted publisher identity.

## Signed Builds with a PFX Certificate

To sign with a standard Windows code-signing certificate:

1. Export the certificate as a password-protected `.pfx` file.
2. Convert it to base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\certificate.pfx")) | Set-Content windows-certificate-base64.txt
```

3. In GitHub, open the repository settings and add these Actions secrets:

- `WINDOWS_CERTIFICATE_BASE64`: the contents of `windows-certificate-base64.txt`
- `WINDOWS_CERTIFICATE_PASSWORD`: the `.pfx` export password

The workflow will automatically decode the certificate into the runner temp directory and let `electron-builder` sign the app and installer.

## Recommended Production Path

For a public Windows release, consider Microsoft Azure Artifact Signing instead of managing a PFX in GitHub Secrets. It keeps signing keys managed by Microsoft and is the current Microsoft-recommended option for non-Store distribution.

If you add auto-update later, treat it as a security feature:

- sign every update
- serve updates only over HTTPS
- restrict release-token access
- verify update signature behavior before enabling it for players
