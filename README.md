# VeraFlow Web

Export a VeraFlow template as one interactive HTML file. Open the file in a browser, enter the case once, verify the critical values and create named outputs for email, tickets or logs.

## Run the exporter

Use Node.js 22 or later. To open the authoring page locally, run:

```sh
npm ci
npm start
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) and press Control-C in Terminal when you are done. The command builds and serves the site on your Mac or PC. To serve a prebuilt release, use a static web server with the extracted release directory as its root.

To export from the command line:

```sh
npm run build
npm run export:html -- examples/service-case.veraflow dist/service-case.html
```

The command accepts `.veraflow` and `.vf` with JSON or JSON5 metadata headers. The VeraFlow Desktop parser rejects duplicate metadata keys and non-finite numbers. Pass `--timestamp` to append the current UTC timestamp to the HTML filename, including when you provide the destination. If you omit the destination, it adds an `.html` file next to the source. It reports a conflict if the destination already exists. The editable source is the VeraFlow template.

On the authoring page, choose the template and click **Download HTML form**. The page reads the template locally and shows the name of the HTML file before download. Turn on **Add a timestamp to the filename** to keep successive exports, for example `service-case-2026-11-24_13-05-22.410Z.html`. Both the authoring page and exported forms can switch between English and Simplified Chinese. Template titles, field labels, instructions, and output text come from the template and stay in the language in which they were authored. The **Update app…** button appears beside the language switch when the hosting site advertises a newer version.

In a clean VeraFlow Web Git checkout, run `npm run export:html -- --update` to fast-forward to the latest stable release tag on `origin`, install the locked dependencies, and rebuild. Run the command from an already built checkout. For a prebuilt site, use the latest release ZIP. For an exported offline form, re-export it to get the newer runtime.

### Prefill and response exchange

Exports start with the template's authored defaults and omit saved responses by default. Select **Include prefilled responses** to include the template's saved answers. You can also select a strict JSON response file to add or replace values. The CLI equivalents are `--include-responses` for saved answers and `--responses record.json` for a separate file. Included values are readable in the HTML. Verification is performed in the current session.

Use **Download response JSON** to save a partial or complete record. VeraFlow Web writes stable field IDs and string or null values. An omitted key leaves the existing desktop value alone, `null` clears it, and `""` records an explicit empty value. Untouched fields without saved responses are omitted, including any defaults they display. Find the record in VeraFlow Desktop using **Import record JSON…**, review the proposed changes, and choose **Apply all changes**. Imported responses need any required field verification in the receiving session.

### Desktop command

The desktop integration is provided as a patch for the companion [VeraFlow repository](https://github.com/iandorsey00/veraflow). With the two repositories checked out as siblings, build VeraFlow Web as above. Then run these commands from VeraFlow Web.

```sh
git -C ../veraflow apply --check ../veraflow-web/integration/veraflow-desktop-export.patch
git -C ../veraflow apply ../veraflow-web/integration/veraflow-desktop-export.patch
npm --prefix ../veraflow run export:html -- ../veraflow-web/examples/service-case.veraflow
```

For another checkout layout, set `VERAFLOW_WEB_DIR` to the VeraFlow Web project directory. The desktop command calls the same build as the authoring page.

## Standalone form

- In-progress responses are held in memory until the tab closes or reloads. Download response JSON before closing if you want to pass the record back to the author.
- **Needs attention** links to fields and required checks for the selected output and clears once those checks pass. **Preview output** shows the exact generated sections after the checks pass. Enter the independent value under **Verify field**. A mismatch preserves the original, and editing the original clears the verification.
- Copy individual sections or copy the whole output using the template's delivery separator. When clipboard access is blocked, the form selects the requested text for manual copy. **Download text** saves the complete output. Use **Add a timestamp to the filename** to distinguish successive text downloads.
- The footer shows the VeraFlow Web version. Expand **Form details** for the VeraFlow core version and, if you opted in at export, the source filename. The CLI equivalent is `npm run export:html -- --include-source-name <template>`. A template without its own title still uses its filename stem as the title. It makes no automatic network requests. The footer link can open the GitHub repository when selected.
- Linked CSV, CSV append, CSV context variables, clipboard and selection variables, and snippet action collections produce an export error. Desktop paste-navigation settings have no effect in a standalone form.

Open the downloaded file in a browser. A mail attachment preview or file preview may display the HTML without running its JavaScript. Managed devices can enforce local-file, script, clipboard, and download restrictions. Ask your IT administrator which restrictions apply. If local HTML is blocked, serve the same file from an approved internal HTTPS site. If the clipboard button is unavailable, use the selected output with the browser’s ordinary copy command or download the text. See [Microsoft Edge URL policies](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/urlblocklist) and [clipboard write behavior](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).

## Bulk extraction

In an exported form, open **Extract from source…**. Paste labeled lines, explicitly read the clipboard, or open or drop one UTF-8 `.txt` file. The shared extractor matches field IDs, labels, and authored aliases against text like `Serial: ABC123458` or `序列号：ABC123458`. It reads colon, full-width colon, and tab separators.

In **Review candidates**, compare the current value, proposed value, alternative values, and quoted evidence. A single valid candidate for an unanswered field can start selected. Check a replacement or ambiguous candidate explicitly, and edit the proposed value if needed. Applying a changed value clears its existing verification and flags affected outputs for review. Unchanged answers retain their checks. Verify required fields in the form after applying.

**External extraction files** imports strict VeraFlow candidate JSON. If you supply the original text before importing, the shared importer checks quotations against it. **Export field descriptions…** saves IDs, labels, aliases, field types, instructions, and choice labels. **Save candidates…** saves the candidate data and its quotations. Use **Download response JSON** in the form to send the selected answers back to Desktop. The exported form reads source and candidate files locally.

### Display replacement acceptance check

The display replacement files in `examples/` match VeraFlow Desktop 0.22.0.

```sh
npm run export:html -- examples/service-intake.vf dist/display-replacement.html
```

1. Open the HTML directly in Windows Edge and macOS Safari with networking disabled. Use **Extract from source…** and open [the labeled source](examples/service-intake-source.txt). Check that the two serial numbers require an explicit choice. Choose `ABC123458`, then apply the selected values.
2. Paste [the email](examples/service-intake-email.txt) and import [the email candidates](examples/service-email-candidates.json). Check that **Affected units** proposes one and **Shipping address** has no candidate. Apply the proposed serial so you can test the correction.
3. Paste [the transcript](examples/service-intake-call.txt) and import [the transcript candidates](examples/service-call-candidates.json). Apply its correction and verify `ABC123458` against the asset label on the [demo destination](examples/service-destination.html). Create **Service ticket**. The dispatch note still requires a street address.
4. Download response JSON. In Desktop, open [the same template](examples/service-intake.vf), import the record, review the changes, and apply them. Check keyboard navigation and manual copy with the Clipboard API blocked. Use the browser Network panel to check for zero network requests. Open the exported HTML in a text editor and locate the styles, form and dialogs, embedded definition, and runtime.

## Forms with steps

VeraFlow Web supports ordinary forms and forms with a `steps` array. Each step names a `title`, the `fields` to enter, and an `outputs` array. Use `outputs: []` for collection only. The legacy singular `output` remains supported. The shared VeraFlow parser checks field and output assignments and rejects references to later steps. Form, field, and output instructions appear next to their respective controls.

Each step uses the same in-memory record. Expand **Fields from earlier steps** to review reused values. Open **Previous step** to edit an earlier input. Use **Next step** after a collection step passes its field checks. For an output step, use **Create output** for the selected output or **Prepare all step outputs** to show each named output with its own copy and download controls. Then use **Next step** when ready. Copying, saving text, and moving between steps are separate actions. When an edit affects a prepared output, **Outputs to review** identifies the step. Copied sections remain flagged until the output is regenerated and those sections are copied again.

Use the desktop [shipment-steps.veraflow](examples/shipment-steps.veraflow) fixture for the offline browser check:

1. Export the template and open the saved HTML directly with the network disabled. Enter `VF-104` and `Alex`, verify the reference, then create and copy the dispatch email.
2. Select **Next step**, review the reference under **Fields from earlier steps**, enter `PK-12`, and create the pickup note.
3. Go back and change the reference to `VF-105`. Check that the dispatch copy and pickup note are both flagged. Verify the new reference, regenerate the dispatch email, and copy each section. Confirm its warning clears after the second copy. Return to pickup and verify that `PK-12` survives and the regenerated note contains `VF-105`.
4. Repeat in Windows Edge and macOS Safari. Check Tab and Enter navigation, the field's accessible description, and the manual copy and text download paths when clipboard writes are blocked. If local HTML is blocked by workplace policy, serve the same HTML over approved internal HTTPS and repeat the checks.

## Bilingual housing acceptance check

The housing template and response file are copied from VeraFlow Desktop 0.21.0.

```sh
npm run export:html -- --responses examples/housing-response.json \
  examples/housing-application.vf dist/housing-prefilled.html
```

1. Move and rename the HTML file. Open it directly in Windows Edge and macOS Safari with the network disabled. Open the Network panel and confirm there are no HTTP requests. Check a narrow window and use Tab and Enter to verify the prefilled legal name.
2. Use **Next step**, open **Optional fields**, and enter `My current home is too far from work.` Select **Prepare all step outputs** and compare the English and Chinese text with Desktop using the same values. Test the separate Copy controls and manual selection when clipboard access is blocked.
3. Go to the previous step, change the legal name, and confirm both affected outputs are flagged. Download response JSON. In Desktop, open the same template, import the JSON, review the changes, and apply them. Confirm the earlier English wording is still present and verify the changed name locally.
4. Open the HTML in a text editor. Look for the title and styles in the head, the form sections, the embedded definition, and the bundled offline runtime. The definition stores source text as a readable array of JSON strings. The runtime is bundled in readable JavaScript, and the authoring HTML links its CSS and JavaScript near the top.

## Synthetic pilot

1. Export [service-case.veraflow](examples/service-case.veraflow). Move it to a new directory, rename it and open it directly in Safari or Windows Edge. Test disconnected and check the browser's Network panel for HTTP requests.
2. Enter case `SV-1042`, tracking number `ZX 902 17` and customer `林 Mei {{case}}`. Leave Route on its Ground default. Compare tracking with `ZX 902 71`, then with `ZX  902 17`. The first check should preserve the entry and block output. The second should match using VeraFlow's whitespace rules.
3. Create **Customer email**, then **Ticket note**. The template marker typed in the customer value should appear literally in both. The [test fixture](tests/fixtures.mjs) records the exact named sections.
4. Change Route to Air and follow the link to the airport field. Edit the tracking number and check that verification is required again. Block clipboard writes during a separate run and confirm manual copy and download still work.

The macOS Safari run used three manual field entries, one default, two comparison attempts, zero repeated entries between outputs, and two successful copy operations. The email was copied as a whole and the note as one section. If a destination has separate email subject and body fields, use three copy operations across the two destinations. The managed Windows Edge pilot is pending.

## Releases

Build from a clean checkout and publish `index.html`, fingerprinted JavaScript and CSS, and `version.json` together. Keep `index.html` and `version.json` revalidatable, and bump the package version for each release. Verify that the published `version.json` matches the version shown in a newly exported form’s footer. Roll back by redeploying the previous static version, including its original version manifest and assets. Published forms are self-contained files and should be re-exported when they need a newer runtime.

## Development

`npm test` builds the application and checks export errors, privacy, CSP integrity and named output fixtures. Set `VERAFLOW_DESKTOP_DIR` to a desktop checkout to compare against its `src/core` directly. `npm run test:browser` runs the end-to-end tests in Chromium. Set `VERAFLOW_BROWSER=edge` for installed Edge or `VERAFLOW_BROWSER=webkit` for the Playwright WebKit build. The browser runner requires a supported browser installed in the test environment.

The MIT-licensed files in `vendor/veraflow/core/` are copied from VeraFlow desktop. The metadata in `vendor/veraflow/revision.json` records the desktop release and commit used for the build. Refresh the core, dependency metadata, and shared fixtures together when upgrading. Desktop 0.22.0 and the Web exporter use Momoa 3.3.13.
