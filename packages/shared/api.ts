// Typed client for the TrojanHub AI service (services/ai). Used by mobile and web.
// Owner: P4 (Jaymin); each feature owner may add methods for their own endpoints.
//
//   const api = createApi({ baseUrl: process.env.NEXT_PUBLIC_API_URL!, getToken });
//   const { results } = await api.items.search({ q: "black hydro flask" });
//
// Mobile: pass `fetch` from "expo/fetch" so chat streaming works (React Native's
// built-in fetch can't stream response bodies).

import type {
  AdminComplaintPatch,
  AdminComplaintRow,
  AdminComplaintsParams,
  AdminStatsResponse,
  ChatConfirmRequest,
  ChatConfirmResponse,
  ChatEvent,
  ChatRequest,
  ClaimItemResponse,
  ComplaintConfirmResponse,
  ComplaintDraftResponse,
  ComplaintRequest,
  CreateItemFields,
  CreateItemResponse,
  DealSearchParams,
  DealSearchResponse,
  EventSearchParams,
  EventSearchResponse,
  FeedResponse,
  FlyerScanRequest,
  FlyerScanResponse,
  ItemSearchParams,
  ItemSearchResponse,
  MyComplaintsResponse,
  RewardsProgressResponse,
  SaveEventRequest,
  SaveEventResponse,
  UpvoteResponse,
} from "./types";

export interface ApiOptions {
  baseUrl: string;
  /** Supabase access token for the current user, or null when logged out. */
  getToken?: () => Promise<string | null> | string | null;
  /** Override fetch (mobile: `import { fetch } from "expo/fetch"`). */
  fetch?: typeof fetch;
}

/** Thrown for any non-2xx response. `code` comes from the API's {error: {code, message}}. */
export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** File for multipart uploads: a web File/Blob, or React Native's {uri, name, type}. */
export type UploadFile = Blob | { uri: string; name: string; type: string };

type Query = Record<string, string | number | boolean | undefined | null>;

export function createApi(opts: ApiOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;

  async function headers(extra?: Record<string, string>): Promise<Record<string, string>> {
    const token = opts.getToken ? await opts.getToken() : null;
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  }

  function url(path: string, query?: Query): string {
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return `${base}${path}${qs ? `?${qs}` : ""}`;
  }

  async function check(res: Response): Promise<Response> {
    if (res.ok) return res;
    let code = `http_${res.status}`;
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiRequestError(res.status, code, message);
  }

  async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const res = await doFetch(url(path, query), {
      method,
      headers: await headers(body !== undefined ? { "Content-Type": "application/json" } : undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    await check(res);
    return (await res.json()) as T;
  }

  async function multipart<T>(path: string, fields: Record<string, string | undefined>, files: Record<string, UploadFile | undefined>): Promise<T> {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v);
    for (const [k, f] of Object.entries(files)) if (f !== undefined) form.append(k, f as Blob);
    const res = await doFetch(url(path), { method: "POST", headers: await headers(), body: form });
    await check(res);
    return (await res.json()) as T;
  }

  /** POST /chat: yields each SSE event as it arrives. */
  async function* chatStream(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const res = await doFetch(url("/api/chat"), {
      method: "POST",
      headers: await headers({ "Content-Type": "application/json", Accept: "text/event-stream" }),
      body: JSON.stringify(req),
      signal,
    });
    await check(res);
    if (!res.body) throw new ApiRequestError(0, "no_stream", "This fetch can't stream. On mobile, use fetch from expo/fetch.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) yield JSON.parse(line.slice(6)) as ChatEvent;
        }
      }
    }
  }

  return {
    health: () => request<{ ok: boolean; use_mocks: boolean }>("GET", "/health"),

    // P1 Chat
    chat: {
      stream: chatStream,
      confirm: (req: ChatConfirmRequest) => request<ChatConfirmResponse>("POST", "/api/chat/confirm", req),
    },

    // P2 Lost & Found
    items: {
      create: (fields: CreateItemFields, photo?: UploadFile) =>
        multipart<CreateItemResponse>("/api/items", { ...fields }, { photo }),
      search: (params: ItemSearchParams) => request<ItemSearchResponse>("GET", "/api/items/search", undefined, { ...params }),
      searchByImage: (photo: UploadFile) => multipart<ItemSearchResponse>("/api/items/search-by-image", {}, { photo }),
      claim: (id: string) => request<ClaimItemResponse>("POST", `/api/items/${id}/claim`, {}),
    },

    // P3 Events, Deals, Rewards, Feed
    flyers: {
      scan: (req: FlyerScanRequest) => request<FlyerScanResponse>("POST", "/api/flyers/scan", req),
    },
    events: {
      search: (params: EventSearchParams = {}) => request<EventSearchResponse>("GET", "/api/events/search", undefined, { ...params }),
      save: (id: string, req: SaveEventRequest = {}) => request<SaveEventResponse>("POST", `/api/events/${id}/save`, req),
      icsUrl: (id: string) => url(`/api/events/${id}/ics`),
    },
    deals: {
      search: (params: DealSearchParams = {}) => request<DealSearchResponse>("GET", "/api/deals/search", undefined, { ...params }),
    },
    rewards: {
      progress: () => request<RewardsProgressResponse>("GET", "/api/rewards/progress"),
    },
    feed: () => request<FeedResponse>("GET", "/api/feed"),

    // P4 Complaints & Admin
    complaints: {
      draft: (req: Omit<ComplaintRequest, "confirm">) =>
        request<ComplaintDraftResponse>("POST", "/api/complaints", { ...req, confirm: false }),
      confirm: (req: Omit<ComplaintRequest, "confirm">) =>
        request<ComplaintConfirmResponse>("POST", "/api/complaints", { ...req, confirm: true }),
      mine: () => request<MyComplaintsResponse>("GET", "/api/complaints/mine"),
      upvote: (ticketId: string) => request<UpvoteResponse>("POST", `/api/tickets/${ticketId}/upvote`, {}),
    },
    admin: {
      complaints: (params: AdminComplaintsParams = {}) =>
        request<AdminComplaintRow[]>("GET", "/api/admin/complaints", undefined, { ...params }),
      patchComplaint: (id: string, patch: AdminComplaintPatch) =>
        request<AdminComplaintRow>("PATCH", `/api/admin/complaints/${id}`, patch),
      stats: () => request<AdminStatsResponse>("GET", "/api/admin/stats"),
      ticketsCsvUrl: () => url("/api/admin/tickets.csv"),
    },
  };
}

export type TrojanHubApi = ReturnType<typeof createApi>;
