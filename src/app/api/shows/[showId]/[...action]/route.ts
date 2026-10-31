import { assert } from "@/server/errors";
import { requireDirector } from "@/server/core";
import { parseAction } from "@/server/schema";
import {
  hashData,
  jsonBody,
  jsonError,
  jsonResponse,
  requireSameOrigin,
} from "@/server/security";
import {
  actorFor,
  command,
  createOutputGrant,
  currentShow,
  invite,
  lease,
  loadRecord,
  revokeGuest,
} from "@/server/shows";
import {
  closeMedia,
  fenceMedia,
  mintMediaToken,
  removeMediaParticipant,
} from "@/server/media";
import { chatHealth, connectChat, ingestChat } from "@/server/twitch";
type Context = { params: Promise<{ showId: string; action: string[] }> };
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const { showId, action: parts } = await context.params,
      route = parts.join("/");
    const body = await jsonBody(request);
    if (route === "action") {
      const parsed = parseAction(body),
        result = await command(showId, request, parsed);
      if (
        parsed.action.type === "end" ||
        parsed.action.type === "restore-rehearsal"
      )
        await closeMedia(showId).catch(() => undefined);
      if (
        parsed.action.type === "leave" ||
        (parsed.action.type === "consent" && !parsed.action.broadcast)
      )
        await removeMediaParticipant(
          showId,
          result.slot!,
          result.show.epoch,
        ).catch(() => undefined);
      return jsonResponse(result);
    }
    if (route === "lease") {
      assert(
        typeof body.clientId === "string" &&
          (body.takeover === undefined || typeof body.takeover === "boolean"),
        400,
        "renderer_id",
        "A director tab identifier is required.",
      );
      assert(
        body.epoch === undefined ||
          (Number.isSafeInteger(body.epoch) && Number(body.epoch) >= 0),
        400,
        "renderer_epoch",
        "A valid director epoch is required.",
      );
      const result = await lease(
        showId,
        request,
        body.clientId,
        body.takeover === true,
        body.epoch as number | undefined,
      );
      if (result.changed)
        await fenceMedia(showId, result.oldEpoch).catch(() => undefined);
      return jsonResponse(result.envelope);
    }
    if (route === "invite") {
      assert(
        body.slot === "B" || body.slot === undefined,
        400,
        "guest_slot",
        "Invite the second performer to stage B.",
      );
      return jsonResponse(await invite(showId, request, "B"));
    }
    if (route === "revoke-invite") {
      const result = await revokeGuest(showId, request);
      await removeMediaParticipant(showId, "B", result.show.epoch).catch(
        () => undefined,
      );
      return jsonResponse(result);
    }
    if (route === "output-grant")
      return jsonResponse(await createOutputGrant(showId, request));
    if (route === "media/token")
      return jsonResponse(await mintMediaToken(showId, request, body));
    if (route === "twitch/session") {
      await connectChat(showId, request, body);
      return jsonResponse(await currentShow(showId, request));
    }
    if (route === "twitch/health") {
      await chatHealth(showId, request, body);
      return jsonResponse({ ok: true });
    }
    if (route === "twitch/events")
      return jsonResponse(await ingestChat(showId, request, body));
    return jsonResponse(
      { error: "This control does not exist.", code: "not_found" },
      404,
    );
  } catch (error) {
    return jsonError(error);
  }
}
export async function GET(request: Request, context: Context) {
  try {
    const { showId, action: parts } = await context.params;
    assert(
      parts.join("/") === "evidence",
      404,
      "not_found",
      "This view does not exist.",
    );
    const record = await loadRecord(showId),
      actor = await actorFor(record, request);
    requireDirector(actor);
    const evidence = {
      format: "portal-stage.trace/v1",
      exportedAt: new Date().toISOString(),
      provenance:
        record.state.mode === "rehearsal"
          ? "Synthetic rehearsal; not proof of remote humans or Twitch participation."
          : "Live-mode semantic event trace; real media and audience claims require accompanying recordings.",
      showId,
      mode: record.state.mode,
      epoch: record.state.epoch,
      sequence: record.state.sequence,
      umbrella: record.state.umbrella,
      creature: record.state.creature,
      preset: record.state.preset,
      round: record.state.round,
      events: record.state.events.map((event) => ({
        ...event,
        summary: event.summary
          .replaceAll(record.state.participants.A.name, "Performer A")
          .replaceAll(record.state.participants.B.name, "Performer B"),
      })),
    };
    return jsonResponse({ ...evidence, checksum: hashData(evidence) }, 200, {
      "Content-Disposition": `attachment; filename="portal-stage-${showId}-trace.json"`,
    });
  } catch (error) {
    return jsonError(error);
  }
}
