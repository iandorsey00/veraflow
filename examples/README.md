# VeraFlow Web examples

[简体中文](README.zh-CN.md) · [Usage guide](../docs/usage.md)

**Source → working record → named outputs → destination**

Use these synthetic cases to see how the form holds one set of field values and reuses it across outputs. Flat record JSON carries those values back to Desktop. Candidate JSON carries proposals and quotations for review.

After `npm run build`, export to new filenames.

```sh
npm run export:html -- --timestamp examples/service-intake.vf dist/display-replacement.html
npm run export:html -- --timestamp --responses examples/housing-response.json \
  examples/housing-application.vf dist/housing.html
```

## Dispatch from JSON

1. On the authoring page, choose **Start from data → Open JSON / JSON5…**. Choose the fictional [dispatch record](dispatch-record.json5), or paste the file contents. Select **Review data**. Check `000184`, the two-line note, and **Unanswered** for tracking. Leave **Generate a summary** selected and choose **Open filled form** to preview the record.
2. Open the JSON again. In review choose **Write your own output** and enter the two lines below. Open the filled form and check that the preview starts with `Dispatch 000184 to North Depot for 林晓 / Alex Lin.`

   ```text
   Dispatch {{reference}} to {{destination}} for {{contact}}.
   Packages: {{packages}}
   ```

3. Open the same data once more and choose **Use a form file → dispatch-form.vf** in the review. Compare **East Depot** with **North Depot**, open the filled form, and choose **Download HTML form**. The record omits the optional delivery code. To test an explicit empty value, add `delivery_code: '',` after the tracking line before reviewing. [Reusable dispatch form](dispatch-form.vf)
4. Disconnect networking and open the downloaded HTML from disk. Verify **Reference** against `000184` and **Destination** against `North Depot`. Check **Preview output**, select **Create output**, and copy the dispatch text. If clipboard access is blocked, the result remains selected for manual copying. Select **Dispatch log** to see the form's other named output.
5. In the same HTML, select **Form tools → Open JSON / JSON5…** and paste `{reference: "000184", destination: "South Depot"}`. Compare the old and new destination, then apply. Reference stays verified, Destination needs a new check, and Notes keeps its two lines. Download **response JSON** and open it on Web or Desktop 0.25.0 to check the leading zeroes, unanswered tracking, and any explicit empty delivery code.

## Display replacement

1. Use **Extract from source…** to open the [labeled text](service-intake-source.txt). In **Needs a decision**, resolve the serial number to `ABC123458` and explicitly select it before applying.
2. Paste the [email](service-intake-email.txt) into extraction. In **External extraction files**, import the [email candidates](service-email-candidates.json). One unit is affected and the street address has no candidate. Apply the conflicting serial `ABC123456` so you can test the correction.
3. Paste the [call transcript](service-intake-call.txt) and import the [transcript candidates](service-call-candidates.json). Apply the serial correction. Verify `ABC123458` against the asset label in the [synthetic destination](service-destination.html). Generate **Service ticket** and copy it. The **Dispatch note** still needs a confirmed street address.
4. Use **Form tools → Download response JSON**. In Desktop, open the same template and choose **Form tools → Import JSON / JSON5…**. Review the changes, apply them, and check that the corrected serial and quantity arrived.

## Bilingual housing application

1. Open the HTML exported from [the housing template](housing-application.vf) and its [prefill record](housing-response.json). Verify `Drew Example` in the collection step, then choose **Next step**.
2. In **Optional fields**, enter `My current home is too far from work.` for the English wording. Prepare all step outputs. Compare the English application and Chinese review with Desktop and copy the output you need.
3. Go back and edit the name. Check that its verification clears and the affected outputs are flagged. Download the working record and review it in Desktop. The English wording should still be present.

For the display and housing demos, move and rename the exported file. Open it directly while offline in Windows Edge and macOS Safari. Check narrow and keyboard-only navigation, Chinese legibility, zero network requests in the browser’s Network panel, and manual copy with clipboard access blocked. In a text editor, find the styles, form markup, embedded definition, and runtime using the section comments.
