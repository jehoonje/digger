-- Digger: YouTube search result cache
create table if not exists public.yt_cache (
  q text primary key,
  videos jsonb not null,
  source text,
  created_at timestamptz not null default now()
);
alter table public.yt_cache enable row level security;
-- No policies: only the server (service role key) can read/write.

-- Daily live-search counter (KST)
create table if not exists public.search_usage (
  day date primary key,
  searches integer not null default 0
);
alter table public.search_usage enable row level security;
create or replace function public.bump_search(p_day date)
returns integer language sql security invoker set search_path = '' as $$
  insert into public.search_usage (day, searches) values (p_day, 1)
  on conflict (day) do update set searches = public.search_usage.searches + 1
  returning searches;
$$;
revoke execute on function public.bump_search(date) from public, anon, authenticated;
grant execute on function public.bump_search(date) to service_role;
