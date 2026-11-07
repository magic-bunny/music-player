# macOS release signing

Public DMG files must be signed with a `Developer ID Application` certificate and notarized by Apple. Ad-hoc signing is sufficient for local development, but Gatekeeper still requires users to whitelist an app downloaded from the internet.

## Prerequisites

- A paid Apple Developer Program membership. Free accounts cannot notarize applications for public distribution.
- A `Developer ID Application` certificate exported from Keychain Access as a password-protected `.p12` file.
- An app-specific password for the Apple ID used for notarization.

## Repository secrets

Add these Actions secrets under **Repository settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded contents of the exported `.p12` file |
| `APPLE_CERTIFICATE_PASSWORD` | Password assigned while exporting the `.p12` file |
| `APPLE_ID` | Apple ID email address |
| `APPLE_PASSWORD` | App-specific password, not the normal Apple ID password |
| `APPLE_TEAM_ID` | Ten-character Team ID from the Apple Developer membership page |
| `KEYCHAIN_PASSWORD` | A strong random password used for the temporary CI keychain |

Encode the certificate without line wrapping:

```sh
openssl base64 -A -in DeveloperIDApplication.p12 -out certificate-base64.txt
```

Paste the complete contents of `certificate-base64.txt` into `APPLE_CERTIFICATE`. Never commit the `.p12`, encoded certificate, passwords, or Team credentials to the repository.

## Release flow

1. Update the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Commit the release changes and push `main`.
3. Create and push the matching tag, for example `v1.0.1`.
4. The desktop release workflow imports the certificate into an ephemeral keychain, locates the `Developer ID Application` identity, builds both macOS architectures, and supplies the Apple ID credentials to Tauri for notarization and stapling.
5. Download both DMG files from the draft or published release and verify them before announcing the release:

```sh
spctl --assess --type open --context context:primary-signature -v Music\ Player.app
codesign --verify --deep --strict --verbose=2 Music\ Player.app
stapler validate Music\ Player.app
```

The workflow intentionally fails macOS jobs when any required secret is missing. Windows signing remains a separate Authenticode setup.
