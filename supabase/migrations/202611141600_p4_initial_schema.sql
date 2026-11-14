-- TrojanHub initial schema (ARCHITECTURE.md §5).
-- Owner: P4 (Jaymin). Others propose changes by PR with a new migration file.
--
-- Embedding dimensions (decided in Phase 0):
--   text  = 384  (sentence-transformers/all-MiniLM-L6-v2)  -> doc_chunks, tickets
--   CLIP  = 512  (open_clip ViT-B-32)                      -> items (image + text)

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role       as enum ('student', 'org_admin', 'dept_admin', 'usg_admin');
create type item_kind       as enum ('found', 'lost');
create type item_tier       as enum ('valuable', 'everyday');
create type item_status     as enum ('open', 'claimed', 'archived');
create type thread_status   as enum ('open', 'handed_off', 'closed');
create type dropoff_type    as enum ('dps', 'it');
create type event_source    as enum ('org', 'community', 'flyer');
create type event_status    as enum ('draft', 'published', 'cancelled');
create type deal_kind       as enum ('ongoing', 'one_time');
create type notif_type      as enum ('digest', 'reminder', 'match');
create type department      as enum ('Facilities', 'Housing', 'ITS', 'Transportation', 'DPS');
create type urgency         as enum ('low', 'medium', 'high', 'safety');
create type ticket_status   as enum ('reported', 'sent', 'resolved');
create type complaint_source as enum ('chat', 'form');

-- ---------------------------------------------------------------------------
-- Core (P4)
-- ---------------------------------------------------------------------------
create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  name              text,
  role              user_role not null default 'student',
  interests         text[] not null default '{}',
  notify_email      boolean not null default false,
  notify_push       boolean not null default false,
  notify_categories text[] not null default '{}',
  expo_push_token   text,
  created_at        timestamptz not null default now()
);

create table orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  verified   boolean not null default false,
  owner_id   uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table buildings (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Chatbot (P1)
-- ---------------------------------------------------------------------------
create table doc_chunks (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  title      text not null,
  section    text,
  content    text not null,
  contacts   jsonb not null default '{}',
  embedding  vector(384),
  fts        tsvector generated always as (to_tsvector('english', title || ' ' || coalesce(section, '') || ' ' || content)) stored,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index doc_chunks_embedding_idx on doc_chunks using hnsw (embedding vector_cosine_ops);
create index doc_chunks_fts_idx on doc_chunks using gin (fts);
create index doc_chunks_url_idx on doc_chunks (url);

create table chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles (id) on delete cascade,
  session_id text not null,
  role       text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content    text,
  tool_calls jsonb,
  sources    jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on chat_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Lost & Found (P2)
-- ---------------------------------------------------------------------------
create table dropoff_points (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        dropoff_type not null,
  building_id uuid references buildings (id),
  hours       text,
  url         text,
  created_at  timestamptz not null default now()
);

create table items (
  id               uuid primary key default gen_random_uuid(),
  kind             item_kind not null,
  tier             item_tier not null default 'everyday',
  title            text not null,
  description      text,
  photo_url        text,
  img_embedding    vector(512),
  text_embedding   vector(512),
  building_id      uuid references buildings (id),
  location_text    text,
  dropoff_point_id uuid references dropoff_points (id),
  status           item_status not null default 'open',
  posted_by        uuid references profiles (id) on delete set null,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index items_img_embedding_idx on items using hnsw (img_embedding vector_cosine_ops);
create index items_status_idx on items (status, kind);

create table item_threads (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items (id) on delete cascade,
  owner_id   uuid not null references profiles (id) on delete cascade,
  finder_id  uuid not null references profiles (id) on delete cascade,
  status     thread_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (item_id, owner_id)
);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references item_threads (id) on delete cascade,
  sender_id  uuid not null references profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Events, Deals & Freebies (P3)
-- ---------------------------------------------------------------------------
create table events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  building_id     uuid references buildings (id),
  location_text   text,
  category        text not null default 'other',
  is_free         boolean not null default true,
  has_freebie     boolean not null default false,
  freebie_desc    text,
  register_url    text,
  ticket_url      text,
  tickets_open_at timestamptz,
  org_id          uuid references orgs (id) on delete set null,
  posted_by       uuid references profiles (id) on delete set null,
  source          event_source not null default 'community',
  flyer_url       text,
  status          event_status not null default 'published',
  created_at      timestamptz not null default now()
);
create index events_starts_idx on events (starts_at);

create table deals (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  kind               deal_kind not null,
  how_to_claim       text,
  link               text,
  starts_at          timestamptz,
  expires_at         timestamptz,
  posted_by          uuid references profiles (id) on delete set null,
  still_active_votes int not null default 0,
  created_at         timestamptz not null default now()
);

create table event_saves (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  event_id         uuid not null references events (id) on delete cascade,
  registered       boolean not null default false,
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, event_id)
);

create table reward_programs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  office         text not null,
  reward_desc    text,
  required_count int not null,
  rules_url      text,
  created_at     timestamptz not null default now()
);

create table reward_program_events (
  program_id uuid not null references reward_programs (id) on delete cascade,
  event_id   uuid not null references events (id) on delete cascade,
  primary key (program_id, event_id)
);

create table attendance (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  event_id      uuid not null references events (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create table notification_log (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type    notif_type not null,
  ref_id  uuid,
  sent_at timestamptz not null default now(),
  unique (user_id, type, ref_id)
);

-- ---------------------------------------------------------------------------
-- Complaints (P4)
-- ---------------------------------------------------------------------------
create table routes (
  id         uuid primary key default gen_random_uuid(),
  department department not null,
  category   text not null default '*',
  form_url   text,
  email      text,
  created_at timestamptz not null default now(),
  unique (department, category)
);

create table tickets (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid references buildings (id),
  room         text,
  department   department not null,
  category     text not null,
  urgency      urgency not null default 'medium',
  summary      text not null,
  status       ticket_status not null default 'reported',
  report_count int not null default 1,
  route_url    text,
  embedding    vector(384),
  created_at   timestamptz not null default now()
);
create index tickets_open_idx on tickets (building_id, status);

create table complaints (
  id                   uuid primary key default gen_random_uuid(),
  ticket_id            uuid references tickets (id) on delete set null,
  reporter_id          uuid references profiles (id) on delete set null,  -- null = anonymous
  raw_text             text not null,
  room                 text,
  building_id          uuid references buildings (id),
  source               complaint_source not null default 'form',
  ai_department        department,
  ai_confidence        real,
  ai_reason            text,
  corrected_department department,
  forwarded_to         text,
  forwarded_at         timestamptz,
  created_at           timestamptz not null default now()
);
create index complaints_ticket_idx on complaints (ticket_id);

-- ---------------------------------------------------------------------------
-- Vector search helpers (called by the AI service with the service role key)
-- ---------------------------------------------------------------------------
create or replace function match_doc_chunks(query_embedding vector(384), match_count int default 8)
returns table (id uuid, url text, title text, section text, content text, contacts jsonb, similarity float)
language sql stable as $$
  select d.id, d.url, d.title, d.section, d.content, d.contacts,
         1 - (d.embedding <=> query_embedding) as similarity
  from doc_chunks d
  where d.embedding is not null
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_items(query_embedding vector(512), match_kind item_kind default 'found', match_count int default 10)
returns table (id uuid, img_similarity float, text_similarity float)
language sql stable as $$
  select i.id,
         coalesce(1 - (i.img_embedding <=> query_embedding), 0)  as img_similarity,
         coalesce(1 - (i.text_embedding <=> query_embedding), 0) as text_similarity
  from items i
  where i.status = 'open' and i.kind = match_kind and i.img_embedding is not null
  order by i.img_embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_open_tickets(query_embedding vector(384), match_building uuid, match_count int default 5)
returns table (id uuid, room text, summary text, report_count int, similarity float)
language sql stable as $$
  select t.id, t.room, t.summary, t.report_count, 1 - (t.embedding <=> query_embedding) as similarity
  from tickets t
  where t.status <> 'resolved'
    and t.building_id is not distinct from match_building
    and t.created_at > now() - interval '7 days'
    and t.embedding is not null
  order by t.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Auth: @usc.edu only, and a profile row for every new user
-- ---------------------------------------------------------------------------
create or replace function public.enforce_usc_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) not like '%@usc.edu' then
    raise exception 'TrojanHub is for Trojans: please sign in with your @usc.edu email';
  end if;
  return new;
end;
$$;

create trigger enforce_usc_email
  before insert on auth.users
  for each row execute function public.enforce_usc_email();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
--   Anyone logged in can read public rows; users edit only their own rows.
--   The AI service uses the service role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table profiles              enable row level security;
alter table orgs                  enable row level security;
alter table buildings             enable row level security;
alter table doc_chunks            enable row level security;
alter table chat_messages         enable row level security;
alter table dropoff_points        enable row level security;
alter table items                 enable row level security;
alter table item_threads          enable row level security;
alter table messages              enable row level security;
alter table events                enable row level security;
alter table deals                 enable row level security;
alter table event_saves           enable row level security;
alter table reward_programs       enable row level security;
alter table reward_program_events enable row level security;
alter table attendance            enable row level security;
alter table notification_log      enable row level security;
alter table routes                enable row level security;
alter table tickets               enable row level security;
alter table complaints            enable row level security;

-- Public read for logged-in users
create policy "read" on orgs                  for select to authenticated using (true);
create policy "read" on buildings             for select to authenticated using (true);
create policy "read" on dropoff_points        for select to authenticated using (true);
create policy "read" on items                 for select to authenticated using (true);
create policy "read" on events                for select to authenticated using (status = 'published' or posted_by = auth.uid());
create policy "read" on deals                 for select to authenticated using (true);
create policy "read" on reward_programs       for select to authenticated using (true);
create policy "read" on reward_program_events for select to authenticated using (true);
create policy "read" on routes                for select to authenticated using (true);
create policy "read" on tickets               for select to authenticated using (true);

-- Profiles: everyone can see names; you edit only yourself (role changes go through the service role)
create policy "read" on profiles for select to authenticated using (true);
create policy "update own" on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from profiles p where p.id = auth.uid()));

-- Own rows
create policy "insert own" on items for insert to authenticated with check (posted_by = auth.uid());
create policy "update own" on items for update to authenticated using (posted_by = auth.uid());

create policy "insert own" on events for insert to authenticated
  with check (posted_by = auth.uid() and (source <> 'org' or exists (
    select 1 from orgs o where o.id = org_id and o.owner_id = auth.uid() and o.verified)));
create policy "update own" on events for update to authenticated using (posted_by = auth.uid());

create policy "insert own" on deals for insert to authenticated with check (posted_by = auth.uid());
create policy "update own" on deals for update to authenticated using (posted_by = auth.uid());

create policy "own" on event_saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on attendance  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read own" on chat_messages    for select to authenticated using (user_id = auth.uid());
create policy "read own" on notification_log for select to authenticated using (user_id = auth.uid());
create policy "read own" on complaints       for select to authenticated using (reporter_id = auth.uid());

-- Lost & Found threads: only the two people in the thread
create policy "participants" on item_threads for select to authenticated
  using (auth.uid() in (owner_id, finder_id));
create policy "participants read" on messages for select to authenticated
  using (exists (select 1 from item_threads t where t.id = thread_id and auth.uid() in (t.owner_id, t.finder_id)));
create policy "participants send" on messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from item_threads t where t.id = thread_id and auth.uid() in (t.owner_id, t.finder_id)));

-- ---------------------------------------------------------------------------
-- Realtime + Storage
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table messages;

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true), ('flyers', 'flyers', true)
on conflict (id) do nothing;

create policy "upload photos/flyers" on storage.objects for insert to authenticated
  with check (bucket_id in ('photos', 'flyers'));
create policy "read photos/flyers" on storage.objects for select
  using (bucket_id in ('photos', 'flyers'));
