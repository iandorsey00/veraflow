# VeraFlow 命令行

[English](cli.md) · 简体中文

在 VeraFlow 源码目录运行 `npm ci`，然后使用 `./scripts/veraflow`。无法直接执行脚本时，可用 `node scripts/veraflow`。在其他目录运行时，请提供命令及输入文件的路径。[macOS PDF 设置](../examples/source/pdf-demo.zh-CN.md#在命令行中运行)

```sh
./scripts/veraflow --help
./scripts/veraflow --help --json
./scripts/veraflow --version
```

| 命令                                                                               | 标准输出                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `inspect FORM`                                                                     | 表单的字段、选项、核对规则、输出及步骤                     |
| `fields FORM`                                                                      | 与桌面版兼容的提取字段定义                                 |
| `validate FORM [--record RECORD] [--output-id ID \| --all]`                        | 表单语法或记录渲染检查结果                                 |
| `normalize RECORD`                                                                 | 将扁平 JSON 或 JSON5 转为标准 JSON                         |
| `create RECORD [--title TITLE] [--body TEXT]`                                      | 含字段摘要或自定义正文的可编辑表单                         |
| `merge RECORD FORM`                                                                | 将输入应用到表单后的扁平 JSON                              |
| `prefill RECORD FORM`                                                              | 包含当前响应及仍然有效的核对状态的预填表单                 |
| `extract TEXT FORM`                                                                | 带证据的提取候选值                                         |
| `candidates FILE FORM [--source TEXT]`                                             | 经过校验的候选文件，可对照原文校验证据                     |
| `compare TEXT RECORD FORM`                                                         | 已填写字段的比较状态与证据                                 |
| `csv FILE [--row N]`                                                               | CSV 列名和行数，或指定的一条记录。表头后的第一行编号为 1。 |
| `row RECORD FORM [--output-id ID] [--format json\|csv\|tsv]`                       | 按表单映射生成一行电子表格数据                             |
| `render RECORD FORM [--output-id ID \| --all] [--format text\|json]`               | 文本，或有序的命名输出与区段                               |
| `pdf RECORD FORM [--output-id ID] [--output PATH] [--force] [--format text\|json]` | 在 macOS 上生成 PDF，输出路径或 JSON 回执                  |

用 `-` 从标准输入读取一份数据。使用与字段 ID 完全一致的键。省略键会保留原值或默认值，`null` 清空字段，`""` 表示显式空值。含前导零的编号请加引号。

使用 `--help --json` 获取命令目录，并通过 `inspect` 了解字段和输出。可用 `fields` 向提取工具提供字段定义，再用 `candidates` 校验返回的候选值和证据。审阅后把接受的值作为扁平记录交给 `merge`、`prefill` 或 `render`。候选值和比较结果提供证据，字段核对仍遵循表单的规则。[候选文件格式](veraflow-language-draft.zh-CN.md#批量提取与候选文件)

```sh
./scripts/veraflow validate examples/source/dispatch-report.vf \
  --record examples/source/dispatch-record.json5 --json-errors

./scripts/veraflow render examples/source/dispatch-record.json5 \
  examples/source/dispatch-report.vf --format json --json-errors
```

标准输出只包含结果。使用 `--json-errors` 时，失败会向标准错误输出一个 JSON 对象，并返回非零退出码。脚本可读取 `error.code`。可用 `--output-id` 选择命名输出，或者用 `--all` 获取全部输出的 JSON。需要核对的字段可在桌面版完成核对后保存为预填表单。更改已核对的值会清除相应的核对状态。

命令在本机运行。以管道输入 PDF 数据时，需提供 `--output`。确认要覆盖已有文件时，再使用 `--force`。仅用可信的模板和数据生成 PDF。
