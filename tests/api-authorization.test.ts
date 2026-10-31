import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const memory = vi.hoisted(() => new Map<string, unknown>());
const hooks = vi.hoisted(() => ({
  beforeUpdate: null as ((id: string) => void) | null,
}));
vi.mock("@/server/store", () => ({
  getStore: () => ({
    get: async (id: string) => structuredClone(memory.get(id) ?? null),
    create: async (id: string, value: unknown) => {
      if (memory.has(id)) return false;
      memory.set(id, structuredClone(value));
      return true;
    },
    update: async (id: string, change: (value: any) => unknown) => {
      hooks.beforeUpdate?.(id);
      if (!memory.has(id)) throw new Error("missing fixture");
      const value = structuredClone(memory.get(id));
      const result = change(value);
      memory.set(id, value);
      return result;
    },
  }),
}));
vi.mock("livekit-server-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("livekit-server-sdk")>();
  return {
    ...actual,
    RoomServiceClient: class {
      async createRoom() {
        return {};
      }
      async removeParticipant() {}
      async deleteRoom() {}
    },
  };
});
import { createRecord, acquireLease } from "@/server/core";
import {
  actorFor,
  command,
  createOutputGrant,
  invitationInfo,
  invite,
  joinShow,
  lease,
  releaseLease,
  redeemOutput,
  revokeGuest,
  revokeOutputs,
} from "@/server/shows";
import { digest, sign, signedCookie } from "@/server/security";
import { mintMediaToken } from "@/server/media";
import { TokenVerifier } from "livekit-server-sdk";
import type { ShowRecord } from "@/server/records";
const id = "ps_0123456789abcdef",
  host = "123e4567-e89b-12d3-a456-426614174000",
  guest = "123e4567-e89b-12d3-a456-426614174001";
function request(who = host, extraCookie = "") {
  return new Request("http://localhost:3200/api", {
    headers: {
      Origin: "http://localhost:3200",
      Cookie: `portal_session=${sign({ id: who, expiresAt: Date.now() + 3600_000 })}; ${extraCookie}`,
    },
  });
}
function record() {
  return memory.get("show:" + id) as ShowRecord;
}
beforeEach(() => {
  hooks.beforeUpdate = null;
  memory.clear();
  vi.stubEnv(
    "SESSION_SECRET",
    "test-only-session-secret-not-a-real-credential",
  );
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "11".repeat(32));
  vi.stubEnv("APP_BASE_URL", "http://localhost:3200");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("LIVEKIT_URL", "ws://127.0.0.1:7880");
  vi.stubEnv("LIVEKIT_API_KEY", "fixture-key");
  vi.stubEnv(
    "LIVEKIT_API_SECRET",
    "fixture-signing-secret-at-least-32-characters",
  );
  const state = createRecord(id, host, "live", Date.now());
  acquireLease(state, "fixture-renderer", false, Date.now());
  state.participantSessions.B = guest;
  for (const p of Object.values(state.state.participants)) {
    p.joined = true;
    p.consentBroadcast = true;
    p.calibrated = true;
  }
  memory.set("show:" + id, state);
});
afterEach(() => vi.unstubAllEnvs());
describe("show and media role boundaries", () => {
  it("reclaims a promptly reloaded renderer without losing its pending offer and fences the old page", async () => {
    await lease(
      id,
      request(),
      "fixture-renderer",
      false,
      undefined,
      "first-page-mount",
      1,
    );
    for (const p of Object.values(record().state.participants))
      Object.assign(p, {
        connected: true,
        camera: true,
        ready: true,
        admitted: true,
        lastSeenAt: Date.now(),
      });
    await command(id, request(), {
      action: { type: "start" },
      idempotencyKey: "reload-start",
      incarnationId: "first-page-mount",
      incarnationSequence: 1,
      rendererId: "fixture-renderer",
      epoch: 1,
    });
    await command(id, request(), {
      action: { type: "offer" },
      idempotencyKey: "reload-offer",
      incarnationId: "first-page-mount",
      incarnationSequence: 1,
      rendererId: "fixture-renderer",
      epoch: 1,
      expectedVersion: 1,
    });
    const before = structuredClone(record().state);
    expect(
      await releaseLease(
        id,
        request(),
        "fixture-renderer",
        1,
        "first-page-mount",
        1,
      ),
    ).toEqual({ released: true });
    const resumed = await lease(
      id,
      request(),
      "fixture-renderer",
      false,
      undefined,
      "second-page-mount",
      2,
    );
    expect(resumed.changed).toBe(false);
    expect(resumed.rendererChanged).toBe(true);
    expect(resumed.oldIncarnationId).toBe("first-page-mount");
    expect(resumed.envelope.show).toMatchObject({
      phase: "live",
      epoch: 1,
      beat: before.beat,
      umbrella: before.umbrella,
    });
    expect(resumed.envelope.show.renderLease.releasedAt).toBeUndefined();
    expect(
      await releaseLease(
        id,
        request(),
        "fixture-renderer",
        1,
        "first-page-mount",
        1,
      ),
    ).toEqual({ released: false });
    await expect(
      lease(id, request(), "fixture-renderer", false, 1, "first-page-mount", 1),
    ).rejects.toMatchObject({ code: "renderer_fenced" });
    await expect(
      lease(
        id,
        request(),
        "fixture-renderer",
        false,
        undefined,
        "first-page-mount",
        1,
      ),
    ).rejects.toMatchObject({ code: "renderer_fenced" });
    await expect(
      command(id, request(), {
        action: {
          type: "cancel-offer",
          transferId: before.umbrella.transfer!.id,
        },
        idempotencyKey: "old-mount-command",
        rendererId: "fixture-renderer",
        epoch: 1,
        expectedVersion: before.umbrella.version,
        incarnationId: "first-page-mount",
        incarnationSequence: 1,
      }),
    ).rejects.toMatchObject({ code: "renderer_fenced" });
    await expect(
      mintMediaToken(id, request(), {
        purpose: "director",
        rendererId: "fixture-renderer",
        epoch: 1,
        incarnationId: "first-page-mount",
        incarnationSequence: 1,
      }),
    ).rejects.toMatchObject({ code: "renderer_fenced" });
    const currentMedia = await mintMediaToken(id, request(), {
      purpose: "director",
      rendererId: "fixture-renderer",
      epoch: 1,
      incarnationId: "second-page-mount",
      incarnationSequence: 2,
    });
    expect(currentMedia.identity).toBe(`director-${id}-1-second-page-mount`);
    const claims = await new TokenVerifier(
      "fixture-key",
      "fixture-signing-secret-at-least-32-characters",
    ).verify(currentMedia.token);
    expect(JSON.parse(claims.metadata!)).toMatchObject({
      incarnationId: "second-page-mount",
      incarnationSequence: 2,
    });
    expect(record().state.umbrella).toEqual(before.umbrella);
  });
  it("does not let a late renewal undo its pagehide release or an equal-sequence duplicate replace the page", async () => {
    await lease(
      id,
      request(),
      "fixture-renderer",
      false,
      undefined,
      "first-page-mount",
      1,
    );
    await releaseLease(
      id,
      request(),
      "fixture-renderer",
      1,
      "first-page-mount",
      1,
    );
    await expect(
      lease(id, request(), "fixture-renderer", false, 1, "first-page-mount", 1),
    ).rejects.toMatchObject({ code: "renderer_fenced" });
    await expect(
      lease(
        id,
        request(),
        "fixture-renderer",
        false,
        undefined,
        "duplicate-page-mount",
        1,
      ),
    ).rejects.toMatchObject({ code: "renderer_fenced" });
    expect(record().state.renderLease.releasedAt).toBeGreaterThan(0);
  });
  it("holds a genuinely expired reload and never acquires an ended renderer", async () => {
    await lease(
      id,
      request(),
      "fixture-renderer",
      false,
      undefined,
      "first-page-mount",
      1,
    );
    record().state.phase = "live";
    record().state.renderLease.expiresAt = Date.now() - 1;
    const recovered = await lease(
      id,
      request(),
      "fixture-renderer",
      false,
      undefined,
      "second-page-mount",
      2,
    );
    expect(recovered.envelope.show).toMatchObject({ phase: "hold", epoch: 2 });
    record().state.phase = "ended";
    await expect(
      lease(
        id,
        request(),
        "fixture-renderer",
        false,
        undefined,
        "third-page-mount",
        3,
      ),
    ).rejects.toMatchObject({ code: "show_ended" });
  });
  it("replaces a lost guest session while preserving a migrated Program pairing", async () => {
    record().inviteGeneration = 4;
    delete record().outputGeneration;
    const output = await createOutputGrant(id, request());
    const redeemed = await redeemOutput(id, output.code, request());
    delete record().outputGeneration; // An already-redeemed pre-migration pairing.
    const program = new Request("http://localhost:3200/api", {
      headers: {
        Cookie: signedCookie("portal_program_" + id, redeemed.token).split(
          ";",
        )[0],
      },
    });
    await revokeGuest(id, request());
    expect(record().outputGeneration).toBe(4);
    expect(record().inviteGeneration).toBe(5);
    expect((await actorFor(record(), program, true)).role).toBe("program");
    await expect(actorFor(record(), request(guest))).rejects.toMatchObject({
      code: "show_access",
    });
    const invitation = await invite(id, request(), "B"),
      replacement = "123e4567-e89b-12d3-a456-426614174002";
    const joined = await joinShow(
      invitation.code,
      "New guest",
      replacement,
      request(replacement),
    );
    expect(joined.show.participants.B).toMatchObject({
      joined: true,
      ready: false,
      admitted: false,
      consentBroadcast: false,
    });
    expect((await actorFor(record(), program, true)).role).toBe("program");
    await expect(
      mintMediaToken(id, request(guest), { purpose: "performer" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("explicitly unpairs outputs without revoking the guest, including issued but unconnected viewers", async () => {
    const output = await createOutputGrant(id, request());
    const redeemed = await redeemOutput(id, output.code, request());
    const program = new Request("http://localhost:3200/api", {
      headers: {
        Cookie: signedCookie("portal_program_" + id, redeemed.token).split(
          ";",
        )[0],
      },
    });
    const media = await mintMediaToken(id, program, { purpose: "output-view" });
    const revoked = await revokeOutputs(id, request());
    expect(revoked.identities).toEqual([media.identity]);
    expect(record().outputIdentities).toEqual([]);
    expect((await actorFor(record(), request(guest))).role).toBe("performer");
    await expect(actorFor(record(), program, true)).rejects.toMatchObject({
      status: 403,
    });
    const fresh = await createOutputGrant(id, request());
    await expect(
      redeemOutput(id, fresh.code, request()),
    ).resolves.toMatchObject({ result: { role: "program" } });
  });
  it("rejects non-string media purposes before issuing any token", async () => {
    for (const purpose of [
      ["performer"],
      ["director"],
      ["output-view"],
      {},
      null,
      1,
      "unknown",
    ]) {
      await expect(
        mintMediaToken(id, request(guest), { purpose }),
      ).rejects.toMatchObject({ status: 400, code: "media_purpose" });
    }
  });
  it("permits an explicitly configured optimized loopback rehearsal but never a cloud rehearsal grant", async () => {
    record().state.mode = "rehearsal";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORTAL_LOCAL_MEDIA_TEST", "1");
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).resolves.toMatchObject({ purpose: "output-view" });
    vi.stubEnv("VERCEL", "1");
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ status: 403, code: "rehearsal_media" });
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("LIVEKIT_URL", "wss://project.livekit.cloud");
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ status: 403, code: "rehearsal_media" });
  });
  it("replaces unused invitation links without revoking a joined guest or program grant", async () => {
    const first = await invite(id, request(), "B");
    const output = await createOutputGrant(id, request());
    const redeemed = await redeemOutput(id, output.code, request());
    const cookie = signedCookie("portal_program_" + id, redeemed.token).split(
      ";",
    )[0];
    const generation = record().inviteGeneration;
    const second = await invite(id, request(), "B");
    await expect(invitationInfo(first.code)).rejects.toMatchObject({
      status: 410,
      code: "invite_replaced",
    });
    await expect(invitationInfo(second.code)).resolves.toMatchObject({
      showId: id,
      slot: "B",
    });
    expect(record().inviteGeneration).toBe(generation);
    expect((await actorFor(record(), request(guest))).role).toBe("performer");
    expect(
      (
        await actorFor(
          record(),
          new Request("http://localhost:3200/api", {
            headers: { Cookie: cookie },
          }),
        )
      ).role,
    ).toBe("program");
  });
  it("rechecks the active invitation inside redemption after a concurrent replacement", async () => {
    delete record().participantSessions.B;
    const invitation = await invite(id, request(), "B");
    hooks.beforeUpdate = (key) => {
      if (key.startsWith("invite:"))
        record().activeInvitations = { B: "replacement" };
    };
    await expect(
      joinShow(invitation.code, "Guest", guest, request(guest)),
    ).rejects.toMatchObject({ status: 410, code: "invite_replaced" });
    expect(record().participantSessions.B).toBeUndefined();
  });
  it("does not let a stale epoch renew an already replaced director authority", async () => {
    acquireLease(record(), "new-renderer-tab", true, Date.now());
    const epoch = record().state.epoch;
    await expect(
      lease(id, request(), "fixture-renderer", false, epoch - 1),
    ).rejects.toMatchObject({ status: 409, code: "renderer_fenced" });
    expect(record().state.epoch).toBe(epoch);
    expect(record().state.renderLease.clientId).toBe("new-renderer-tab");
  });
  it("keeps output grants read-only even in a director browser", async () => {
    const media = await mintMediaToken(id, request(), {
      purpose: "output-view",
    });
    const claims = await new TokenVerifier(
      "fixture-key",
      "fixture-signing-secret-at-least-32-characters",
    ).verify(media.token);
    expect(media.room).toBe(`portal-${id}-program`);
    expect(claims.video).toMatchObject({
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
      canUpdateOwnMetadata: false,
      roomAdmin: false,
    });
    expect((await actorFor(record(), request(), true)).role).toBe("program");
  });
  it("bounds performer grants and cannot issue broad director privileges to a guest", async () => {
    const media = await mintMediaToken(id, request(guest), {
      purpose: "performer",
    });
    const claims = await new TokenVerifier(
      "fixture-key",
      "fixture-signing-secret-at-least-32-characters",
    ).verify(media.token);
    expect(claims.video?.room).toBe(`portal-${id}-backstage`);
    expect(claims.video?.canPublishSources).toEqual(["camera", "microphone"]);
    expect(claims.video?.canUpdateOwnMetadata).toBe(false);
    expect(record().state.participants.B).toMatchObject({
      ready: false,
      admitted: false,
      microphone: false,
    });
    await expect(
      mintMediaToken(id, request(guest), {
        purpose: "director",
        rendererId: "fixture-renderer",
        epoch: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("requires consent and forbids production rehearsal media spend", async () => {
    record().state.participants.B.consentBroadcast = false;
    await expect(
      mintMediaToken(id, request(guest), { purpose: "performer" }),
    ).rejects.toMatchObject({ status: 409 });
    record().state.mode = "rehearsal";
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects expired and revoked invitations before any media permission", async () => {
    delete record().participantSessions.B;
    const invitation = await invite(id, request(), "B");
    const key = "invite:" + digest(invitation.code),
      stored = memory.get(key) as { expiresAt: number };
    stored.expiresAt = Date.now() - 1;
    await expect(invitationInfo(invitation.code)).rejects.toMatchObject({
      status: 410,
    });
    stored.expiresAt = Date.now() + 60_000;
    await revokeGuest(id, request());
    await expect(
      joinShow(invitation.code, "Guest", guest, request(guest)),
    ).rejects.toMatchObject({ status: 410 });
  });
  it("exchanges a single invitation for a private, unready guest session", async () => {
    delete record().participantSessions.B;
    const invitation = await invite(id, request(), "B");
    const result = await joinShow(
      invitation.code,
      "Second performer",
      guest,
      request(guest),
    );
    expect(result.role).toBe("performer");
    expect(result.slot).toBe("B");
    expect(result.show.participants.B).toMatchObject({
      joined: true,
      ready: false,
      admitted: false,
      consentBroadcast: false,
      camera: false,
    });
    await expect(
      joinShow(
        invitation.code,
        "Another",
        "123e4567-e89b-12d3-a456-426614174002",
        request(guest),
      ),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      command(id, request(guest), {
        action: { type: "start" },
        idempotencyKey: "guest-start-command",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("redeems output once and never turns an output cookie into director control", async () => {
    const grant = await createOutputGrant(id, request());
    const redeemed = await redeemOutput(id, grant.code, request());
    const cookie = signedCookie("portal_program_" + id, redeemed.token).split(
      ";",
    )[0];
    const program = new Request("http://localhost:3200/api", {
      headers: { Cookie: cookie },
    });
    expect((await actorFor(record(), program)).role).toBe("program");
    await expect(
      command(id, program, {
        action: { type: "end" },
        idempotencyKey: "output-cannot-end",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(redeemOutput(id, grant.code, request())).rejects.toMatchObject(
      { status: 410 },
    );
  });
});
