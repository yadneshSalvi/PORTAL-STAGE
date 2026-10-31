import {
  jsonError,
  jsonResponse,
  newSession,
  readSession,
  sessionCookie,
} from "@/server/security";
import { sessionInfo } from "@/server/shows";
export async function GET(request: Request) {
  try {
    const existing = readSession(request),
      session = existing ?? newSession();
    return jsonResponse(
      await sessionInfo(session.id),
      200,
      existing ? {} : { "Set-Cookie": sessionCookie(session) },
    );
  } catch (error) {
    return jsonError(error);
  }
}
