# Release and rollback

## 0.6.0 mouse, email order, and field cleanup

FRC selected for persisted email metadata and explicit value transformation. Existing templates default to including Subject in the original paste order; optional new properties store header order and Subject inclusion. Native storage and JSON imports validate all four unique headers. Body stays last. Field cleanup is memory-only, affects only the chosen field, and invalidates verification. Mouse transfer now starts enabled but still retrieves text only on an explicit request.

Version 0.5.x can use the signed updater; earlier versions need a manual download. Back up library.json before installing. To downgrade after saving new email metadata, quit, reinstall the previous binary, and restore a compatible pre-upgrade library backup. Never overwrite a public release or move the feed backwards; corrections require a higher version. Publisher signing and the outstanding cross-app/native acceptance matrix remain preview limitations.

## 0.5.1 recovery and usability fixes

FRC selected because these fixes affect native clipboard capture, keyboard delivery, and update discovery. Version 0.5.1 adds an explicit session-only clipboard-preservation choice, manual email Back/Next navigation without injected keys, green backgrounds on verified fields only, specific held-modifier/permission errors, clear confirmation actions, and a main-page Update now action after a quiet startup check. The existing signed-package, downloaded-checksum, and feed-publication gates remain mandatory. Dependencies include the patched source-map-js 1.2.2 build dependency.

No storage-schema change is introduced. Version 0.5.0 can update in place after confirmation; 0.4.0 and earlier need a manual download. Back up the library before installing. Roll back manually with the existing 0.5.0 binary and a compatible library backup; the update feed deliberately does not advertise downgrades. Native cross-app acceptance and publisher signing remain preview limitations.

## 0.5.0 signed update pipeline

FRC selected for in-place software installation and the accumulated template, shortcut, and native mouse-panel changes. Installation runs only after an explicit button click and install confirmation. Version 0.5.1 also checks quietly for availability at startup. Frontend and native guards reject installation during unsaved work or active sessions. Tauri verifies HTTPS downloads with the embedded public key and requires an authenticated version in the signature before installation. Source URLs are restricted to this repository’s versioned GitHub Release assets. Release notes are rendered as text. Download progress is shown; installation restarts the application and preserves app-data files.

### One-time signing setup

The private update key is kept in the ignored `.release-keys/updater.key` file with restricted local permissions. Keep an independent encrypted backup; never commit it or paste it into an issue, chat, or release log. Put its complete file contents in the repository Actions secret `TAURI_SIGNING_PRIVATE_KEY`. This key has an empty signing password; access is protected by local permissions and GitHub’s secret store. Only the public key is committed in Tauri configuration. Do not generate a replacement key after shipping the updater: installed apps trust the original key. Key rotation requires an explicit migration release signed by the old key.

Build jobs receive the key only for tagged release packaging, with read-only repository permissions. Pull-request checks never receive it. Release jobs verify all three bundles with the independent minisign CLI and verify the signed version before publication. The updater artifacts flag is enabled only in the release build command so normal development/check builds need no signing key.

### Publish and verify

Push a version-consistent commit and matching tag. The release workflow gates packaging on macOS and Windows checks, produces normal downloads plus signed updater bundles, then verifies signatures and checksums before publishing a preview. A separate final job advertises the already-public release at `https://raw.githubusercontent.com/iandorsey00/veraflow/updates/latest.json`. The `updates` branch is release metadata; do not merge it into development. The feed rejects backwards version changes. If feed publication fails after binaries are public, rerun only that failed job. Do not repackage or overwrite an already-public version.

After publication verify the public feed’s version, all platform URLs, and signatures. Test a real upgrade on clean Windows 11, macOS Apple Silicon, and macOS Intel installations before claiming native acceptance. In particular test writable/unwritable installation locations, macOS permission prompts, Windows installer relaunch, network interruptions, no newer version, invalid signatures, and saved-library retention.

### Migration and rollback

Existing 0.4.0 installations need one manual install of 0.5.0; future releases can be installed from Settings. Back up the library before this upgrade. Older binaries reject newly saved `globalShortcuts` and `placeholderStyle` properties. To roll back, quit, reinstall the previous binary, and restore its compatible library backup. To recover from a bad published release, publish a corrected higher-version release; the updater deliberately rejects downgrades. Publisher signing/notarization remains separate and unconfigured, so these remain labeled previews.

## 0.4.0 email mode

FRC selected because this feature introduces native Paste/Tab injection. Review confirms only Paste, Tab, and Shift+Tab are emitted, with modifier-release waiting, external-focus checks, serialized native calls, text-size/NUL validation, and no automatic Send. Clipboard replacement is deliberate. A focus change or partial injection may occur after text is pasted; output index stays unchanged on errors and the UI advises checking the destination before retrying. Native email-client behavior remains a manual acceptance gate, so distribution remains an unsigned preview.

Back up the library before upgrading. Old templates load without email configuration; binaries before 0.4.0 reject saved email properties even though the library version remains 1. Restore the pre-upgrade backup to downgrade.

## 0.3.1 binary distribution

FRC selected for the first binary distribution. Publish an explicitly unsigned GitHub prerelease, with macOS arm64/x64 application ZIPs and a Windows x64 NSIS installer. No publisher signing credentials were configured by that release. Native interactive acceptance remains outstanding; preview publication does not mark those gates complete.

After reviewing and pushing a version-consistent commit, push its matching `vX.Y.Z` tag. `.github/workflows/release.yml` runs the shared checks on macOS and Windows, builds all three packages, then creates a draft prerelease. It computes SHA-256 checksums, uploads the assets, downloads and verifies them, and only then makes the prerelease public. Any failed check/build blocks publication. A failed upload can be retried while the release is a draft; the workflow refuses to replace a published release. Publish a new patch version to correct published binaries.

## 0.3.0 scope

Recommended release cycle selected RC for focused keyboard workflow and optional verification styling. Version 0.3.0 adds functionality without changing native clipboard adapters or dependencies. Existing schema-1 libraries load with `verifiedBackground` defaulting to false. This remains an unsigned source/local preview release.

## 0.2.0 scope

Full release cycle (FRC): the complete first MVP was uncommitted, including security-sensitive native capture. This is a source release and unsigned local preview, not a signed public installer release. Version 0.2.0 advances the original 0.1.0 development scaffold; storage schema remains version 1.

## Reproduce

1. Use Node 24 and stable Rust with the platform prerequisites in README.md.
2. Run `npm ci`, `npm run check:version`, `npm run format:check`, `npm test`, `npm run build`, and `npm run test:ui` (install Playwright Chromium first).
3. Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings`, and `cargo test --locked --manifest-path src-tauri/Cargo.toml`.
4. Run `npm audit` and `cargo audit --file src-tauri/Cargo.lock`. Review maintenance warnings separately from vulnerabilities; do not suppress findings silently.
5. On macOS run `clang -fobjc-arc tests/native/macos-text.m -framework AppKit -framework ApplicationServices -o /tmp/veraflow-text-test && /tmp/veraflow-text-test` to check Unicode/NUL handling without touching the clipboard.
6. Build local platform packages with `npm run desktop:build`. On macOS `-- --bundles app` builds the app without making a disk image. Vite emits hashed assets, and Tauri bundles them directly; there is no service worker or external asset cache.
7. Review the native acceptance matrix in validation.md. Sign and notarize macOS artifacts and sign Windows installers before a stable release; unsigned previews must be labeled explicitly. Credentials are not part of the repository.
8. Review staged files and diff hygiene, commit, push, and inspect both platform CI jobs. Branch checks do not publish binaries. Version tags invoke the gated release workflow described above.

## Install and upgrade

Close VeraFlow, back up `library.json` from the OS app-data directory, then replace the app/installer with the intended version. On macOS keep the app at a stable location such as Applications before granting Accessibility access. Confirm the new version launches, templates load, and capture permissions still work. Sessions are intentionally not recoverable after exit.

## Rollback

Quit the app and reinstall the last known-good binary. Keep a backup of the library before any downgrade. Although the schema number remains 1, version 0.2.0 rejects the new `verifiedBackground` preference. Restore the pre-upgrade library backup with the app closed when downgrading to 0.2.0. For source rollback, check out the known-good commit in a separate checkout and rebuild with locked dependencies. Do not delete app data to work around an error; corrupt libraries fail closed for recovery. There is no prior published binary for this initial release.
