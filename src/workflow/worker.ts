import { setTimeout as delay } from "node:timers/promises";
import {
  acquireWorker,
  claimExecution,
  definition,
  finishExecution,
  type Claim,
  type Outcome,
} from "./engine";
import type { DestinationAdapter } from "./destination";
import { ResponseInbox } from "./inbox";
import { processAlive, type WorkflowDatabase } from "./store";

export class WorkflowWorker {
  private readonly id = crypto.randomUUID();
  private readonly inbox: ResponseInbox;
  private scanWork: Promise<unknown> = Promise.resolve();
  private active?: {
    claim: Claim;
    abort: AbortController;
    done: Promise<void>;
  };
  private stopping = false;

  constructor(
    private db: WorkflowDatabase,
    folder: string,
    readonly adapter: DestinationAdapter,
    private onError: (code: string) => void,
    private pollMs = 2000,
  ) {
    this.inbox = new ResponseInbox(db, folder);
  }

  async start() {
    await this.db.update((state) =>
      acquireWorker(state, this.id, processAlive),
    );
  }

  scan(force = false) {
    const scan = this.scanWork.then(() => this.inbox.scan(Date.now(), force));
    this.scanWork = scan.catch(() => {});
    return scan;
  }

  private mayContinue(claim: Claim) {
    if (this.stopping) return false;
    const state = this.db.read();
    const instance = state.instances.find(({ id }) => id === claim.instanceId);
    return (
      !!instance &&
      instance.state === "running" &&
      instance.attempts.at(-1)?.id === claim.attemptId &&
      state.worker?.id === this.id &&
      !state.stopped &&
      !definition(state, instance.workflowId, instance.revision).paused
    );
  }

  reconsider() {
    if (this.active && !this.mayContinue(this.active.claim))
      this.active.abort.abort();
  }

  private async execute(claim: Claim, abort: AbortController) {
    const monitor = setInterval(() => {
      try {
        this.reconsider();
      } catch {
        abort.abort();
        this.onError("workerStateUnavailable");
      }
    }, 400);
    try {
      let outcome: Outcome;
      try {
        outcome = await this.adapter.execute(
          claim,
          () => this.mayContinue(claim),
          abort.signal,
        );
      } catch {
        outcome = {
          kind: "uncertain",
          issue: { code: "destinationAdapterFailed" },
        };
      }
      await this.db.update((state) => finishExecution(state, claim, outcome));
    } catch {
      // Leave the durable Running attempt for explicit recovery on restart.
      this.onError("workerAttemptSaveFailed");
      this.stopping = true;
    } finally {
      clearInterval(monitor);
      this.active = undefined;
    }
  }

  async run(signal: AbortSignal) {
    while (!signal.aborted && !this.stopping) {
      try {
        await this.scan();
        if (!this.active && !signal.aborted && !this.stopping) {
          const claim = await this.db.update((state) =>
            claimExecution(state, this.id),
          );
          if (claim) {
            const abort = new AbortController();
            if (signal.aborted || this.stopping) abort.abort();
            this.active = { claim, abort, done: this.execute(claim, abort) };
          }
        }
      } catch {
        this.onError("workerCycleFailed");
      }
      await delay(this.pollMs, undefined, { signal }).catch(() => {});
    }
  }

  async close() {
    this.stopping = true;
    this.active?.abort.abort();
    await this.active?.done;
    await this.scanWork;
    await this.adapter.close();
    await this.db.update((state) => {
      if (state.worker?.id === this.id) delete state.worker;
    });
  }
}
