# Architecture decision

VeraFlow uses Tauri 2, Rust, and a dependency-light TypeScript/DOM interface. System webviews avoid bundling Chromium. Electron offers mature integrations but adds a browser/runtime footprint. Separate Swift and Windows native applications would offer deeper native UI at the cost of maintaining two products. Qt adds a UI runtime and deployment complexity. Tauri provides the smallest sensible shared shell here; OS selection and clipboard behavior still require native adapters.

One webview owns the in-memory session. It changes size for capture mode; there is no second window or session broadcast channel. A global shortcut emits an action without activating the window, preserving focus in the source app. Shortcuts exist only during a session. A serial UI operation gate and native capture lock prevent overlapping operations. The Rust boundary exposes only typed local storage, selection capture, explicit clipboard reads/writes, window settings, and tray actions. No HTTP or shell capability is granted to the frontend.

Core parsing, rendering, comparison, and state transitions are pure TypeScript. Native Objective-C (macOS) and C++ (Windows) are linked into the Rust binary. No subprocess receives customer text. Local JSON stores only templates and preferences. All session values, verification candidates, and rendered output are memory-only.

Shared standards: ../guidelines. Product exceptions: the utility uses a compact wordmark and 36px controls to fit a floating panel; the primary action remains keyboard accessible. No shared identity service applies to this offline app.

Framework references: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [global shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/).
