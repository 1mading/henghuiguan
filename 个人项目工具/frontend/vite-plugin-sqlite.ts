import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type JsonBody = Record<string, unknown>;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}

function openDb(dbPath: string): DatabaseSync {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

export function sqliteDevBridge(projectRoot: string): Plugin {
  const dbPath = path.join(projectRoot, "data", "project.db");
  const schemaPath = path.join(projectRoot, "schema", "schema.sql");

  return {
    name: "sqlite-dev-bridge",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__sqlite")) {
          next();
          return;
        }

        try {
          if (!fs.existsSync(dbPath)) {
            sendJson(res, 503, {
              error: `database missing: ${dbPath}. Run: python scripts/init_db.py`,
            });
            return;
          }

          const db = openDb(dbPath);
          const url = new URL(req.url, "http://localhost");

          if (req.method === "GET" && url.pathname === "/__sqlite/health") {
            const projects = db.prepare("SELECT COUNT(*) AS c FROM projects").get() as {
              c: number;
            };
            sendJson(res, 200, {
              ok: true,
              dbPath,
              projects: projects.c,
            });
            db.close();
            return;
          }

          if (req.method === "GET" && url.pathname === "/__sqlite/schema-check") {
            const tables = db
              .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
              )
              .all() as Array<{ name: string }>;
            sendJson(res, 200, { tables });
            db.close();
            return;
          }

          if (req.method === "POST" && url.pathname === "/__sqlite/query") {
            const raw = await readBody(req);
            const body = JSON.parse(raw || "{}") as JsonBody;
            const sql = String(body.sql ?? "");
            const params = (Array.isArray(body.params) ? body.params : []) as Array<
              string | number | bigint | null | Uint8Array
            >;
            if (!sql.trim().toLowerCase().startsWith("select")) {
              sendJson(res, 400, { error: "query endpoint only allows SELECT" });
              db.close();
              return;
            }
            const rows = db.prepare(sql).all(...params);
            sendJson(res, 200, { rows });
            db.close();
            return;
          }

          if (req.method === "POST" && url.pathname === "/__sqlite/run") {
            const raw = await readBody(req);
            const body = JSON.parse(raw || "{}") as JsonBody;
            const sql = String(body.sql ?? "");
            const params = (Array.isArray(body.params) ? body.params : []) as Array<
              string | number | bigint | null | Uint8Array
            >;
            const lower = sql.trim().toLowerCase();
            if (lower.startsWith("select")) {
              sendJson(res, 400, { error: "use /__sqlite/query for SELECT" });
              db.close();
              return;
            }
            const result = db.prepare(sql).run(...params);
            sendJson(res, 200, {
              changes: result.changes,
              lastInsertRowid: result.lastInsertRowid,
            });
            db.close();
            return;
          }

          if (req.method === "POST" && url.pathname === "/__sqlite/ensure-schema") {
            const schema = fs.readFileSync(schemaPath, "utf8");
            db.exec(schema);
            sendJson(res, 200, { ok: true });
            db.close();
            return;
          }

          sendJson(res, 404, { error: "unknown sqlite bridge route" });
          db.close();
        } catch (error) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}
