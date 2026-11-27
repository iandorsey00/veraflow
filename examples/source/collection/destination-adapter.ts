import type { Page } from "@playwright/test";

type FormValue = {
  id: string;
  label: string;
  optional?: boolean;
  select?: boolean;
};

/** Fill this fictional destination and report readback separately from source verification. */
export async function fillEmployment(
  page: Page,
  values: Record<string, unknown>,
) {
  const status = values.employment_status;
  const branches = new Map<string, FormValue[]>([
    [
      "employed",
      [
        { id: "employer", label: "Employer" },
        { id: "job_title", label: "Job title" },
      ],
    ],
    [
      "self_employed",
      [
        { id: "business", label: "Business name" },
        { id: "incorporated", label: "Registered", select: true },
        ...(values.incorporated === "true"
          ? [{ id: "registration", label: "Registration number" }]
          : []),
      ],
    ],
    [
      "unemployed",
      [{ id: "seeking_role", label: "Role sought", optional: true }],
    ],
  ]);
  if (typeof status !== "string" || !branches.has(status))
    throw Error("Unexpected employment status");
  if (
    status === "self_employed" &&
    !["true", "false"].includes(String(values.incorporated))
  )
    throw Error("Missing registration choice");
  const fields = [
    { id: "full_name", label: "Full name" },
    { id: "employment_status", label: "Employment", select: true },
    ...branches.get(status)!,
    { id: "comments", label: "Comments", optional: true },
  ].flatMap(({ id, label, optional, select }) => {
    const value = Object.hasOwn(values, id) ? values[id] : undefined;
    if (optional && value == null) return [];
    if (typeof value !== "string" || (!optional && !value.trim()))
      throw Error(`Expected a value for ${id}`);
    return [{ id, label, select, value }];
  });
  for (const { label, select, value } of fields) {
    const control = page.getByLabel(label, { exact: true });
    if (select) await control.selectOption(value);
    else await control.fill(value);
  }
  const mismatches: string[] = [];
  for (const { id, label, value } of fields)
    if ((await page.getByLabel(label, { exact: true }).inputValue()) !== value)
      mismatches.push(id);
  return { checked: fields.map(({ id }) => id), mismatches };
}
