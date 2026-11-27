# 信息收集与审阅记录

[English](record-interoperability.md) · 简体中文

核流根据原有表单的字段和条件判断还缺哪些信息。打开表单后，选择 **表单工具 → 记录工具…**，即可检查缺项、导出收集请求、导入答复、审阅转换建议及批准记录。原有的 **将记录保存为 JSON…** 仍导出扁平记录。

## 用虚构的就业资料练习

打开[就业信息采集](../examples/source/collection/employment.vf)，填写虚构姓名和用人单位，并保留「在职」。点 **记录工具 → 收集缺失信息…**。请求包含必填的「职位」以及可选的「补充说明」。分享前，请预览并核对其中的标签和说明。

1. 点 **保存记录并导出请求**。核流把私有工作记录保存在本机的「最近打开的表单」，另行导出可分享的请求文件。长期使用时，请另存私有预填表单。最近记录有数量和大小上限。
2. 可用下面的命令把请求和示例中文答案转换为答复。回到原工作记录，点 **导入收集答复…**。核对当前值和新值。只有选中的替换或清空会被应用。
3. 点 **审阅转换建议…** 并选择 [translation.json](../examples/source/collection/translation.json)。确认后可在 **字段历史** 中看到原文和来源。用 `Software Architect` 核验转换后的职位。示例翻译是预先编写的，核流不会自动翻译。
4. 点 **审阅并批准记录…**，核对当前范围和具体值。按需勾选来源和历史，再批准导出。普通输出仍可照常准备与复制。
5. 如需演示填入外部页面，运行下文的本地示例。适配器只填入适用的字段并读回核对，停在提交之前。

### 命令行与 VeraData

在源码目录运行 `npm ci`。以下文件和示例数据均为虚构。

```sh
demo=examples/source/collection
work=$(mktemp -d)

./scripts/veraflow map "$demo/veradata-selection.json" "$demo/veradata-mapping.json" \
  --form "$demo/employment.vf" > "$work/mapped.vf"
./scripts/veraflow gaps "$work/mapped.vf"
./scripts/veraflow collection-request "$work/mapped.vf" \
  --output "$work/private.vf" > "$work/request.json"
./scripts/veraflow collection-respond "$work/request.json" "$demo/answers.json" > "$work/response.json"
./scripts/veraflow collection-review "$work/response.json" "$work/private.vf"
./scripts/veraflow collection-apply "$work/response.json" "$work/private.vf" \
  --accept > "$work/received.vf"
./scripts/veraflow transformation-review "$demo/translation.json" "$work/received.vf"
./scripts/veraflow transformation-apply "$demo/translation.json" "$work/received.vf" \
  --accept > "$work/transformed.vf"
./scripts/veraflow gaps "$work/transformed.vf"
```

审阅全部变更后再用 `--accept`。逐项选择请用桌面版。每次输出请另存为新文件，避免 shell 在读取前截断输入。只收集必填项可加 `--required-only`，并从答复移除未请求的问题。用 `collection-close PRIVATE.vf --request-id ID` 可在新预填文件中关闭指定请求。

可按[英文示例](record-interoperability.md#cli-and-veradata-example)用 VeraData CLI 创建独立的虚构资料库，并用 `veradata-plan.json` 导出所选字段。每条 VeraData 数据命令都应带 `--vault "$vault"`。示例中的映射仅对明确给出的 `Present` 做转换，不推断其他就业记录的状态。

在桌面版打开 `transformed.vf`，核验职位，按需保存预填副本供 `record-export` 使用。人工批准请在桌面版审阅后保存 `approved.json`。机器校验导出不会附加批准。

```sh
./scripts/veraflow record-inspect "$work/approved.json"
node --import tsx "$demo/run-destination.mjs" "$work/approved.json"
```

示例适配器需要 Playwright Chromium（`npx playwright install chromium`）。它仅操作虚构的本地页面，支持扁平记录和已审阅记录。实际的目标系统应由独立适配器处理登录、目标选择和提交。目标端读回结果应与核流的字段核验分别记录。

## 交换格式 v1

[英文交换规范](record-interoperability.md#exchange-v1)包含完整 JSON 样例及各成员的校验规则。公共交换文件使用 UTF-8 严格 JSON。会拒绝重复键、不支持的版本、未知信封属性、过深嵌套、超限大小和含 NUL 的值。请求、答复、映射和建议上限为 1 MiB、12 层。审阅记录检查上限为 4 MiB。字段 ID 精确匹配并区分大小写。请求和答复 ID 仅用于关联，不能证明答复者身份。

- **缺项分析 `veraflow-gaps`**。区分省略、null、空字符串、默认值和已有值。省略字段保留预填值或默认值。null 清除并屏蔽默认值。条件尚未确定时先收集控制字段，再重新计算分支。CLI 的 `--step` 从 1 开始，交换对象的 `step` 从 0 开始。
- **收集请求 `veraflow-collection-request`**。只包含请求 ID，以及所选问题的 ID、标签、类型、必填状态、约束和选项。已知值、内部记录标识、输出、路径及来源细节不会自动包含。标签和说明采用作者原文，分享前应检查。
- **收集答复 `veraflow-collection-response`**。包含关联 ID、答复 ID 和扁平 `fields`，可带 UTC 毫秒时间。字段值为字符串或 null。选择和布尔答案使用稳定的选项 ID。省略不会清除现有值。程序校验请求归属、修订、分支、必填信息和字段限制。每份记录最多记住 32 项请求，每项最多处理 32 个答复 ID。已处理答复在当前工作副本中重复导入不会重复应用。先更新到最新私有工作副本。若导出中断，请从最近表单重新打开记录，关闭旧请求或建立新请求。核流不托管、投递或认证答复。
- **映射 `veraflow-record-mapping`**。每个目标字段有一条路径，可先从数组按精确条件选择一项，再用明确的字典转换标量。多条匹配、缺少必需值或未知转换会报错。不会执行脚本或访问继承的属性。需要保留精度的标识应写成字符串。
- **转换建议 `veraflow-transformations`**。字段项包含转换类别 `kind`、精确原值 `from` 与建议值 `to`。已经变化的原值需要重新提出建议。接受后保留来源及至多八次变更（包括原始变更），并重新要求核验受影响的字段。旧文件不会被补造来源。
- **已审阅记录 `veraflow-reviewed-record`**。包含表单修订指纹、范围、校验状态、核验状态、适用的已知值、核验字段和内容指纹。可选历史可能包含旧值和关联 ID，但不包含整份资料或证据原文。桌面版明确批准后才附加批准时间及对应指纹。内容改变后应重新审阅。它不是签名、事实担保或已提交凭据。

新功能使用预填表单中的可选私有 `recordState`。普通扁平 JSON、候选值文件和现有模板继续可用。旧版核流可能拒绝带新私有元数据的文件，可分别导出可复用定义和扁平记录。共享前应区分公开请求、原始记录和包含历史的审阅记录。
