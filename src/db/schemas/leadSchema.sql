create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agent_id uuid null,
  whatsapp_jid text not null,
  whatsapp_lid text not null,
  conversion_type text null check (conversion_type in ('ORDER', 'SALE')),
  status text not null default 'PENDING' check (status in ('FAILED', 'SUCCESS', 'PENDING', 'FOLLOW_UP', 'LOSE')),
  created_at timestamp without time zone not null default now(),
  last_contact_at timestamp without time zone null,
  last_agent_message_at timestamp without time zone null,

  -- Relacionamentos
  constraint leads_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint leads_agent_id_fkey foreign key (agent_id) references users (id) on delete set null
);