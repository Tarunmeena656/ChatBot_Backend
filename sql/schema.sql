create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  name text,
  direct_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists chat_members (
  chat_id uuid not null references chats (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_members_user_idx on chat_members (user_id);
