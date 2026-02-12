create table if not exists public.agents (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone_number text null,
  status text null default 'active'::text,
  n8n_webhook_url text null,
  created_at timestamp without time zone null default now(),
  updated_at timestamp without time zone null default now(),
  "instanceName" text null,
  prompt text null,
  anexos jsonb null default '{}'::jsonb,
  contact_owner text null,
  contact_delivery text null,
  product text null,
  message_delay integer null default 0,
  amount text null,
  custom_message text null,
  prompt_type text null default 'dropshipper'::text,
  audience text null,
  tone text null,
  product_description text null,
  prompt_generated text null,
  constraint agents_pkey primary key (id),
  constraint agents_instanceName_key unique ("instanceName")
) tablespace pg_default;

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
