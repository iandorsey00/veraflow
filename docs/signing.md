# Publisher signing

Updater signatures are already enforced for every release. They authenticate VeraFlow update packages and versions; they do not establish Apple or Windows publisher trust.

Publisher signing is not configured: no signing identity is available locally, and the project owner has confirmed that neither platform's signing credentials are available. Current binaries must remain labeled publisher-unsigned previews.

## macOS

For distribution outside the App Store, obtain Apple Developer membership and a **Developer ID Application** certificate with its private key. Configure notarization credentials as well. Once available, the release workflow needs to import the identity into a temporary keychain, sign the app with hardened runtime, notarize and staple it, and verify both signing and notarization before archiving or updater-signing the final package. Clean up the keychain and credential files on success or failure. Ad-hoc signing does not substitute for Developer ID signing and notarization.

Follow [Tauri's macOS signing and notarization guide](https://v2.tauri.app/distribute/sign/macos/). Account enrollment and credential entry are owner steps; do not paste private keys or passwords into chat or commit them.

## Windows

Obtain a trusted code-signing certificate or managed signing service, including the provider's identity verification. Choose the provider before implementing its CI integration: hardware-backed and managed credentials have different requirements. The workflow should sign and timestamp both the application and installer, verify the resulting Authenticode signatures, and only then create updater signatures and publish checksums. Signing does not guarantee that SmartScreen warnings disappear immediately.

Follow [Tauri's Windows signing guide](https://v2.tauri.app/distribute/sign/windows/) and the selected provider's current instructions. Do not use the legacy exportable-certificate instructions for a modern certificate that requires hardware-backed keys.

## Release rules

Keep the existing update-signing key: changing publisher certificates does not require replacing it. Credentials belong in an approved protected signing service or CI secret store. Install them only in tagged packaging jobs, never pull-request checks. Once configured, missing or invalid publisher signing must fail the intended signed release; it must not silently fall back to unsigned output. Update release labels only after independent verification of every platform's artifacts.
