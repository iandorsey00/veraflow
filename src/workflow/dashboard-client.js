const labels = {
  title: ["Workflows", "工作流"],
  definitions: ["Workflow definitions", "工作流定义"],
  instances: ["Instances", "运行实例"],
  inbox: ["Response inbox", "答复收件箱"],
  connect: ["Connect", "连接"],
  access: ["Worker access key", "后台进程访问密钥"],
  unlock: [
    "Enter the access key printed by the local worker.",
    "请输入本机后台进程显示的访问密钥。",
  ],
  offline: [
    "The local worker is unavailable. Start it from a terminal and keep this computer awake.",
    "本机后台进程不可用。请在终端启动，并让电脑保持唤醒。",
  ],
  online: [
    "Worker running on this computer. Keep it awake to receive responses and autofill.",
    "后台进程正在本机运行。请保持电脑唤醒，以接收答复并自动填写。",
  ],
  stopped: [
    "Destination automation is stopped. Incoming responses are still processed.",
    "目标自动填写已停止。仍会处理收到的答复。",
  ],
  stop: ["Stop all autofill", "停止所有自动填写"],
  start: ["Enable autofill", "启用自动填写"],
  pause: ["Pause autofill", "暂停自动填写"],
  resume: ["Resume autofill", "继续自动填写"],
  paused: ["Paused", "已暂停"],
  add: ["Add definition", "添加定义"],
  workflow: ["Workflow JSON or JSON5", "工作流 JSON 或 JSON5"],
  form: ["Blank VeraFlow form", "空白核流表单"],
  create: ["New instance", "创建实例"],
  source: ["Optional source JSON or JSON5", "可选的来源 JSON 或 JSON5"],
  test: ["Test destination", "测试目标"],
  testPassed: [
    "The local destination passed its page check.",
    "本机目标页面已通过检查。",
  ],
  scan: ["Rescan inbox", "重新扫描收件箱"],
  import: ["Import response", "导入答复"],
  response: ["Response JSON file", "答复 JSON 文件"],
  request: ["Prepare questionnaire", "准备问卷"],
  download: ["Download request", "下载请求"],
  link: ["Add respondent link", "添加答复链接"],
  respondentUrl: ["Respondent URL", "答复者网址"],
  openLink: ["Open questionnaire", "打开问卷"],
  close: ["Close local request", "关闭本地请求"],
  closeHelp: [
    "Close the questionnaire in the owner dashboard and recover outstanding submissions first.",
    "请先在所有者控制台关闭问卷并找回尚未同步的答复。",
  ],
  googleFormsOwnerDashboard: [
    "Upload the request in the private Google Forms adapter dashboard. Publish the questionnaire there, then save the respondent link here.",
    "在私有 Google Forms 适配器控制台上传请求。在那里发布问卷，再将答复链接保存到此处。",
  ],
  offlineQuestionnaire: [
    "Open the request in VeraFlow Web to export an offline questionnaire.",
    "在核流网页版打开请求，导出离线问卷。",
  ],
  values: ["Supply values", "补充字段值"],
  valuesPrompt: [
    "Field values as a flat JSON object",
    "以平铺 JSON 对象填写字段值",
  ],
  verify: ["Verify field", "核验字段"],
  candidate: [
    "Enter the value from an independent source",
    "输入独立来源中的值",
  ],
  mismatch: [
    "The value did not match. The original was retained.",
    "值不一致。原值已保留。",
  ],
  conflict: ["Review conflict", "检查冲突"],
  accept: ["Use incoming answers", "使用收到的答复"],
  keep: ["Keep current values", "保留当前值"],
  decision: ["Decision", "处理方式"],
  incoming: ["Incoming answers", "收到的答复"],
  details: ["Activity", "活动记录"],
  inspection: ["Export working form", "导出工作表单"],
  export: ["Export validated record", "导出已验证记录"],
  queue: ["Queue autofill", "加入自动填写队列"],
  retry: ["Retry autofill", "重试自动填写"],
  acknowledge: [
    "I checked the previous attempt and want to fill a fresh page.",
    "我已检查上次运行，并希望在新页面重新填写。",
  ],
  reveal: ["Show populated page", "显示已填写页面"],
  complete: ["Mark complete", "标记为已完成"],
  cancel: ["Cancel instance", "取消实例"],
  dismiss: ["Back", "返回"],
  continue: ["Continue", "继续"],
  none: ["Nothing here yet.", "暂无内容。"],
  "needs-attention": ["Needs attention", "需要处理"],
  "awaiting-response": ["Awaiting response", "等待答复"],
  ready: ["Ready", "已就绪"],
  queued: ["Queued", "已排队"],
  running: ["Filling destination", "正在填写目标"],
  autofilled: ["Autofilled · review in browser", "已填写 · 请在浏览器复核"],
  failed: ["Autofill failed", "自动填写失败"],
  uncertain: ["Check the previous attempt", "请检查上次运行"],
  completed: ["Completed", "已完成"],
  cancelled: ["Cancelled", "已取消"],
  accepted: ["Accepted", "已接受"],
  duplicate: ["Duplicate", "重复答复"],
  quarantined: ["Quarantined", "已隔离"],
  missingFields: ["Required values missing", "缺少必填值"],
  invalidFields: ["Values need correction", "字段值需要修正"],
  unresolvedConditions: [
    "Answer these fields to determine the next questions",
    "请回答这些字段以确定后续问题",
  ],
  verificationRequired: ["Independent verification required", "需要独立核验"],
  conflictingResponse: [
    "A response conflicts with the current record",
    "答复与当前记录冲突",
  ],
  destinationPageChanged: [
    "Destination page changed. Test the destination again.",
    "目标页面已变化。请重新测试目标。",
  ],
  destinationReadbackMismatch: [
    "The destination returned different values. Review the page.",
    "目标页面读回的值不一致。请复核页面。",
  ],
  destinationInteractionFailed: [
    "The browser stopped during autofill. Check the page before retrying.",
    "浏览器在填写期间中断。请检查页面后再重试。",
  ],
  destinationMissingInput: [
    "Check that the destination mappings provide the selected branch’s required fields.",
    "请检查目标映射是否包含当前分支所需字段。",
  ],
  destinationBrowserUnavailable: [
    "Chromium is unavailable. Check the worker’s browser setup.",
    "Chromium 不可用。请检查后台进程的浏览器配置。",
  ],
  executionInterrupted: [
    "Execution was interrupted. Review the previous attempt before retrying.",
    "运行已中断。请先复核上次运行。",
  ],
  inboxUnavailable: [
    "The response folder is unavailable. Autofill is suspended until it returns.",
    "答复文件夹不可用。恢复访问前暂停自动填写。",
  ],
  recordValidationFailed: [
    "The form output did not pass validation. Inspect the working form.",
    "输出未通过校验。请检查工作表单。",
  ],
  workflowReviewUnavailable: [
    "This browser page is closed. To open a fresh page, retry after checking the previous attempt.",
    "浏览器页面已关闭。请检查上次运行后重试，以打开新页面。",
  ],
  workflowUnlockRequired: [
    "Use the access link or key from the current worker.",
    "请使用当前后台进程的访问链接或密钥。",
  ],
  invalidRespondentUrl: [
    "Enter the questionnaire’s public respondent URL.",
    "请输入问卷的公开答复网址。",
  ],
  collectionNoQuestions: [
    "There are no open questions for this record.",
    "此记录没有待回答的问题。",
  ],
  collectionRequired: ["A required answer is missing", "缺少必填答案"],
  collectionStale: [
    "The request no longer matches this form",
    "请求与当前表单不匹配",
  ],
  collectionUnexpected: [
    "The response contains fields outside the request",
    "答复含有请求之外的字段",
  ],
  collectionInapplicable: [
    "The answer does not apply to the current branch",
    "答案不适用于当前分支",
  ],
  recordInvalidField: [
    "An answer failed the form’s validation",
    "答案未通过表单校验",
  ],
  invalidCollectionResponse: ["Invalid response format", "答复格式无效"],
  collectionUnknown: [
    "No instance owns this questionnaire",
    "没有与此问卷关联的实例",
  ],
  collectionClosed: ["The local request is closed", "本地请求已关闭"],
  responseIdReused: [
    "The response ID was reused with different answers",
    "答复 ID 重复且答案不同",
  ],
  responseTooLarge: ["Response file is too large", "答复文件过大"],
  responseInvalidEncoding: [
    "Response file must use UTF-8",
    "答复文件必须使用 UTF-8",
  ],
  workflowInstanceLocked: [
    "This instance is locked for destination review.",
    "此实例已锁定，等待目标页面复核。",
  ],
  invalidWorkflow: [
    "Check the workflow definition and revision.",
    "请检查工作流定义和修订版本。",
  ],
  workflowRequestHasConflict: [
    "Resolve the pending conflict before closing the request.",
    "请先解决答复冲突，再关闭请求。",
  ],
  workflowRevisionExists: [
    "That revision already exists. Use a new revision ID.",
    "此修订已存在。请使用新的修订 ID。",
  ],
  invalidSource: [
    "The selected VeraFlow form is invalid.",
    "所选核流表单无效。",
  ],
  workflowInputTooLarge: ["The selected file is too large.", "所选文件过大。"],
  workflowInvalidEncoding: [
    "Save the selected file as UTF-8.",
    "请将所选文件保存为 UTF-8。",
  ],
  unexpectedError: [
    "The action could not finish. Check the activity or terminal.",
    "操作未完成。请检查活动记录或终端。",
  ],
};
const $ = (id) => document.getElementById(id);
let chinese = navigator.language.startsWith("zh");
let key =
  location.hash.slice(1) || sessionStorage.getItem("veraflow-worker-key") || "";
if (location.hash) history.replaceState(null, "", location.pathname);
let snapshot;
let pending;
let editing;
const t = (id) => labels[id]?.[Number(chinese)] ?? id;
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
const button = (action, label, ...args) =>
  `<button type="button" class="secondary" data-action="${action}" data-args="${esc(JSON.stringify(args))}">${esc(t(label))}</button>`;
const field = (name, label, type = "text", required = true) =>
  `<label>${esc(t(label))}<input name="${name}" type="${type}" ${required ? "required" : ""}></label>`;

async function api(action, args = {}) {
  const response = await fetch(action ? "/api" : "/api/status", {
    method: action ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(action ? { "Content-Type": "application/json" } : {}),
    },
    ...(action ? { body: JSON.stringify({ action, ...args }) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.code);
  return result;
}

function language() {
  document.documentElement.lang = chinese ? "zh-CN" : "en";
  $("language").textContent = chinese ? "English" : "简体中文";
  $("language").lang = chinese ? "en" : "zh-CN";
  for (const id of ["title", "definitions", "instances", "activity"])
    $(id === "title" ? id : id + "-heading").textContent = t(
      id === "activity" ? "inbox" : id,
    );
  $("unlock").querySelector("label").textContent = t("access");
  $("unlock-button").textContent = t("connect");
  $("dismiss").textContent = t("dismiss");
  $("save").textContent = t("continue");
}

function render(state) {
  $("controls").innerHTML =
    button("stop", state.stopped ? "start" : "stop", !state.stopped) +
    button("rescan", "scan") +
    button("import", "import") +
    button("add", "add");
  $("notice").textContent = [
    t(state.stopped ? "stopped" : "online"),
    state.inboxError && t(state.inboxError),
  ]
    .filter(Boolean)
    .join(" ");
  $("definitions").innerHTML =
    state.definitions
      .map(
        ({ id, revision, title, paused }) => `
    <article><h3>${esc(title)} <small>${esc(revision)}${paused ? ` · ${t("paused")}` : ""}</small></h3>
    <div class="actions">${button("create", "create", id, revision)}${button("test", "test", id, revision)}
    ${button("pause", paused ? "resume" : "pause", id, !paused)}</div></article>`,
      )
      .join("") || t("none");
  $("instances").innerHTML =
    [...state.instances]
      .reverse()
      .map((instance) => {
        const {
          id,
          state: status,
          workflowId,
          revision,
          issues,
          requests,
          responses,
          activity,
          attempts,
          created,
        } = instance;
        const title =
          state.definitions.find(
            (entry) => entry.id === workflowId && entry.revision === revision,
          )?.title ?? workflowId;
        const editable = [
          "awaiting-response",
          "needs-attention",
          "ready",
          "queued",
          "failed",
        ].includes(status);
        const collecting = ["awaiting-response", "needs-attention"].includes(
          status,
        );
        const displayDate = new Date(created).toLocaleString();
        const actions = [
          collecting && button("request", "request", id),
          editable && button("values", "values", id),
          ...issues
            .filter(({ code }) => code === "verificationRequired")
            .flatMap(({ fields }) =>
              fields.map((name) => button("verify", "verify", id, name)),
            ),
          ...responses
            .filter(({ disposition }) => disposition === "conflict")
            .map((entry) => button("conflict", "conflict", id, entry.id)),
          status === "ready" && button("execution", "queue", id, "queue"),
          ["failed", "uncertain", "autofilled"].includes(status) &&
            button("retry", "retry", id, status),
          ["autofilled", "uncertain"].includes(status) &&
            button("reveal", "reveal", id),
          status === "autofilled" &&
            button("execution", "complete", id, "complete"),
          !["cancelled", "completed", "running"].includes(status) &&
            button("cancel", "cancel", id),
        ];
        return `<article><h3>${esc(title)} <small>${esc(displayDate)} · ${esc(id.slice(0, 8))}</small></h3>
      <p><strong>${esc(t(status))}</strong></p>
      ${issues.length ? `<ul>${issues.map(({ code, fields }) => `<li>${esc(t(code))}${fields?.length ? ` · ${esc(fields.join(", "))}` : ""}</li>`).join("")}</ul>` : ""}
      <div class="actions">${actions.filter(Boolean).join("")}</div>
      ${
        requests.length
          ? `<details><summary>${t("request")} · ${requests.length}</summary>
      ${requests
        .map(
          (request) => `<p class="actions">${
            request.respondentUrl
              ? `<a href="${esc(request.respondentUrl)}" target="_blank" rel="noopener noreferrer">${t("openLink")}</a>`
              : ""
          }
        ${button("download", "download", id, request.id)}
        ${editable && !request.closed ? button("link", "link", id, request.id) : ""}
        ${status !== "running" && !request.closed ? button("close", "close", id, request.id) : ""}</p>`,
        )
        .join("")}</details>`
          : ""
      }
      <details><summary>${t("details")}</summary>
      <div class="actions">${button("working", "inspection", id)}
      ${["queued", "ready", "running", "autofilled", "failed", "uncertain", "completed"].includes(status) ? button("record", "export", id) : ""}</div>
      <pre>${esc(JSON.stringify({ activity, attempts }, null, 2))}</pre></details></article>`;
      })
      .join("") || t("none");
  $("inbox").innerHTML =
    state.inbox
      .map(
        ({ file, code, status, at }) =>
          `<p><strong>${esc(t(status))}</strong> · ${esc(file)}${code ? ` · ${esc(t(code))}` : ""} <small>${esc(new Date(at).toLocaleString())}</small></p>`,
      )
      .join("") || t("none");
}

async function refresh(force = false) {
  try {
    if (!key) throw Error("workflowUnlockRequired");
    const state = await api();
    sessionStorage.setItem("veraflow-worker-key", key);
    $("unlock").hidden = true;
    $("dashboard").hidden = false;
    const content = JSON.stringify(state);
    if (
      force ||
      (content !== snapshot && !document.activeElement?.closest("#dashboard"))
    ) {
      const focused = document.activeElement;
      const wasButton = focused?.dataset.action;
      render(state);
      if (wasButton) {
        [...$("dashboard").querySelectorAll("button")]
          .find(
            (el) =>
              el.dataset.action === wasButton &&
              el.dataset.args === focused.dataset.args,
          )
          ?.focus();
      }
      snapshot = content;
    }
  } catch (error) {
    $("dashboard").hidden = true;
    $("unlock").hidden = false;
    $("notice").textContent = t(
      error.message === "workflowUnlockRequired" ? "unlock" : "offline",
    );
  }
}

function dialog(label, fields, save, saveLabel = "continue") {
  $("editor-title").textContent = t(label);
  $("editor-fields").innerHTML = `<div class="stack">${fields}</div>`;
  $("editor-error").textContent = "";
  $("save").textContent = t(saveLabel);
  $("save").hidden = !save;
  editing = save;
  $("editor").showModal();
}

function download(filename, value, raw = false) {
  const catalog = new Blob(
    [raw ? value : JSON.stringify(value, null, 2) + "\n"],
    {
      type: raw ? "text/plain" : "application/json",
    },
  );
  const href = URL.createObjectURL(catalog);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function fileText(file, maxBytes = 1048576) {
  if (file.size > maxBytes) throw Error("workflowInputTooLarge");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw Error("workflowInvalidEncoding");
  }
}

async function perform(action, args) {
  const [id, secondary, third] = args;
  const update = (name, payload) => () => api(name, payload);
  switch (action) {
    case "add":
      return dialog(
        "add",
        field("workflow", "workflow", "file") + field("form", "form", "file"),
        async (data) =>
          api("add", {
            workflow: await fileText(data.get("workflow")),
            form: await fileText(data.get("form"), 4 * 1048576),
          }),
      );
    case "create":
      return dialog(
        "create",
        field("source", "source", "file", false),
        async (data) => {
          const source = data.get("source");
          await api("create", {
            id,
            revision: secondary,
            ...(source.size ? { source: await fileText(source) } : {}),
          });
        },
      );
    case "import":
      return dialog(
        "import",
        field("response", "response", "file"),
        async (data) =>
          api("import", { response: await fileText(data.get("response")) }),
      );
    case "request":
    case "download": {
      const { request, setup } = await api(
        action === "request" ? "request" : "request-inspect",
        { id, requestId: secondary },
      );
      download(`request-${request.requestId}.json`, request);
      if (action === "request") dialog("request", `<p>${t(setup)}</p>`, null);
      return;
    }
    case "link":
      return dialog("link", field("url", "respondentUrl", "url"), (data) =>
        api("link", { id, requestId: secondary, url: data.get("url") }),
      );
    case "close":
      return dialog(
        "close",
        `<p>${t("closeHelp")}</p>`,
        update("close", { id, requestId: secondary }),
        "close",
      );
    case "values":
      return dialog(
        "values",
        `<label>${t("valuesPrompt")}<textarea name="source" rows="5" required></textarea></label>`,
        (data) => api("values", { id, source: data.get("source") }),
      );
    case "verify":
      return dialog(
        "verify",
        `<strong>${esc(secondary)}</strong><label>${t("candidate")}<textarea name="candidate" rows="3" required></textarea></label>`,
        async (data) => {
          const result = await api("verify", {
            id,
            field: secondary,
            candidate: data.get("candidate"),
          });
          if (!result.matched) throw Error("mismatch");
        },
      );
    case "conflict": {
      const { response } = await api("response-inspect", {
        id,
        responseId: secondary,
      });
      return dialog(
        "conflict",
        `<p>${button("working", "inspection", id)}</p>
        <p>${t("incoming")}</p><pre>${esc(JSON.stringify(response.fields, null, 2))}</pre>
        <label>${t("decision")}<select name="decision"><option value="keep">${t("keep")}</option><option value="accept">${t("accept")}</option></select></label>`,
        (data) =>
          api("resolve", {
            id,
            responseId: secondary,
            decision: data.get("decision"),
          }),
      );
    }
    case "retry":
      if (secondary === "failed")
        return api("execution", { id, transition: "retry" });
      return dialog(
        "retry",
        `<label>${t("acknowledge")}<input type="checkbox" required></label>`,
        update("execution", { id, transition: "retry", acknowledge: true }),
        "retry",
      );
    case "cancel":
      return dialog(
        "cancel",
        "",
        update("execution", { id, transition: "cancel" }),
        "cancel",
      );
    case "working": {
      const { form } = await api("record-working", { id });
      return download(`working-${id}.veraflow`, form, true);
    }
    case "record":
      return download(`record-${id}.json`, await api("record", { id }));
    case "test":
      await api("test", { id, revision: secondary });
      return dialog("test", `<p>${t("testPassed")}</p>`, null);
    case "stop":
      return api("stop", { enabled: id });
    case "pause":
      return api("pause", { id, enabled: secondary });
    case "execution":
      return api("execution", {
        id,
        transition: secondary,
        acknowledge: third,
      });
    default:
      return api(action, { id });
  }
}

document.addEventListener("click", async (event) => {
  const control = event.target.closest("button[data-action]");
  if (!control || pending) return;
  pending = true;
  control.disabled = true;
  try {
    await perform(control.dataset.action, JSON.parse(control.dataset.args));
    await refresh(true);
  } catch (error) {
    if ($("editor").open) $("editor-error").textContent = t(error.message);
    else $("notice").textContent = t(error.message);
  } finally {
    control.disabled = false;
    pending = false;
  }
});

$("edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editing || pending) return;
  pending = true;
  $("save").disabled = true;
  try {
    await editing(new FormData(event.currentTarget));
    $("editor").close();
    await refresh(true);
  } catch (error) {
    $("editor-error").textContent = t(error.message);
  } finally {
    $("save").disabled = false;
    pending = false;
  }
});
$("editor").addEventListener("close", () => {
  editing = null;
  $("editor-fields").replaceChildren();
});
$("dismiss").addEventListener("click", () => {
  if (!pending) $("editor").close();
});
$("editor").addEventListener("cancel", (event) => {
  if (pending) event.preventDefault();
});
$("unlock").addEventListener("submit", (event) => {
  event.preventDefault();
  key = $("access").value.trim();
  $("access").value = "";
  void refresh(true);
});
$("language").addEventListener("click", () => {
  chinese = !chinese;
  language();
  void refresh(true);
});
language();
void refresh(true);
setInterval(() => {
  if (!pending) void refresh();
}, 3000);
