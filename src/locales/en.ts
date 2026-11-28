export const en = {
  workflows: "Workflows",
  workflowDashboardUnavailable:
    "Could not open Workflows. Start the local worker first.",
  invalidWorkflow: "Check the workflow definition and its format version.",
  workflowNeedsForm: "Choose a VeraFlow form with record outputs.",
  workflowNeedsBlankForm:
    "Register a blank form without saved values or collection history.",
  workflowUnknownField:
    "A workflow rule refers to a field that is absent from the form.",
  workflowDefinitionNotFound: "No matching workflow revision is registered.",
  workflowInstanceNotFound: "The workflow instance does not exist.",
  workflowRevisionExists:
    "This workflow revision already exists. Use a new revision ID.",
  workflowInstanceLocked:
    "Resolve the destination review before changing this record.",
  workflowVerificationNotPending:
    "This field does not have a pending verification.",
  workflowRequestHasConflict:
    "Resolve the pending response conflict before closing this request.",
  workflowConflictNotFound:
    "There is no unresolved conflict for that response.",
  workflowConflictDecision: "Choose accept or keep for the incoming response.",
  workflowInvalidTransition:
    "This action is unavailable for the current execution state. An uncertain or previously autofilled attempt requires acknowledgement before retry.",
  workflowWorkerAlreadyRunning: "A worker already owns this state directory.",
  workflowWorkerInterrupted:
    "The worker could not save the result. Restart it to review the interrupted attempt.",
  workflowReviewUnavailable:
    "The review page is unavailable. Check the previous attempt before retrying.",
  workflowMissingArgument: "A required workflow argument is missing.",
  workflowResponseNotReadable:
    "The response is temporarily unreadable. Retry after synchronization.",
  workflowResponseNeedsFile: "Choose a regular response JSON file.",
  invalidRespondentUrl:
    "Choose a respondent URL. For Google Forms use the form's public answer link.",
  unsupportedCollectionProvider:
    "Choose google-forms or native-file as the collection provider.",
  unsupportedWorkflowDestination:
    "Choose the fictional employment destination and its intake page.",
  destinationPageChanged:
    "The destination page did not match the expected layout.",
  destinationBrowserUnavailable:
    "Chromium is unavailable. Run npx playwright install chromium.",
  workflowStoreBusy: "The workflow store is busy. Retry the operation.",
  workflowInputTooLarge: "The workflow input is too large.",
  workflowUnsupportedStore: "This workflow database version is not supported.",
  booleanYes: "Yes",
  booleanNo: "No",
  openSource: "Import template file",
  sourceLine: "Line",
  searchCSVRows: "Search all columns or enter a row number",
  copyOutput: "Copy output",
  recentOutputs: "Recent outputs",
  clearOutputHistory: "Clear output history",
  clearOutputHistoryConfirm: "Clear all saved outputs?",
  outputHistoryLimit: "Number of recent outputs to keep",
  outputHistoryHelp:
    "VeraFlow stores rendered outputs in plain text on this device. Enter 0 to clear and turn off history.",
  outputHistoryEmpty:
    "Copied, pasted, or exported template outputs will appear here.",
  outputHistoryOff: "Output history is off. You can turn it on in Settings.",
  invalidHistoryLimit: "Enter a whole number from 0 to 20.",
  historyFull:
    "This output exceeds the history size limit. You can save it as text.",
  outputHistorySaveFailed:
    "The output was transferred or saved, but VeraFlow could not add it to Recent outputs.",
  scannerToolsLabel: "Tools",
  legacyLibrary: "Legacy template library",
  legacyLibraryHelp:
    "Open saved library templates and export them for migration.",
  openFolder: "Open folder…",
  refreshFolder: "Refresh",
  closeFolder: "Close folder",
  searchTemplates: "Find a form",
  folderEmpty: "This folder has no VeraFlow form files.",
  folderReadFailed: "VeraFlow could not read this folder.",
  folderTooLarge: "This folder is too large. Choose a smaller folder.",
  pasteOptions: "Paste options",
  reorderSections: "Reorder sections…",
  sectionOrder: "Section paste order",
  resetSectionOrder: "Reset to template order",
  sectionOrderHelp:
    "Moving a section restarts at the first section. Saved text keeps the template order.",
  manualSectionOrder:
    "Custom paste order. Place the cursor before each paste. VeraFlow pastes one section and sends no navigation keys.",
  outputHeading: "Output",
  recentForms: "Recently opened forms",
  recentEmpty: "Open a form, then save your responses when you close it.",
  saveRecentSession: "Save to recent forms",
  clearRecentConfirm: "Clear all saved forms from this list?",
  clearRecent: "Clear recent forms",
  recentMissing: "This form could not be reopened.",
  openDocument: "Open file…",
  openWorkflow: "Open as",
  chooseWorkflow: "Choose a workflow",
  chooseWorkflowRequired: "Choose Fill form or Scanner.",
  csvUseTemplate: "Open a form file…",
  csvFreeScanner: "Custom form · CSV columns",
  exportSource: "Export .veraflow",
  sourceTemplate: "Imported template",
  sourceText: "Template source",
  invalidSource:
    "Check the VeraFlow source header, field definitions, and matching section or condition tags.",
  hideLivePreview: "Hide live output preview",
  prepareSections: "Prepare output sections",
  allSections: "All sections",
  groupSections: "Paste sections together",
  deliveryMode: "Paste mode",
  deliveryStep: "One section per shortcut",
  deliverySequence: "All remaining sections per shortcut",
  afterSection: "After this section",
  noNavigation: "No keystrokes",
  sectionTab: "Press Tab where the template has no keys",
  copyEntireOutput: "Copy entire output",
  extractSource: "Extract from source…",
  openSourceText: "Open text file…",
  sourceTextFileType: "Choose one UTF-8 .txt file.",
  candidateFileTools: "External extraction files",
  candidatePrivacy:
    "Candidate files are plain text and may contain private values and quoted evidence.",
  importCandidates: "Import candidates…",
  exportExtractionFields: "Export field descriptions…",
  findCandidates: "Find candidates",
  candidateLimit:
    "The source or candidate file exceeds the extraction limits. Use a smaller selection or file.",
  invalidCandidateFile:
    "The candidate file is invalid. Check its format, version, and entries.",
  candidateEvidenceMismatch:
    "A quotation in the candidate file does not match the source text provided.",
  noCandidates:
    "No candidate fields found. Use labeled lines or import a candidate file.",
  reviewCandidates: "Review candidates",
  candidateReviewHelp:
    "Check the values you want to apply. Review replacements against the evidence. Required verification happens in the form.",
  candidateFound: "Candidate found",
  candidateAmbiguous: "Ambiguous source. Choose or enter a value.",
  candidateInvalid: "The source value needs correction.",
  candidateSame: "Matches the current value.",
  candidateConflict: "Differs from the current value.",
  chooseCandidate: "Source alternatives",
  acceptCandidate: "Apply",
  candidateEvidence: "Source evidence",
  candidateInferred: "Inferred",
  candidateDirect: "Directly stated",
  candidateNoEvidence: "No quotation supplied.",
  saveCandidates: "Save candidates…",
  applyCandidates: "Apply selected values",
  selectCandidates: "Select at least one candidate to apply.",
  batchCompare: "Compare source text…",
  batchSource: "Paste source text",
  batchSourceLimit: "Enter up to 65,536 characters of source text.",
  batchEvidenceHelp:
    "Review this evidence against the original. This comparison does not mark fields verified. Each result shows the record value followed by any source candidates.",
  batchAssociated: "Matching labeled value",
  batchConflict: "Different labeled value",
  batchAmbiguous: "Multiple candidates",
  batchFound: "Value found without a matching label",
  batchMissing: "No matching line",
  importRecord: "Import JSON / JSON5…",
  openRecordInput: "Open JSON / JSON5…",
  chooseRecordFile: "Choose JSON file…",
  pasteRecordInput: "Or paste JSON or JSON5",
  reviewRecordInput: "Review data",
  recordInputHelp:
    "Use one object with a name for each field. Values can be text, numbers, true, false, or null.",
  recordInputFile: "Choose a UTF-8 .json or .json5 file.",
  recordInputLimit:
    "Use up to 1,000 fields and keep the data and generated form under 1 MiB.",
  recordInputSyntax: "Check the JSON or JSON5 near this line.",
  recordInputObject: "Enter one JSON object with at least one field.",
  recordInputName: "Field names must have text and fit on one line.",
  recordInputDuplicate: "This field appears more than once.",
  recordInputNested:
    "Use a single value for this field. Move nested objects or lists to their own fields first.",
  recordInputNumber:
    "Use a finite number or quote the value as text for this field.",
  recordFieldValues: "Field values",
  recordInputFormName: "JSON form",
  recordOutputHelp:
    "Open a filled form with a ready-made summary, or use a form file to generate its outputs.",
  recordCustomOutput: "Write your own output",
  recordOutputLabel: "Output text",
  recordOutputExample:
    "Use {{field}} to insert a value. Leave this empty to list all fields in the output.",
  recordBack: "Back to JSON",
  recordUseExisting: "Use a form file…",
  recordOpenFilled: "Open filled form",
  recordUnknownField: "Unknown field in this record.",
  recordInvalidField: "Invalid value for field.",
  recordNoChanges: "This record contains no changes.",
  recordUnanswered: "Unanswered",
  recordEmptyValue: "Explicitly empty",
  recordCurrent: "Current value",
  recordIncoming: "Incoming value",
  recordReview: "Review record changes",
  recordApply: "Apply all changes",
  recordApplied: "Record changes applied.",
  customFormUseFile: "Use with form file…",
  recordNeedsForm: "Choose a source file that opens a form.",
  saveRecord: "Save record as JSON…",
  copySection: "Copy current section",
  saveSections: "Save output as text",
  savePdf: "Save as PDF…",
  saveMarkdown: "Save Markdown…",
  recentRecordForms: "Recently used form files",
  pdfSetup: "PDF setup",
  pdfSetupHelp:
    "Install Pandoc and a TeX distribution with XeLaTeX. VeraFlow remembers the verified executables on this Mac.",
  locatePandoc: "Locate Pandoc…",
  locatePdfEngine: "Locate PDF Engine…",
  pdfToolNotFound: "Executable needed",
  pdfUseTools: "Use these tools",
  pdfReview: "Review Markdown for PDF",
  pdfPreparedMarkdown: "Prepared Markdown",
  pdfTrustHelp:
    "Continue only if you trust the form and the imported text. Markdown and LaTeX can include local resources. Review the full document before converting.",
  pdfChooseDestination: "Choose PDF destination…",
  pdfConverting: "Creating PDF…",
  pdfCancelling: "Cancelling…",
  pdfCancelled: "PDF creation cancelled.",
  pdfSaved: "PDF saved.",
  pdfPandocMissing: "Locate an installed Pandoc executable in PDF setup.",
  pdfEngineMissing: "Locate an installed XeLaTeX executable in PDF setup.",
  pdfMarkdownLimit:
    "PDF export needs a nonempty prepared output of up to 16 MiB.",
  pdfBusy: "A PDF is already being created.",
  pdfConvertFailed:
    "Pandoc or XeLaTeX could not produce the PDF. Review the Markdown and LaTeX, or save the Markdown to diagnose it.",
  pdfFontFailed:
    "XeLaTeX could not use a font. Check the font name in the Markdown and install the font on this Mac.",
  pdfLatexPackage:
    "XeLaTeX is missing a required LaTeX package. Check your TeX installation or save the Markdown to diagnose it.",
  pdfTimedOut:
    "PDF creation took more than 90 seconds. Simplify the document or save the Markdown to diagnose it.",
  pdfInvalidResult: "The converter did not produce a readable PDF.",
  pdfDestination: "Choose a writable folder and a regular .pdf file.",
  pdfDestinationChanged:
    "The destination changed while the PDF was being made. Choose it again before replacing it.",
  closeSourceTitle: "Save before closing?",
  closeSourceHelp:
    "Save your responses to Recent Sessions on this device, save a prefilled form file, or export the output as text.",
  closeSourceIncomplete:
    "Save your responses to Recent Sessions on this device or to a prefilled form file. Finish the required fields and checks to export the output as text.",
  openSessions: "Open sessions",
  sessionHome: "Home",
  quitParkedConfirm: "Quit and discard the drafts in the other open sessions?",
  snippetPasteTitle: "Enter text…",
  snippetPasteLabel: "Paste or type the text to use",
  snippetSelectionUnavailable: "Could not capture selected text",
  snippetCopyAction: "Copy result",
  snippetCopyUnavailable: "Copy the result manually",
  snippetOutputLabel: "Generated text",
  createForm: "Create form",
  adHocForm: "Custom form",
  createFormIntro:
    "Define the fields you need for this task, or import a saved field list.",
  startAdHocForm: "Open form",
  formStep: "Step",
  formStepPrevious: "Previous step",
  prepareStepOutputs: "Prepare all step outputs",
  formStepNext: "Next step",
  formStepReused: "Fields from earlier steps",
  formStepOutputStale: "Inputs changed. Review this output again.",
  formStepCopiedStale:
    "Inputs changed after transfer. Review and replace any affected copies.",
  attentionMissing: "missing",
  attentionChecks: "to verify",
  attentionShowAll: "Show all items",
  candidateDecisions: "Review these decisions",
  candidateNewValues: "New values",
  candidateMatchingValues: "Matching values",
  formAttention: "Needs attention",
  formNextAttention: "Next item needing attention",
  fieldNeedsVerification: "Needs verification",
  fieldNeedsValue: "Missing value",
  fieldCaptureSelection: "Capture",
  fieldVerify: "Verify field",
  fieldVerifyAgain: "Verify again",
  fieldEnterOriginal: "Enter original value",
  formFieldSettings: "Field settings",
  formUseDefault: "Use form default",
  formRequireVerification: "Require verification",
  formVerificationOptional: "Verification optional",
  formVerified: "Verified",
  formOptionalDetails: "Optional details",
  formVerificationDefault: "Require verification by default",
  formTools: "Form tools",
  templateInstructions: "Form instructions",
  snippetCollectionHelp:
    "Choose a snippet to copy its text. For selection snippets, select text in another app first.",
  savePrefilled: "Save prefilled form",
  returnToFilledForm: "Return to Form",
  returnToFilledScanner: "Return to Scanner",
  scannerChooseOption: "Choose a value in VeraFlow for this field.",
  closeWithoutSaving: "Close without saving",
  sectionDeliveryHelp:
    "Focus the destination, then press the shortcut to paste. If paste fails, inspect the destination before retrying or use Copy current section.",
  sourceCSV: "Fill from CSV…",
  csvTooLarge: "The CSV exceeds 64 MiB.",
  csvTooManyRows: "The CSV has more than 100,000 data rows.",
  csvHeaders: "CSV column names must be nonblank and unique.",
  csvNoRows: "This CSV has no data rows.",
  csvLinkUnavailable:
    "The linked CSV is unavailable. Check the file path relative to the template.",
  csvPickLinked: "Choose the linked CSV",
  previousCSVRow: "Previous row",
  nextCSVRow: "Next row",
  previousCSVRows: "Earlier rows…",
  nextCSVRows: "Later rows…",
  previousOutput: "Previous output",
  nextNamedOutput: "Next output",
  csvMode: "CSV",
  appendMode: "Append row",
  useCSVRow: "Use this row in Form",
  replaceDraftWithRow: "Replace the current draft with this CSV row?",
  appendReview: "Review row",
  appendChooseFile: "Choose destination CSV…",
  appendChangeFile: "Change or reload CSV…",
  appendWrite: "Append row",
  appendWriteNext: "Append and start next",
  appendNext: "Start next record",
  appendReceipt: "Added data row",
  appendDuplicate: "Matching key in data row",
  appendDuplicateConfirm: "This key already exists. Append another row?",
  appendDuplicateKey:
    "The duplicate-check column is missing or its value is blank.",
  appendUnmapped: "Fields outside the destination columns:",
  appendMissingColumn:
    "The destination CSV is missing a column named in this output.",
  appendNoColumns: "The record and destination CSV have no matching columns.",
  appendEmptyRow: "Enter at least one value before adding a row.",
  appendDialect:
    "The CSV delimiter is ambiguous. Use a CSV with clear column separators.",
  appendDesktopOnly:
    "Choose and write a CSV in the desktop app. You can copy the row here.",
  appendReadFailed: "The destination could not be read as UTF-8 CSV.",
  appendWriteFailed:
    "The CSV could not be written. Close it in other apps and retry. Your record is still here.",
  appendChanged:
    "The CSV changed since it was opened. Reload it and review the row before retrying.",
  copySpreadsheetRow: "Copy as spreadsheet row",
  csvRow: "CSV row",

  scannerWorkflow: "Scanner workflow",
  outputPreview: "Output preview",
  typingVerification: "Require a second entry in Typing workflow",
  invalidFormDirective:
    "Check the template’s form syntax, option IDs, and field conditions.",
  invalidControlValue:
    "Enter a value that matches the field type and allowed choices.",
  singleLineRequired:
    "This field takes a single line. Remove line breaks and try again.",
  leaveUnanswered: "Leave unanswered",
  chooseValue: "Choose a value",
  enableField: "On",
  reenterValue: "Enter the value again to verify it.",
  typingMismatch: "The second entry differs. Try again or edit your responses.",
  editResponses: "Edit responses",
  matchedEntry: "Matched second entry",
  sessionResults: "Session results",
  restartSession: "Restart with fresh fields",
  reuseSession: "Restart with previous responses",

  editTemplate: "Edit template",
  fillForm: "Fill form",
  openInScanner: "Open in Scanner",
  formCheckHint:
    "After filling the form, enter each response again to verify it.",
  quickGuide: "Quick guide",
  guideCapture:
    "Select a field. Capture selected source text, or open Enter value manually and paste or type it.",
  guideCheck:
    "Choose Check field, then select the original text again or paste a fresh copy to compare. A mismatch keeps the captured value. Templates start their check pass after capture.",
  guideCopy:
    "Copy field or Ctrl/Cmd+C on a selected Scanner field copies its value after any required check. Paste into your destination and inspect the result.",
  guidePause:
    "Pause returns to the launcher. Resume task restores your place and unfinished typing. Choose Classic view to switch layouts without losing values.",

  focusedView: "Focused view",
  classicView: "Classic view",
  pauseTask: "Pause",
  resumeTask: "Resume task",
  taskPaused: "Task paused",
  pausePrivacy:
    "Kept in memory while VeraFlow is open. Quitting clears this session.",
  taskTools: "Edit fields and output",
  progressCaptured: "captured",
  progressMatched: "matched source",
  matchedSource: "Matched source",
  matchMeaning:
    "Matched source means the selected text agrees under your comparison rules. Check that it is the correct record. It does not confirm the destination.",
  nextCapture: "Next: capture this field",
  nextCompare: "Next: compare a fresh source selection",
  nextCheck: "Next: check this field against the source",
  nextCopy: "Next: copy or paste this field",
  nextPending: "Next: select an empty field to capture",
  nextOutput: "Ready: choose your output",
  nextEmail: "Next: fill the current email section",
  nextMismatch: "Next: compare again or correct the captured value",
  checkField: "Check field",
  compareSelection: "Compare selection",
  lastAction: "Last action",
  noActionYet: "Nothing captured or transferred in this session yet",
  stepCaptured: "Captured",
  stepMatched: "Matched source",
  stepMismatch: "Source differed; captured value kept",
  stepCopied: "Copied to clipboard",
  stepPaste: "Paste requested; destination not checked",
  stepPasteUncertain:
    "Paste uncertain; inspect the destination before retrying",
  stepManual: "Advanced manually; paste not confirmed",
  transferPending: "Not transferred",

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
  scannerTemporary: "Temporary until exported.",
  mousePasteHelp:
    "Mouse paste uses the last external app. Focus its destination first and keep mouse mode on.",

  pasteToApp: "Paste field to last app",
  pasteRequested: "Paste requested. Check the destination before retrying.",

  freeScanner: "Free Scanner",
  defineFields: "Define fields",
  fieldLines:
    "Field names — one per line; or leave blank and supply a template",
  importFormFields: "Import form fields (JSON)",
  importScanner: "Import Scanner JSON",
  scannerTemplate: "Output text — use {{field_name}} for a field (optional)",
  addMissing: "Add missing fields",
  copyTemplate: "Copy output",
  exportScannerFields: "Export fields JSON",
  exportScannerValues: "Export fields and values JSON",
  fieldMatched: "matched",
  fieldMissing: "no matching field",
  exportValuesConfirm:
    "Export captured values to JSON? The file may contain private information. Mismatches are excluded.",
  invalidFields:
    "Enter unique field names, one per line, without brackets or control characters.",

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
    "Closing a custom form clears its values. Export them to keep a copy.",
  scannerFieldName: "Field name",
  renameField: "Rename field",
  addField: "Add field",
  scannerFieldInvalid:
    "Use a unique field name of 1–250 characters. A form supports up to 1,000 fields.",
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
  invalidSnippetImport:
    "Choose a valid VeraFlow snippets JSON file (up to 16 MB). Snippets need titles and text; nothing was imported.",
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
  app: "VeraFlow",
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
  localNote: "Templates stay on this device.",
  search: "Find a form",
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
    "Type the key names shown here, separated by +. Shortcuts are active only during a session. Leave a combination blank to disable that action.",
  general: "General",
  language: "Language",
  theme: "Appearance",
  SYSTEM: "System",
  LIGHT: "Light",
  DARK: "Dark",
  launchAtLogin: "Launch at login",
  minimizeToTray: "Close window to menu bar / system tray",
  alwaysOnTop: "Keep the session window on top",
  verifiedBackground: "Green background for verified fields",
  keyboardHelp:
    "Cmd/Ctrl+Enter starts the selected template. In a session, it opens manual entry or submits and advances. Alt+Left/Right moves between fields.",
  autoAdvance: "Advance automatically",
  verification: "Verification",
  verificationEnabled: "Verify Scanner workflow before copying",
  verificationDefault: "Verify by default in custom forms",
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
    "Open Privacy & Security in System Settings and scroll down to Accessibility. Enable the app you launched, VeraFlow or VeraFlow Test. If it is missing, add it with +. For Scanner capture, you can also copy the text yourself and choose Use clipboard.",
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
  recordTools: "Record tools…",
  collectionCreate: "Collect missing information…",
  collectionQuestionHelp:
    "Choose the optional questions to include. Required questions are always included.",
  collectionDeferred:
    "Some questions depend on answers you do not have yet. Apply this response, then check the remaining gaps.",
  collectionRequiredLabel: "Required",
  collectionOptionalLabel: "Optional",
  collectionInvalidLabel: "Invalid values",
  collectionVerifyLabel: "Needs verification",
  collectionDeferredLabel: "Waiting on a condition",
  collectionNoGaps: "The current scope has no outstanding fields or checks.",
  collectionPreview: "Preview collection request",
  collectionPrivacy:
    "This is the exact JSON to share. Check the labels and instructions for private details. VeraFlow saves the working record locally so you can match the response later.",
  collectionSaveRequest: "Save record and export request",
  collectionExported:
    "Request exported. Reopen the working record from Recently opened forms to review a response.",
  collectionNoQuestions:
    "There are no selected questions to collect in this scope.",
  collectionRequestLimit:
    "This record has too many open requests. Close a request before creating another.",
  collectionImport: "Import collection response…",
  collectionManage: "Manage open requests…",
  collectionOpenRequests: "Request ID · Responses processed",
  collectionSelectRequest: "Choose a request to close.",
  collectionCloseRequest: "Close request",
  collectionReviewHelp:
    "New values start selected. Select a replacement or clear explicitly. Any unchecked values will be kept.",
  collectionAcceptClear: "Clear value",
  collectionApplySelected: "Apply selected values",
  collectionApplied: "Response reviewed and saved to the local working record.",
  collectionDuplicate:
    "This response was already processed in this working record.",
  collectionUnknown:
    "This request belongs to a different working record. Open the original working record and retry.",
  collectionClosed: "This collection request is closed.",
  collectionStale:
    "The form or scope changed after the request was created. Create a new request.",
  collectionUnexpected: "The response includes a field that was not requested.",
  collectionRequired:
    "The response is missing an answer to a required question.",
  collectionInapplicable:
    "An answer does not apply to the current branch. Review the record and create a new request if needed.",
  collectionResponseLimit:
    "This request has reached its response limit. Close it and create another request.",
  invalidCollectionRequest:
    "The collection request is invalid or exceeds its size or nesting limit.",
  invalidCollectionResponse:
    "The collection response is invalid or exceeds its size or nesting limit.",
  invalidRecordState: "The private working record metadata is invalid.",
  invalidRecordMapping: "The mapping or source JSON is invalid.",
  recordMappingAmbiguous:
    "A mapping selected more than one source record. Narrow the selection.",
  recordMappingMissing: "A required source value is missing.",
  recordMappingConversion:
    "The mapping does not define a conversion for a source value.",
  recordTransform: "Review transformations…",
  invalidTransformation: "The transformation proposal is invalid.",
  transformationStale:
    "A proposed transformation no longer matches the current value.",
  recordHistory: "Field history",
  recordHistoryEmpty: "There is no recorded field history.",
  recordApproval: "Review and approve record…",
  recordApprovalHelp:
    "Review the values for the current scope before approving a snapshot for export.",
  recordIncludeHistory: "Include field origins and previous transformed values",
  recordApprovalExact:
    "These values will be exported with an approval timestamp. Approve only for the intended use.",
  recordApproveExport: "Approve and export",
  recordNotReady:
    "Finish required fields and checks before exporting a validated record.",
  invalidReviewedRecord:
    "The reviewed record is invalid or no longer matches its fingerprint.",
  recordExactJSON: "Exact export contents",
  recordOriginManual: "Entered manually",
  recordOriginJSON: "Imported from JSON",
  recordOriginCSV: "Read from CSV",
  recordOriginMapped: "Mapped from another record",
  recordOriginCandidate: "Accepted from extracted candidates",
  recordOriginCapture: "Captured from another source",
  recordOriginDefault: "Default from this form",
  recordOriginCollection: "Accepted from a collection response",
  recordOriginTransformation: "Transformed from a previous value",
  recordOriginRequest: "Request ID",
  recordOriginResponse: "Response ID",
  recordTransformFrom: "Before",
  recordTransformTo: "After",
};
