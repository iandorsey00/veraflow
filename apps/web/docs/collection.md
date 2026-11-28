# Collect missing answers offline

[简体中文](collection.zh-CN.md)

Use VeraFlow Desktop’s **Record tools** to create a collection request for the missing fields in a form or step. Save the private working form in Desktop so it can recognize the response later. The request is a separate UTF-8 JSON file containing the questions you selected.

1. In VeraFlow Web, choose **Open collection request…** and select the request JSON. Review the required and optional questions, instructions, and choices. Choose **Download questionnaire HTML**.
2. Share the HTML with the respondent through your normal file-sharing channel. They can open it directly in a browser without a server or internet connection. They fill in the answers and choose **Download response JSON**, then return the downloaded JSON to you.
3. Open the originating working form in Desktop. In **Record tools**, choose **Import collection response…** and review the proposed changes. Apply the answers you accept and complete any required verification separately.

The HTML contains the request ID and requested questions. It leaves out the template, prefilled values, and private working history. The respondent’s answers are written only to the downloaded response. Unanswered optional questions are omitted. The same answers download with the same response ID while the questionnaire stays open. Submitting changed answers produces a new ID.

For a fictional exercise, use the VeraFlow Desktop checkout with the v1 collection commands. Run the following from the Desktop repository, then open only the request in Web. Keep `private.vf` for review.

```sh
demo=examples/source/collection
work=$(mktemp -d)

./scripts/veraflow map "$demo/veradata-selection.json" "$demo/veradata-mapping.json" \
  --form "$demo/employment.vf" > "$work/mapped.vf"
./scripts/veraflow collection-request "$work/mapped.vf" \
  --output "$work/private.vf" > "$work/request.json"
```

Answer **职位** with `软件架构师` and **补充说明** with `可以远程办公。`. Save the generated response as `"$work/response.json"` and review it without changing the file.

```sh
./scripts/veraflow collection-review "$work/response.json" "$work/private.vf"
```

When a response resolves a condition in the original form, Desktop reevaluates the form. Generate a new request for any newly applicable questions.
