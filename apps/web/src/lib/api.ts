export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 500, code = "server_error") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Json = Record<string, unknown> | undefined;

async function request<T>(method: string, path: string, body?: Json): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("You seem to be offline.", 0, "offline");
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const record = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(record.error ?? "Something went wrong.", response.status, record.code ?? "server_error");
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Json) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: Json) => request<T>("PATCH", path, body),
};
