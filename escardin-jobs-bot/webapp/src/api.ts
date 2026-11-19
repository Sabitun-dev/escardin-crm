// Talks to /api/app/*. Every request carries Telegram's signed initData, so the server knows who is asking.
import type { ApiErrorBody } from "../../src/app-types";
import type { CheckKey } from "../../src/rules/checks";
import { initData } from "./tg";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public missing: CheckKey[] = [],
  ) {
    super(code);
  }
}

const useMock = import.meta.env.DEV && new URLSearchParams(location.search).has("mock");

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Sends one request. A POST gets a request id, so a double tap is done only once on the server. */
export async function request<T>(method: "GET" | "POST", path: string, body?: unknown, form?: FormData): Promise<T> {
  if (import.meta.env.DEV && useMock) {
    const { mockApi } = await import("./mock");
    return mockApi<T>(method, path, body, form);
  }
  const headers: Record<string, string> = { "x-telegram-init-data": initData() };
  if (method === "POST") headers["x-request-id"] = rid();
  if (body !== undefined && !form) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api/app/${path}`, {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, b.error ?? "server", b.missing ?? []);
  }
  return res.json() as Promise<T>;
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T = { ok: true }>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});

/** Photos come through our server (the bot token never reaches the phone). Returns a local image URL. */
const photoCache = new Map<number, Promise<string>>();
export function photoUrl(id: number): Promise<string> {
  if (!photoCache.has(id)) {
    const p = (async () => {
      if (import.meta.env.DEV && useMock) return (await import("./mock")).mockPhoto(id);
      const res = await fetch(`/api/app/media/${id}`, { headers: { "x-telegram-init-data": initData() } });
      if (!res.ok) throw new ApiError(res.status, "not_found");
      return URL.createObjectURL(await res.blob());
    })();
    p.catch(() => photoCache.delete(id));
    photoCache.set(id, p);
  }
  return photoCache.get(id)!;
}
