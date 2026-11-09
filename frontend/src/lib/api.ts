export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type ApiErrorBody = {
  message?: string;
  error_code?: string;
  errors?: Array<{ msg?: string }>;
};

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  roles: string[];
  branches: string[];
  created_at: string | null;
  permissions: string[];
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("csrf_token="));
  return cookie ? decodeURIComponent(cookie.slice("csrf_token=".length)) : null;
}

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      method,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "Could not connect to the shop server. Check that the backend is running.",
      0,
    );
  }

  const body = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiErrorBody
    | null;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    const validationMessage = errorBody?.errors
      ?.map((item) => item.msg)
      .filter((message): message is string => Boolean(message))
      .join(", ");
    throw new ApiError(
      validationMessage || errorBody?.message || "Something went wrong.",
      response.status,
      errorBody?.error_code ?? null,
    );
  }

  if (!body || !("data" in body)) {
    throw new ApiError("The server returned an unexpected response.", response.status);
  }

  return body.data;
}

export function hasPermission(user: CurrentUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}
