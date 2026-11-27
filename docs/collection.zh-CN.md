# 离线采集缺失答案

[English](collection.md)

在 VeraFlow Desktop 中打开表单，通过“记录工具”为当前表单或步骤中缺失的字段创建采集请求。在桌面端保留私有工作表单，以便之后匹配回答。采集请求是单独的 UTF-8 JSON 文件，仅包含你选中的问题。

1. 在 VeraFlow Web 中选择“打开采集请求…”，打开请求 JSON。查看必填与选填问题、说明和选项，然后选择“下载 HTML 问卷”。
2. 通过平时使用的文件共享渠道把 HTML 发给填写者。对方可在浏览器中直接打开文件，无需服务器或网络连接。填写后点击“下载回答 JSON”，再把下载的 JSON 发回给你。
3. 在桌面端打开原来的工作表单，在“记录工具”中选择“导入收集答复…”，审阅建议更改，应用你接受的答案，再单独完成所需的字段核对。

HTML 包含请求 ID 和要采集的问题，省略模板、预填答案和私有历史记录。填写者的答案只会写入下载的回答文件。未填写的选填项会省略。问卷保持打开时，重复下载同一组答案会保留原回答 ID。提交更改后的答案会生成新 ID。

如需用虚构数据练习，请在支持 v1 采集命令的 VeraFlow Desktop 仓库中运行以下命令。只在 Web 中打开请求文件，并保留 `private.vf` 用于审阅。

```sh
demo=examples/source/collection
work=$(mktemp -d)

./scripts/veraflow map "$demo/veradata-selection.json" "$demo/veradata-mapping.json" \
  --form "$demo/employment.vf" > "$work/mapped.vf"
./scripts/veraflow collection-request "$work/mapped.vf" \
  --output "$work/private.vf" > "$work/request.json"
```

在 **职位** 中填写 `软件架构师`，在 **补充说明** 中填写 `可以远程办公。`。将生成的回答另存为 `"$work/response.json"`，保留文件原样并审阅。

```sh
./scripts/veraflow collection-review "$work/response.json" "$work/private.vf"
```

回答明确原表单中的某个条件后，桌面端会重新判断哪些问题适用。若出现新的适用问题，可为它们生成下一份采集请求。
