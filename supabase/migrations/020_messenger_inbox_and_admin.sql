-- ============================================================
-- 020: Admin flag on profiles + Messenger Inbox tables
-- ============================================================

-- ---- 1. Admin flag ----
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Only admins can read other profiles' is_admin; users can read their own
create policy "profiles: admin read all"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ---- 2. Team member display names ----
alter table public.team_members
  add column if not exists display_name text;

-- ---- 3. Messenger Threads ----
create table public.messenger_threads (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references public.pages(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  sender_id       text not null,
  sender_name     text,
  sender_avatar   text,
  status          text not null default 'open'
                    check (status in ('open','in_progress','resolved','snoozed')),
  priority        text not null default 'normal'
                    check (priority in ('normal','urgent')),
  assigned_to     uuid references public.profiles(id) on delete set null,
  labels          text[] not null default '{}',
  unread_count    int  not null default 0,
  snoozed_until   timestamptz,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (page_id, sender_id)
);

alter table public.messenger_threads enable row level security;

create policy "messenger_threads: page owners and team members"
  on public.messenger_threads for all
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.team_members tm
      where tm.page_id = messenger_threads.page_id
        and tm.member_id = auth.uid()
    )
  );

-- ---- 4. Messenger Messages ----
create table public.messenger_messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.messenger_threads(id) on delete cascade,
  fb_message_id  text unique,
  direction      text not null check (direction in ('inbound','outbound')),
  text           text not null,
  sent_by        uuid references public.profiles(id) on delete set null,
  sent_by_label  text,   -- 'ai', 'human', 'auto-reply', or team member name
  ai_confidence  int,    -- 0-100, only for AI-drafted messages
  delivered_at   timestamptz,
  read_at        timestamptz,
  sent_at        timestamptz not null default now()
);

alter table public.messenger_messages enable row level security;

create policy "messenger_messages: via thread access"
  on public.messenger_messages for all
  using (
    exists (
      select 1 from public.messenger_threads mt
      where mt.id = messenger_messages.thread_id
        and (
          mt.user_id = auth.uid()
          or exists (
            select 1 from public.team_members tm
            where tm.page_id = mt.page_id and tm.member_id = auth.uid()
          )
        )
    )
  );

-- ---- 5. Internal Thread Notes ----
create table public.messenger_notes (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.messenger_threads(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  mentions   uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.messenger_notes enable row level security;

create policy "messenger_notes: via thread access"
  on public.messenger_notes for all
  using (
    exists (
      select 1 from public.messenger_threads mt
      where mt.id = messenger_notes.thread_id
        and (
          mt.user_id = auth.uid()
          or exists (
            select 1 from public.team_members tm
            where tm.page_id = mt.page_id and tm.member_id = auth.uid()
          )
        )
    )
  );

-- ---- 6. Thread Event Audit Log ----
create table public.thread_events (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.messenger_threads(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  event_type text not null,
  -- e.g. 'assigned','status_changed','label_added','note_added','message_sent'
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.thread_events enable row level security;

create policy "thread_events: via thread access"
  on public.thread_events for select
  using (
    exists (
      select 1 from public.messenger_threads mt
      where mt.id = thread_events.thread_id
        and (
          mt.user_id = auth.uid()
          or exists (
            select 1 from public.team_members tm
            where tm.page_id = mt.page_id and tm.member_id = auth.uid()
          )
        )
    )
  );

-- ---- 7. Indexes ----
create index messenger_threads_page_id_idx      on public.messenger_threads(page_id);
create index messenger_threads_assigned_to_idx  on public.messenger_threads(assigned_to);
create index messenger_threads_status_idx       on public.messenger_threads(status);
create index messenger_threads_last_message_idx on public.messenger_threads(last_message_at desc);
create index messenger_messages_thread_id_idx   on public.messenger_messages(thread_id);
create index messenger_messages_sent_at_idx     on public.messenger_messages(sent_at desc);
create index thread_events_thread_id_idx        on public.thread_events(thread_id);
