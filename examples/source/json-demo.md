# Create output from JSON data

English · [简体中文](json-demo.zh-CN.md)

Use a build with **Open JSON / JSON5…** on Home. The dispatch details in this demo are fictional.

1. On Home, choose **Open JSON / JSON5…**, then **Choose JSON file…** and select [dispatch-record.json5](dispatch-record.json5). You can also paste the file contents and select **Review data**.
2. Check the reference `000184`, the two-line note, and **Unanswered** for tracking. Select **Open filled form** to see all fields in the output preview.
3. To generate a shorter note, open the same input again. In the review, expand **Write your own output**, enter the text below, then select **Open filled form**.

```text
Dispatch {{reference}} to {{destination}} for {{contact}}.
Packages: {{packages}}
```

The preview should begin with `Dispatch 000184 to North Depot for 林晓 / Alex Lin.` Select **Prepare output sections** and copy the result.

Use **Form tools → Save record as JSON…** from the filled form to export its values. Open that export with **Open JSON / JSON5…** to reuse the values. To keep both the output definition and the values together, close the session and choose **Save prefilled form**.

For a file with predefined outputs, open [housing-response.json](housing-response.json) from Home and choose **Use a form file… → housing-application.vf**. Review the changes before applying them. The housing form still requires its own checks. [Housing walkthrough](housing-demo.md)
