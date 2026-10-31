import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, unknown>());
const provider = vi.hoisted(() => ({
  createRoom: vi.fn(async () => ({})),
  deleteRoom: vi.fn(async (_name: string) => undefined),
  removeParticipant: vi.fn(async () => undefined),
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
      if (!memory.has(id)) throw new Error("Missing test document.");
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
      createRoom = provider.createRoom;
      deleteRoom = provider.deleteRoom;
      removeParticipant = provider.removeParticipant;
    },
  };
});

import { acquireLease, createRecord } from "../src/server/core";
import { mintMediaToken } from "../src/server/media";
import {
  actorFor,
  command,
  createOutputGrant,
  invitationInfo,
  invite,
  joinShow,
  redeemOutput,
} from "../src/server/shows";
import { sign, signedCookie } from "../src/server/security";
import type { ShowRecord } from "../src/server/records";
import { POST } from "../src/app/api/shows/[showId]/[...action]/route";

const id = "ps_1123456789abcdef";
const host = "123e4567-e89b-12d3-a456-426614174000",
  guest = "123e4567-e89b-12d3-a456-426614174001";
const renderer = "transport-test-renderer";
function record() {
  return memory.get(`show:${id}`) as ShowRecord;
}
function cookie(who = host) {
  return `portal_session=${sign({ id: who, expiresAt: Date.now() + 3600_000 })}`;
}
function request(who = host) {
  return new Request("http://localhost:3200/api", {
    headers: { Origin: "http://localhost:3200", Cookie: cookie(who) },
  });
}
async function joinGuest() {
  const invitation = await invite(id, request(), "B");
  await joinShow(
    invitation.code,
    "Invited test performer",
    guest,
    request(guest),
  );
  return invitation;
}
async function restore() {
  return POST(
    new Request(`http://localhost:3200/api/shows/${id}/action`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3200",
        Cookie: cookie(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: { type: "restore-rehearsal" },
        idempotencyKey: "restore-transport-test",
        rendererId: renderer,
        epoch: record().state.epoch,
      }),
    }),
    { params: Promise.resolve({ showId: id, action: ["action"] }) },
  );
}

beforeEach(() => {
  memory.clear();
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", "transport-tests-only-session-signing-secret");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3200");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("LIVEKIT_URL", "ws://127.0.0.1:7880");
  vi.stubEnv("LIVEKIT_API_KEY", "transport-test-key");
  vi.stubEnv(
    "LIVEKIT_API_SECRET",
    "transport-test-signing-secret-at-least-32-characters",
  );
  const value = createRecord(id, host, "rehearsal", Date.now());
  acquireLease(value, renderer, false, Date.now());
  memory.set(`show:${id}`, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("rehearsal transport through server entry points", () => {
  it("marks a real backstage grant as LiveKit transport and removes implicit fixture readiness", async () => {
    expect(record().state.transport).toBe("fixture");
    await mintMediaToken(id, request(), {
      purpose: "director",
      rendererId: renderer,
      epoch: 1,
    });
    expect(provider.createRoom).toHaveBeenCalled();
    expect(record().state).toMatchObject({
      mode: "rehearsal",
      transport: "livekit",
      participants: {
        A: {
          ready: false,
          admitted: false,
          connected: false,
          camera: false,
          microphone: false,
        },
      },
    });
  });
  it("does not turn an ordinary fixture scene into LiveKit participation just for a read-only output grant", async () => {
    await mintMediaToken(id, request(), { purpose: "output-view" });
    expect(record().state.transport).toBe("fixture");
    expect(record().state.participants.A.ready).toBe(true);
  });
  it("switches to LiveKit participation when an actual private guest joins, before any device permission", async () => {
    await joinGuest();
    expect(record().state.transport).toBe("livekit");
    expect(record().participantSessions.B).toBe(guest);
    expect(record().state.participants.B).toMatchObject({
      name: "Invited test performer",
      joined: true,
      connected: false,
      camera: false,
      microphone: false,
      consentBroadcast: false,
      ready: false,
      admitted: false,
    });
    expect(provider.createRoom).not.toHaveBeenCalled();
  });
  it("restores fixture mode through the route, closes both media rooms, and revokes old semantic access", async () => {
    const oldInvitation = await joinGuest();
    const extraInvitation = await invite(id, request(), "B");
    record().state.phase = "live";
    record().state.umbrella.owner = "B";
    record().state.umbrella.version = 9;
    record().state.umbrella.wetness = 0.61;
    record().state.creature.hatched = true;
    record().state.creature.shelterOwner = "B";
    const preset = {
      ...record().state.preset,
      id: "same-scene",
      name: "Same Scene",
      episodeTitle: "Still the Same Storm",
    };
    await command(id, request(), {
      action: { type: "save-preset", preset },
      idempotencyKey: "transport-save-preset",
      rendererId: renderer,
      epoch: 1,
    });
    await command(id, request(), {
      action: { type: "load-preset", presetId: preset.id },
      idempotencyKey: "transport-load-preset",
      rendererId: renderer,
      epoch: 1,
    });
    const output = await createOutputGrant(id, request());
    const redeemed = await redeemOutput(id, output.code, request());
    const outputCookie = signedCookie(
      `portal_program_${id}`,
      redeemed.token,
    ).split(";")[0];
    const programRequest = new Request("http://localhost:3200/api", {
      headers: { Cookie: outputCookie },
    });
    expect((await actorFor(record(), request(guest))).role).toBe("performer");
    expect((await actorFor(record(), programRequest)).role).toBe("program");
    const preserved = structuredClone({
      umbrella: record().state.umbrella,
      creature: record().state.creature,
      preset: record().state.preset,
      savedPresets: record().state.savedPresets,
    });
    const generation = record().inviteGeneration;
    const response = await restore();
    expect(response.status).toBe(200);
    expect((await response.json()).show).toMatchObject({
      mode: "rehearsal",
      transport: "fixture",
      phase: "hold",
      ...preserved,
    });
    expect(record().inviteGeneration).toBe(generation + 1);
    expect(record().participantSessions).toEqual({ A: host });
    expect(provider.deleteRoom).toHaveBeenCalledWith(`portal-${id}-backstage`);
    expect(provider.deleteRoom).toHaveBeenCalledWith(`portal-${id}-program`);
    expect(provider.deleteRoom).toHaveBeenCalledTimes(2);
    await expect(invitationInfo(oldInvitation.code)).rejects.toMatchObject({
      status: 410,
      code: "invite_revoked",
    });
    await expect(invitationInfo(extraInvitation.code)).rejects.toMatchObject({
      status: 410,
      code: "invite_revoked",
    });
    await expect(actorFor(record(), request(guest))).rejects.toMatchObject({
      status: 403,
      code: "show_access",
    });
    await expect(actorFor(record(), programRequest)).rejects.toMatchObject({
      status: 403,
      code: "show_access",
    });
    await expect(
      command(id, request(guest), {
        action: {
          type: "presence",
          connected: true,
          camera: true,
          microphone: true,
        },
        idempotencyKey: "old-guest-cannot-rejoin",
      }),
    ).rejects.toMatchObject({ status: 403, code: "role_revoked" });
  });
  it("never closes real live-show media in response to forbidden fixture restoration", async () => {
    record().state.mode = "live";
    record().state.transport = "livekit";
    const response = await restore();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "fixture_only" });
    expect(provider.deleteRoom).not.toHaveBeenCalled();
    expect(record().state.transport).toBe("livekit");
  });
  it("rejects stale director presence inside the LiveKit rehearsal API transaction", async () => {
    await joinGuest();
    acquireLease(record(), "replacement-media-tab", true, Date.now());
    const before = structuredClone(record());
    await expect(
      command(id, request(), {
        action: {
          type: "presence",
          connected: false,
          camera: false,
          microphone: false,
        },
        idempotencyKey: "old-renderer-disconnect",
        rendererId: renderer,
        epoch: 1,
      }),
    ).rejects.toMatchObject({ code: "renderer_fenced", status: 409 });
    expect(record()).toEqual(before);
  });
  it("uses the invited receiver's session for LiveKit rehearsal acceptance instead of a director impersonation", async () => {
    await joinGuest();
    record().state.phase = "live";
    for (const person of Object.values(record().state.participants))
      Object.assign(person, {
        connected: true,
        camera: true,
        ready: true,
        admitted: true,
        consentBroadcast: true,
        calibrated: true,
        lastSeenAt: Date.now(),
      });
    await command(id, request(), {
      action: { type: "offer" },
      idempotencyKey: "livekit-rehearsal-offer",
      rendererId: renderer,
      epoch: 1,
      expectedVersion: record().state.umbrella.version,
    });
    const transferId = record().state.umbrella.transfer!.id;
    const version = record().state.umbrella.version;
    await expect(
      command(id, request(), {
        action: { type: "accept", transferId, slot: "B" },
        idempotencyKey: "host-cannot-act-as-guest",
        rendererId: renderer,
        epoch: 1,
        expectedVersion: version,
      }),
    ).rejects.toMatchObject({ status: 403, code: "performer_required" });
    expect(record().state.umbrella.owner).toBe("A");
    await command(id, request(guest), {
      action: { type: "accept", transferId },
      idempotencyKey: "invited-receiver-accepts",
      epoch: 1,
      expectedVersion: version,
    });
    expect(record().state.umbrella.owner).toBe("B");
  });
});
