import { appOrigin, session } from "@/server/security";
import { finishOAuth } from "@/server/twitch";
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.has("error")) throw new Error("cancelled");
    const auth = session(request);
    const allowed = await finishOAuth(
      auth.id,
      url.searchParams.get("state") || "",
      url.searchParams.get("code") || "",
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appOrigin(request)}/studio?auth=${allowed ? "connected" : "host-invitation"}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appOrigin(request)}/studio?auth=failed`,
        "Cache-Control": "no-store",
      },
    });
  }
}
