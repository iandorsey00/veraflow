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

The command accepts `.veraflow` and `.vf`. If you omit the destination, it adds an `.html` file next to the source. It reports a conflict if the destination already exists. The editable source is the VeraFlow template.

On the authoring page, choose the template and click **Download HTML form**. The page reads the template locally and shows the name of the HTML file before download. Both the authoring page and exported forms can switch between English and Simplified Chinese. Template titles, field labels, instructions, and output text come from the template and stay in the language in which they were authored. Publish the build's `index.html`, fingerprinted JavaScript and CSS, and `version.json` together. The page offers **Update now…** when the same site advertises a higher version. Keep `index.html` and `version.json` revalidatable, and bump the package version for each release.

### Desktop command

The desktop integration is provided as a patch for the companion [VeraFlow repository](https://github.com/iandorsey00/veraflow). With the two repositories checked out as siblings, build VeraFlow Web as above. Then run these commands from VeraFlow Web.

```sh
git -C ../veraflow apply --check ../veraflow-web/integration/veraflow-desktop-export.patch
git -C ../veraflow apply ../veraflow-web/integration/veraflow-desktop-export.patch
npm --prefix ../veraflow run export:html -- ../veraflow-web/examples/service-case.veraflow
```

For another checkout layout, set `VERAFLOW_WEB_DIR` to the VeraFlow Web project directory. The desktop command calls the same build as the authoring page.

## Standalone form

- The form uses the saved template definitions and defaults. Standard exports omit saved responses and verification marks. In-progress responses are held in memory until the tab closes or reloads.
- **Needs attention** links to fields and required checks for the selected output and clears once those checks pass. **Preview output** shows the exact generated sections after the checks pass. Enter the independent value under **Verify field**. A mismatch preserves the original, and editing the original clears the verification.
- Copy individual sections or copy the whole output using the template's delivery separator. When clipboard access is blocked, the form selects the requested text for manual copy. **Download text** saves the complete output.
- The footer shows the VeraFlow Web version. Expand **Form details** for the VeraFlow core version and, if you opted in at export, the source filename. The CLI equivalent is `npm run export:html -- --include-source-name <template>`. A template without its own title still uses its filename stem as the title. It makes no automatic network requests. The footer link can open the GitHub repository when selected.
- Linked CSV, CSV append, CSV context variables, clipboard and selection variables, and snippet action collections produce an export error. Desktop paste-navigation settings have no effect in a standalone form.

The form requires a browser that can run JavaScript from a local file. When managed-device policy blocks local HTML, the same file can be served from an approved internal HTTPS site.

## Synthetic pilot

1. Export [service-case.veraflow](examples/service-case.veraflow). Move it to a new directory, rename it and open it directly in Safari or Windows Edge. Test disconnected and check the browser's Network panel for HTTP requests.
2. Enter case `SV-1042`, tracking number `ZX 902 17` and customer `林 Mei {{case}}`. Leave Route on its Ground default. Compare tracking with `ZX 902 71`, then with `ZX  902 17`. The first check should preserve the entry and block output. The second should match using VeraFlow's whitespace rules.
3. Create **Customer email**, then **Ticket note**. The template marker typed in the customer value should appear literally in both. The [test fixture](tests/fixtures.mjs) records the exact named sections.
4. Change Route to Air and follow the link to the airport field. Edit the tracking number and check that verification is required again. Block clipboard writes during a separate run and confirm manual copy and download still work.

The macOS Safari run used three manual field entries, one default, two comparison attempts, zero repeated entries between outputs, and two successful copy operations. The email was copied as a whole and the note as one section. If a destination has separate email subject and body fields, use three copy operations across the two destinations. The managed Windows Edge pilot is pending.

## Releases

Build from a clean checkout and publish the static output as one version. Verify that the published `version.json` matches the version shown in a newly exported form’s footer. Roll back by redeploying the previous static version, including its original version manifest and assets. Published forms are self-contained files and should be re-exported when they need a newer runtime.

## Development

`npm test` builds the application and checks export errors, privacy, CSP integrity and named output fixtures. Set `VERAFLOW_DESKTOP_DIR` to a desktop checkout to compare against its `src/core` directly. `npm run test:browser` runs the end-to-end tests in Chromium. Set `VERAFLOW_BROWSER=edge` for installed Edge or `VERAFLOW_BROWSER=webkit` for the Playwright WebKit build. The browser runner requires a supported browser installed in the test environment.

The MIT-licensed core snapshot in `vendor/veraflow/core/` is unchanged from the desktop revision recorded in `vendor/veraflow/revision.json`. Refresh the snapshot and revision metadata together and run the desktop and web fixtures when upgrading it.
