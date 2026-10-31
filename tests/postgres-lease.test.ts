import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { acquireLease, createRecord, LEASE_MS } from "../src/server/core";
import { PostgresStore } from "../src/server/store";
import type { ShowRecord } from "../src/server/records";

// Explicit opt-in; creates and deletes only random fixture rows.
const url = process.env.PORTAL_TEST_DATABASE_URL;
describe.skipIf(!url)("Postgres renderer lease integration", () => {
  let store: PostgresStore, key: string;
  const owner = "integration-fixture-owner",
    renderer = "integration-renderer";
  beforeEach(async () => {
    store = new PostgresStore(url!);
    const id = "ps_" + randomBytes(8).toString("hex");
    key = "show:" + id;
    const record = createRecord(id, owner, "live", Date.now());
    acquireLease(record, renderer, false, Date.now());
    await store.create(key, record);
  });
  afterEach(async () => {
    if (key)
      await neon(url!).query("DELETE FROM portal_documents WHERE id = $1", [
        key,
      ]);
  });
  it("renews while a concurrent state mutation preserves both results", async () => {
    const before = (await store.get<ShowRecord>(key))!;
    const [renewed] = await Promise.all([
      store.renewShowLease(key, owner, renderer, before.state.epoch, LEASE_MS),
      store.update<ShowRecord, void>(key, (record) => {
        record.state.umbrella.wetness = 0.42;
      }),
    ]);
    expect(renewed).not.toBeNull();
    const after = (await store.get<ShowRecord>(key))!;
    expect(after.state.umbrella.wetness).toBe(0.42);
    expect(after.state.renderLease.expiresAt).toBeGreaterThan(
      before.state.renderLease.expiresAt,
    );
    expect(after.state.revision).toBe(before.state.revision + 2);
    expect(after.state.sequence).toBe(before.state.sequence);
  }, 30_000);
  it("refuses wrong owner, renderer, stale epoch, expired lease, and ended show", async () => {
    const epoch = (await store.get<ShowRecord>(key))!.state.epoch;
    expect(
      await store.renewShowLease(
        key,
        "another-owner",
        renderer,
        epoch,
        LEASE_MS,
      ),
    ).toBeNull();
    expect(
      await store.renewShowLease(
        key,
        owner,
        "another-renderer",
        epoch,
        LEASE_MS,
      ),
    ).toBeNull();
    expect(
      await store.renewShowLease(key, owner, renderer, epoch - 1, LEASE_MS),
    ).toBeNull();
    await store.update<ShowRecord, void>(key, (record) => {
      record.state.renderLease.expiresAt = Date.now() - 1;
    });
    expect(
      await store.renewShowLease(key, owner, renderer, epoch, LEASE_MS),
    ).toBeNull();
    await store.update<ShowRecord, void>(key, (record) => {
      record.state.renderLease.expiresAt = Date.now() + LEASE_MS;
      record.state.phase = "ended";
    });
    expect(
      await store.renewShowLease(key, owner, renderer, epoch, LEASE_MS),
    ).toBeNull();
  }, 30_000);
  it("enforces the rate limit and does not write an unchanged snapshot", async () => {
    await store.update<ShowRecord, void>(key, (record) => {
      record.rates["lease:" + renderer] = { at: Date.now(), count: 30 };
    });
    const before = (await store.get<ShowRecord>(key))!;
    expect(
      await store.renewShowLease(
        key,
        owner,
        renderer,
        before.state.epoch,
        LEASE_MS,
      ),
    ).toBeNull();
    await store.update<ShowRecord, void>(key, () => undefined);
    expect((await store.get<ShowRecord>(key))!.state.revision).toBe(
      before.state.revision,
    );
  }, 30_000);
});
