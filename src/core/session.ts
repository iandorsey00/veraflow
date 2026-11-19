import type { TemplateContext } from "./variables";
import { forgetSource, parseSource, sourceOutput, sourceParts } from "./source";
import { compare } from "./compare";
import {
  captureFieldNames,
  outputParts,
  templateControls,
  emailSections,
} from "./template";
import {
  normalizeText,
  stripBlankLines,
  textLayoutError,
  validControlValue,
} from "./form";
import type { Session, Template, EmailHeader } from "./model";
export function verificationRequired(s: Session) {
  return s.typing
    ? s.template.typingVerification === true
    : s.template.verificationEnabled;
}
export function activeSourceFields(s: Session): Set<string> | undefined {
  if (s.template.placeholderStyle !== "source") return;
  const parsed = parseSource(s.template.content);
  const active = new Set(parsed.recordOnlyFields);
  sourceParts(parsed, sessionValues(s), active, undefined, s.sourceContext);
  return active;
}
function selectedOutputFields(s: Session) {
  if (s.template.placeholderStyle !== "source") return;
  const parsed = parseSource(s.template.content);
  if (parsed.outputs.length === 1) return activeSourceFields(s);
  const active = new Set<string>();
  sourceParts(
    parsed,
    sessionValues(s),
    active,
    s.outputId ?? parsed.outputs[0].id,
    s.sourceContext,
  );
  return active;
}
export function fieldVisible(
  s: Session,
  name: string,
  active = activeSourceFields(s),
) {
  if (active) return active.has(name);
  const when = s.controls?.get(name)?.when;
  return (
    !when ||
    s.fields.find((field) => field.name === when.name)?.value === when.value
  );
}
function needsCapture(
  s: Session,
  field: Session["fields"][number],
  active?: Set<string>,
) {
  return (
    (active?.has(field.name) ?? fieldVisible(s, field.name)) &&
    (field.status === "empty" ||
      (field.status === "skipped" &&
        (s.typing === true || s.controls?.has(field.name) === true))) &&
    !s.controls?.get(field.name)?.optional
  );
}
function checkable(s: Session, value: string | null) {
  return (
    value !== null &&
    (!(s.scanner || s.template.placeholderStyle === "source") || !!value.trim())
  );
}
function needsCheck(
  s: Session,
  field: Session["fields"][number],
  active?: Set<string>,
) {
  return (
    (active?.has(field.name) ?? fieldVisible(s, field.name)) &&
    checkable(s, field.value) &&
    field.status !== "verified"
  );
}
export function startSession(template: Template): Session {
  const controls = templateControls(template);
  const source =
    template.placeholderStyle === "source"
      ? parseSource(template.content)
      : undefined;
  const saved = source?.responses;
  const names = captureFieldNames(template);
  // Choices are entered first. Within each group, resolve conditions before dependent fields.
  const drivers = new Set(source?.conditionDrivers);
  const rank = (name: string) =>
    (controls.get(name)?.options ? 0 : 2) + (drivers.has(name) ? 0 : 1);
  const ordered = source ? names.sort((a, b) => rank(a) - rank(b)) : names;
  const fields: Session["fields"] = ordered.map((name) => {
    const value = saved?.has(name)
      ? saved.get(name)!
      : (controls.get(name)?.defaultValue ?? null);
    const verified = source?.verification.get(name);
    return {
      name,
      value,
      status: verified ? "verified" : value === null ? "empty" : "captured",
      ...(verified === "form" ? { checkedByTyping: true } : {}),
    };
  });
  const s: Session = {
    template: structuredClone(template),
    controls,
    fields,
    active: 0,
    mode: "capture",
    ...(source
      ? {
          sourceContext: { timestamp: new Date(), templateName: template.name },
        }
      : {}),
  };
  if (!fields.length) s.mode = "ready";
  else if (controls.size || template.placeholderStyle === "source") {
    const active = activeSourceFields(s);
    const first = fields.findIndex((field) => needsCapture(s, field, active));
    if (first >= 0) s.active = first;
    else if (verificationRequired(s)) beginVerification(s);
    else s.mode = "ready";
  }
  return s;
}

// A check in one workflow does not satisfy the other workflow's verification rule.
export function prepareWorkflow(s: Session, typing: boolean) {
  s.typing = typing;
  for (const field of s.fields) {
    if (field.status === "verified" && !!field.checkedByTyping !== typing) {
      field.status = "captured";
      delete field.checkedByTyping;
    }
    if (field.status === "mismatch") {
      field.status = "captured";
      delete field.checkedByTyping;
      delete field.candidate;
    }
  }
  const active = activeSourceFields(s);
  const first = s.fields.findIndex((field) => needsCapture(s, field, active));
  if (first >= 0) {
    s.mode = "capture";
    if (!typing) s.active = first;
  } else if (verificationRequired(s)) beginVerification(s);
  else s.mode = "ready";
}
function editable(s: Session) {
  if (s.mode === "complete") throw new Error("sessionComplete");
}
export function move(s: Session, offset: number): void {
  editable(s);
  const active = activeSourceFields(s);
  const visible = s.fields.flatMap((field, index) =>
    fieldVisible(s, field.name, active) ? [index] : [],
  );
  if (!visible.length) return;
  const current = visible.indexOf(s.active);
  s.active =
    current < 0
      ? visible[0]
      : visible[(current + offset + visible.length) % visible.length];
}
export function capture(s: Session, value: string, advance = true): void {
  editable(s);
  const field = s.fields[s.active];
  if (!field) throw new Error("noField");
  const control = s.controls?.get(field.name);
  const text = field.removeBlankLines
    ? stripBlankLines(value)
    : normalizeText(control, value);
  const layoutError = textLayoutError(control, text);
  if (layoutError) throw Error(layoutError);
  if (!text.trim()) throw Error("emptySelection");
  if (control && !validControlValue(control, text))
    throw Error("invalidControlValue");
  field.value = text;
  field.status = "captured";
  delete field.checkedByTyping;
  delete field.candidate;
  s.mode = "capture";
  if (advance) advanceCapture(s);
}
export function clear(s: Session): void {
  editable(s);
  const field = s.fields[s.active];
  if (!field) return;
  field.value = null;
  field.status = "empty";
  delete field.removeBlankLines;
  delete field.checkedByTyping;
  delete field.candidate;
  s.mode = "capture";
}
export function skip(s: Session, advance = true): void {
  const control = s.controls?.get(s.fields[s.active]?.name);
  if (control && !control.optional) throw Error("incomplete");
  clear(s);
  const field = s.fields[s.active];
  if (!field) return;
  field.status = "skipped";
  if (advance) advanceCapture(s);
}
function advanceCapture(s: Session): void {
  const active = activeSourceFields(s);
  const next = findNext(s, (field) => needsCapture(s, field, active));
  if (next !== -1) {
    s.active = next;
    return;
  }
  if (verificationRequired(s)) beginVerification(s);
  else s.mode = "ready";
}
function findNext(
  s: Session,
  predicate: (field: Session["fields"][number]) => boolean,
): number {
  for (let step = 1; step <= s.fields.length; step++) {
    const index = (s.active + step) % s.fields.length;
    if (predicate(s.fields[index])) return index;
  }
  return -1;
}
export function beginVerification(s: Session, outputOnly = false) {
  editable(s);
  const active = outputOnly ? selectedOutputFields(s) : activeSourceFields(s);
  if (s.fields.some((field) => needsCapture(s, field, active)))
    throw new Error("incomplete");
  const index = s.fields.findIndex((field) => needsCheck(s, field, active));
  s.verificationOutputOnly = outputOnly;
  s.mode = index === -1 ? "ready" : "verify";
  if (index !== -1) s.active = index;
  return index !== -1;
}
/** Recheck original values without replacing them or changing unrelated fields. */
export function beginReverification(s: Session, all = false): void {
  if (!["capture", "verify", "ready"].includes(s.mode))
    throw Error("sessionComplete");
  const active = activeSourceFields(s);
  const indices = all
    ? s.fields.flatMap((field, index) =>
        fieldVisible(s, field.name, active) && checkable(s, field.value)
          ? [index]
          : [],
      )
    : checkable(s, s.fields[s.active]?.value ?? null)
      ? [s.active]
      : [];
  if (!indices.length) throw Error("noValue");
  for (const index of indices) {
    s.fields[index].status = "captured";
    delete s.fields[index].candidate;
  }
  s.verificationOutputOnly = false;
  s.active = indices[0];
  s.mode = "verify";
}
export function verify(s: Session, candidate: string, advance = true): boolean {
  editable(s);
  if (s.mode !== "verify") throw new Error("notVerifying");
  const field = s.fields[s.active];
  if (!field || field.value === null) throw new Error("noValue");
  const control = s.controls?.get(field.name);
  candidate = field.removeBlankLines
    ? stripBlankLines(candidate)
    : normalizeText(control, candidate);
  const layoutError = textLayoutError(control, candidate);
  if (layoutError) throw Error(layoutError);
  if (!candidate.trim()) throw new Error("emptySelection");
  const matches = s.controls?.get(field.name)?.options
    ? field.value === candidate
    : compare(field.value, candidate, s.template.comparison);
  field.status = matches ? "verified" : "mismatch";
  if (!matches) {
    field.candidate = candidate;
    return false;
  }
  delete field.checkedByTyping;
  delete field.candidate;
  if (s.typing) field.checkedByTyping = true;
  const active = s.verificationOutputOnly
    ? selectedOutputFields(s)
    : activeSourceFields(s);
  if (
    !s.fields.some(
      (f) => needsCheck(s, f, active) || needsCapture(s, f, active),
    )
  )
    s.mode = "ready";
  else if (advance) {
    const next = findNext(s, (f) => needsCheck(s, f, active));
    if (next !== -1) s.active = next;
    else s.mode = "capture";
  }
  return true;
}
function validateOutput(s: Session) {
  if (
    s.template.placeholderStyle !== "source" &&
    s.fields.some((f) => needsCapture(s, f))
  )
    throw Error("incomplete");
  const active = selectedOutputFields(s);
  if (verificationRequired(s) && s.fields.some((f) => needsCheck(s, f, active)))
    throw Error("unverified");
}

function renderParts(
  template: Template,
  values: ReadonlyMap<string, string>,
  controls: NonNullable<Session["controls"]>,
  outputId?: string,
  context?: TemplateContext,
) {
  if (template.placeholderStyle === "source")
    return sourceParts(
      parseSource(template.content),
      values,
      undefined,
      outputId,
      context,
    ).map(({ id, label, parts }) => ({ key: id, label, parts }));
  return emailSections(template).map((part) => ({
    key: part.key,
    parts: outputParts(
      part.text,
      template,
      values,
      controls,
      part.key !== "body",
    ),
  }));
}

// Render from a value map without applying the app's session verification gate.
export function renderTemplateValues(
  template: Template,
  input: ReadonlyMap<string, string>,
  outputId?: string,
  context?: TemplateContext,
) {
  const controls = templateControls(template);
  const values = new Map(
    Array.from(input, ([name, value]) => [
      name,
      normalizeText(controls.get(name), value),
    ]),
  );
  const saved =
    template.placeholderStyle === "source"
      ? parseSource(template.content).responses
      : undefined;
  // Explicit inputs win over prefilled responses. A saved null still blocks the default below.
  for (const [name, value] of saved ?? []) {
    if (!values.has(name) && value !== null) values.set(name, value);
  }
  for (const [name, control] of controls) {
    if (!values.has(name)) {
      if (control.defaultValue !== undefined && !saved?.has(name))
        values.set(name, control.defaultValue);
      else if (control.optional) values.set(name, "");
    }
  }
  if (template.placeholderStyle === "source")
    return checkedSource(template, values, outputId, {
      templateName: template.name,
      ...context,
    });
  const rendered = checkedParts(template, values, controls);
  return template.email?.enabled ? checkedEmail(template, rendered) : rendered;
}

function checkedParts(
  template: Template,
  values: ReadonlyMap<string, string>,
  controls: NonNullable<Session["controls"]>,
) {
  for (const [name, control] of controls) {
    if (control.when && values.get(control.when.name) !== control.when.value)
      continue;
    const value = values.get(name);
    if (value === undefined) throw Error("missingValue");
    if (
      !(control.optional && value === "") &&
      !validControlValue(control, value)
    )
      throw Error("invalidControlValue");
  }
  return emailSections(template).map(({ key, text: source }) => {
    const parts = outputParts(
      source,
      template,
      values,
      controls,
      key !== "body",
    );
    if (parts.some((part) => part.missing)) throw Error("missingValue");
    const text = parts.map((part) => part.text).join("");
    return { key, text: key === "body" ? text : text.trim() };
  });
}

function sessionValues(s: Session) {
  return new Map(
    s.fields.flatMap((field) =>
      field.value !== null ||
      field.status === "skipped" ||
      s.controls?.get(field.name)?.optional
        ? [[field.name, field.value ?? ""] as const]
        : [],
    ),
  );
}

export function previewSections(template: Template, s?: Session) {
  const controls = s?.controls ?? templateControls(template);
  if (!s && template.placeholderStyle === "source") s = startSession(template);
  const values = s ? sessionValues(s) : new Map<string, string>();
  if (!s) {
    for (const [name, control] of controls) {
      if (control.defaultValue !== undefined)
        values.set(name, control.defaultValue);
      else if (control.optional) values.set(name, "");
    }
  }
  return renderParts(template, values, controls, s?.outputId, s?.sourceContext);
}

function checkedSource(
  template: Template,
  values: ReadonlyMap<string, string>,
  outputId?: string,
  context?: TemplateContext,
) {
  const parsed = parseSource(template.content);
  // Validate fields visited by the selected branches. Hidden values can remain in the session.
  const used = new Set<string>();
  const id = outputId ?? parsed.outputs[0].id;
  sourceParts(parsed, values, used, id, context);
  const parts = sourceParts(parsed, values, undefined, id, context);
  validateSourceValues(parsed, values, used);
  return parts.map((part) => {
    if (part.parts.some((token) => token.missing)) throw Error("missingValue");
    return {
      id: part.id,
      label: part.label,
      text: part.parts.map((token) => token.text).join(""),
    };
  });
}
function validateSourceValues(
  parsed: ReturnType<typeof parseSource>,
  values: ReadonlyMap<string, string>,
  used: ReadonlySet<string>,
) {
  for (const name of used) {
    const control = parsed.controls.get(name),
      value = values.get(name);
    const layoutError =
      value === undefined ? undefined : textLayoutError(control, value);
    if (layoutError) throw Error(layoutError);
    if (
      control &&
      value !== undefined &&
      !(
        control.optional &&
        (value === "" ||
          (["text", "textarea"].includes(control.kind) && !value.trim()))
      ) &&
      !validControlValue(control, value)
    )
      throw Error("invalidControlValue");
  }
}

export function spreadsheetRow(
  s: Session,
  headers?: string[],
  validate = true,
) {
  const parsed = parseSource(s.template.content);
  const output = sourceOutput(parsed, s.outputId);
  const values = sessionValues(s);
  const used = new Set<string>();
  let cells: Map<string, string>;
  if (output.row) {
    sourceParts(parsed, values, used, output.id, s.sourceContext, true);
    const parts = sourceParts(
      parsed,
      values,
      undefined,
      output.id,
      s.sourceContext,
      true,
    );
    if (
      validate &&
      parts.some((part) => part.parts.some((token) => token.missing))
    )
      throw Error("missingValue");
    cells = new Map(
      parts.map((cell) => [
        cell.id,
        cell.parts.map((token) => token.text).join(""),
      ]),
    );
    if (
      validate &&
      headers &&
      [...cells.keys()].some((name) => !headers.includes(name))
    )
      throw Error("appendMissingColumn");
  } else {
    const active = activeSourceFields(s);
    const names = headers ?? s.fields.map((field) => field.name);
    for (const name of names) if (active?.has(name)) used.add(name);
    if (validate && [...used].some((name) => !values.has(name)))
      throw Error("missingValue");
    cells = new Map(
      [...used].map((name) => {
        const value = values.get(name) ?? "";
        return [name, parsed.controls.get(name)?.options?.get(value) ?? value];
      }),
    );
  }
  if (validate) {
    validateSourceValues(parsed, values, used);
    if (
      verificationRequired(s) &&
      s.fields.some((field) => needsCheck(s, field, used))
    )
      throw Error("unverified");
  }
  return cells;
}

export function prepareSections(s: Session) {
  validateOutput(s);
  return checkedSource(
    s.template,
    sessionValues(s),
    s.outputId,
    s.sourceContext,
  );
}
export function renderSession(s: Session): string {
  if (s.template.placeholderStyle === "source")
    return prepareSections(s)
      .map((part) => part.text)
      .join("\n");
  validateOutput(s);
  return checkedParts(
    s.template,
    sessionValues(s),
    s.controls ?? templateControls(s.template),
  ).find((part) => part.key === "body")!.text;
}
export function eraseSession(s: Session): void {
  if (s.template.placeholderStyle === "source") forgetSource();
  for (const field of s.fields) {
    field.value = null;
    delete field.checkedByTyping;
    delete field.candidate;
    field.status = "empty";
    delete field.removeBlankLines;
  }
  delete s.prepared;
  delete s.scannerOutputTemplate;
  delete s.scannerId;
  s.mode = "complete";
}

export class EmailHeaderError extends Error {
  constructor(public section: EmailHeader) {
    super("emailHeaderInvalid");
  }
}
export function renderEmail(s: Session) {
  validateOutput(s);
  return checkedEmail(
    s.template,
    checkedParts(
      s.template,
      sessionValues(s),
      s.controls ?? templateControls(s.template),
    ),
  );
}

function checkedEmail(
  template: Template,
  sections: { key: EmailHeader | "body"; text: string }[],
) {
  if (
    (template.email?.subjectEnabled !== false &&
      !sections.find((p) => p.key === "subject")?.text.trim()) ||
    !sections.find((p) => p.key === "to")?.text.trim()
  )
    throw new Error("emailRequired");
  for (const part of sections) {
    if (part.key !== "body" && /[\p{Cc}\p{Zl}\p{Zp}]/u.test(part.text))
      throw new EmailHeaderError(part.key);
  }
  return sections;
}

export async function deliverEmailSection(
  s: Session,
  back: boolean,
  send: (text: string | null, tab: boolean) => Promise<void>,
): Promise<void> {
  if (s.mode !== "delivery") throw new Error("emailNotReady");
  const parts = renderEmail(s),
    index = s.deliveryIndex ?? 0;
  if (back) {
    if (index === 0) return;
    await send(null, false);
    s.deliveryIndex = index - 1;
    s.deliveryDone = false;
  } else if (!s.deliveryDone) {
    await send(parts[index].text, index < parts.length - 1);
    if (index < parts.length - 1) s.deliveryIndex = index + 1;
    else s.deliveryDone = true;
  }
}

// Manual recovery only changes VeraFlow's section; never injects keys or claims paste success.
export function moveEmailSection(s: Session, direction: -1 | 1): void {
  if (s.mode !== "delivery") throw new Error("emailNotReady");
  const parts = renderEmail(s),
    index = s.deliveryIndex ?? 0;
  if (direction === -1) {
    if (s.deliveryDone) s.deliveryDone = false;
    else s.deliveryIndex = Math.max(0, index - 1);
  } else if (!s.deliveryDone) {
    if (index < parts.length - 1) s.deliveryIndex = index + 1;
    else s.deliveryDone = true;
  }
}

export { stripBlankLines } from "./form";
export function cleanBlankLines(s: Session): void {
  editable(s);
  const field = s.fields[s.active];
  if (!field || field.value === null) throw new Error("noValue");
  const cleaned = stripBlankLines(field.value);
  if (cleaned === field.value) return;
  field.removeBlankLines = true;
  capture(s, cleaned, false);
  if (verificationRequired(s) && !s.fields.some((f) => needsCapture(s, f))) {
    s.mode = "verify";
  }
}
