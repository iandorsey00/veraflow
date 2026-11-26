# VeraFlow 模板示例

[English](README.md) · 简体中文

使用示例值测试。在 VeraFlow 中选择 **打开文件…**，或用 **打开文件夹…** 浏览整个示例目录。

| 文件                            | 试用内容                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `greeting.vf`                   | 在表单中输入姓名和编号。最后一个占位符按字面输出。                                                                             |
| `address.veraflow`              | 填写地址并逐项核对。街道地址中的空行会自动移除。留空收件人字段时，对应整行不会输出。                                           |
| `step-tabs.veraflow`            | 在表单中准备输出。将光标放在测试页的 Recipient 中。第一次快捷键填入收件人并按两次 Tab 跳到 Subject，随后再分别填入主题和正文。 |
| `full-sequence.veraflow`        | 使用同一测试页。一次快捷键填入三个字段，Optional 保持为空。可在粘贴选项中改成逐区段模式。                                      |
| `reverse-tab.vf`                | 从测试页的 Subject 开始。第一次填入主题并向后跳到 Optional，第二次填入 Optional。                                              |
| `rma.veraflow` 和 `rma.csv`     | 打开 CSV，选择第二条记录并加载 RMA 模板，查看 To、Subject 和可选收件人行。                                                     |
| `inline-greeting.veraflow`      | 选择 Yes，查看含双引号的地址。输入姓名以生成行内称呼。合并两段输出时，中间会空一行。                                           |
| `prefilled-incomplete.veraflow` | 打开含已有响应的模板。填写编号，保存预填表单，再打开它继续修改。                                                               |

将 `test-destination.html` 作为本地网页打开。准备输出后，将光标放在起始字段中，再按 VeraFlow 窗口上显示的输出快捷键。测试页只包含本地输入框。

打开[关联拜访记录模板](linked-records.veraflow)，并将[配套 CSV](linked-records.csv) 放在同一个文件夹中。输出页面的行箭头可依次浏览两条记录和两个命名输出。

试用[共享记录](shared-record.veraflow)，用同一组字段预览预约通知和制表符分隔的一行。保存 JSON 记录时也会包含内部备注。

打开[派送单](dispatch-note.veraflow)试用注释、条件、循环、日期格式与地址空行清理。

将[发货记录模板](shipment-log.veraflow)和[配套 CSV](shipment-log.csv)复制到同一目录，试用表单、CSV 浏览和追加行。输入编号 `VF-104` 可查看查重提示，也可输入新编号并追加一条记录。

打开[发货跟进](shipment-steps.veraflow)，先准备发货邮件，再填写取件和送达信息。返回第一步修改编号，可查看哪些已复制的输出需要重新检查。

打开[双语住房申请](housing-application.vf)，试用 JSON5、只收集信息的步骤，以及同一条虚构记录的两个输出。

试用 [JSON 演示](json-demo.zh-CN.md)，从 JSON5 记录生成摘要、编写简短派送通知，并将字段值导出为 JSON。

在支持批量提取的版本中试用[显示器换货演示](service-demo.zh-CN.md)，包括带标签的文本、邮件和通话候选文件，以及离线粘贴页面。

在 macOS 上[试用 PDF 演示](pdf-demo.zh-CN.md)，从虚构简历或派送记录生成 PDF。
