export const en = {
  extraScannerFields: "Extra Scanner fields (optional)",
  extraFieldsHelp:
    "One field name per line. Capture and verify these alongside the template fields, then open them in Scanner after completion. They are never added to template text or email sections. Blank lines and repeated names are ignored.",
  invalidExtraFields:
    "Use up to 1,000 unique names of 1–250 characters, without brackets or control characters.",
  extraFieldsReviewHelp:
    "Template output copied. Open the captured fields in Scanner to transfer individual items, or clear them and close. Values stay in memory until you choose.",

  invalidCSV:
    "Use a UTF-8 CSV file with consistent columns and correctly quoted cells.",
  csvColumns:
    "CSV rows have different column counts. Check the delimiter and quoting.",

  scannerMore: "More tools",
  scannerTemporary: "Temporary until saved as a row or exported.",
  mousePasteHelp:
    "Mouse paste uses the last external app. Focus its destination first and keep mouse mode on.",

  pasteToApp: "Paste field to last app",
  pasteRequested: "Paste requested. Check the destination before retrying.",
  tableDestination: "Existing table name or VeraFlow ID; or a new table name",
  tableAmbiguous:
    "Several tables have that name. Enter the table’s VeraFlow ID.",

  workspace: "Workspace",
  freeScanner: "Free Scanner",
  workspaceConfirm: "Apply this workspace action?",
  defineFields: "Define fields",
  fieldLines:
    "Field names — one per line; or leave blank and supply a template",
  importScanner: "Import Scanner JSON",
  scannerTemplate: "Text or template — use {{field_name}} (optional)",
  addMissing: "Add missing fields",
  copyTemplate: "Copy template output",
  saveRow: "Save row",
  saveAsRow: "Save as new table row",
  exportScannerFields: "Export fields JSON",
  exportScannerValues: "Export fields and values JSON",
  fieldMatched: "matched",
  fieldMissing: "no matching field",
  rowSaveHelp:
    "Edits stay temporary until Save row. Saved values remain after ending Scanner.",
  exportValuesConfirm:
    "Export captured values to JSON? The file may contain private information. Mismatches are excluded.",
  newTableName: "New table name",
  rowTitle: "Row title (optional)",
  rowSaved: "Row saved locally.",
  rowMissing:
    "The saved table or row was removed. Reopen Scanner from the workspace.",
  invalidFields:
    "Enter unique field names, one per line, without brackets or control characters.",
  invalidReferences: "Use one Label=Value per line for external IDs.",
  folderNotFound: "No folder has that name. Create it first.",

  sampleSubject: "{{subject}}",
  sampleTo: "{{recipient_email}}",
  scannerField: "Field",
  scannerFields: "Fields",
  scannerFieldsHelp:
    "Tab switches fields. Ctrl/Cmd+C copies the focused field.",
  saveFieldName: "Save name",
  emailToScanner: "Open fields in Scanner",
  clearClose: "Clear fields and close",
  emailReviewHelp:
    "Email transfer is complete. Open the captured fields in Scanner to copy or paste individual items, or clear them and close. Values stay only in memory until you choose.",

  scannerNewValue: "Enter new value",
  removeFieldConfirm: "Remove this field and erase its captured value?",
  scannerManage: "Fields and output",
  endScanner: "End Scanner",
  removeField: "Remove field",
  scannerUnverified: "Verify this field before transferring it.",
  testBuildNotice:
    "Test build — separate library; public app updates are disabled.",
  testBuildUpdates:
    "Test builds cannot install public updates. Download a newer test build from GitHub Actions.",
  scanner: "Scanner",
  startScanner: "Start Scanner",
  returnScanner: "Return to Scanner",
  scannerIntro:
    "Capture, verify, and transfer text without a template. Define field names, one per line, or import Scanner JSON.",
  scannerPrivacy:
    "Free Scanner stays temporary until Save as row or export. Ending it clears unsaved values. Saved rows remain on this device.",
  scannerFieldName: "Field name",
  renameField: "Rename field",
  addField: "Add field",
  scannerFieldInvalid:
    "Use a unique field name of 1–250 characters. Scanner supports up to 1,000 fields.",
  copyField: "Copy field",
  pasteField: "Paste field",
  pasteTab: "Paste and Tab",
  scannerOutput: "Output shortcut",
  scannerFocusHelp:
    "For paste, focus the destination in another app and press the output shortcut. Copy field always copies without pasting. Paste failures leave the active field unchanged.",
  useTemplate: "Use a template",
  keepScanner: "Keep Scanner values for another task",
  scannerMatchHelp:
    "Values fill template fields with exactly matching names. Verify again using the template’s comparison rules. Without Keep values, returning starts a fresh Scanner.",

  windowPlacement:
    "The window position could not be restored. Please try again.",
  sessionOptions: "Session options and guidance",
  clipboardDefaultHelp:
    "Capture can replace the clipboard by default. Enable restoration only if you need it; unsupported clipboard formats can prevent capture.",

  blankLinesRemoved:
    "Blank lines have been removed from this field. Verification also ignores blank lines here; other text stays unchanged. Clear and recapture to turn this off.",

  enableSubject: "Include Subject",
  emailOrder: "Email paste order",
  emailOrderHelp:
    "Move sections to match your email app. Body stays last. For To → Cc → Body, turn off Include Subject and enable Cc. Handle excluded sections yourself.",
  removeBlankLines: "Remove blank lines",

  updateNow: "Update now",
  discardChanges: "Discard changes",
  eraseSession: "Erase session",
  clearAndSkip: "Clear and skip",
  preserveClipboard: "Preserve clipboard for this session",
  preserveClipboardHelp:
    "If capture cannot preserve your clipboard, turn this off and retry the shortcut or Transfer. Capturing will replace your existing clipboard. This choice resets each session.",
  emailManualBack: "Previous section (manual)",
  emailManualNext: "Next section (manual)",
  modifiersHeld:
    "Release all shortcut keys, then retry. No paste or navigation was requested.",

  mouseMode: "Mouse transfer panel",
  mouseHelp:
    "Select text in your source app, then click Transfer here. VeraFlow returns to that app to capture the selection. Drag this window beside your source; keep Always on top enabled in Settings. Some apps may clear selection when focus changes. This panel does not paste email sections.",
  transfer: "Transfer",

  placeholderStyle: "Placeholder syntax",
  angleStyle: "Angle brackets: <name> (legacy)",
  bracesStyle: "Double braces: {{name}} (recommended)",
  bracePlaceholderHelp:
    "Use {{field_name}} for a variable. Email addresses in <angle brackets> remain literal text.",
  escapeHelp:
    "Changing syntax does not rewrite your text. Prefix an opening delimiter with a backslash to keep it literal: \\<name> or \\{{name}}. Use \\\\ for a literal backslash.",
  importTemplate: "Import one template",
  exportTemplate: "Export this template",
  singleTemplateRequired:
    "Choose a JSON file containing one template. Use Import JSON for a whole template library.",
  importTemplates: "Import JSON",
  exportTemplates: "Export JSON",
  invalidImport:
    "This is not a valid VeraFlow template export, or it exceeds the size/template limit. No templates were imported.",
  importConfirm:
    "Import these templates as new copies? Existing templates will be kept.",
  imported: "Templates imported as new copies.",
  globalShortcuts: "Enable global shortcuts",
  alternateShortcuts: "Use alternate shortcut preset",
  updateHelp:
    "Checks for a newer version, then downloads and installs it here after confirmation. VeraFlow restarts to finish. Complete your session and save changes first.",
  updateBusy:
    "Finish or cancel your session and save or discard changes before updating.",
  updateChecking: "Checking for updates…",
  updateCurrent: "You’re using the latest available version.",
  updateConfirm:
    "Install this update and restart VeraFlow? Saved templates and settings will be kept.",
  updateDownloading: "Downloading and verifying update…",
  updateInstalling: "Installing update. VeraFlow will restart…",
  updateCheckFailed:
    "Could not check for updates. Check your connection and try again.",
  updateDownloadFailed:
    "The update could not be downloaded or verified. Nothing was installed. Check your connection and try again.",
  updateInstallFailed:
    "The update could not be installed. Close other VeraFlow instances and check that the app is in a writable location, then try again.",
  updateFailed: "The update could not be completed. Please try again.",
  updateApp: "Update app…",

  emailFinished:
    "Email session finished. Review the draft in your email app before sending.",
  emailMode: "Email mode",
  subject: "Subject",
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
  body: "Body",
  enableCc: "Include Cc",
  enableBcc: "Include Bcc",
  emailTemplateHelp:
    "Each section accepts placeholders. To and any included Subject are required. Disabled Cc/Bcc sections are excluded from capture and output.",
  emailRequired:
    "Enter To and any included Subject before preparing the email.",
  emailHeaderInvalid:
    "This section contains an internal line break, tab, or control character. Put it on one line; separate multiple recipients with commas. Surrounding whitespace is removed automatically.",
  emailDelivery: "Paste email sections",
  emailDeliveryHelp:
    "Focus the first included section in your email app. Its Tab order must match the order configured on this template. Show only the optional fields you enabled here. Each shortcut pastes one section and presses Tab; Body has no trailing Tab. Adjust focus yourself if your email app uses a different order. Nothing sends the email.",
  emailPasteNext: "Paste section and advance",
  emailGoBack: "Previous section (Shift+Tab)",
  emailBackHelp:
    "Going back moves focus; it does not undo a paste. Select existing text before repasting. Output replaces the clipboard. Manual Back/Next and Alt+Left/Right change only the section here; adjust email focus yourself. The global Next shortcut also advances manually.",
  emailBodyPasted:
    "Review every section in your email app before finishing with Cmd/Ctrl+Enter. Manual advance does not confirm a paste.",
  emailCopy: "Copy current section",
  emailDone: "Finish email session",
  emailPrepare: "Prepare email output",
  emailPasteFailed:
    "Paste or navigation could not be confirmed. Check focus, permissions, and the destination before retrying; text may already have been pasted.",
  manualEntry: "Enter value manually",
  skipConfirm: "Clear this value and skip the field?",
  app: "VeraFlow 核流",
  templates: "Templates",
  settings: "Settings",
  about: "About",
  copyright: "VeraFlow © 2026 Ian Dorsey. Open source under the MIT license.",
  repository: "View repository on GitHub",
  repositoryFailed:
    "Could not open the repository. Visit github.com/iandorsey00/veraflow in your browser.",
  session: "Current session",
  newTemplate: "New template",
  tagline: "Capture once. Verify with confidence.",
  localOnly: "Local by default",
  localNote:
    "Tables and templates stay on this device. Free Scanner stays temporary until saved.",
  search: "Find a template",
  allFolders: "All folders",
  noTemplates: "No templates yet",
  noResults: "No matching templates",
  createHint: "Create a reusable snippet with named fields.",
  name: "Template name",
  folder: "Folder",
  content: "Template text",
  placeholderHelp:
    "Use <field_name> for a variable. Repeated names share one value.",
  reorderHelp: "Drag the dotted handle or use the arrows to reorder.",
  fields: "Capture order",
  noFields: "No placeholders. This template can be copied as written.",
  moveUp: "Move up",
  moveDown: "Move down",
  save: "Save template",
  saved: "Your changes have been saved.",
  duplicate: "Duplicate",
  delete: "Delete",
  start: "Start session",
  cancel: "Cancel",
  back: "Templates",
  deleteConfirm: "Delete this template?",
  discardConfirm: "Discard your unsaved changes?",
  sessionConfirm: "Erase the current session?",
  quitConfirm: "Quit and erase the current session?",
  confirm: "Continue",
  keep: "Keep working",
  deleted: "Template deleted.",
  copySuffix: "copy",
  untitled: "Untitled template",
  capture: "Capture",
  verify: "Verify",
  ready: "Ready to copy",
  complete: "Copied",
  empty: "Empty",
  captured: "Captured",
  verified: "Verified",
  mismatch: "Mismatch",
  skipped: "Skipped",
  current: "Current",
  captureHelp:
    "Select text in your source app, then press the capture shortcut to copy and advance to the next pending field.",
  verifyHelp:
    "Select the original text again, then press the verification shortcut.",
  verifyAgain: "Verify again…",
  reverifyField: "Reverify selected field",
  reverifyAll: "Reverify all filled fields",
  reverifyHelp:
    "Keeps captured text and clears verification for the chosen fields. Compare a fresh source copy to verify them again.",
  reorderFields: "Reorder fields",
  doneReordering: "Done reordering",
  verifyStart: "Start verification",
  verifySelected: "Verify selection",
  captureSelected: "Capture selection",
  previous: "Previous field",
  next: "Next field",
  clear: "Clear field",
  skip: "Skip field",
  finish: "Copy result",
  manual: "Paste or type a value",
  apply: "Capture value",
  compare: "Compare value",
  clipboard: "Use clipboard",
  clipboardHelp:
    "Copy in the source app first. This reads the clipboard without changing it.",
  capturedValue: "Captured value",
  selectedValue: "Selected value",
  editValue: "Correct captured value",
  mismatchHelp:
    "The values differ. Reselect the source or explicitly correct the captured value.",
  preview: "Preview",
  hidePreview: "Hide preview",
  copied: "Text copied to clipboard.",
  erased: "Session values have been cleared.",
  retained: "Session values remain in memory until you close this session.",
  closeSession: "Close session",
  shortcut: "Shortcut",
  shortcuts: "Global shortcuts",
  shortcutHelp:
    "Use CommandOrControl, Alt, Shift, and a key, for example CommandOrControl+Shift+1. Cmd/Ctrl+Shift+N may already be assigned by your system or another app; try CommandOrControl+Alt+N for letter bindings. Shortcuts are active only during a session. Leave a combination blank to disable that action.",
  general: "General",
  language: "Language",
  theme: "Appearance",
  SYSTEM: "System",
  LIGHT: "Light",
  DARK: "Dark",
  launchAtLogin: "Launch at login",
  minimizeToTray: "Close window to menu bar / system tray",
  alwaysOnTop: "Keep capture window on top",
  verifiedBackground: "Green background for verified fields",
  keyboardHelp:
    "Cmd/Ctrl+Enter starts the selected template. In a session, it opens manual entry or submits and advances. Alt+Left/Right moves between fields.",
  autoAdvance: "Advance automatically",
  verification: "Verification",
  verificationEnabled: "Verify before copying",
  verificationDefault: "Enable verification for new templates",
  comparison: "Comparison rules",
  exact: "Exact",
  whitespace: "Whitespace tolerant",
  caseSensitive: "Case sensitive",
  unicode: "Normalize Unicode (NFC)",
  punctuation: "Ignore punctuation",
  collapseLines: "Treat line breaks as spaces",
  privacy: "Privacy",
  clearAfterCompletion: "Erase session values after copying",
  restoreClipboard: "Restore clipboard after temporary capture",
  quitPrivacy:
    "Session values are always cleared when the app quits. Session persistence is not available.",
  saveSettings: "Save settings",
  cancelSession: "Cancel session",
  busy: "Working…",
  error: "Unable to complete the action",
  browserPreview:
    "Browser preview · global shortcuts and native capture require the desktop app.",
  incomplete: "Capture or explicitly skip every field first.",
  unverified: "Verify every populated field before copying.",
  emptySelection: "No text was captured. Select text again or paste a value.",
  noValue: "This field has no captured value. Select a populated field.",
  noField: "There is no active field.",
  notVerifying: "Start verification first.",
  sessionComplete: "Start a new session to capture more values.",
  missingValue: "A field is missing a value.",
  sourceFocus:
    "Select text in another application before pressing the global shortcut.",
  accessibility:
    "Enable VeraFlow in System Settings → Privacy & Security → Accessibility, then retry. You can also copy text yourself and choose Use clipboard.",
  clipboardUnsafe:
    "The existing clipboard cannot be safely preserved. Turn off Preserve clipboard for this session and retry, or copy the source text yourself and choose Use clipboard.",
  copyTimeout:
    "Copy did not complete. Release the shortcut keys, check source-app permissions, and retry, or copy the text yourself.",
  clipboardChanged:
    "The clipboard or source app changed during capture. Retry; the newer clipboard was left in place.",
  restoreFailed:
    "Clipboard restoration failed. Check the clipboard before continuing; capture was not accepted.",
  clipboardBusy: "The clipboard is busy. Try again.",
  captureFailed: "Capture failed. Copy text yourself and choose Use clipboard.",
  invalidText: "This text cannot be copied. Remove null characters and retry.",
  storageFailed:
    "Local storage is unavailable. Your changes have not been saved. Check disk access and try again.",
  invalidLibrary:
    "The saved library could not be read. Restore library.json from a backup; it has not been overwritten.",
  shortcutFailed:
    "A shortcut is invalid, duplicated, or in use by another app. Choose another combination.",
  desktopRequired: "Open the desktop app to use this feature.",
  nameRequired: "Enter a template name.",
  trayFailed: "The menu could not be updated. Try again.",
  settingsFailed:
    "Settings could not be applied. Check login-item permissions and try again.",
  fieldCount: "fields",
  step: "Step",
  of: "of",
  help: "Keyboard help",
  done: "Done",
  quit: "Quit",
  sampleName: "General email",
  sampleFolder: "Examples",
  sampleContent: "Hello {{recipient_name}},\n\n{{message}}\n\nThank you.",
  sampleChineseName: "通用邮件",
  sampleChineseContent: "您好，{{收件人}}：\n\n{{正文}}\n\n谢谢！",
  library: "Template library",
  workflow: "Choose → Capture → Verify → Copy",
  expand: "Inspect value",
  rulesNote:
    "Newline endings are always normalized. Other rules apply only when enabled. Captured values are never changed by comparison.",
  readOnly:
    "Storage could not be loaded. Restart after restoring your library to avoid overwriting it.",
  templateSettings: "Template options",
  values: "values",
};
