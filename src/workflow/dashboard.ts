import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { definition, findInstance } from "./engine";
import { workflowAction, workflowStatus } from "./actions";
import type { WorkflowDatabase } from "./store";
import type { WorkflowWorker } from "./worker";
import { en } from "../locales/en";
import { SourceSyntaxError } from "../core/source";

export const dashboardPort = 49337;
const assets = new Map([
  ["/", ["dashboard.html", "text/html; charset=utf-8"]],
  ["/dashboard.js", ["dashboard-client.js", "text/javascript; charset=utf-8"]],
  ["/dashboard.css", ["dashboard.css", "text/css; charset=utf-8"]],
]);

async function body(request: IncomingMessage) {
  if (request.headers["content-type"] !== "application/json")
    throw Error("workflowInvalidRequest");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8 * 1024 * 1024) throw Error("workflowInputTooLarge");
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("workflowInvalidRequest");
  return value as Record<string, unknown>;
}

export async function startDashboard(
  db: WorkflowDatabase,
  worker: WorkflowWorker,
  port = dashboardPort,
) {
  const key = randomBytes(32).toString("hex");
  const expected = Buffer.from(`Bearer ${key}`);
  let origin = "";
  const server = createServer(
    {
      requestTimeout: 10000,
      headersTimeout: 5000,
      maxHeaderSize: 8192,
    },
    (request, response) => {
      void handle(request, response).catch((error) => {
        if (response.headersSent || response.destroyed) return;
        // Exclude paths, form content, browser errors and tokens from UI errors.
        const code =
          error instanceof SourceSyntaxError
            ? "invalidSource"
            : error instanceof Error
              ? error.message.split(":")[0]
              : "";
        json(response, 400, {
          code: Object.hasOwn(en, code) ? code : "unexpectedError",
        });
      });
    },
  );
  const assetsContent = new Map(
    await Promise.all(
      [...assets].map(
        async ([route, [file, type]]) =>
          [
            route,
            { bytes: await readFile(new URL(file, import.meta.url)), type },
          ] as const,
      ),
    ),
  );

  function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(value));
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    // Validate the literal host to prevent DNS-rebinding access to local data.
    if (request.headers.host !== origin.slice("http://".length))
      return json(response, 403, { code: "workflowHostRejected" });
    const path = (request.url ?? "").split("?")[0];
    const asset = assetsContent.get(path);
    if (request.method === "GET" && asset) {
      response.writeHead(200, { "Content-Type": asset.type });
      return response.end(asset.bytes);
    }
    if (path !== "/api" && path !== "/api/status")
      return json(response, 404, { code: "workflowUnknownAction" });
    const supplied = Buffer.from(request.headers.authorization ?? "");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return json(response, 401, { code: "workflowUnlockRequired" });
    if (request.method === "GET" && path === "/api/status")
      return json(response, 200, workflowStatus(db));
    if (
      request.method !== "POST" ||
      path !== "/api" ||
      request.headers.origin !== origin
    )
      return json(response, 403, { code: "workflowOriginRejected" });
    const args = await body(request);
    let result;
    switch (args.action) {
      case "rescan":
        result = { entries: await worker.scan(true) };
        break;
      case "test":
        await worker.adapter.test(
          definition(db.read(), String(args.id), String(args.revision)).workflow
            .destination,
        );
        result = { ok: true };
        break;
      case "reveal":
        await worker.adapter.reveal(
          findInstance(db.read(), String(args.id)).id,
        );
        result = { ok: true };
        break;
      default:
        result = await workflowAction(db, String(args.action), args);
        if (
          args.action === "execution" &&
          ["complete", "cancel"].includes(String(args.transition))
        )
          await worker.adapter.release(String(args.id));
    }
    worker.reconsider();
    json(response, 200, result);
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("workflowDashboardUnavailable");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    accessUrl: `${origin}/#${key}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
