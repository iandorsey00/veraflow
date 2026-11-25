# Display replacement demo

Use the files in this folder with a build that includes **Extract from source…**. All names, records, and sources are fictional. Open the [demo paste destination](service-destination.html) in your browser. Open [Display replacement intake](service-intake.vf) in VeraFlow.

## Acquire and review a labeled source

1. Choose **Extract from source… → Open text file…** and open [service-intake-source.txt](service-intake-source.txt). You can also drop that file into the dialog, paste its text, or select the whole block in your text editor and use **Capture selection** in the desktop app.
2. Choose **Find candidates**. The model, quantity, issue, and contact fields have single candidates. The English and Chinese serial labels give two alternatives. Open the evidence and compare it with the asset label on the browser page. Choose `ABC123458` and check **Apply · Serial number**.
3. Choose **Apply selected values**. Use **Verify field** beside Serial number and compare against `ABC123458` from the asset label. Try a wrong digit first to see the mismatch.
4. Prepare **Service ticket** and paste it into the browser page. Try **Dispatch note**. Its street address remains unresolved. Enter a fictional street address only when you want to test that output.

## Review an external extraction

Start with a fresh form, or leave the previous record open to see how VeraFlow presents replacements.

1. Paste [the email](service-intake-email.txt) into **Extract from source…**. Under **External extraction files**, import [service-email-candidates.json](service-email-candidates.json). These synthetic candidates stand in for an external extractor.
2. Inspect **Affected units**. Its evidence says one display failed out of three purchased. **Shipping address** is listed under **No matching line**. Apply the values you want. If a current response differs, its replacement starts unchecked.
3. Paste [the call transcript](service-intake-call.txt) into the dialog and import [service-call-candidates.json](service-call-candidates.json). Review the quoted correction from `ABC123456` to `ABC123458`. Accept the corrected value and verify it independently against the asset label.
4. Use **Save candidates…** to inspect the strict JSON exchange format. Use **Export field descriptions…** to see the input an external extractor can consume. The example runs locally and uses prerecorded files.

The [Python example](service-email-extractor.py) produces a partial candidate file from the synthetic email with three domain-specific patterns. Run it from this folder and import the result through **External extraction files**. Use `--fields` with an exported field-description file to restrict which IDs it emits.

```sh
python3 service-email-extractor.py service-intake-email.txt service-email-partial.json
```
