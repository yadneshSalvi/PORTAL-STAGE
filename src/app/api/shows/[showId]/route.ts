import { jsonError, jsonResponse } from "@/server/security";
import { currentShow } from "@/server/shows";
export async function GET(
  request: Request,
  context: { params: Promise<{ showId: string }> },
) {
  try {
    const { showId } = await context.params;
    return jsonResponse(
      await currentShow(
        showId,
        request,
        new URL(request.url).searchParams.get("view") === "program",
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
