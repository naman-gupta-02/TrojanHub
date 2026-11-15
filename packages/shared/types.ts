// TrojanHub shared types: DB rows (ARCHITECTURE.md §5) + API contracts (§6).
// Owner: P4 (Jaymin). Change by PR + ping, because all 4 people code against this file.
// Hand-written to match supabase/migrations/202611141600_p4_initial_schema.sql.
// Later it can be replaced/augmented by `supabase gen types typescript`.
//
// Conventions: snake_case JSON, ids are uuid strings, timestamps are ISO strings (UTC).

export type UUID = string;
export type ISODate = string;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export type UserRole = "student" | "org_admin" | "dept_admin" | "usg_admin";
export type ItemKind = "found" | "lost";
export type ItemTier = "valuable" | "everyday";
export type ItemStatus = "open" | "claimed" | "archived";
export type ThreadStatus = "open" | "handed_off" | "closed";
export type DropoffType = "dps" | "it";
export type EventSource = "org" | "community" | "flyer";
export type EventStatus = "draft" | "published" | "cancelled";
export type EventCategory = "cultural" | "career" | "free_food" | "sports" | "social" | "academic" | "other";
export type DealKind = "ongoing" | "one_time";
export type NotificationType = "digest" | "reminder" | "match";
export type Department = "Facilities" | "Housing" | "ITS" | "Transportation" | "DPS";
export type Urgency = "low" | "medium" | "high" | "safety";
export type TicketStatus = "reported" | "sent" | "resolved";
export type ComplaintSource = "chat" | "form";

// ---------------------------------------------------------------------------
// DB rows: Core (P4)
// ---------------------------------------------------------------------------
export interface Profile {
  id: UUID;
  name: string | null;
  role: UserRole;
  interests: string[];
  notify_email: boolean;
  notify_push: boolean;
  notify_categories: string[];
  expo_push_token: string | null;
  created_at: ISODate;
}

export interface Org {
  id: UUID;
  name: string;
  verified: boolean;
  owner_id: UUID | null;
  created_at: ISODate;
}

export interface Building {
  id: UUID;
  code: string; // e.g. "GFS"
  name: string;
  lat: number | null;
  lng: number | null;
}

// ---------------------------------------------------------------------------
// DB rows: Chatbot (P1)
// ---------------------------------------------------------------------------
export interface ChatMessage {
  id: UUID;
  user_id: UUID | null;
  session_id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  tool_calls: unknown | null;
  sources: ChatSource[] | null;
  created_at: ISODate;
}

// ---------------------------------------------------------------------------
// DB rows: Lost & Found (P2). Embeddings are server-only and never sent to clients.
// ---------------------------------------------------------------------------
export interface DropoffPoint {
  id: UUID;
  name: string;
  type: DropoffType;
  building_id: UUID | null;
  hours: string | null;
  url: string | null;
}

export interface Item {
  id: UUID;
  kind: ItemKind;
  tier: ItemTier;
  title: string;
  description: string | null;
  photo_url: string | null;
  building_id: UUID | null;
  location_text: string | null;
  dropoff_point_id: UUID | null;
  status: ItemStatus;
  posted_by: UUID | null;
  expires_at: ISODate | null;
  created_at: ISODate;
}

export interface ItemThread {
  id: UUID;
  item_id: UUID;
  owner_id: UUID;
  finder_id: UUID;
  status: ThreadStatus;
  created_at: ISODate;
}

export interface Message {
  id: UUID;
  thread_id: UUID;
  sender_id: UUID;
  body: string;
  created_at: ISODate;
}

// ---------------------------------------------------------------------------
// DB rows: Events, Deals & Freebies (P3)
// ---------------------------------------------------------------------------
export interface Event {
  id: UUID;
  title: string;
  description: string | null;
  starts_at: ISODate;
  ends_at: ISODate | null;
  building_id: UUID | null;
  location_text: string | null;
  category: EventCategory;
  is_free: boolean;
  has_freebie: boolean;
  freebie_desc: string | null;
  register_url: string | null;
  ticket_url: string | null;
  tickets_open_at: ISODate | null;
  org_id: UUID | null;
  posted_by: UUID | null;
  source: EventSource;
  flyer_url: string | null;
  status: EventStatus;
  created_at: ISODate;
  // Joined from orgs by the API (P3); absent in raw Supabase rows
  org_name?: string | null;
  org_verified?: boolean;
}

export interface Deal {
  id: UUID;
  title: string;
  description: string | null;
  kind: DealKind;
  how_to_claim: string | null;
  link: string | null;
  starts_at: ISODate | null;
  expires_at: ISODate | null;
  posted_by: UUID | null;
  still_active_votes: number;
  created_at: ISODate;
}

export interface EventSave {
  id: UUID;
  user_id: UUID;
  event_id: UUID;
  registered: boolean;
  reminder_sent_at: ISODate | null;
  created_at: ISODate;
}

export interface RewardProgram {
  id: UUID;
  name: string;
  office: string;
  reward_desc: string | null;
  required_count: number;
  rules_url: string | null;
}

export interface Attendance {
  id: UUID;
  user_id: UUID;
  event_id: UUID;
  checked_in_at: ISODate;
}

// ---------------------------------------------------------------------------
// DB rows: Complaints (P4)
// ---------------------------------------------------------------------------
export interface Route {
  id: UUID;
  department: Department;
  category: string; // "*" = default for the department
  form_url: string | null;
  email: string | null;
}

export interface Ticket {
  id: UUID;
  building_id: UUID | null;
  room: string | null;
  department: Department;
  category: string;
  urgency: Urgency;
  summary: string;
  status: TicketStatus;
  report_count: number;
  route_url: string | null;
  created_at: ISODate;
}

export interface Complaint {
  id: UUID;
  ticket_id: UUID | null;
  reporter_id: UUID | null; // null = anonymous
  raw_text: string;
  room: string | null;
  building_id: UUID | null;
  source: ComplaintSource;
  ai_department: Department | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  corrected_department: Department | null;
  forwarded_to: string | null;
  forwarded_at: ISODate | null;
  photo_path: string | null; // private storage path; never sent to students (see has_photo)
  created_at: ISODate;
}

// ===========================================================================
// API contracts (FastAPI, base /api). Errors are always ApiError with an HTTP status.
// ===========================================================================
export interface ApiError {
  error: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// P1 Chat. POST /chat streams Server-Sent Events: `data: <ChatEvent JSON>\n\n`
// ---------------------------------------------------------------------------
export interface ChatRequest {
  session_id: string;
  message: string;
  image_url?: string;
}

export interface ChatSource {
  n: number; // matches [n] in the answer text
  title: string;
  url: string;
  snippet: string;
}

export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: unknown }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "confirm"; action_id: string; tool: string; title: string; summary: string; draft: Record<string, unknown> }
  | { type: "done"; session_id: string };

export interface ChatConfirmRequest {
  session_id: string;
  action_id: string;
  approved: boolean;
  edits?: Record<string, unknown>;
}

export interface ChatConfirmResponse {
  action_id: string;
  status: "done" | "cancelled" | "failed";
  message: string;
  result?: unknown; // whatever the owner's endpoint returned
}

// ---------------------------------------------------------------------------
// P2 Lost & Found
// ---------------------------------------------------------------------------
/** POST /items is multipart/form-data: photo (file), kind, description?, building_id?, location_text? */
export interface CreateItemFields {
  kind: ItemKind;
  description?: string;
  building_id?: UUID;
  location_text?: string;
}

export interface DropoffInfo {
  name: string;
  url: string | null;
  map: string; // Google Maps link
  hours?: string | null;
}

export interface CreateItemResponse {
  item: Item;
  tier: ItemTier;
  dropoff?: DropoffInfo; // only for valuables
  ask_tier?: boolean; // true when the AI isn't sure; client asks "Is this a valuable?"
}

export interface ItemSearchParams {
  q: string;
  building_id?: UUID;
}

export interface ItemSearchResponse {
  results: { item: Item; score: number }[]; // top 10, best first
}

/** POST /items/describe: the AI's first go at "What is it?" from the photo. The finder can edit it.
 * source: "ai" = vision model, "label" = CLIP's label only, "none" = nothing (leave the box empty). */
export interface DescribeItemResponse {
  title: string | null;
  description: string | null;
  source: "ai" | "label" | "none";
}

/** Everyday items return a thread; valuables return where to pick it up instead. */
export type ClaimItemResponse = { thread_id: UUID } | { pickup: DropoffInfo };

// ---------------------------------------------------------------------------
// P3 Events, Deals, Freebies, Notifications
// ---------------------------------------------------------------------------
export interface FlyerScanRequest {
  image_url: string;
}

export interface FlyerFields {
  title: string | null;
  starts_at: ISODate | null;
  ends_at: ISODate | null;
  location_text: string | null;
  building_id: UUID | null;
  is_free: boolean | null;
  has_freebie: boolean | null;
  freebie_desc: string | null;
  register_url: string | null;
  org_name: string | null;
  category: EventCategory | null;
}

export interface FlyerScanResponse {
  type: "event" | "deal";
  fields: FlyerFields;
  missing: (keyof FlyerFields)[];
  duplicate_of?: UUID;
  /** 0..1 per filled field; the form highlights anything under ~0.7 for a second look */
  confidence?: Partial<Record<keyof FlyerFields, number>>;
  /** Extra things the flyer said that aren't FlyerFields */
  extra?: {
    description: string | null;
    ticket_url: string | null;
    tickets_open_at: ISODate | null;
    how_to_claim: string | null; // deals
  };
  duplicate?: { id: UUID; title: string; starts_at: ISODate };
  /** true = the event already ended (or the deal expired); POST /events and /deals will refuse it (422) */
  ended?: boolean;
}

/** POST /flyers/upload is multipart/form-data: photo (file) */
export interface FlyerUploadResponse {
  image_url: string; // public URL (or a data: URL in mock mode); pass to /flyers/scan and as flyer_url
}

/** GET /events/{id} */
export interface EventDetailResponse {
  event: Event;
  saved: boolean;
  registered: boolean;
  attended: boolean;
  counts_toward: { program_id: UUID; name: string; attended: number; required: number; style?: RewardStyle }[];
  google_calendar_url: string;
  ics_url: string;
}

/** POST /events. 409 {error: {code: "duplicate", duplicate_of}} unless force: true */
export interface CreateEventRequest {
  title: string;
  description?: string | null;
  starts_at: ISODate;
  ends_at?: ISODate | null;
  location_text?: string | null;
  building_id?: UUID | null;
  category?: EventCategory;
  is_free?: boolean;
  has_freebie?: boolean;
  freebie_desc?: string | null;
  register_url?: string | null;
  ticket_url?: string | null;
  tickets_open_at?: ISODate | null;
  org_name?: string | null;
  flyer_url?: string | null;
  force?: boolean;
}

export interface CreateEventResponse {
  event: Event;
}

export interface CreateDealRequest {
  title: string;
  description?: string | null;
  kind: DealKind;
  how_to_claim?: string | null;
  link?: string | null;
  starts_at?: ISODate | null;
  expires_at?: ISODate | null;
  /** true = "post anyway" after a 409 duplicate warning */
  force?: boolean;
}

export interface CreateDealResponse {
  deal: Deal;
}

export interface DealVoteRequest {
  /** true = still works, false = doesn't work anymore, null = take my vote back */
  still_active: boolean | null;
}

export interface DealVoteResponse {
  still_active_votes: number;
  /** this student's vote after the change (null = no vote) */
  my_vote?: boolean | null;
}

/** POST /events/{id}/checkin: with the organizer's QR code, or "I'm here" while the event is on */
export interface CheckinRequest {
  code?: string;
}

export interface CheckinResponse {
  checked_in: true;
  already: boolean;
  rewards: RewardProgress[]; // only programs this event counts toward, already updated
}

export interface CheckinCodeResponse {
  code: string;
  checkin_url: string; // trojanhub://checkin/{id}?code=...  (put this in the QR)
}

/** GET /me/events */
export interface MyEventsResponse {
  saved: { event: Event; registered: boolean; attended: boolean }[];
}

/** POST /notify/digest-now (admins): the on-stage "Send digest now" button */
export interface DigestNowRequest {
  email?: string; // default: the signed-in admin's email
  everyone?: boolean; // true = run the real 8 AM job now
}

export interface DigestNowResponse {
  sent: number;
  to?: string;
  items?: number;
  skipped_reason?: string;
}

/** GET / PATCH /me/notify. Empty notify_categories = everything. "deals" covers one-time deals. */
export type NotifyCategory = EventCategory | "deals";

export interface NotifyPrefs {
  notify_email: boolean;
  notify_push: boolean;
  notify_categories: NotifyCategory[];
}

export interface EventSearchParams {
  q?: string;
  from?: ISODate;
  to?: ISODate;
  category?: EventCategory;
  free?: boolean;
  freebie?: boolean;
}

export interface EventSearchResponse {
  events: Event[];
}

export interface DealSearchParams {
  q?: string;
  active?: boolean;
}

export interface DealSearchResponse {
  deals: Deal[];
}

export interface SaveEventRequest {
  register?: boolean;
}

export interface SaveEventResponse {
  saved: true;
  ics_url: string;
  register_url?: string;
}

/** goal = "2 of 3 events" toward a reward; entries = every check-in is one more entry in a drawing */
export type RewardStyle = "goal" | "entries";

export interface RewardProgress {
  program: RewardProgram;
  attended: number;
  required: number;
  next_eligible_events: Event[];
  // P3 additions (optional, so older clients and mocks still type-check)
  style?: RewardStyle;
  /** The student's check-ins that counted, oldest first */
  attended_events?: { id: UUID; title: string; starts_at: ISODate; checked_in_at: ISODate | null }[];
  /** When the goal was reached (goal style only); null while in progress */
  completed_at?: ISODate | null;
}

export type RewardsProgressResponse = RewardProgress[];

/** GET /rewards/checkins: every event the student checked in to, newest first */
export interface MyCheckinsResponse {
  checkins: { event: Event; checked_in_at: ISODate | null }[];
}

/** How a perk is earned: show up, do a small task, apply, or compete */
export type PerkWay = "attend" | "task" | "apply" | "compete";

/** One way to earn something around USC (GET /rewards/perks). Facts come from `url`. */
export interface Perk {
  id: string;
  name: string;
  office: string;
  way: PerkWay;
  /** true = money, gift cards, prizes, food; false = recognition (honor cord, trophy, priority access) */
  redeemable: boolean;
  reward: string;
  how_to_earn: string;
  who: string;
  when: string;
  deadline: ISODate | null;
  /** Official page (or a TrojanHub path starting with "/") */
  url: string;
  /** TrojanHub check-ins count toward this reward program */
  tracked_program_id: UUID | null;
}

export interface PerksResponse {
  perks: Perk[];
  checked_on: ISODate; // the date the official pages were last checked
}

export type FeedItem = { kind: "event"; event: Event; reason?: string } | { kind: "deal"; deal: Deal; reason?: string };

export interface FeedResponse {
  for_you: FeedItem[]; // 3 items
  today_freebies: FeedItem[];
}

// ---------------------------------------------------------------------------
// P4 Complaints & Admin
// ---------------------------------------------------------------------------
export interface ComplaintRequest {
  text: string;
  building_id?: UUID;
  building?: string; // building code or name ("GFS", "Leavey Library") when it isn't in `text`; building_id wins
  room?: string;
  anonymous?: boolean;
  confirm?: boolean; // false/absent = draft only; true = create/merge the ticket
  source?: ComplaintSource; // "chat" when Tommy files it
  photo?: string; // optional photo of the problem: a data: URL (or a link into our Supabase Storage); stored privately on confirm
}

export interface ComplaintDraft {
  department: Department;
  category: string;
  urgency: Urgency;
  building: string | null; // building code, e.g. "GFS"
  building_id: UUID | null;
  room: string | null;
  summary: string;
  confidence: number; // 0..1, shown on the admin dashboard
  reason: string; // one-line "why this department"
}

export interface ComplaintDraftResponse {
  draft: ComplaintDraft;
  duplicate_ticket?: { id: UUID; report_count: number };
  safety?: { dps_phone: string; message: string }; // present => do NOT create a ticket
}

export interface ComplaintConfirmResponse {
  ticket: Ticket;
  route_url: string | null;
  photo_saved?: boolean;
}

export interface MyComplaintsResponse {
  complaints: { complaint: Omit<Complaint, "photo_path"> & { has_photo: boolean }; ticket: Ticket | null }[];
}

export interface UpvoteResponse {
  report_count: number;
}

export interface AdminComplaintsParams {
  department?: Department;
  building?: string; // building code
  urgency?: Urgency;
  from?: ISODate;
}

export interface AdminComplaintRow {
  id: UUID;
  ticket_id: UUID | null;
  logged_at: ISODate;
  text: string;
  building: string | null;
  room: string | null;
  source: ComplaintSource;
  ai_department: Department | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  corrected_department: Department | null;
  forwarded_to: string | null;
  forwarded_at: ISODate | null;
  status: TicketStatus;
  urgency: Urgency;
  report_count: number;
  photo_url: string | null; // signed link to the private photo, valid ~1 hour
}

export interface AdminComplaintPatch {
  corrected_department?: Department;
  status?: TicketStatus;
}

export interface AdminStatsResponse {
  total: number;
  forwarded_pct: number;
  routing_accuracy_pct: number;
  by_department: { department: Department; count: number }[];
  by_building: { building: string; count: number }[];
}
