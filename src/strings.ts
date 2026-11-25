export type Language = "en" | "zh-CN";

const strings = {
  language: ["Interface language", "界面语言"],
  createdWith: ["Created with", "由"],
  createdEnd: [".", " 创建。"],
  licenseNotice: ["Open source under the MIT license", "采用 MIT 许可证开源"],
  choose: ["Choose…", "请选择…"],
  chooseFile: ["Choose template", "选择模板"],
  replaceFile: ["Change template", "更换模板"],
  chooseSource: [
    "Choose a .veraflow or .vf file.",
    "请选择 .veraflow 或 .vf 文件。",
  ],
  localFile: [
    "Your template stays in this browser.",
    "模板文件只在此浏览器中处理。",
  ],
  title: ["Export as standalone HTML", "导出为独立 HTML"],
  lead: [
    "Turn a VeraFlow template into one HTML file that works offline.",
    "将 VeraFlow 模板转换为一个可离线使用的 HTML 文件。",
  ],
  source: ["VeraFlow template", "VeraFlow 模板"],
  outputFile: ["HTML file", "HTML 文件"],
  timestampFilename: [
    "Add a timestamp to the filename",
    "在文件名中添加时间戳",
  ],
  includeResponses: ["Include prefilled responses", "包含预填回答"],
  prefillRecord: ["Response JSON file (optional)", "回答 JSON 文件（可选）"],
  prefillHelp: [
    "Use the responses saved in the template, or choose a JSON record to add or replace values. Included responses are readable in the exported file.",
    "可使用模板中保存的回答，也可选择 JSON 记录来添加或替换值。导出的文件中可以读取这些回答。",
  ],
  invalidRecord: [
    "Choose a strict JSON record with unique field IDs and string or null values.",
    "请选择有效的 JSON 记录。字段 ID 不能重复，值须为字符串或 null。",
  ],
  recordUnknownField: [
    "Unknown field in the response record: {0}",
    "回答记录中有未知字段：{0}",
  ],
  recordInvalidField: [
    "Invalid value in the response record: {0}",
    "回答记录中有无效值：{0}",
  ],
  recordReadError: [
    "Could not read the response record. Choose the file again.",
    "无法读取回答记录。请重新选择文件。",
  ],
  extractSource: ["Extract from source…", "从来源提取…"],
  batchSource: ["Source text", "来源文本"],
  extractHelp: [
    "Paste labeled lines or drop one UTF-8 .txt file here.",
    "请粘贴带标签的文本，或将一个 UTF-8 编码的 .txt 文件拖到这里。",
  ],
  readClipboard: ["Read clipboard", "读取剪贴板"],
  extractClipboardDenied: [
    "Clipboard access failed. Paste the text or open a text file.",
    "无法读取剪贴板。请粘贴文本或打开文本文件。",
  ],
  openSourceText: ["Open text file…", "打开文本文件…"],
  sourceTextFileType: [
    "Choose one UTF-8 .txt file.",
    "请选择一个 UTF-8 编码的 .txt 文件。",
  ],
  candidateFileTools: ["External extraction files", "外部提取文件"],
  candidateFileHelp: [
    "Add the original text above to check imported quotations against it.",
    "如需核对导入的引文，请在上方输入原文。",
  ],
  importCandidates: ["Import candidates…", "导入候选值…"],
  exportExtractionFields: ["Export field descriptions…", "导出字段说明…"],
  findCandidates: ["Find candidates", "查找候选值"],
  batchSourceLimit: [
    "Enter nonblank source text of up to 65,536 characters.",
    "请输入不超过 65,536 个字符的非空来源文本。",
  ],
  candidateLimit: [
    "The source or candidate file exceeds the extraction limits.",
    "来源或候选文件超出提取限制。",
  ],
  invalidCandidateFile: [
    "Choose a valid VeraFlow candidate JSON file.",
    "请选择有效的 VeraFlow 候选值 JSON 文件。",
  ],
  candidateEvidenceMismatch: [
    "A quotation in the candidate file does not match the source text provided.",
    "候选文件中的一条引文与提供的来源文本不符。",
  ],
  extractReadError: [
    "Could not read the file. Check the encoding and try again.",
    "无法读取文件。请检查编码后重试。",
  ],
  noCandidates: ["No candidate fields found.", "未找到候选字段。"],
  reviewCandidates: ["Review candidates", "审阅候选值"],
  candidateReviewHelp: [
    "Select the values to apply. Verify required fields separately in the form.",
    "请选择要应用的值，并在表单中另行完成所需核对。",
  ],
  candidateFound: ["Candidate found", "找到候选值"],
  candidateAmbiguous: [
    "Ambiguous source. Choose or enter a value.",
    "来源存在歧义，请选择或输入值。",
  ],
  candidateInvalid: ["The source value needs correction.", "来源值需要修正。"],
  candidateSame: ["Matches the current value.", "与当前值一致。"],
  candidateConflict: ["Differs from the current value.", "与当前值不同。"],
  chooseCandidate: ["Source alternatives", "来源备选值"],
  candidateCurrent: ["Current value", "当前值"],
  emptyRecordValue: ["Explicitly empty", "空字符串"],
  candidateIncoming: ["Proposed value", "建议值"],
  acceptCandidate: ["Apply · {0}", "应用 · {0}"],
  candidateEvidence: ["Source evidence", "来源证据"],
  candidateInferred: ["Inferred", "推导所得"],
  candidateDirect: ["Directly stated", "原文给出"],
  candidateNoEvidence: ["No quotation supplied.", "未提供引文。"],
  candidateLine: ["Line {0}", "第 {0} 行"],
  candidateMissing: ["No candidate ({0})", "无候选值（{0}）"],
  candidatePrivacy: [
    "Candidate files may include private values and quoted evidence.",
    "候选文件可能包含私密字段值和来源引文。",
  ],
  candidateUnknownField: [
    "Unknown field in the candidate file: {0}",
    "候选文件中有未知字段：{0}",
  ],
  candidateInvalidField: [
    "Invalid candidate value for field: {0}",
    "字段的候选值无效：{0}",
  ],
  candidateApplied: ["Selected values applied.", "已应用所选值。"],
  candidateNoChanges: [
    "The selected values match the current record.",
    "所选值与当前记录一致。",
  ],
  saveCandidates: ["Save candidates…", "保存候选值…"],
  applyCandidates: ["Apply selected values", "应用所选值"],
  selectCandidates: [
    "Select at least one candidate to apply.",
    "请至少选择一个候选值。",
  ],
  cancel: ["Cancel", "取消"],
  downloadResponses: ["Download response JSON", "下载回答 JSON"],
  fixRecord: [
    "Correct the invalid field before downloading responses.",
    "请更正无效字段后再下载回答。",
  ],
  prepareStepOutputs: ["Prepare all step outputs", "生成本步骤的所有输出"],
  provenanceOption: [
    "Include the source filename in Form details",
    "在表单详情中包含源文件名",
  ],
  downloadHtml: ["Download HTML form", "下载 HTML 表单"],
  downloadRequested: ["Download requested.", "已请求下载。"],
  reading: ["Reading template…", "正在读取模板…"],
  tooBig: ["Choose a template under 4 MiB.", "请选择小于 4 MiB 的模板。"],
  exportError: [
    "Could not export the form. Check the template and try again.",
    "无法导出表单。请检查模板后重试。",
  ],
  emptyFile: ["The template file is empty.", "模板文件为空。"],
  sourceError: [
    "Check your template. VeraFlow reported:",
    "请检查模板。VeraFlow 报告：",
  ],
  sourceLine: [
    "Check line {0} of the template. VeraFlow reported:",
    "请检查模板第 {0} 行。VeraFlow 报告：",
  ],
  csv: [
    "Standalone HTML cannot use linked CSV records.",
    "独立 HTML 表单不支持关联的 CSV 记录。",
  ],
  appendCsv: [
    "Standalone HTML cannot append to CSV files.",
    "独立 HTML 表单不能向 CSV 文件追加记录。",
  ],
  snippets: [
    "Standalone HTML requires a form template. Snippet collections use desktop actions.",
    "独立 HTML 表单需要表单模板。片段集需要使用桌面版操作。",
  ],
  variable: [
    "Standalone HTML cannot resolve @{0}.",
    "独立 HTML 表单无法解析 @{0}。",
  ],
  update: ["Update app…", "更新应用…"],
  details: ["Form details", "表单详情"],
  originalFile: ["Source template", "源模板文件"],
  runtime: ["VeraFlow core", "VeraFlow 核心版本"],
  noScriptForm: [
    "JavaScript must be enabled to use this form.",
    "请启用 JavaScript 后使用此表单。",
  ],
  attention: ["Needs attention", "待处理"],
  remaining: ["Needs attention. {0} remaining.", "还有 {0} 项待处理。"],
  ready: ["Ready to create output.", "可以生成输出。"],
  optional: ["Optional fields", "选填项"],
  output: ["Output", "输出"],
  stepProgress: ["Step {0}", "步骤 {0}"],
  stepNavigation: ["Step navigation", "步骤导航"],
  previousStep: ["Previous step", "上一步"],
  nextStep: ["Next step", "下一步"],
  earlierFields: ["Fields from earlier steps", "之前步骤的字段"],
  emptyField: ["Not entered", "未填写"],
  reviewOutput: [
    "{0} · Inputs changed. Regenerate this output.",
    "{0} · 输入已更改。请重新生成输出。",
  ],
  reviewCopied: [
    "{0} · Inputs changed after copying. Regenerate and copy the affected sections again.",
    "{0} · 复制后输入已更改。请重新生成并复制受影响的部分。",
  ],
  reviewSteps: ["Outputs to review", "待复查的输出"],
  create: ["Create output", "生成输出"],
  preview: ["Preview output", "预览输出"],
  previewWaiting: [
    "Complete the fields and checks listed under Needs attention to see a preview.",
    "请完成“待处理”中的字段和核对项，然后查看预览。",
  ],
  independent: ["Independent value for {0}", "从其他来源核对：{0}"],
  verifyField: ["Verify field", "核对字段"],
  verifyFieldName: ["Verify field: {0}", "核对字段：{0}"],
  compare: ["Compare values", "比对数据"],
  enterIndependent: [
    "Enter the independent value.",
    "请输入从其他来源获取的数据。",
  ],
  invalidEmail: ["Enter a valid email address.", "请输入有效的电子邮件地址。"],
  invalidNumber: ["Enter a valid number.", "请输入有效的数字。"],
  invalidDate: [
    "Enter a valid date as YYYY-MM-DD.",
    "请输入有效日期，格式为 YYYY-MM-DD。",
  ],
  invalidValue: [
    "Enter a value that follows the field instructions.",
    "请按照字段说明输入数据。",
  ],
  mismatch: [
    "Values differ. Your original entry is unchanged.",
    "两次输入不一致。原始输入已保留。",
  ],
  verified: ["Verified.", "已核对。"],
  verifyRequired: ["Verification required.", "需要核对。"],
  verify: ["Verify {0}", "核对 {0}"],
  fix: ["Correct {0}", "更正 {0}"],
  enter: ["Enter {0}", "填写 {0}"],
  copyFull: ["Copy entire output", "复制全部输出"],
  downloadText: ["Download text", "下载文本"],
  entireOutput: ["Entire output", "全部输出"],
  showFull: ["Show entire output as text", "展开全部输出"],
  copy: ["Copy", "复制"],
  copySection: ["Copy: {0}", "复制：{0}"],
  outputTooBig: [
    "The generated text is too large. Shorten the field entries and try again.",
    "生成的文本过长。请缩短字段内容后重试。",
  ],
  outputError: [
    "The output could not be created. Review the field values and try again.",
    "无法生成输出。请检查已填写的数据后重试。",
  ],
  copied: ["Copied.", "已复制。"],
  blocked: [
    "Clipboard access is blocked. Copy the selected text with your keyboard or download it.",
    "无法访问剪贴板。请用键盘复制选中的文本，或下载文本文件。",
  ],
} as const;

export type Message = keyof typeof strings;

export function translate(language: Language, key: Message, value = "") {
  return strings[key][language === "en" ? 0 : 1].replace("{0}", () => value);
}
