import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { CliError } from "../cli-options";
import { recordInputLimit } from "../core/source-record";
import { workflowAction, workflowStatus } from "./actions";
import { startDashboard } from "./dashboard";
import { EmploymentDestination } from "./destination";
import { definition } from "./engine";
import { importResponseFile, ResponseInbox } from "./inbox";
import { WorkflowDatabase } from "./store";
import { WorkflowWorker } from "./worker";

function defaultStateFolder() {
  if (process.env.VERAFLOW_WORKFLOW_HOME)
    return process.env.VERAFLOW_WORKFLOW_HOME;
  if (process.platform === "darwin")
    return join(
      homedir(),
      "Library",
      "Application Support",
      "VeraFlow",
      "Workflows",
    );
  if (process.platform === "win32")
    return join(
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
      "VeraFlow",
      "Workflows",
    );
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
    "veraflow",
    "workflows",
  );
}

function enabled(value: string) {
  if (value !== "on" && value !== "off")
    throw new CliError("usage", "Use on or off.");
  return value === "on";
}

export async function runWorkflowCommand(
  name: string,
  [first, second, third]: string[],
  flags: {
    state?: string;
    revision?: string;
    source?: string;
    acknowledge?: boolean;
  },
  read: (path: string, limit: number) => Promise<string>,
  print: (value: unknown) => void,
) {
  const db = new WorkflowDatabase(flags.state ?? defaultStateFolder());
  const command = name.slice("workflow-".length);
  try {
    const action = (operation: string, args: Record<string, unknown>) =>
      workflowAction(db, operation, args);
    switch (command) {
      case "status":
        return print(workflowStatus(db));
      case "add":
        return print(
          await action("add", {
            workflow: await read(first, recordInputLimit),
            form: await read(second, 4 * recordInputLimit),
          }),
        );
      case "create":
        return print(
          await action("create", {
            id: first,
            revision: flags.revision,
            source:
              flags.source === undefined
                ? undefined
                : await read(flags.source, recordInputLimit),
          }),
        );
      case "request":
      case "request-inspect": {
        const result = await action(command, { id: first, requestId: second });
        if (!("request" in result)) throw Error("workflowUnknownAction");
        return print(result.request);
      }
      case "link":
      case "close":
        return print(
          await action(command, { id: first, requestId: second, url: third }),
        );
      case "import": {
        const result =
          first === "-"
            ? await action("import", {
                response: await read(first, recordInputLimit),
              })
            : await importResponseFile(db, resolve(first));
        print(result);
        if (
          "status" in result &&
          ["quarantined", "conflict"].includes(result.status)
        )
          process.exitCode = 2;
        return;
      }
      case "scan": {
        const entries = await new ResponseInbox(db, resolve(first)).scan(
          Date.now(),
          true,
        );
        const { inboxError } = db.read();
        print({ entries, ...(inboxError ? { error: inboxError } : {}) });
        if (
          inboxError ||
          entries.some(({ status }) =>
            ["quarantined", "conflict"].includes(status),
          )
        )
          process.exitCode = 2;
        return;
      }
      case "values":
        return print(
          await action("values", {
            id: first,
            source: await read(second, recordInputLimit),
          }),
        );
      case "verify": {
        // Do not pass source evidence as an argument, where process listings can expose it.
        const candidate = (await read(third, recordInputLimit)).replace(
          /\r?\n$/,
          "",
        );
        const result = await action("verify", {
          id: first,
          field: second,
          candidate,
        });
        print(result);
        if ("matched" in result && !result.matched) process.exitCode = 2;
        return;
      }
      case "resolve":
        return print(
          await action("resolve", {
            id: first,
            responseId: second,
            decision: third,
          }),
        );
      case "action":
        return print(
          await action("execution", {
            id: first,
            transition: second,
            acknowledge: flags.acknowledge === true,
          }),
        );
      case "pause":
        return print(
          await action("pause", { id: first, enabled: enabled(second) }),
        );
      case "stop":
        return print(await action("stop", { enabled: enabled(first) }));
      case "record":
        return print(await action("record", { id: first }));
      case "working-form": {
        const result = await action("record-working", { id: first });
        if (!("form" in result) || typeof result.form !== "string")
          throw Error("workflowUnknownAction");
        process.stdout.write(result.form);
        return;
      }
      case "test": {
        const adapter = new EmploymentDestination({ headless: true });
        try {
          await adapter.test(
            definition(db.read(), first, flags.revision).workflow.destination,
          );
          return print({ ok: true });
        } finally {
          await adapter.close();
        }
      }
      case "worker": {
        const worker = new WorkflowWorker(
          db,
          resolve(first),
          new EmploymentDestination(),
          (code) => console.error(`veraflow: ${code}`),
        );
        await worker.start();
        const stop = new AbortController();
        const abort = () => stop.abort();
        process.on("SIGINT", abort);
        process.on("SIGTERM", abort);
        try {
          const dashboard = await startDashboard(db, worker);
          try {
            print({
              format: "veraflow-workflow-worker",
              version: 1,
              status: "running",
              dashboard: dashboard.accessUrl,
            });
            await worker.run(stop.signal);
            if (!stop.signal.aborted) throw Error("workflowWorkerInterrupted");
          } finally {
            await dashboard.close();
          }
        } finally {
          process.off("SIGINT", abort);
          process.off("SIGTERM", abort);
          await worker.close();
        }
        return;
      }
      default:
        throw Error("workflowUnknownAction");
    }
  } finally {
    db.close();
  }
}
