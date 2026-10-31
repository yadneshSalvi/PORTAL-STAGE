import type {
  ActionEnvelope,
  Invitation,
  SessionInfo,
  ShowAction,
  ShowEnvelope,
  ShowMode,
} from "./contracts";
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(20_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    const mutation =
      init.method && !["GET", "HEAD"].includes(init.method.toUpperCase());
    throw new ApiError(
      signal.aborted
        ? mutation
          ? "The request timed out and may have committed. Refresh the stage before trying again."
          : "The stage did not respond in time. Check your connection and refresh."
        : "The connection was interrupted. Refresh the current stage before retrying a control.",
      0,
      signal.aborted ? "request_timeout" : "network_error",
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      payload.error ||
        "The stage could not complete that request. Please try again.",
      response.status,
      payload.code,
    );
  return payload as T;
}
export const getSession = () => api<SessionInfo>("/api/session");
export const createShow = (mode: ShowMode) =>
  api<ShowEnvelope>("/api/shows", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
export const getShow = (id: string) =>
  api<ShowEnvelope>(`/api/shows/${encodeURIComponent(id)}`);
export const act = (
  id: string,
  action: ShowAction,
  options: Partial<Omit<ActionEnvelope, "action">> = {},
) =>
  api<ShowEnvelope>(`/api/shows/${encodeURIComponent(id)}/action`, {
    method: "POST",
    body: JSON.stringify({
      action,
      idempotencyKey: crypto.randomUUID(),
      ...options,
    }),
  });
export const invite = (id: string, slot: "A" | "B" = "B") =>
  api<Invitation>(`/api/shows/${encodeURIComponent(id)}/invite`, {
    method: "POST",
    body: JSON.stringify({ slot }),
  });
export const join = (code: string, name: string) =>
  api<ShowEnvelope>("/api/join", {
    method: "POST",
    body: JSON.stringify({ code, name }),
  });
