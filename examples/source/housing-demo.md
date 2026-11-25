# VeraFlow housing demo

Use the files in this folder to try a fictional case in about five minutes.

1. Open `housing-destination.html` in a browser and `housing-application.vf` in VeraFlow. In **Settings**, enable **Keep the session window on top** if you want to test switching between apps.
2. Type `Alex Example` as the legal name. Select **Form tools → Import JSON / JSON5… → Choose JSON file…** and open `housing-response.json`. Review the change from Alex to Drew and the incoming Chinese text. Select **Apply all changes**.
3. Select **Verify field** beside the legal name. Try `Alex Example` to see a mismatch, then use `Drew Example` from the browser page to match it. Try selection capture if available, or enter the value manually.
4. Choose **Next step**. Open **Optional details** and enter `My current home is too far from work.` for English wording. Select **Prepare all step outputs**. The form now offers **English application** and **中文核对**.
5. Copy each output into the matching box on the demo page. To test native paste, focus the intended box and use the output shortcut shown in VeraFlow. Check the destination after each transfer.
6. Return to the collection step and edit the name. Check that VeraFlow asks you to verify it again and flags the previously transferred outputs. Pause the session and check that the launcher releases its window pin.

You can close and reopen the demo page to clear the paste destinations.

For bulk text and candidate interchange, try the [display replacement demo](service-demo.md) in a build that includes **Extract from source…**.
