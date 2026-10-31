import { assert } from "@/server/errors";
import {
  jsonBody,
  jsonError,
  jsonResponse,
  requireSameOrigin,
  session,
} from "@/server/security";
import { createShow } from "@/server/shows";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const auth = session(request),
      body = await jsonBody(request);
    assert(
      body.mode === "live" || body.mode === "rehearsal",
      400,
      "show_mode",
      "Choose a live show or a labeled rehearsal.",
    );
    return jsonResponse(await createShow(auth.id, body.mode, request), 201);
  } catch (error) {
    return jsonError(error);
  }
}
