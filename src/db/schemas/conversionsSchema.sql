create table if not exists public.conversions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  agent_id uuid null references public.users(id) on delete set null,
  type text not null check (type in ('ORDER', 'SALE')),
  value numeric null,
  notes text null,
  created_at timestamp without time zone not null default now()
);


alter table public.leads
  add column if not exists last_conversion_id uuid references public.conversions(id) on delete set null;
