# 便携模板与已保存的数据

[English](portable-templates.md) · 简体中文

本文介绍第一版便携格式。它涵盖 UTF-8 文本及 `veraflow-templates` 和 `veraflow-workspace` 的第 1 版 JSON 归档。现行 `.veraflow` 和 `.vf` 源文件支持独立的字段定义、布尔条件和通用输出区段，详见[模板语言指南](veraflow-language-draft.zh-CN.md)。旧版工作区归档仅供读写既有文件和实现兼容工具使用。

## 手动填写

打开 UTF-8 文本 `订位 {{reference}}：{{name}}（{{reference}}）。`。令 `reference` 为 `AB-104`，`name` 为 `李梅`，输出是 `订位 AB-104：李梅（AB-104）。`。同一字段重复出现时，使用同一个值。占位符替换只运行一遍。若值本身含有花括号或反斜杠，按原样输出。

纯文本模板区分大小写，也不自动归一化 Unicode。源文件开头的 UTF-8 BOM 作为编码标记处理，JSON 字符串中的 U+FEFF 保留为字符。正文的空白和换行保留。字段名先排除花括号、尖括号、Unicode 控制与格式字符及行、段分隔符，再去掉两端的 ECMAScript 空白。名称内部的空格保留。缺少键会报 `missingValue`，空字符串产生零字符。源文本中 `\{{` 输出字面左双花括号，`\\` 输出一个反斜杠，其余反斜杠保持原样。无法识别的占位符按字面输出。

## 动态字段与邮件输出

第 1 版模板归档只携带定义。字段以稳定 ID 查找，选项也以稳定 ID 保存。同一模板的 `radio`、`dropdown` 默认选择第一个选项，`checkbox`、`switch` 默认选择 `no`。只有缺失键才应用默认值，明确留空会覆盖默认值。未提供值的可选字段输出空字符串。隐藏字段不校验，其占位符输出为空。旧版指令定义字段时会同时输出其值，使用新源文件格式可将字段定义与输出分开。

邮件渲染返回有序区段，包含启用的邮件标题字段和最后的正文。默认输出顺序是 Subject、To、Cc、Bcc、Body，其中 To 必须启用。启用的 Subject 和 To 均需非空。替换值及完整邮件标题字段两端的空白会去掉。邮件标题字段中剩余的 Unicode 控制字符、行分隔符或段分隔符属于错误。正文保持原样。渲染只准备文本供核对和传送。

试用[订位通知示例](../examples/portable/booking-template.json)。在 `DOA` 选择 `no` 时，标签为 Standard，收件人为 `dispatch@example.test`。选择 `yes` 时，标签为 DOA review，收件人为 `review@example.test`，并需要补充备注。备注中的 `{{literal}}` 保持原样。[测试输入和确切输出](../examples/portable/cases.json)

在仓库根目录使用 Python 标准库即可独立验证：

```sh
python3 examples/portable/reader.py --check
python3 examples/portable/reader.py examples/portable/booking-template.json examples/portable/review-values.json
```

独立读取器测试第一版可移植渲染规则。归档合并、完整导入校验和高级源文件语法另有应用测试。

## CSV 和旧版工作区归档

便携 CSV 使用 UTF-8、逗号和表头。列名不能为空或重复，列数一致。包含逗号、双引号或换行的值用双引号包围，内嵌双引号写两次。空单元格是空字符串，列数不足属于错误。所有值都按文本读取，因此前导零保留，类似公式的字符串也只是文本。

旧版工作区 JSON 保存文件夹、数据表、行和片段。内部 ID 区分大小写且全局唯一，外部引用是描述性标签和值。缺失字段以省略键表示，空字符串是明确留空。`null` 对旧版工作区值无效。导入先验证引用，再为冲突的内部 ID 分配新 ID，并同步更新归档内的引用。已有记录保留。当前 VeraFlow 直接从文件读取选中的 CSV 行。可用[示例 CSV](../examples/portable/bookings.csv)和[旧版工作区归档](../examples/portable/booking-workspace.json)查看数据结构。

实现其他读取器时，请对照[完整字段结构、错误规则和兼容性说明（英文）](portable-templates.md)。
