// Tommy chat state (P1). Pure TS, no React: the same file is used by web and mobile
// (apps/web/app/chat/_lib/chatState.ts). If you change one, copy it to the other.
import type { ChatEvent, ChatSource } from "@trojanhub/shared/types";

export type ToolStatus = { id: string; name: string; done: boolean };

export type ConfirmStatus = "pending" | "sending" | "done" | "cancelled" | "failed";

export type ConfirmCard = {
  action_id: string;
  tool: string;
  title: string;
  summary: string;
  draft: Record<string, unknown>;
  status: ConfirmStatus;
  message?: string;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUri?: string; // user's attached photo (for display only)
  sources: ChatSource[];
  tools: ToolStatus[];
  confirms: ConfirmCard[];
  streaming: boolean;
  error?: string;
};

let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

export function userMessage(text: string, imageUri?: string): ChatMsg {
  return { id: newId(), role: "user", text, imageUri, sources: [], tools: [], confirms: [], streaming: false };
}

export function assistantPlaceholder(): ChatMsg {
  return { id: newId(), role: "assistant", text: "", sources: [], tools: [], confirms: [], streaming: true };
}

/** Apply one SSE event from POST /api/chat to the assistant message being streamed. */
export function applyEvent(msg: ChatMsg, ev: ChatEvent): ChatMsg {
  switch (ev.type) {
    case "token":
      return { ...msg, text: msg.text + ev.text };
    case "tool_call":
      return { ...msg, tools: [...msg.tools, { id: ev.id, name: ev.name, done: false }] };
    case "tool_result":
      return { ...msg, tools: msg.tools.map((t) => (t.id === ev.id ? { ...t, done: true } : t)) };
    case "sources":
      return { ...msg, sources: ev.sources };
    case "confirm":
      return {
        ...msg,
        confirms: [...msg.confirms, { action_id: ev.action_id, tool: ev.tool, title: ev.title, summary: ev.summary, draft: ev.draft, status: "pending" }],
      };
    case "done":
      return { ...msg, streaming: false, tools: msg.tools.map((t) => ({ ...t, done: true })) };
    default:
      return msg;
  }
}

export function updateConfirm(msg: ChatMsg, actionId: string, patch: Partial<ConfirmCard>): ChatMsg {
  return { ...msg, confirms: msg.confirms.map((c) => (c.action_id === actionId ? { ...c, ...patch } : c)) };
}

/** What the status line under a bubble says while a tool runs. */
export const TOOL_LABELS: Record<string, [running: string, done: string]> = {
  search_usc_info: ["Searching USC pages…", "Checked USC pages"],
  search_lost_items: ["Searching Lost & Found…", "Checked Lost & Found"],
  report_found_item: ["Drafting a found-item post…", "Drafted a found-item post"],
  search_events: ["Looking for events…", "Checked events"],
  search_deals: ["Looking for deals…", "Checked deals"],
  get_rewards: ["Checking rewards programs…", "Checked rewards programs"],
  scan_flyer: ["Reading the flyer…", "Read the flyer"],
  save_event: ["Preparing to save the event…", "Ready to save the event"],
  log_complaint: ["Drafting your report…", "Drafted your report"],
};

export function toolLabel(t: ToolStatus): string {
  const labels = TOOL_LABELS[t.name];
  return labels ? labels[t.done ? 1 : 0] : t.done ? `Used ${t.name}` : `Running ${t.name}…`;
}

/** Fields a student may edit on a confirm card before saying yes. */
export type EditField = { key: string; label: string; kind: "text" | "bool"; onlyIf?: string };

export const EDITABLE: Record<string, EditField[]> = {
  log_complaint: [
    { key: "building", label: "Building", kind: "text" },
    { key: "room", label: "Room", kind: "text" },
    { key: "anonymous", label: "Report anonymously", kind: "bool" },
    { key: "has_photo", label: "Include my photo (only staff can see it)", kind: "bool", onlyIf: "has_photo" },
  ],
  report_found_item: [
    { key: "description", label: "What is it?", kind: "text" },
    { key: "location", label: "Where did you find it?", kind: "text" },
  ],
  save_event: [{ key: "register", label: "Also register me", kind: "bool" }],
  scan_flyer: [
    { key: "title", label: "Title", kind: "text" },
    { key: "location_text", label: "Location", kind: "text" },
  ],
};

export const SUGGESTED_PROMPTS = [
  "When is the food pantry open?",
  "Any free food today?",
  "It's so hot in GFS 213",
  "Did anyone find a black Hydro Flask?",
  "I found a blue umbrella at Leavey",
];

/** Phrases Tommy suggests on each page (the floating "Chat with Tommy" button). */
export const PAGE_PROMPTS: Record<string, string[]> = {
  home: ["What's happening on campus today?", "Any free food today?", "When is the food pantry open?"],
  "lost-found": ["I lost my AirPods in Leavey", "Did anyone find a black Hydro Flask?", "I found a blue umbrella at Leavey"],
  events: ["What's on this weekend?", "Any career events this week?", "Events with free food today?"],
  deals: ["Any free food today?", "Student discounts near campus?", "What freebies end soon?"],
  rewards: ["How do I earn rewards?", "Which events count toward my rewards?", "Ways to earn around USC?"],
  report: ["It's so hot in GFS 213", "The elevator in Leavey is broken", "A water fountain in VKC is leaking"],
};

/** "/lost-found/123" -> the Lost & Found phrases; unknown pages get the general ones. */
export function promptsFor(path: string | null | undefined): string[] {
  const section = (path ?? "").split("/").filter(Boolean)[0] ?? "home";
  if (section === "deals" || (path ?? "").includes("tab=deals")) return PAGE_PROMPTS.deals;
  return PAGE_PROMPTS[section] ?? SUGGESTED_PROMPTS.slice(0, 3);
}

export type TommyMood = "default" | "searching" | "celebrating" | "winking";

/** Tommy's face for a reply: searching while he works, celebrating when something went through. */
export function moodFor(msg: ChatMsg | undefined): TommyMood {
  if (!msg) return "winking";
  if (msg.streaming) return "searching";
  if (msg.confirms.some((c) => c.status === "done")) return "celebrating";
  return "default";
}

/** The edit fields to show for a card (e.g. the photo toggle only when a photo is attached). */
export function editableFields(card: { tool: string; draft: Record<string, unknown> }): EditField[] {
  return (EDITABLE[card.tool] ?? []).filter((f) => !f.onlyIf || Boolean(card.draft[f.onlyIf]));
}

/** Split answer text into plain text and [n] citation markers. */
export type Piece = { kind: "text"; text: string } | { kind: "cite"; n: number } | { kind: "bold"; text: string } | { kind: "link"; text: string; url: string };

export function parseAnswer(raw: string): Piece[] {
  // The app keeps "(Sources used: …)" in chat history for Tommy; if the model ever copies it, hide it.
  const text = raw.replace(/\s*\(Sources used:[^)]*\)\s*$/, "");
  const pieces: Piece[] = [];
  // [n] citation | **bold** | [text](https://… or /page-in-the-app) | bare https://…
  const re = /\[(\d+)\]|\*\*([^*]+)\*\*|\[([^\]]+)\]\(\s*(https?:\/\/[^)\s]+|\/[^)\s]*)\s*\)|(https?:\/\/[^\s)]+[^\s).,])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) pieces.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) pieces.push({ kind: "cite", n: Number(m[1]) });
    else if (m[2]) pieces.push({ kind: "bold", text: m[2] });
    else if (m[3] && m[4]) pieces.push({ kind: "link", text: m[3], url: m[4] });
    else if (m[5]) pieces.push({ kind: "link", text: m[5], url: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}

export const SIGN_IN_TO_CHAT = "Sign in with your @usc.edu email to chat with Tommy.";
/** Guests (not signed in) can send a few messages an hour (services/ai/app/chat/routes.py). */
export const GUEST_LIMIT_REACHED = "That's the guest limit for now. Sign in with your @usc.edu email to keep chatting.";

/** Errors that come with a "Sign in" link. */
export function needsSignIn(error: string | undefined): boolean {
  return error === SIGN_IN_TO_CHAT || error === GUEST_LIMIT_REACHED;
}

/** What to tell the student when a chat request fails. */
export function chatErrorMessage(e: unknown, offlineHint: string): string {
  const { status, code } = (e as { status?: number; code?: string } | null) ?? {};
  if (status === 401) return SIGN_IN_TO_CHAT;
  if (status === 429 && code === "rate_limited") return GUEST_LIMIT_REACHED;
  if (status === 429) return "Tommy is busy right now. Please try again in a minute.";
  return offlineHint;
}

/** "/events/123" is a page inside TrojanHub; "https://…" is another website. */
export function isInternalLink(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

export function newSessionId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
