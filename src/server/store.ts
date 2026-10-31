import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { HttpError } from "./errors";
import type { ShowRecord } from "./records";

type Envelope<T> = { revision: number; value: T };
function advanceStateRevision(id: string, value: unknown) {
  if (!id.startsWith("show:") || !value || typeof value !== "object") return;
  const state = (value as { state?: { revision?: number; sequence?: number } })
    .state;
  if (state) state.revision = (state.revision ?? state.sequence ?? 0) + 1;
}
export interface DocumentStore {
  get<T>(id: string): Promise<T | null>;
  create<T>(id: string, value: T): Promise<boolean>;
  update<T, R>(id: string, change: (value: T) => R): Promise<R>;
  renewShowLease?(
    id: string,
    ownerId: string,
    clientId: string,
    epoch: number,
    durationMs: number,
    incarnation?: { id: string; sequence: number },
  ): Promise<ShowRecord | null>;
}
function serialize(value: unknown) {
  const result = JSON.stringify(value);
  if (Buffer.byteLength(result) > 2_000_000)
    throw new HttpError(
      413,
      "storage_budget",
      "Show storage budget reached; create a new show.",
    );
  return result;
}
export class PostgresStore implements DocumentStore {
  private sql;
  private initialized?: Promise<unknown>;
  constructor(url: string) {
    this.sql = neon(url);
  }
  private async query(
    text: string,
    parameters: unknown[] = [],
    timeoutMs = 8_000,
  ) {
    const signal = AbortSignal.timeout(Math.max(1, timeoutMs));
    const measuring = process.env.PORTAL_TIMING_LOG === "1",
      started = performance.now();
    let nextTick = started + 100,
      loopLagMs = 0,
      rowCount = -1,
      failed = false;
    const timer = measuring
      ? setInterval(() => {
          const tick = performance.now();
          loopLagMs = Math.max(loopLagMs, tick - nextTick);
          nextTick = tick + 100;
        }, 100).unref()
      : null;
    try {
      const rows = await this.sql.query(text, parameters, {
        fetchOptions: { signal },
      });
      rowCount = rows.length;
      return rows;
    } catch (error) {
      failed = true;
      if (signal.aborted)
        throw new HttpError(
          503,
          "database_timeout",
          "The stage store took too long to respond. A command may have committed; refresh the scene before retrying.",
        );
      throw error;
    } finally {
      if (timer) clearInterval(timer);
      if (measuring) {
        const elapsed = performance.now() - started;
        loopLagMs = Math.max(loopLagMs, performance.now() - nextTick, 0);
        const operation = text.includes("jsonb_set")
          ? "lease"
          : text.trim().split(/\s+/)[0].toLowerCase();
        // Never log SQL, parameters, identities, provider messages, or credentials.
        console.info(
          "portal.store " +
            JSON.stringify({
              operation,
              elapsedMs: Math.round(elapsed),
              eventLoopLagMs: Math.round(loopLagMs),
              rows: rowCount,
              failed,
              timedOut: signal.aborted,
            }),
        );
      }
    }
  }
  private async ready() {
    this.initialized ??= this.query(
      "CREATE TABLE IF NOT EXISTS portal_documents (id text PRIMARY KEY, revision bigint NOT NULL DEFAULT 1, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
    ).catch((error) => {
      this.initialized = undefined;
      throw error;
    });
    await this.initialized;
  }
  private async envelope<T>(
    id: string,
    timeoutMs = 8_000,
  ): Promise<Envelope<T> | null> {
    await this.ready();
    const rows = await this.query(
      "SELECT revision, value FROM portal_documents WHERE id = $1",
      [id],
      timeoutMs,
    );
    return rows.length
      ? { revision: Number(rows[0].revision), value: rows[0].value as T }
      : null;
  }
  async get<T>(id: string) {
    return (await this.envelope<T>(id))?.value ?? null;
  }
  async create<T>(id: string, value: T) {
    await this.ready();
    const rows = await this.query(
      "INSERT INTO portal_documents (id, value) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING RETURNING id",
      [id, serialize(value)],
    );
    return rows.length === 1;
  }
  /** One row-locked statement for an existing renderer. Acquisition still uses the domain CAS path. */
  async renewShowLease(
    id: string,
    ownerId: string,
    clientId: string,
    epoch: number,
    durationMs: number,
    incarnation?: { id: string; sequence: number },
  ): Promise<ShowRecord | null> {
    await this.ready();
    const now = "floor(extract(epoch from clock_timestamp()) * 1000)::bigint";
    const expiredBucket = `COALESCE((value #>> ARRAY['rates', $5, 'at'])::bigint, 0) <= (${now}) - 60000`;
    const rows = await this.query(
      `
      UPDATE portal_documents
      SET value = jsonb_set(
        jsonb_set(jsonb_set(value,
          '{state,renderLease,expiresAt}', to_jsonb((${now}) + $6::bigint)),
          '{state,revision}', to_jsonb(COALESCE((value #>> '{state,revision}')::bigint, (value #>> '{state,sequence}')::bigint, 0) + 1)),
        ARRAY['rates', $5], jsonb_build_object(
          'at', CASE WHEN ${expiredBucket} THEN (${now}) ELSE (value #>> ARRAY['rates', $5, 'at'])::bigint END,
          'count', CASE WHEN ${expiredBucket} THEN 1 ELSE COALESCE((value #>> ARRAY['rates', $5, 'count'])::integer, 0) + 1 END)),
        revision = revision + 1, updated_at = now()
      WHERE id = $1 AND value->>'ownerId' = $2
        AND value #>> '{state,renderLease,clientId}' = $3
        AND (value #>> '{state,mode}' <> 'solo' OR (value #>> '{state,solo,endsAt}')::bigint > (${now}))
        AND (value #>> '{state,epoch}')::bigint = $4
        AND (value #>> '{state,renderLease,epoch}')::bigint = $4
        AND (value #>> '{state,renderLease,expiresAt}')::bigint > (${now})
        AND value #>> '{state,renderLease,releasedAt}' IS NULL
        AND ((value #>> '{state,renderLease,incarnationId}' IS NULL AND $7::text IS NULL)
          OR (value #>> '{state,renderLease,incarnationId}' = $7::text
            AND (value #>> '{state,renderLease,incarnationSequence}')::bigint = $8::bigint))
        AND (value #>> '{state,expiresAt}')::bigint > (${now})
        AND value #>> '{state,phase}' <> 'ended'
        AND (${expiredBucket} OR COALESCE((value #>> ARRAY['rates', $5, 'count'])::integer, 0) < 30)
        AND (value #>> '{state,mode}' = 'live' OR value #>> '{state,transport}' = 'livekit'
          OR (value #>> '{state,participants,A,ready}' = 'true' AND value #>> '{state,participants,A,admitted}' = 'true'
            AND value #>> '{state,participants,B,ready}' = 'true' AND value #>> '{state,participants,B,admitted}' = 'true'))
      RETURNING value`,
      [
        id,
        ownerId,
        clientId,
        epoch,
        "lease:" + clientId,
        durationMs,
        incarnation?.id ?? null,
        incarnation?.sequence ?? null,
      ],
    );
    return rows.length ? (rows[0].value as ShowRecord) : null;
  }
  async update<T, R>(id: string, change: (value: T) => R): Promise<R> {
    await this.ready();
    const deadline = Date.now() + 15_000;
    for (let retry = 0; retry < 10 && Date.now() < deadline; retry++) {
      const record = await this.envelope<T>(
        id,
        Math.min(8_000, deadline - Date.now()),
      );
      if (!record) throw new HttpError(404, "not_found", "Record not found.");
      // The synchronous pure callback can be replayed after a competing writer wins.
      const before = serialize(record.value);
      const result = change(record.value);
      if (serialize(record.value) === before) return result;
      advanceStateRevision(id, record.value);
      const rows = await this.query(
        "UPDATE portal_documents SET value = $1::jsonb, revision = revision + 1, updated_at = now() WHERE id = $2 AND revision = $3 RETURNING id",
        [serialize(record.value), id, record.revision],
        Math.min(8_000, deadline - Date.now()),
      );
      if (rows.length) return result;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          20 + Math.min(100, retry * 15) + Math.floor(Math.random() * 15),
        ),
      );
    }
    throw new HttpError(
      409,
      "concurrent_update",
      "The show changed concurrently; retry the command.",
    );
  }
}
/** Development only. Cross-process lock plus atomic rename; never a production fallback. */
export class LocalFileStore implements DocumentStore {
  constructor(private directory: string) {}
  private filename(id: string) {
    return path.join(
      this.directory,
      Buffer.from(id).toString("base64url") + ".json",
    );
  }
  private async locked<R>(fn: () => Promise<R>): Promise<R> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, ".lock");
    for (let tries = 0; ; tries++) {
      try {
        await mkdir(lock);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (tries > 100)
          throw new HttpError(
            503,
            "local_store_locked",
            "Local store is busy. Remove .local/store/.lock only after stopping all servers if a prior process crashed.",
          );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      return await fn();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  async get<T>(id: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.filename(id), "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  private async put(id: string, value: unknown) {
    const temporary = this.filename(id) + "." + randomUUID();
    await writeFile(temporary, serialize(value), { mode: 0o600 });
    await rename(temporary, this.filename(id));
  }
  async create<T>(id: string, value: T) {
    return this.locked(async () => {
      if ((await this.get(id)) !== null) return false;
      await this.put(id, value);
      return true;
    });
  }
  async update<T, R>(id: string, change: (value: T) => R): Promise<R> {
    return this.locked(async () => {
      const value = await this.get<T>(id);
      if (value === null)
        throw new HttpError(404, "not_found", "Record not found.");
      const before = serialize(value);
      const result = change(value);
      if (serialize(value) === before) return result;
      advanceStateRevision(id, value);
      await this.put(id, value);
      return result;
    });
  }
}
let singleton: DocumentStore | undefined;
export function getStore(): DocumentStore {
  if (singleton) return singleton;
  if (process.env.DATABASE_URL)
    return (singleton = new PostgresStore(process.env.DATABASE_URL));
  if (process.env.NODE_ENV === "production" || process.env.VERCEL)
    throw new HttpError(
      503,
      "database_unavailable",
      "A durable database must be configured.",
    );
  return (singleton = new LocalFileStore(
    path.join(process.cwd(), ".local", "store"),
  ));
}
