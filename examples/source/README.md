# VeraFlow source examples

English · [简体中文](README.zh-CN.md)

Use synthetic responses while testing. Open each example with VeraFlow Test or choose **Open file…**.

| File                            | What to check                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `greeting.vf`                   | Choose Fill form or Scanner. Enter a name and reference. The final placeholder prints literally.                                                                                                                                                         |
| `address.veraflow`              | Opens in Scanner. Try two street lines, then insert a blank line to see it removed. Leaving Attention empty removes that line.                                                                                                                         |
| `step-tabs.veraflow`            | Opens in Fill form with sample values. Prepare sections and paste into `test-destination.html`. One shortcut pastes Recipient, then presses Tab twice and stops at Subject. The second shortcut pastes Subject and moves to Body. The third pastes Body. |
| `full-sequence.veraflow`        | Uses the same sample values and destination. One shortcut fills all three inputs and leaves Optional empty. Switch Paste mode to one section to test the override.                                                                                       |
| `reverse-tab.vf`                | Start in Subject in `test-destination.html`. The first shortcut pastes Subject and moves backward to Optional. The second pastes Optional.                                                                                                               |
| `rma.veraflow` and `rma.csv`    | Open the CSV, select the second row, and choose the RMA template. Check the To and Subject branches and the optional Attention line.                                                                                                                     |
| `inline-greeting.veraflow`      | Choose Yes to render the quoted display-name address. Enter a name to add it inline. Group output to see a blank line between the recipient and message.                                                                                                 |
| `prefilled-incomplete.veraflow` | Road freight and the notes reopen prefilled. Add a reference, save a prefilled copy, and reopen it to change the values. Save the completed output as text.                                                                                              |

Open `test-destination.html` in your browser as a local page. Prepare the output in VeraFlow, select the first destination input, then use the output shortcut displayed by VeraFlow. The test page only contains local editable fields.

Try [Shared record](shared-record.veraflow) to preview an appointment note and a tab-separated row from the same fields. Save the record as JSON to include its internal note.

Open [Linked service visits](linked-records.veraflow) with [its CSV](linked-records.csv) beside it. Step through two visits and two named outputs using the row arrows on the Output page.

Try the [dispatch note](dispatch-note.veraflow) for comments, conditions, loops, formatted dates, and an address field that removes blank lines.

Open [Quick snippets](quick-snippets.veraflow) for one-click clipboard actions, including a local timestamp and a greeting using selected text.

Copy [the shipment template](shipment-log.veraflow) and [its CSV](shipment-log.csv) into the same folder to try all four modes. Use reference `VF-104` to see the duplicate check, or use a new reference to append and start another record.
