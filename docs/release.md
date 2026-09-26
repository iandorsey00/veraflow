# Release and rollback

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
7. Review the native acceptance matrix in validation.md. Sign and notarize macOS artifacts and sign Windows installers before general distribution. Credentials are not part of the repository.
8. Review staged files and diff hygiene, commit, push, and inspect both platform CI jobs. This workflow does not automatically publish artifacts or create GitHub Releases.

## Install and upgrade

Close VeraFlow, back up `library.json` from the OS app-data directory, then replace the app/installer with the intended version. On macOS keep the app at a stable location such as Applications before granting Accessibility access. Confirm the new version launches, templates load, and capture permissions still work. Sessions are intentionally not recoverable after exit.

## Rollback

Quit the app and reinstall the last known-good binary. Keep a backup of the library before any downgrade. Although the schema number remains 1, version 0.2.0 rejects the new `verifiedBackground` preference. Restore the pre-upgrade library backup with the app closed when downgrading to 0.2.0. For source rollback, check out the known-good commit in a separate checkout and rebuild with locked dependencies. Do not delete app data to work around an error; corrupt libraries fail closed for recovery. There is no prior published binary for this initial release.
