# Exchange records between the Desktop CLI and VeraFlow Web

[简体中文](desktop-cli.zh-CN.md)

This walkthrough uses a fictional dispatch, its reusable form, and VeraFlow Desktop from this repository. Run the commands from `apps/web`. Run `npm ci` at the repository root once before using the Desktop CLI. [Dispatch form](../examples/dispatch-exchange.vf) · [Source text](../examples/dispatch-exchange.txt) · [Desktop CLI guide](../../../docs/cli.md)

## Inspect the form and generate candidates

```sh
../../scripts/veraflow inspect examples/dispatch-exchange.vf
../../scripts/veraflow fields examples/dispatch-exchange.vf > dispatch-fields.json
../../scripts/veraflow extract examples/dispatch-exchange.txt \
  examples/dispatch-exchange.vf > dispatch-candidates.json
```

Look for `reference`, `route`, `tracking`, and `delivery_code`. The Route labels are **Ground** and **Air**. Their choice IDs are `ground` and `air`. The default output is `log`, which is listed second. An external extractor can use `dispatch-fields.json` and the source text to produce candidate JSON. In Web, **Extract from source… → External extraction files → Export field descriptions…** exports those same field definitions.

## Review in Web

1. Open the same `dispatch-exchange.vf` in VeraFlow Web and download its HTML. Open the downloaded file directly in a browser. **Dispatch log** is the initial output.
2. Choose **Extract from source…** and load the original text. Then choose **External extraction files → Import candidates…** and open `dispatch-candidates.json`. Review the proposal `000184` and its evidence `Reference: 000184`. Check the Route proposal `ground`, then apply the selected values. A value that matches the form's existing value can be left as-is.
3. To exercise an unanswered value and an explicit empty string, choose **Form tools → Open JSON / JSON5…** and paste `{route: "ground", tracking: null, delivery_code: ""}`. Compare the values and apply them. Including Route explicitly records its choice ID when downloading the response.
4. Candidate review checks the evidence for a proposed value. For practice, open **Optional fields**, enter a tracking value and use **Verify field** to compare it with an independently read value. Restore `tracking: null` through the reviewed JSON import before continuing with the fictional record below.
5. Choose **Form tools → Download response JSON** and save the resulting file as `responses.json` in the current directory. Choose **Create output → Download output JSON** for the default Dispatch log and save it as `log.json`.

## Validate and render the accepted record

```sh
../../scripts/veraflow validate examples/dispatch-exchange.vf \
  --record responses.json
../../scripts/veraflow render responses.json examples/dispatch-exchange.vf \
  --format json > desktop-log.json
```

Both render files contain a `veraflow-render` version 1 envelope with output `log`, section `body`, and the same section text beginning with `000184 | Ground service`. The response file preserves `"000184"`, `"ground"`, `null`, and `""` under their exact field IDs. To compare **Dispatch note**, select it in Web and pass `--output-id note` to Desktop. Its ordered sections are `subject` and `body`.

To reopen the response in the Desktop UI, open the same form and use **Form tools → Import JSON / JSON5…**. For a form that requires verification before rendering, verify the values in Desktop and save a prefilled form with its checks. For the exact Helvetica résumé PDF layout, follow the macOS Desktop or CLI PDF walkthrough. [Résumé PDF walkthrough](https://github.com/iandorsey00/veraflow/blob/d2bac40/examples/source/pdf-demo.md)
