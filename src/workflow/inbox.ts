import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { sha256 } from "../core/collection";
import { recordInputLimit } from "../core/source-record";
import { ingestResponse, type InboxEntry } from "./engine";
import type { WorkflowDatabase } from "./store";

const fileStamp = (file: Awaited<ReturnType<typeof lstat>>) =>
  `${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}:${file.ctimeMs}`;

async function stableText(filename: string, stamp: string) {
  let file;
  try {
    file = await open(
      filename,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    const before = await file.stat();
    if (!before.isFile() || fileStamp(before) !== stamp) return null;
    if (before.size > recordInputLimit) return { code: "responseTooLarge" };
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        total,
        bytes.length - total,
        null,
      );
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (
      fileStamp(await file.stat()) !== stamp ||
      fileStamp(await lstat(filename)) !== stamp
    )
      return null;
    if (total > recordInputLimit) return { code: "responseTooLarge" };
    const input = bytes.subarray(0, total);
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(input) };
    } catch {
      return { code: "responseInvalidEncoding" };
    }
  } catch {
    // Drive placeholders, renames and locked files can become readable later.
    return null;
  } finally {
    await file?.close();
  }
}

async function importFile(
  db: WorkflowDatabase,
  filename: string,
  stamp: string,
  force: boolean,
  checkKnown = true,
) {
  const file = basename(filename);
  const input = await stableText(filename, stamp);
  if (!input) return null;
  const key = await sha256(
    JSON.stringify([filename, input.text ?? [input.code, stamp]]),
  );
  if (checkKnown && !force) {
    const prior = db.read().inbox.find((item) => item.key === key);
    if (prior) return { ...prior, status: "duplicate" as const };
  }
  return db.update(async (store) => {
    const prior = store.inbox.find((item) => item.key === key);
    if (prior && prior.status !== "quarantined")
      return { ...prior, status: "duplicate" as const };
    if (prior && !force && checkKnown)
      return { ...prior, status: "duplicate" as const };
    if (input.text !== undefined)
      return ingestResponse(store, input.text, file, key);
    const entry: InboxEntry = {
      key,
      file,
      status: "quarantined",
      at: new Date().toISOString(),
      code: input.code,
    };
    store.inbox = store.inbox.filter((item) => item.key !== key);
    store.inbox.push(entry);
    return entry;
  });
}

export async function importResponseFile(
  db: WorkflowDatabase,
  filename: string,
) {
  const stat = await lstat(filename);
  if (!stat.isFile()) throw Error("workflowResponseNeedsFile");
  const result = await importFile(db, filename, fileStamp(stat), false, false);
  if (!result) throw Error("workflowResponseNotReadable");
  return result;
}

/** Reconcile a flat inbox. Quarantine is a durable classification, never a move or deletion. */
export class ResponseInbox {
  private observations = new Map<string, { stamp: string; since: number }>();
  private scanned = new Map<string, string>();
  constructor(
    private db: WorkflowDatabase,
    private folder: string,
    private settleMs = 2000,
  ) {}

  async scan(now = Date.now(), rescan = false) {
    let files;
    try {
      files = await readdir(this.folder, { withFileTypes: true });
    } catch {
      if (this.db.read().inboxError !== "inboxUnavailable")
        await this.db.update((state) => {
          state.inboxError = "inboxUnavailable";
        });
      return [];
    }
    if (this.db.read().inboxError)
      await this.db.update((state) => {
        delete state.inboxError;
      });
    const observed = new Map<string, { stamp: string; since: number }>();
    const entries: InboxEntry[] = [];
    for (const dirent of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith(".json"))
        continue;
      const filename = join(this.folder, dirent.name);
      const stat = await lstat(filename).catch(() => null);
      if (!stat?.isFile()) continue;
      const stamp = fileStamp(stat);
      const prior = this.observations.get(filename);
      const same = prior?.stamp === stamp;
      observed.set(filename, { stamp, since: same ? prior.since : now });
      if (
        !rescan &&
        (!same ||
          now - prior.since < this.settleMs ||
          this.scanned.get(filename) === stamp)
      )
        continue;
      const entry = await importFile(this.db, filename, stamp, rescan);
      if (entry) {
        entries.push(entry);
        this.scanned.set(filename, stamp);
      }
    }
    for (const filename of this.scanned.keys())
      if (!observed.has(filename)) this.scanned.delete(filename);
    this.observations = observed;
    return entries;
  }
}
