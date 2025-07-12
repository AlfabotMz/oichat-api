create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  name text not null,
  description text not null,
  prompt text not null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

create index if not exists idx_agents_user_id on public.agents (user_id);
create index if not exists idx_agents_name on public.agents (name);


create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_agents_updated_at
before update on public.agents
for each row
execute procedure update_updated_at_column();
