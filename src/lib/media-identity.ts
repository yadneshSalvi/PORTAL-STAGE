/** Immutable token identities fence a replaced page without changing story ownership. */
export function rendererMediaIdentity(
  showId: string,
  epoch: number,
  kind: "director" | "output-publisher",
  incarnationId?: string,
) {
  const prefix = kind === "director" ? "director" : "renderer";
  return `${prefix}-${showId}-${epoch}${incarnationId ? `-${incarnationId}` : ""}`;
}
