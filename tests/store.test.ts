import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore } from "../src/server/store";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "portal-stage-store-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
type Counter = { count: number; history: number[] };

describe("development-only LocalFileStore", () => {
  it("persists atomically across instances and refuses to overwrite an existing record", async () => {
    const first = new LocalFileStore(directory);
    const second = new LocalFileStore(directory);
    const original = {
      title: "Borrowed Weather",
      nested: { owner: "A", ready: true },
    };
    expect(await first.create("show:one", original)).toBe(true);
    expect(await second.create("show:one", { title: "Overwritten" })).toBe(
      false,
    );
    expect(await second.get("show:one")).toEqual(original);
    const read = await second.get<typeof original>("show:one");
    read!.nested.owner = "B";
    expect(await first.get("show:one")).toEqual(original);
    expect(
      await first.update<typeof original, string>("show:one", (value) => {
        value.nested.owner = "B";
        return value.nested.owner;
      }),
    ).toBe("B");
    expect(await new LocalFileStore(directory).get("show:one")).toMatchObject({
      nested: { owner: "B" },
    });
    expect(
      (await readdir(directory)).filter(
        (name) => name === ".lock" || !name.endsWith(".json"),
      ),
    ).toEqual([]);
  });
  it("returns null only for absent records and releases the lock after missing updates", async () => {
    const store = new LocalFileStore(directory);
    expect(await store.get("absent")).toBeNull();
    await expect(store.update("absent", () => true)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(await store.create("present", { ok: true })).toBe(true);
  });
  it("serializes concurrent updates from independent instances without lost increments", async () => {
    const stores = [
      new LocalFileStore(directory),
      new LocalFileStore(directory),
    ];
    await stores[0].create<Counter>("counter", { count: 0, history: [] });
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        stores[i % 2].update<Counter, number>("counter", (value) => {
          value.count += 1;
          value.history.push(value.count);
          return value.count;
        }),
      ),
    );
    expect(new Set(results).size).toBe(40);
    expect(await stores[0].get("counter")).toEqual({
      count: 40,
      history: Array.from({ length: 40 }, (_, i) => i + 1),
    });
    expect(
      (await readdir(directory)).filter((name) => !name.endsWith(".json")),
    ).toEqual([]);
  }, 10_000);
  it("makes readers observe complete snapshots while other instances write", async () => {
    const writer = new LocalFileStore(directory),
      reader = new LocalFileStore(directory);
    await writer.create("atomic", {
      version: 0,
      payload: "0:" + "x".repeat(20_000),
    });
    let complete = false;
    const writing = Promise.all(
      Array.from({ length: 20 }, () =>
        writer.update<{ version: number; payload: string }, void>(
          "atomic",
          (value) => {
            value.version += 1;
            value.payload = `${value.version}:` + "x".repeat(20_000);
          },
        ),
      ),
    ).finally(() => {
      complete = true;
    });
    let reads = 0;
    do {
      const value = await reader.get<{ version: number; payload: string }>(
        "atomic",
      );
      expect(value).not.toBeNull();
      expect(value!.payload).toBe(`${value!.version}:` + "x".repeat(20_000));
      reads++;
    } while (!complete && reads < 2000);
    await writing;
    expect(reads).toBeGreaterThan(0);
    expect(await reader.get("atomic")).toMatchObject({ version: 20 });
  }, 10_000);
  it("does not persist a partially mutated callback that throws and remains usable afterward", async () => {
    const store = new LocalFileStore(directory);
    await store.create<Counter>("rollback", { count: 1, history: [1] });
    await expect(
      store.update<Counter, void>("rollback", (value) => {
        value.count = 99;
        value.history.push(99);
        throw new Error("abort this callback");
      }),
    ).rejects.toThrow("abort this callback");
    expect(await store.get("rollback")).toEqual({ count: 1, history: [1] });
    await store.update<Counter, void>("rollback", (value) => {
      value.count = 2;
      value.history.push(2);
    });
    expect(await store.get("rollback")).toEqual({ count: 2, history: [1, 2] });
  });
  it("preserves the previous snapshot on an oversized write and removes its lock", async () => {
    const store = new LocalFileStore(directory);
    await store.create("bounded", { body: "original" });
    await expect(
      store.update<{ body: string }, void>("bounded", (value) => {
        value.body = "x".repeat(2_000_001);
      }),
    ).rejects.toMatchObject({ status: 413, code: "storage_budget" });
    expect(await store.get("bounded")).toEqual({ body: "original" });
    expect((await readdir(directory)).length).toBe(1);
  });
  it("encodes IDs as flat filenames and writes private file permissions", async () => {
    const store = new LocalFileStore(directory);
    const id = "show:../../traversal/with?query#fragment";
    await store.create(id, { ok: true });
    const files = await readdir(directory);
    expect(files).toEqual([Buffer.from(id).toString("base64url") + ".json"]);
    if (process.platform !== "win32")
      expect((await stat(path.join(directory, files[0]))).mode & 0o777).toBe(
        0o600,
      );
  });
  it("coordinates the atomic lock across two actual Node processes", async () => {
    const store = new LocalFileStore(directory);
    await store.create<Counter>("cross-process", { count: 0, history: [] });
    const module = new URL("../src/server/store.ts", import.meta.url).href;
    const script = `import { LocalFileStore } from ${JSON.stringify(module)};
const store = new LocalFileStore(process.argv[1]);
for (let i = 0; i < 12; i++) await store.update('cross-process', value => { value.count += 1; value.history.push(value.count); });
process.stdout.write('done');`;
    const run = () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "--input-type=module",
            "--eval",
            script,
            directory,
          ],
          {
            cwd: fileURLToPath(new URL("..", import.meta.url)),
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let output = "",
          error = "";
        child.stdout.on("data", (chunk) => {
          output += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          error += String(chunk);
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve(output)
            : reject(new Error(`Store worker exited ${code}: ${error}`)),
        );
      });
    expect(await Promise.all([run(), run()])).toEqual(["done", "done"]);
    expect(await store.get("cross-process")).toEqual({
      count: 24,
      history: Array.from({ length: 24 }, (_, i) => i + 1),
    });
  }, 15_000);
  it("treats existing false and zero JSON values as records rather than missing documents", async () => {
    const store = new LocalFileStore(directory);
    await store.create("false-value", false);
    expect(await store.create("false-value", true)).toBe(false);
    await store.create("zero-value", 0);
    expect(await store.create("zero-value", 1)).toBe(false);
    expect(await store.get("false-value")).toBe(false);
    expect(await store.get("zero-value")).toBe(0);
    expect(
      await store.update<boolean, boolean>("false-value", (value) => value),
    ).toBe(false);
    expect(
      await store.update<number, number>("zero-value", (value) => value),
    ).toBe(0);
  });
  it("advances persisted revision for changed samples but skips an unchanged expiry callback", async () => {
    const store = new LocalFileStore(directory);
    type RevisionRecord = {
      state: {
        revision: number;
        sequence: number;
        anchor: { x: number; y: number };
      };
    };
    await store.create<RevisionRecord>("show:revision", {
      state: { revision: 7, sequence: 3, anchor: { x: 0.5, y: 0.5 } },
    });
    await store.update<RevisionRecord, void>("show:revision", (value) => {
      value.state.anchor.x = 0.7;
    });
    expect(await store.get("show:revision")).toMatchObject({
      state: { revision: 8, sequence: 3, anchor: { x: 0.7 } },
    });
    await store.update<RevisionRecord, void>("show:revision", () => undefined);
    expect(await store.get("show:revision")).toMatchObject({
      state: { revision: 8, sequence: 3 },
    });
  });
});
