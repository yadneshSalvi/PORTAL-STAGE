import {
  jsonError,
  jsonResponse,
  requireSameOrigin,
  session,
} from "@/server/security";
import { disconnectOAuth } from "@/server/twitch";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await disconnectOAuth(session(request).id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
