// Error that keeps the HTTP status so the UI can react to 403 / 404 / 409.
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Builds an ApiError from a failed fetch Response ({ error: "..." } body).
export async function readApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const message =
    typeof body?.error === "string"
      ? body.error
      : `Request failed (${res.status})`;
  return new ApiError(message, res.status);
}