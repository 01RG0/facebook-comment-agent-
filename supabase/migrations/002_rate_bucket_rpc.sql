-- RPC to atomically increment rate-limit bucket (called by worker with service role)
create or replace function public.increment_rate_bucket(
  p_page_id   uuid,
  p_bucket_hour timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rate_limit_buckets (page_id, bucket_hour, reply_count)
  values (p_page_id, p_bucket_hour, 1)
  on conflict (page_id, bucket_hour)
  do update set reply_count = rate_limit_buckets.reply_count + 1;
end;
$$;
