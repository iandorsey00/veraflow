export type Language = "en" | "zh-CN";

const strings = {
  language: ["Interface language", "界面语言"],
  createdWith: ["Created with", "由"],
  createdEnd: [".", " 创建。"],
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
  title: ["Export a standalone form", "导出独立表单"],
  lead: [
    "Turn a VeraFlow template into one HTML file that works offline.",
    "将 VeraFlow 模板转换为一个可离线使用的 HTML 文件。",
  ],
  source: ["VeraFlow template", "VeraFlow 模板"],
  outputFile: ["HTML file", "HTML 文件"],
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
  update: ["Update now…", "立即更新…"],
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
