import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { PostgresStore } from "@/server/store";
import { allocateSolo, type SoloQuota } from "@/server/solo-policy";
import { createRecord } from "@/server/core";
import { castVote, openRound } from "@/server/audience";
import type { ShowRecord } from "@/server/records";

// Explicit opt-in only. All input is a labeled synthetic fixture; random rows are deleted afterward.
const url = process.env.PORTAL_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "Postgres solo caps and synthetic audience batching",
  () => {
    let store: PostgresStore, key: string;
    beforeEach(() => {
      store = new PostgresStore(url!);
      key = `integration:solo-audience:${randomBytes(12).toString("hex")}`;
      vi.stubEnv("PORTAL_SOLO_PER_ACCOUNT_DAILY", "3");
      vi.stubEnv("PORTAL_SOLO_GLOBAL_DAILY", "4");
      vi.stubEnv("PORTAL_SOLO_GLOBAL_CONCURRENT", "2");
    });
    afterEach(async () => {
      vi.unstubAllEnvs();
      if (key)
        await neon(url!).query("DELETE FROM portal_documents WHERE id = $1", [
          key,
        ]);
    });
    it("atomically bounds simultaneous reservations from different accounts at the global concurrency cap", async () => {
      await store.create<SoloQuota>(key, { days: {}, active: {} });
      const now = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          store.update<SoloQuota, unknown>(key, (quota) =>
            allocateSolo(
              quota,
              `fixture-account-${i}`,
              `fixture-show-${i}`,
              `fixture-reservation-${i}`,
              now,
            ),
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(2);
      const saved = (await store.get<SoloQuota>(key))!;
      expect(Object.keys(saved.active)).toHaveLength(2);
      expect(Object.values(saved.days)[0].total).toBe(2);
    }, 45_000);
    it("shares one account's reservation cap across simultaneous browser sessions", async () => {
      await store.create<SoloQuota>(key, { days: {}, active: {} });
      const now = Date.now();
      const results = await Promise.allSettled(
        [1, 2, 3].map((i) =>
          store.update<SoloQuota, unknown>(key, (quota) =>
            allocateSolo(
              quota,
              "same-fixture-twitch-account",
              `fixture-show-${i}`,
              `fixture-reservation-${i}`,
              now,
            ),
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const saved = (await store.get<SoloQuota>(key))!;
      expect(
        Object.values(saved.days)[0].accounts["same-fixture-twitch-account"],
      ).toBe(1);
    }, 45_000);
    it("persists a synthetic100-choice burst with five batched mutations and deduplicates redelivery", async () => {
      const now = Date.now(),
        record = createRecord(
          "ps_synthetic_burst_fixture",
          "fixture-owner",
          "rehearsal",
          now,
        );
      record.state.phase = "live";
      record.state.preset.roundSeconds = 90;
      openRound(record, "weather", now);
      await store.create(key, record);
      const started = performance.now();
      for (let batch = 0; batch < 5; batch++)
        await store.update<ShowRecord, void>(key, (value) => {
          for (let i = 0; i < 20; i++) {
            const index = batch * 20 + i;
            castVote(
              value,
              `fixture-voter-${index}`,
              `fixture-message-${index}`,
              index % 2 ? "wild" : "gentle",
              now + 1,
              Date.now(),
              true,
            );
          }
        });
      const elapsedMs = Math.round(performance.now() - started);
      await store.update<ShowRecord, void>(key, (value) => {
        for (let i = 0; i < 20; i++)
          castVote(
            value,
            `fixture-voter-${i}`,
            `fixture-message-${i}`,
            "wild",
            now + 1,
            Date.now(),
            true,
          );
      });
      const saved = (await store.get<ShowRecord>(key))!;
      expect(saved.state.round).toMatchObject({
        uniqueVoters: 100,
        tallies: { gentle: 50, wild: 50 },
      });
      expect(
        saved.state.events.filter((event) => event.type === "round.vote"),
      ).toHaveLength(100);
      console.info(
        "portal.synthetic-burst " +
          JSON.stringify({
            events: 100,
            batchSize: 20,
            mutationsRequested: 5,
            elapsedMs,
            redeliveryAddedVotes: 0,
            provenance:
              "synthetic Postgres fixture; not Twitch or media latency",
          }),
      );
    }, 45_000);
  },
);
