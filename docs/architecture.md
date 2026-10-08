# Architecture decision

VeraFlow uses Tauri 2, Rust, and a dependency-light TypeScript/DOM interface. System webviews avoid bundling Chromium. Electron offers mature integrations but adds a browser/runtime footprint. Separate Swift and Windows native applications would offer deeper native UI at the cost of maintaining two products. Qt adds a UI runtime and deployment complexity. Tauri provides the smallest sensible shared shell here; OS selection and clipboard behavior still require native adapters.

One webview owns the in-memory session. It changes size for capture mode; there is no second window or session broadcast channel. A global shortcut emits an action without activating the window, preserving focus in the source app. Shortcuts exist only during a session. A serial UI operation gate and native capture lock prevent overlapping operations. The Rust boundary exposes only typed local storage, selection capture, explicit clipboard reads/writes, window settings, and tray actions. No HTTP or shell capability is granted to the frontend.

Core parsing, rendering, comparison, and state transitions are pure TypeScript. Native Objective-C (macOS) and C++ (Windows) are linked into the Rust binary. No subprocess receives customer text. Local JSON stores only templates and preferences. All session values, verification candidates, and rendered output are memory-only.

Shared standards: ../guidelines. Product exceptions: the utility uses a compact wordmark and 36px controls to fit a floating panel; the primary action remains keyboard accessible. No shared identity service applies to this offline app.

Framework references: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [global shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/).

## Email template and output phase

Optional template email metadata holds Subject/To/Cc/Bcc templates and their enabled flags; existing `content` is Body. `templateSource` aggregates only enabled sections for shared placeholder ordering. `renderEmail` applies the common completeness/verification gate and validates resolved headers. Automatic delivery advances the memory-only cursor only after native success. Explicit manual Back/Next recovery changes the cursor without injected keys and never establishes paste success. Existing finish/previous global shortcuts become Paste+Tab/Shift+Tab in that phase, with no trailing Tab for Body and explicit completion. Native output uses the same clipboard lock as capture, and does not claim delivery or automate Send.

## In-place updates and exchange

`src-tauri/src/updater.rs` owns the checked update and install guard. The frontend checks quietly once at desktop startup and on demand, showing a main-page action only when a newer version is found. Availability checks are serialized and update only the banner to preserve edits. The frontend invokes check/install with a progress channel; no updater URL or key comes from the webview. Tauri handles platform package verification and installation. The release workflow publishes verified assets before updating the separate metadata branch. The private key is outside version control; normal builds do not produce signed update artifacts.

Template archives use a separate versioned JSON envelope validated by `src/core/transfer.ts`. Import adds new IDs through the existing library persistence boundary. Templates can select braces syntax while missing syntax preserves legacy angle brackets; parser and renderer share tokenization and escape behavior. Mouse mode retains only the recent external application/window identity in native memory while enabled.
