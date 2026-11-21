-- Digger: YouTube search result cache
create table if not exists public.yt_cache (
  q text primary key,
  videos jsonb not null,
  source text,
  created_at timestamptz not null default now()
);
alter table public.yt_cache enable row level security;
-- No policies: only the server (service role key) can read/write.
