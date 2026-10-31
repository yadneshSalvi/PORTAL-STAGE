export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
export function assert(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, code, message);
}
