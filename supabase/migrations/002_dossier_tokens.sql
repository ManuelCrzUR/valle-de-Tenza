-- Enlaces de descarga del dossier. Solo la service role. El token en claro no se guarda.

create table if not exists public.dossier_tokens (
  token_hash text primary key,
  reservation_request_id uuid not null references public.reservation_requests (id),
  expira timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.dossier_tokens enable row level security;
revoke all on table public.dossier_tokens from anon, authenticated;
