# 从 JSON 数据生成输出

[English](json-demo.md) · 简体中文

请使用首页带有 **打开 JSON / JSON5…** 的版本。本演示中的派送记录为虚构数据。

1. 在首页点击 **打开 JSON / JSON5…**，再点击 **选择 JSON 文件…** 并选中 [dispatch-record.json5](dispatch-record.json5)。也可粘贴文件内容，再点击 **检查数据**。
2. 核对编号 `000184`、分为两行的备注，以及显示为 **未填写** 的追踪号。点击 **打开预填表单**，即可在输出预览中查看所有字段。
3. 如需生成更短的通知，可再次打开同一份记录。在审阅界面展开 **自定义输出**，输入以下内容，再点击 **打开预填表单**。

```text
将 {{reference}} 派送至 {{destination}}，联系人 {{contact}}。
包裹数量：{{packages}}
```

预览的第一行应为「将 000184 派送至 North Depot，联系人 林晓 / Alex Lin。」点击 **准备输出区段** 后即可复制结果。

在表单中选择 **表单工具 → 将记录保存为 JSON…** 导出字段值。通过 **打开 JSON / JSON5…** 可重新使用这些值。如果想同时保留输出格式和字段值，关闭会话时选择 **保存预填表单**。

如需使用已定义的输出，从首页打开 [housing-response.json](housing-response.json)，再选择 **使用表单文件… → housing-application.vf**。先审阅并应用更改，再按住房申请表单的要求核对字段。[住房申请演示](housing-demo.zh-CN.md)
