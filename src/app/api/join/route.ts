import { assert } from "@/server/errors";
import {
  jsonBody,
  jsonError,
  jsonResponse,
  newSession,
  readSession,
  requireSameOrigin,
  sessionCookie,
} from "@/server/security";
import { joinShow } from "@/server/shows";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await jsonBody(request),
      auth = readSession(request) ?? newSession();
    assert(
      typeof body.code === "string" && typeof body.name === "string",
      400,
      "join_fields",
      "Enter your invitation and stage name.",
    );
    return jsonResponse(
      await joinShow(body.code, body.name, auth.id, request),
      200,
      { "Set-Cookie": sessionCookie(auth) },
    );
  } catch (error) {
    return jsonError(error);
  }
}
