import { assert } from "@/server/errors";
import {
  jsonBody,
  jsonError,
  jsonResponse,
  requireSameOrigin,
  signedCookie,
} from "@/server/security";
import { currentShow, redeemOutput } from "@/server/shows";
export async function GET(request: Request) {
  try {
    return jsonResponse(
      await currentShow(
        new URL(request.url).searchParams.get("show") || "",
        request,
        true,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await jsonBody(request);
    assert(
      typeof body.showId === "string" && typeof body.code === "string",
      400,
      "output_code",
      "Enter the show identifier and output code.",
    );
    const result = await redeemOutput(body.showId, body.code, request);
    return jsonResponse(result.result, 200, {
      "Set-Cookie": signedCookie(
        "portal_program_" + body.showId,
        result.token,
        2 * 3600,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
