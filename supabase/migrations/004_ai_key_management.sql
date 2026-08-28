create table public.ai_provider_keys (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  label                 text not null default 'Key',
  provider              text not null,
  base_url              text,
  model                 text,
  api_key_enc           text not null,
  api_key_iv            text not null,
  priority              integer not null default 0,
  is_active             boolean not null default true,
  daily_request_limit   integer,
  monthly_token_limit   integer,
  consecutive_errors    integer not null default 0,
  last_used_at          timestamptz,
  last_error_at         timestamptz,
  last_error_message    text,
  cost_per_1m_input     numeric(10,4) default 0,
  cost_per_1m_output    numeric(10,4) default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.ai_provider_keys enable row level security;

create policy "ai_provider_keys: users own their rows"
  on public.ai_provider_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_ai_provider_keys_user_id on public.ai_provider_keys(user_id);
create index idx_ai_provider_keys_priority on public.ai_provider_keys(user_id, priority);

create table public.ai_key_usage (
  key_id          uuid not null references public.ai_provider_keys(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  date            date not null default current_date,
  requests        integer not null default 0,
  tokens_in       integer not null default 0,
  tokens_out      integer not null default 0,
  estimated_cost  numeric(10,6) not null default 0,
  primary key (key_id, date)
);

alter table public.ai_key_usage enable row level security;

create policy "ai_key_usage: users own their rows"
  on public.ai_key_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_ai_key_usage_user_date on public.ai_key_usage(user_id, date desc);

create or replace function public.record_ai_key_usage(
  p_key_id    uuid,
  p_user_id   uuid,
  p_tokens_in integer,
  p_tokens_out integer,
  p_cost      numeric
) returns void language plpgsql security definer as $$
begin
  insert into public.ai_key_usage (key_id, user_id, date, requests, tokens_in, tokens_out, estimated_cost)
  values (p_key_id, p_user_id, current_date, 1, p_tokens_in, p_tokens_out, p_cost)
  on conflict (key_id, date) do update set
    requests       = ai_key_usage.requests + 1,
    tokens_in      = ai_key_usage.tokens_in + p_tokens_in,
    tokens_out     = ai_key_usage.tokens_out + p_tokens_out,
    estimated_cost = ai_key_usage.estimated_cost + p_cost;
  update public.ai_provider_keys set
    consecutive_errors = 0,
    last_used_at       = now(),
    updated_at         = now()
  where id = p_key_id;
end;
$$;

create or replace function public.record_ai_key_error(
  p_key_id        uuid,
  p_error_message text
) returns void language plpgsql security definer as $$
begin
  update public.ai_provider_keys set
    consecutive_errors  = consecutive_errors + 1,
    last_error_at       = now(),
    last_error_message  = p_error_message,
    updated_at          = now()
  where id = p_key_id;
end;
$$;

create trigger trg_ai_provider_keys_updated_at
  before update on public.ai_provider_keys
  for each row execute function public.set_updated_at();
