import { mkdirSync, closeSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { emptyStore, type WorkflowStore } from "./engine";

export class WorkflowDatabase {
  private readonly db: DatabaseSync;
  readonly folder: string;

  constructor(folder: string) {
    this.folder = resolve(folder);
    mkdirSync(this.folder, { recursive: true, mode: 0o700 });
    const filename = join(this.folder, "workflows.sqlite");
    // Set permissions at creation. SQLite inherits them for its auxiliary files.
    closeSync(openSync(filename, "a", 0o600));
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS workflow_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        contents TEXT NOT NULL
      );
    `);
    this.db
      .prepare("INSERT OR IGNORE INTO workflow_state VALUES (1, 0, ?)")
      .run(JSON.stringify(emptyStore()));
  }

  private snapshot() {
    const row = this.db
      .prepare("SELECT revision, contents FROM workflow_state WHERE id = 1")
      .get()!;
    const state = JSON.parse(String(row.contents)) as WorkflowStore;
    if (state.format !== "veraflow-workflow-store" || state.version !== 1)
      throw Error("workflowUnsupportedStore");
    return {
      state,
      contents: String(row.contents),
      revision: Number(row.revision),
    };
  }

  read(): WorkflowStore {
    return this.snapshot().state;
  }

  // Decisions can await hashing or validation. Only commit if nobody changed the
  // snapshot in the meantime. Effects on the destination happen outside this callback.
  async update<T>(edit: (state: WorkflowStore) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const { state, contents, revision } = this.snapshot();
      const result = await edit(state);
      const updated = JSON.stringify(state);
      if (updated === contents) return result;
      const change = this.db
        .prepare(
          "UPDATE workflow_state SET contents = ?, revision = revision + 1 WHERE revision = ? AND id = 1",
        )
        .run(updated, revision);
      if (change.changes === 1) return result;
    }
    throw Error("workflowStoreBusy");
  }

  close() {
    this.db.close();
  }
}

export function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Access denied is not evidence that the worker stopped.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
