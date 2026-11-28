# VeraFlow Web 示例

[English](README.md) · [使用指南](../docs/usage.zh-CN.md)

**来源 → 工作记录 → 命名输出 → 目标位置**

这两个人工编写的演示展示了如何在表单中维护一组字段值，供多项输出复用。扁平记录 JSON 可将字段值交回桌面端。候选值 JSON 携带待审阅的建议值和引文。

运行 `npm run build` 后，使用新文件名导出。

```sh
npm run export:html -- --timestamp examples/service-intake.vf dist/display-replacement.html
npm run export:html -- --timestamp --responses examples/housing-response.json \
  examples/housing-application.vf dist/housing.html
```

## 从 JSON 生成派送输出

1. 在 Web 首页选择“从数据开始 → 打开 JSON / JSON5…”。选择虚构的[派送记录](dispatch-record.json5)，或粘贴文件内容，然后点击“审阅数据”。确认编号为 `000184`、备注有两行、物流单号显示“未回答”。选择“生成摘要”，打开已填表单并查看预览。
2. 再次打开同一记录。在审阅界面选择“编写自定义输出”，输入下面两行。打开已填表单，确认预览以 `Dispatch 000184 to North Depot for 林晓 / Alex Lin.` 开头。

   ```text
   Dispatch {{reference}} to {{destination}} for {{contact}}.
   Packages: {{packages}}
   ```

3. 再次打开该记录，在审阅界面选择“使用表单文件”，并选择 `dispatch-form.vf`。对比 **East Depot** 和 **North Depot**，打开已填表单，点击“下载 HTML 表单”。记录中省略了选填的派送代码。如需测试明确的空字符串，可在审阅前在物流单号一行后加入 `delivery_code: '',`。[可复用派送表单](dispatch-form.vf)
4. 断开网络，用浏览器直接打开下载的 HTML 文件。用 `000184` 核对 **Reference**，用 `North Depot` 核对 **Destination**。查看“预览输出”，点击“生成输出”并复制派送文本。若剪贴板访问受阻，输出文本会保持选中，可手动复制。选择 **Dispatch log** 可查看表单的另一项命名输出。
5. 在同一个 HTML 表单中选择“表单工具 → 打开 JSON / JSON5…”，粘贴 `{reference: "000184", destination: "South Depot"}`。对比新旧目的地后应用更改。**Reference** 保持已核对，**Destination** 需要重新核对，**Notes** 仍有两行。下载回答 JSON，用 Web 或 Desktop 0.25.0 打开，检查编号的前导零、未回答的物流单号及明确填空的派送代码（如有）。

## 显示器换货

1. 点击“从来源提取…”，打开[带标签的文本](service-intake-source.txt)。在“待确认”中将序列号选为 `ABC123458`，并明确勾选后再应用。
2. 在提取窗口粘贴[邮件原文](service-intake-email.txt)，然后在“外部提取文件”中导入[邮件候选值](service-email-candidates.json)。受影响数量应为一台，街道地址应无候选值。先应用冲突的序列号 `ABC123456`，以便测试更正。
3. 粘贴[通话记录](service-intake-call.txt)，导入[通话候选值](service-call-candidates.json)，再应用更正。从[模拟目标页面](service-destination.html)上的资产标签独立核对 `ABC123458`。生成并复制服务工单。发货说明仍需补充已确认的街道地址。
4. 使用“表单工具 → 下载回答 JSON”。在 VeraFlow Desktop 中打开同一模板，选择“表单工具 → 导入 JSON / JSON5…”。审阅并应用更改，确认更正后的序列号和数量已导入。

## 双语住房申请

1. 使用[住房申请模板](housing-application.vf)和[预填记录](housing-response.json)导出并打开 HTML。在信息收集步骤核对 `Drew Example`，然后选择“下一步”。
2. 展开“选填项”，在英文表述中输入 `My current home is too far from work.`。生成本步骤的所有输出，与桌面端的英文申请和中文核对文本对照，再复制需要的输出。
3. 返回上一步修改姓名，确认核对状态被清除且受影响的输出有复查提示。下载工作记录，在桌面端审阅。英文表述应仍然保留。

将两份导出的文件移动并重命名，断网后在 Windows Edge 和 macOS Safari 中直接打开。检查窄窗口和仅键盘操作、中文可读性、浏览器网络面板中没有网络请求，以及剪贴板受阻时的手动复制。在文本编辑器中按分段注释找到样式、表单标记、嵌入的定义和运行时。
