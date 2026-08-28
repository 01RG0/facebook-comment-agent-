-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- profiles — mirrors auth.users
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: users own their row"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- pages — connected Facebook Pages
-- ============================================================
create table public.pages (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  fb_page_id          text not null,
  page_name           text not null,
  page_picture_url    text,
  access_token_enc    text not null,
  access_token_iv     text not null,
  agent_enabled       boolean not null default false,
  webhook_subscribed  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, fb_page_id)
);

alter table public.pages enable row level security;

create policy "pages: users own their rows"
  on public.pages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_pages_user_id on public.pages(user_id);
create index idx_pages_fb_page_id on public.pages(fb_page_id);

-- ============================================================
-- settings — per-page AI and agent configuration
-- ============================================================
create table public.settings (
  id                      uuid primary key default uuid_generate_v4(),
  page_id                 uuid not null references public.pages(id) on delete cascade,
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  ai_provider             text not null default 'gemini',
  ai_model                text,
  ai_api_key_enc          text,
  ai_api_key_iv           text,
  reply_instructions      text not null default 'You are a helpful assistant for this Facebook page. Reply warmly, concisely, and helpfully to comments. Always use the same language as the commenter.',
  reply_language          text not null default 'auto',
  reply_delay_seconds     integer not null default 0 check (reply_delay_seconds >= 0 and reply_delay_seconds <= 3600),
  max_replies_per_hour    integer not null default 100 check (max_replies_per_hour > 0),
  keyword_filter          text[],
  blacklisted_user_ids    text[],
  reply_to_own_posts_only boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (page_id)
);

alter table public.settings enable row level security;

create policy "settings: users own their rows"
  on public.settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_settings_page_id on public.settings(page_id);

-- ============================================================
-- comments_log — interaction history
-- ============================================================
create table public.comments_log (
  id               uuid primary key default uuid_generate_v4(),
  page_id          uuid not null references public.pages(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  fb_comment_id    text not null unique,
  fb_post_id       text not null,
  commenter_id     text not null,
  commenter_name   text not null,
  comment_text     text not null,
  reply_text       text,
  status           text not null default 'pending'
                     check (status in ('pending', 'replied', 'skipped', 'failed', 'manual')),
  skip_reason      text,
  ai_provider      text,
  ai_model         text,
  error_message    text,
  replied_at       timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.comments_log enable row level security;

create policy "comments_log: users own their rows"
  on public.comments_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_comments_log_page_id on public.comments_log(page_id);
create index idx_comments_log_user_id on public.comments_log(user_id);
create index idx_comments_log_created_at on public.comments_log(created_at desc);
create index idx_comments_log_status on public.comments_log(status);

-- ============================================================
-- rate_limit_buckets — per-page hourly reply counters
-- ============================================================
create table public.rate_limit_buckets (
  page_id      uuid not null references public.pages(id) on delete cascade,
  bucket_hour  timestamptz not null,
  reply_count  integer not null default 0,
  primary key (page_id, bucket_hour)
);

alter table public.rate_limit_buckets enable row level security;

create policy "rate_limit_buckets: users own their rows"
  on public.rate_limit_buckets for all
  using (
    auth.uid() = (select user_id from public.pages where id = page_id)
  );

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_pages_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

create trigger trg_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();
