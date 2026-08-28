-- ============================================================
-- custom_ai_providers — admin-managed provider registry
-- ============================================================
create table public.custom_ai_providers (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null unique,        -- slug used in settings (e.g. 'azure-gpt4')
  display_name  text not null,               -- shown in UI
  provider_type text not null default 'openai-compat'
                  check (provider_type in ('gemini', 'mistral', 'openai', 'openai-compat')),
  base_url      text,                        -- for openai-compat providers
  default_model text,
  -- encrypted system-level API key (admin sets, all users share unless they override)
  api_key_enc   text,
  api_key_iv    text,
  is_enabled    boolean not null default true,
  sort_order    integer not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Only admin reads/writes (no RLS subject = service role only)
-- Non-admin users read only enabled providers via API
alter table public.custom_ai_providers enable row level security;
create policy "custom_ai_providers: public read enabled"
  on public.custom_ai_providers for select
  using (is_enabled = true);

create trigger trg_custom_providers_updated_at
  before update on public.custom_ai_providers
  for each row execute function public.set_updated_at();

-- ============================================================
-- ai_usage_logs — per-request AI audit trail
-- ============================================================
create table public.ai_usage_logs (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  page_id          uuid references public.pages(id) on delete set null,
  comment_log_id   uuid references public.comments_log(id) on delete set null,
  provider         text not null,
  model            text,
  prompt_tokens    integer,
  completion_tokens integer,
  total_tokens     integer,
  latency_ms       integer,
  success          boolean not null default true,
  error_message    text,
  created_at       timestamptz not null default now()
);

alter table public.ai_usage_logs enable row level security;

-- Users can read their own logs; admin reads all via service role
create policy "ai_usage_logs: users own their rows"
  on public.ai_usage_logs for select
  using (auth.uid() = user_id);

create index idx_ai_usage_logs_user_id    on public.ai_usage_logs(user_id);
create index idx_ai_usage_logs_created_at on public.ai_usage_logs(created_at desc);
create index idx_ai_usage_logs_provider   on public.ai_usage_logs(provider);
create index idx_ai_usage_logs_success    on public.ai_usage_logs(success);

-- ============================================================
-- usage_limits — admin-set per-user limits
-- ============================================================
create table public.usage_limits (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  max_requests_per_day   integer,   -- null = unlimited
  max_tokens_per_day     integer,
  max_requests_per_month integer,
  max_tokens_per_month   integer,
  is_suspended           boolean not null default false,
  notes                  text,
  updated_at             timestamptz not null default now()
);

alter table public.usage_limits enable row level security;
-- Users can read their own limits; admin uses service role
create policy "usage_limits: users read own"
  on public.usage_limits for select
  using (auth.uid() = user_id);

-- ============================================================
-- usage_daily_buckets — fast daily counter for limit checks
-- ============================================================
create table public.usage_daily_buckets (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  bucket_day    date not null,
  request_count integer not null default 0,
  token_count   integer not null default 0,
  primary key (user_id, bucket_day)
);

alter table public.usage_daily_buckets enable row level security;
create policy "usage_daily_buckets: users read own"
  on public.usage_daily_buckets for select
  using (auth.uid() = user_id);

create index idx_usage_daily_buckets_user_day on public.usage_daily_buckets(user_id, bucket_day desc);

-- ============================================================
-- RPC: atomically increment daily usage bucket
-- ============================================================
create or replace function public.increment_usage_bucket(
  p_user_id     uuid,
  p_bucket_day  date,
  p_requests    integer default 1,
  p_tokens      integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usage_daily_buckets (user_id, bucket_day, request_count, token_count)
  values (p_user_id, p_bucket_day, p_requests, p_tokens)
  on conflict (user_id, bucket_day)
  do update set
    request_count = usage_daily_buckets.request_count + p_requests,
    token_count   = usage_daily_buckets.token_count   + p_tokens;
end;
$$;
