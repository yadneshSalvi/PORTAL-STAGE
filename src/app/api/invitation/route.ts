import { jsonError, jsonResponse } from "@/server/security";
import { invitationInfo } from "@/server/shows";
export async function GET(request: Request) {
  try {
    return jsonResponse(
      await invitationInfo(new URL(request.url).searchParams.get("code") || ""),
    );
  } catch (error) {
    return jsonError(error);
  }
}
