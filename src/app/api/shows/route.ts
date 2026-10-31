import { assert } from "@/server/errors";
import {
  jsonBody,
  jsonError,
  jsonResponse,
  requireSameOrigin,
  session,
} from "@/server/security";
import { createShow } from "@/server/shows";
import { EPISODES, type EpisodeId } from "@/lib/show-grammar";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const auth = session(request),
      body = await jsonBody(request);
    assert(
      body.mode === "live" || body.mode === "rehearsal" || body.mode === "solo",
      400,
      "show_mode",
      "Choose a live show or a labeled rehearsal.",
    );
    assert(
      body.episode === undefined ||
        EPISODES.includes(body.episode as EpisodeId),
      400,
      "episode",
      "Choose one of the authored episodes.",
    );
    return jsonResponse(
      await createShow(
        auth.id,
        body.mode,
        request,
        body.episode as EpisodeId | undefined,
      ),
      201,
    );
  } catch (error) {
    return jsonError(error);
  }
}
