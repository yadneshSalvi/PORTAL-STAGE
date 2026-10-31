import {
  jsonError,
  newSession,
  readSession,
  sessionCookie,
} from "@/server/security";
import { startOAuth } from "@/server/twitch";
export async function GET(request: Request) {
  try {
    const auth = readSession(request) ?? newSession();
    return new Response(null, {
      status: 302,
      headers: {
        Location: await startOAuth(auth.id),
        "Set-Cookie": sessionCookie(auth),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
