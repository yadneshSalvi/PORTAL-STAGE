export function isLoopbackUrl(value: string | undefined, protocols: string[]) {
  try {
    const url = new URL(value || "");
    return (
      protocols.includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Never enables rehearsal grants in Vercel or against a cloud media endpoint. */
export function localMediaTestingEnabled() {
  return (
    !process.env.VERCEL &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PORTAL_LOCAL_MEDIA_TEST === "1") &&
    isLoopbackUrl(process.env.APP_BASE_URL, ["http:", "https:"]) &&
    isLoopbackUrl(process.env.LIVEKIT_URL, ["ws:", "wss:"])
  );
}
