-- StudyAgent — initial schema
-- Requires: pgvector extension (enable in Supabase dashboard or via SQL)

create extension if not exists vector;
create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles: extends auth.users
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- Trigger: crear profile cuando se crea un user en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- documents
-- ============================================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  storage_path text not null unique,
  size_bytes int not null,
  page_count int,
  status text not null default 'pending'
    check (status in ('pending', 'ingesting', 'ready', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  ingested_at timestamptz
);

create index documents_user_id_idx on public.documents(user_id);

alter table public.documents enable row level security;

create policy "documents_select_own"
  on public.documents for select
  using (user_id = auth.uid());

create policy "documents_insert_own"
  on public.documents for insert
  with check (user_id = auth.uid());

create policy "documents_update_own"
  on public.documents for update
  using (user_id = auth.uid());

create policy "documents_delete_own"
  on public.documents for delete
  using (user_id = auth.uid());

-- ============================================================================
-- chunks
-- ============================================================================
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  chunk_index int not null,
  page_number int,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index chunks_document_id_idx on public.chunks(document_id);
create index chunks_user_id_idx on public.chunks(user_id);

-- Índice HNSW para búsqueda vectorial. Cosine porque OpenAI normaliza embeddings.
create index chunks_embedding_idx
  on public.chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.chunks enable row level security;

create policy "chunks_select_own"
  on public.chunks for select
  using (user_id = auth.uid());

create policy "chunks_insert_own"
  on public.chunks for insert
  with check (user_id = auth.uid());

create policy "chunks_delete_own"
  on public.chunks for delete
  using (user_id = auth.uid());

-- ============================================================================
-- conversations + messages
-- ============================================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations(user_id, updated_at desc);

alter table public.conversations enable row level security;

create policy "conversations_select_own"
  on public.conversations for select
  using (user_id = auth.uid());

create policy "conversations_insert_own"
  on public.conversations for insert
  with check (user_id = auth.uid());

create policy "conversations_update_own"
  on public.conversations for update
  using (user_id = auth.uid());

create policy "conversations_delete_own"
  on public.conversations for delete
  using (user_id = auth.uid());

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content jsonb not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages(conversation_id, created_at);

alter table public.messages enable row level security;

-- Las messages se filtran via conversation_id; check que la conversación es del usuario.
create policy "messages_select_via_conversation"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy "messages_insert_via_conversation"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Storage bucket (configurar via dashboard o por SQL Storage API)
-- ============================================================================
-- Nota: el bucket 'documents' debe crearse desde Supabase Studio o vía API
-- y configurar como privado. Política de acceso:
--
--   (storage.foldername(name))[1] = auth.uid()::text
--
-- Aplicada a SELECT, INSERT, UPDATE, DELETE.
