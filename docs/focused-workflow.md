# Templates and workflows

## Template workflows

Select a template to see its preview. **Scanner workflow** captures text from another app and uses the template’s Scanner verification setting. **Typing workflow** opens a full-window form with a live output preview. Highlighted placeholders mark required values still waiting for input. Switch workflows in the session to keep your responses. Each workflow verifies with its own method.

- **Settings → General → Focused view** enables the compact task checklist and Pause/Resume layout by default. The setting starts off. Use **Focused view** or **Classic view** in a session to switch immediately.
- **Template options** lets you set Scanner verification and Typing verification independently. Typing verification starts off. When enabled, the app asks you to enter each response again before copying.
- After completion, reopen **Session results** from the navigation or choose **Restart with fresh fields**. If you turn off **Erase session values after copying**, you can reopen the last output and restart with its previous responses. This keeps one session in memory until replaced or cleared.

Back up the library before testing with existing data. Saving **Focused view** or **Typing verification** adds an optional library setting. Use a compatible library backup if you return to a build that predates these settings.

### Add form controls

Set **Placeholder syntax** to double braces. Ordinary placeholders such as `{{reference}}` still generate text fields. Use the following definitions for additional controls. Field IDs in definitions use letters, digits, underscores, or hyphens. Define each field once and refer to it elsewhere with `{{id}}`.

| Definition                                                     | Behavior                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `{{text name: "Alex"}}`                                        | Single-line text with a default                          |
| `{{textarea notes?:}}`                                         | Optional multiline text                                  |
| `{{date due: "2026-12-01"}}`                                   | Calendar date in YYYY-MM-DD format                       |
| `{{number count: "1"}}`                                        | Numeric value                                            |
| `{{email recipient:}}`                                         | Single email address                                     |
| `{{select people: steve="Steve Sample" \| joe="Joe Example"}}` | Radio buttons with stable option IDs. `radio` also works |
| `{{dropdown shipment: local="Local" \| express="Express"}}`    | Dropdown                                                 |
| `{{checkbox tracking: yes="Tracking included" \| no=""}}`      | Checkbox. An empty off value emits no text               |
| `{{switch updates: yes="Send updates" \| no=""}}`              | Toggle switch                                            |
| `{{text address: when shipment=express}}`                      | Required only while the express option is selected       |

Choose an option once and reuse its ID across other parts of the template. For example:

```text
Recipient: {{select people: steve="Steve Sample" | joe="Joe Example"}}
{{choice people: steve="Hello Steve" | joe="Hello Joe"}}

Update available.
{{choice people: steve="Best regards, Steve" | joe="Best regards, Joe"}}
```

Email Mode can define a selection in **To** and reference it in **Subject** or **Body**. A choice can omit an option to emit empty text for that option. Quoted values can use JSON escapes such as `\n` for a multiline block. The first radio or dropdown option is the default. Checkboxes and switches start off. Conditional fields keep their responses while hidden and omit them from the output.

In Scanner, select a configured field to use its control or capture a value. For a selection, the stored value is its option ID. The preview shows the text associated with that ID.

## Start with a small task

Try one synthetic record before using real work. For example, use two fields:

```text
Passenger name
Booking reference
```

Use `Alex Example` and `AB-104` as the values. You can type them manually; a source application is not required for this first exercise.

1. Open **Free Scanner** at the bottom of Workspace.
2. Choose **Define fields**, enter those two lines, and choose **Start Scanner**.
3. The heading identifies the task. The next-action line tells you what to do with the active field. The checklist shows all fields and their state.
4. **Enter value manually** starts open in Scanner. Paste or type `Alex Example` and choose **Capture value**. Capture advances to the next empty field when automatic advancement is enabled.
5. Enter `AB-104` for Booking reference.

For real work, open a saved row from a table instead. The task heading shows the table and row title, when present. Table fields and existing values are loaded into Scanner. Previously saved values need a fresh source check when verification is required.

## Capture from another application

Select the intended text in the source app, then use **Capture selection** or the capture shortcut shown above the controls. The mouse action returns to the most recent source app to capture the selection. You can also copy in the source app and choose **Use clipboard**, paste into the manual text box, or paste onto a selected field.

On Windows, the default global capture shortcut is **Ctrl+Alt+1**. On Mac it is **Cmd+Option+1**. Custom bindings still apply. Browser preview supports manual entry and ordinary clipboard operations; native cross-app capture requires the desktop app.

Capture can replace the clipboard. The existing optional clipboard-restoration setting remains available under **Session options and guidance**.

## Check a value against its source

1. Select **Booking reference** in the checklist.
2. Choose **Check field**.
3. Select the original reference again and use **Compare selection**, or paste a fresh source copy into the manual entry box and choose **Compare value**.
4. Try `AB-1O4` in the exercise. The mismatch shows both versions and highlights the differing part. The captured value stays `AB-104`.
5. Compare `AB-104`. The field becomes **Matched source**.

“Matched source” means the two selections agree under the current comparison rules. It does not establish that you selected the right booking or person. It does not check the destination. Exact and whitespace-tolerant rules still work as before.

**Edit fields and output** contains **Reverify selected field** and **Reverify all filled fields**. Both preserve captured text. Editing a value invalidates its source match. Optional green backgrounds apply only to matched fields and remain off by default.

## Copy or paste a checked value

Select a field, then choose **Copy field**, or press **Ctrl+C** / **Cmd+C** while its checklist button has focus. Required verification still applies. Native text-selection copying and pasting inside text boxes remain unchanged.

Paste into the destination app with its usual Paste action. The desktop **Paste field to last app** action is also available: put the caret in the destination first, then return to VeraFlow and request the paste.

The **Last action** line distinguishes:

| Message                                  | What it establishes                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Captured                                 | VeraFlow accepted text into the named field.                                                                    |
| Matched source                           | A comparison passed under the configured rules.                                                                 |
| Copied to clipboard                      | The clipboard write completed.                                                                                  |
| Paste requested; destination not checked | The paste adapter returned without an error; inspect the destination yourself.                                  |
| Paste uncertain                          | A paste operation failed or could not be confirmed. It may already have inserted text. Inspect before retrying. |
| Advanced manually; paste not confirmed   | VeraFlow moved its email position; that action did not paste anything.                                          |

The line records the latest action in this session, not a permanent history. Its wording does not change if you later edit a value: consult the field’s current state for whether it still matches its source.

## Pause and return after an interruption

Choose **Pause**. VeraFlow returns to Workspace and shows a recap: task name, captured/matched counts, active field, and last action. Session capture shortcuts are suspended, and source-window tracking for the paused session stops. If you separately use snippets in Workspace, their existing source-window tracking may run.

Choose **Resume task** to return. The active field, comparison mode, mismatch, captured values, email position, and unfinished manual typing are retained. Moving to another main page from Classic view also pauses the task. An unresolved shortcut conflict on resume reports an error while leaving manual entry available.

**Pause is not Save.** It keeps work only while the app is running. Quitting, restarting, or clearing a session erases temporary work. Quit and update guards still apply. Use **Edit fields and output → Save row** or **Save as new table row** when you want captured values saved locally. A row save stores captured values, not an in-progress comparison or unfinished typing. Free Scanner never starts saving automatically.

## Templates and email

In **Templates**, choose **Scanner workflow** to capture and check values. Scanner verification starts its second pass when capture is complete. Once ready, choose **Copy result**, **Preview**, or **Prepare email output**.

Email output shows the configured section order as a checklist. Place focus in the correct destination field. Use the configured output shortcut (**Ctrl+Alt+8** on Windows by default) once per section to request a paste and advance. Body has no trailing Tab. VeraFlow never sends the email.

**Next section (manual)** and **Previous section (manual)** move only VeraFlow’s position. Use them to recover after inspecting or manually filling the destination. Each section records copied/requested/uncertain/manual status separately; none of these means the destination has been checked. Pause/resume preserves this checklist within the running app.

After finishing email output, **Open fields in Scanner** remains available for individual transfer. **Clear fields and close** erases the temporary session.

## Switch Scanner layouts

Choose **Classic view** at the top of the working window. Choose **Focused view** to return. Switching preserves captured values, matches, active field, and unfinished manual entry. The session switch lasts for the current app run. Use Settings to set the layout for the next launch.
