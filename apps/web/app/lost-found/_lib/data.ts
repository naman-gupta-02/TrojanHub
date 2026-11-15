// P2 Vishwa: Lost & Found data for the website.
// Simple reads/writes go straight to Supabase (RLS protects them); anything AI goes through
// `api.items.*` (ARCHITECTURE.md §2). When Supabase isn't configured (mock mode), the pages use
// the mock JSON in packages/shared/mocks so they still render.
import type { Building, DropoffInfo, Item, ItemTier, Message } from "@trojanhub/shared";
import searchMock from "@trojanhub/shared/mocks/items_search.json";

import { supabase } from "@/lib/supabase";

export const isMock = !supabase;

/** Never select the embedding columns: they're large and server-only. */
const ITEM_COLUMNS =
  "id,kind,tier,title,description,photo_url,building_id,location_text,dropoff_point_id,status,posted_by,expires_at,created_at";

const MOCK_ITEMS = searchMock.results.map((r) => r.item as Item);

// Mirrors services/ai/app/lostfound/dropoff.py (USC's only official lost & found is DPS).
export const DPS_DROPOFF_ID = "dd000000-0000-0000-0000-000000000001";
export const DPS_DROPOFF: DropoffInfo = {
  name: "DPS Lost & Found, 3667 McClintock Ave (University Park Campus)",
  url: "https://dps.usc.edu/services/lost-and-found/",
  map: "https://www.google.com/maps/search/?api=1&query=3667+McClintock+Ave%2C+Los+Angeles%2C+CA+90089",
  hours: null,
};

export const MEETING_SPOTS = ["Leavey Library entrance", "USC Village", "Doheny Library"];

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Open found items that haven't expired, newest first. */
export async function listRecent(): Promise<Item[]> {
  if (!supabase) return MOCK_ITEMS;
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("status", "open")
    .eq("kind", "found")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []) as Item[];
}

export async function getItem(id: string): Promise<Item | null> {
  if (!supabase) return MOCK_ITEMS.find((i) => i.id === id) ?? null;
  const { data, error } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Item | null;
}

let buildingsCache: Promise<Record<string, Building>> | null = null;

export function getBuildings(): Promise<Record<string, Building>> {
  if (!supabase) return Promise.resolve({});
  const client = supabase;
  buildingsCache ??= (async () => {
    const { data } = await client.from("buildings").select("id,code,name,lat,lng");
    return Object.fromEntries(((data ?? []) as Building[]).map((b) => [b.id, b]));
  })();
  return buildingsCache;
}

/** The finder answers "Is this a valuable?" when the AI wasn't sure. Updates their own item (RLS). */
export async function setTier(item: Item, tier: ItemTier): Promise<Item> {
  const patch = {
    tier,
    dropoff_point_id: tier === "valuable" ? DPS_DROPOFF_ID : null,
    expires_at: tier === "valuable" ? null : new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
  };
  if (!supabase) return { ...item, ...patch };
  const { data, error } = await supabase.from("items").update(patch).eq("id", item.id).select(ITEM_COLUMNS).single();
  if (error) throw new Error(error.message);
  return data as Item;
}

/** Finder marks the item as returned, so it leaves search. */
export async function markReturned(itemId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("items").update({ status: "claimed" }).eq("id", itemId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Handoff chats (item_threads + messages; only the two people in a thread can see it)
// ---------------------------------------------------------------------------
export type ThreadSummary = {
  id: string;
  owner_id: string;
  finder_id: string;
  created_at: string;
  item: Pick<Item, "id" | "title" | "photo_url" | "tier" | "status"> | null;
};

const MOCK_THREAD: ThreadSummary = {
  id: "d0000000-0000-0000-0000-000000000001",
  owner_id: "00000000-0000-0000-0000-000000000001",
  finder_id: "00000000-0000-0000-0000-000000000002",
  created_at: new Date().toISOString(),
  item: { id: MOCK_ITEMS[0].id, title: MOCK_ITEMS[0].title, photo_url: null, tier: "everyday", status: "open" },
};

export async function listThreads(): Promise<ThreadSummary[]> {
  if (!supabase) return [MOCK_THREAD];
  const { data, error } = await supabase
    .from("item_threads")
    .select("id,owner_id,finder_id,created_at,item:items(id,title,photo_url,tier,status)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ThreadSummary[];
}

export async function getThread(id: string): Promise<ThreadSummary | null> {
  if (!supabase) return id === MOCK_THREAD.id ? MOCK_THREAD : null;
  const { data, error } = await supabase
    .from("item_threads")
    .select("id,owner_id,finder_id,created_at,item:items(id,title,photo_url,tier,status)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as ThreadSummary | null;
}

export async function listMessages(threadId: string): Promise<Message[]> {
  if (!supabase) {
    return [{ id: "m1", thread_id: threadId, sender_id: MOCK_THREAD.owner_id, body: "Hi! I think this is mine. When could we meet to hand it off?", created_at: new Date().toISOString() }];
  }
  const { data, error } = await supabase
    .from("messages")
    .select("id,thread_id,sender_id,body,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendMessage(threadId: string, senderId: string, body: string): Promise<Message> {
  const clean = body.trim();
  if (!supabase) return { id: `local-${Date.now()}`, thread_id: threadId, sender_id: senderId, body: clean, created_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: senderId, body: clean })
    .select("id,thread_id,sender_id,body,created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}

/** Live updates for a thread. Returns an unsubscribe function. */
export function subscribeToThread(threadId: string, onMessage: (m: Message) => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  // Unique name per subscription: reusing a name returns the already-subscribed channel, and
  // adding callbacks to it throws (happens when a page mounts twice, e.g. React StrictMode).
  const channel = client
    .channel(`lf-thread-${threadId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` }, (payload) =>
      onMessage(payload.new as Message),
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Search scores are rough (see services/ai/app/lostfound/search.py), so show words, not percentages. */
export function matchLabel(score: number): string {
  if (score >= 0.7) return "Strong match";
  if (score >= 0.4) return "Possible match";
  return "Weak match";
}

const GENERIC_WORDS = new Set(["hall", "library", "building", "center", "memorial", "campus", "the", "and"]);

/** The finder's own words, plus the official building name only when it adds something:
 * "Leavey Library, 2nd floor" stays as is; "SAL 101" -> "SAL 101 · Salvatori Computer Science Center". */
export function whereFound(item: Item, buildings: Record<string, Building>): string {
  const b = item.building_id ? buildings[item.building_id] : undefined;
  const text = item.location_text?.trim();
  if (!text) return b?.name ?? "Location not given";
  if (!b) return text;
  const lower = text.toLowerCase();
  const named = b.name
    .toLowerCase()
    .split(/\s+/)
    .some((w) => w.length >= 4 && !GENERIC_WORDS.has(w) && lower.includes(w));
  return named ? text : `${text} · ${b.name}`;
}

/** Shrink big phone photos before upload. Returns a JPEG blob (also converts HEIC where the browser can read it). */
export async function shrinkPhoto(file: File, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("We couldn't read that photo. Try a JPG or PNG.");
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("We couldn't read that photo."))), "image/jpeg", 0.85),
  );
}
