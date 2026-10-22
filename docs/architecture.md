# Architecture decision

VeraFlow uses Tauri 2, Rust, and a dependency-light TypeScript/DOM interface. System webviews avoid bundling Chromium. Electron offers mature integrations but adds a browser/runtime footprint. Separate Swift and Windows native applications would offer deeper native UI at the cost of maintaining two products. Qt adds a UI runtime and deployment complexity. Tauri provides the smallest sensible shared shell here; OS selection and clipboard behavior still require native adapters.

One webview owns the in-memory session. It changes size for capture mode; there is no second window or session broadcast channel. A global shortcut emits an action without activating the window, preserving focus in the source app. Shortcuts exist only during a session. A serial UI operation gate and native capture lock prevent overlapping operations. The Rust boundary exposes only typed local storage, selection capture, explicit clipboard reads/writes, window settings, and tray actions. No HTTP or shell capability is granted to the frontend.

Core parsing, rendering, comparison, and state transitions are pure TypeScript. Native Objective-C (macOS) and C++ (Windows) are linked into the Rust binary. No subprocess receives customer text. Local JSON stores templates, preferences, and explicitly saved workspace rows. Unsaved session values, verification candidates, and rendered output are memory-only.

Shared standards: ../guidelines. Product exceptions: the utility uses a compact wordmark and 36px controls to fit a floating panel; the primary action remains keyboard accessible. No shared identity service applies to this offline app.

Framework references: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [global shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/).

## Email template and output phase

Optional template email metadata holds Subject/To/Cc/Bcc templates and their enabled flags; existing `content` is Body. `templateSource` aggregates only enabled sections for shared placeholder ordering. `renderEmail` applies the common completeness/verification gate and validates resolved headers. Automatic delivery advances the memory-only cursor only after native success. Explicit manual Back/Next recovery changes the cursor without injected keys and never establishes paste success. Existing finish/previous global shortcuts become Paste+Tab/Shift+Tab in that phase, with no trailing Tab for Body and explicit completion. Native output uses the same clipboard lock as capture, and does not claim delivery or automate Send.

## In-place updates and exchange

`src-tauri/src/updater.rs` owns the checked update and install guard. The frontend checks quietly once at desktop startup and on demand, showing a main-page action only when a newer version is found. Availability checks are serialized and update only the banner to preserve edits. The frontend invokes check/install with a progress channel; no updater URL or key comes from the webview. Tauri handles platform package verification and installation. The release workflow publishes verified assets before updating the separate metadata branch. The private key is outside version control; normal builds do not produce signed update artifacts.

Template archives use a separate versioned JSON envelope validated by `src/core/transfer.ts`. Import adds new IDs through the existing library persistence boundary. Templates can select braces syntax while missing syntax preserves legacy angle brackets; parser and renderer share tokenization and escape behavior. Mouse mode retains only the recent external application/window identity in native memory while enabled.

## Email order and explicit field cleanup

Optional `subjectEnabled` and `order` template properties preserve old-library defaults. Header order is a validated permutation; the frontend displays enabled headers in that order and always appends Body. Disabled Subject is excluded from the aggregate placeholder source and resolved-header checks. Delivery and manual recovery share this ordered section list.

A session field may carry an in-memory `removeBlankLines` flag after explicit cleanup. It strips whitespace-only lines from that value and later verification candidates, invalidates the previous verification, and is erased on clear or completion. Template text and other fields are unchanged. Mouse mode starts enabled per session and can be disabled; application identity polling remains separate from explicit text capture.

## Clipboard preference migration and email header boundaries

`clipboardPreservationConfigured` is an optional native-compatible preference marker. The frontend migrates libraries without a true marker once, sets restoration false, and persists atomically through the existing storage command. Later saved opt-in is retained. Fresh preferences start configured and off.

Rendered email headers and the values substituted into them are trimmed at their edges after completeness/verification checks. `EmailHeaderError` carries only a typed section key for localized recovery guidance. Interior controls and line separators stay invalid; captured values and Body are unchanged.

## Session geometry and inactive fields (0.6.2)

The desktop adapter records bounds only when entering compact mode and restores them when the session completes or is left. A fixed native command uses the invoking Tauri window's HWND on Windows; the frontend cannot supply handles. GetWindowPlacement/SetWindowPlacement share workspace coordinates, avoiding taskbar-offset drift. Placement access is serialized; the record is cleared only after successful restoration. macOS stores physical size and position through Tauri APIs.

Template fieldOrder may include placeholders in disabled email headers. Editor normalization reads all stored header text; session construction and the visible ordering controls use only enabled sections. Reordering swaps active names in the full sequence, preserving dormant positions. No captured values enter this metadata.

## Scanner (0.7.0 test builds)

Scanner uses the existing in-memory Session/Field model and capture, comparison, clipboard, native output, and shortcut adapters. A session-only scanner flag distinguishes individual-field output from template completion. Capturing in Scanner does not automatically switch to whole-template verification. Verification and output apply to the active field; mismatch always blocks output. Native output emits Paste and optional Tab only. The global output shortcut advances only after successful output; mouse Copy remains a direct copy.

Template handoff copies non-mismatch values by exact field name into a new template session, resets statuses to captured, and uses the destination template's comparison policy. The previous session is not erased until launch resources are ready. The optional retained Scanner is a separate memory-only snapshot; it is included in quit and update guards and is erased on explicit discard/quit. No library schema changes or persisted capture fields are introduced.

The isolated test installer uses a distinct Tauri product name/identifier and a Cargo test-build feature. Native updater check/install handlers reject this build flavor. Its frontend disables startup checks and shows a test banner. Test artifacts are created after Windows checks with read-only repository permissions, without signing secrets, and expire after 14 days; tagged public releases continue through the existing signed workflow.

## Email completion and defaults refinement (0.7.0 test channel)

Email delivery now enters an in-memory review state after Finish email session. It remains active for exit and update guards. The explicit Scanner action clones captured fields, status, and the original comparison/verification policy before erasing the email session. Clear fields and close erases both the email fields and any retained Scanner snapshot. The only new persisted property is an optional one-time shortcut migration marker. Email review and Scanner values remain memory-only. Existing ordinary-template completion behavior remains unchanged.

The October 19 build initially opened Templates with Scanner second; October 20 replaces this with Workspace and a bottom Free Scanner action. Fresh examples use structured email metadata and double braces; existing libraries are not replaced. The additive Add email example action was removed on October 20. Angle syntax remains a compatibility mode for old templates without placeholderStyle metadata. Stock shortcuts migrate individually from Shift to Alt only when unchanged and without colliding with customized shortcuts; an optional shortcutDefaultsConfigured marker prevents later explicit shortcut choices from being overwritten.

Scanner Add field and per-row Rename field use focused dialogs with inline validation. Cancellation of Add removes only the provisional empty field and restores the prior active field/mode. Rename changes metadata only, retaining captured values and verification state.

## Local workspace and row Scanner (October 20)

An optional typed `workspace` property extends Library version 1 without changing old-library defaults. Native serde types reject unknown properties and validate folder/table/row IDs, references, names, counts, and value sizes. The frontend applies strict versioned JSON validation. The existing app-data path, mutex, 16 MB cap, temporary-file sync, and atomic replacement remain the persistence boundary. This is a bounded local collection, not an SQL engine or sync service.

Workspace contains folders and tables. Tables contain field names, optional row titles, reusable output text, labeled external references, and rows with explicit saved values. IDs are generated independently of names and external references. Import validates the complete archive before adding records, remaps all conflicting IDs including folder references, and never overwrites rows. Table exports are standalone workspace archives containing the referenced folder. Database exports exclude templates and preferences.

Free Scanner starts from newline-delimited names or Scanner JSON. A session can link to a saved row; values persist only on explicit Save row or Save as row. Save can add columns but never silently delete other rows' values; removing columns in Table settings requires confirmation when populated. Mismatches block row saving. Session candidates and verification states never enter Workspace. Saved/imported values reopen as captured under the current comparison policy. Session erasure also drops its output template and row link; persisted values require explicit row/table deletion.

Scanner output templates and email templates share brace tokenization, support field names including spaces, trim delimiter padding, escape literal opening braces, and render escaped match labels. Legacy angle syntax is unchanged. Copy checks each referenced field with scannerValue. The DOM is never built from unescaped captured text. Keyboard copy only intercepts a focused field button without a native text selection. Tab crosses field buttons, then returns to native tab navigation at either boundary.

Mouse paste reuses the native clipboard lock and vf_focus_source plus vf_deliver within one locked operation. Only a boolean restoreSource flag is new; no externally supplied window handle or app identifier is accepted. Existing source checks, modifier waiting, limits, and permission failures remain active. Mouse paste never advances fields automatically or claims delivery success.

CSV is parsed as bounded UTF-8 text with quoted-cell/newline handling and an explicit preview/header override before a new table is saved. A preflight estimates expanded JSON size before allocating repeated header keys across rows. CSV headers become field names or unique generated column names; values never execute as formulas or macros. New Scanner/table definitions infer missing field lists from brace templates. Scanner compact entry uses 360px logical width and window configs allow a 300px minimum.

## Extra Scanner definitions (0.7.1)

Template.extraFields is optional metadata, absent from old libraries by default. captureFieldNames unions active output placeholders with the extra definitions, deduplicates by exact name, and applies shared fieldOrder. rememberedFieldOrder additionally retains dormant header positions. templateSource and renderTemplate never synthesize extra tokens, keeping output independent from collection. Extra definitions follow the template's capture/verification gates and explicit skip semantics. The Scanner-to-template handoff fills extras by exact name with fresh verification.

Ordinary Finish with extra definitions copies only rendered content and enters the guarded review state. Scanner transfer clones non-skipped captured fields before erasure and keeps comparison/verification policy; Clear and close erases both current values and any retained snapshot. No extra values/candidates are persisted in the library or template archive. Explicit Scanner row-save/value-export behavior is unchanged. Invalid in-progress field text remains editable but blocks Save/Start without corrupting the last valid draft metadata.
