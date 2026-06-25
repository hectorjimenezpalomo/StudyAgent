-- StudyAgent — durable ingestion, chat rate limits and privacy-preserving traces.
--
-- This migration adds new tables only. Existing RLS policies remain unchanged.

-- ============================================================================
-- Durable PDF ingestion queue
-- ============================================================================
create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retrying', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingestion_jobs_claim_idx
  on public.ingestion_jobs(status, next_attempt_at, created_at);

alter table public.ingestion_jobs enable row level security;

create policy "ingestion_jobs_select_own"
  on public.ingestion_jobs for select
  using (user_id = auth.uid());

create policy "ingestion_jobs_insert_own"
  on public.ingestion_jobs for insert
  with check (
    user_id = auth.uid()
    and status = 'queued'
    and attempts = 0
  );

create or replace function public.claim_ingestion_job(p_worker_id text)
returns table (
  id uuid,
  document_id uuid,
  user_id uuid,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.ingestion_jobs j
    where
      (
        j.status in ('queued', 'retrying')
        and j.next_attempt_at <= now()
      )
      or (
        j.status = 'processing'
        and j.locked_at < now() - interval '15 minutes'
      )
    order by j.next_attempt_at asc, j.created_at asc
    for update skip locked
    limit 1
  ), claimed as (
    update public.ingestion_jobs j
    set
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
    from candidate
    where j.id = candidate.id
    returning j.id, j.document_id, j.user_id, j.attempts, j.max_attempts
  )
  select * from claimed;
end;
$$;

create or replace function public.complete_ingestion_job(p_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ingestion_jobs
  set
    status = 'completed',
    locked_at = null,
    locked_by = null,
    last_error = null,
    updated_at = now()
  where id = p_job_id and status = 'processing';
$$;

create or replace function public.retry_ingestion_job(
  p_job_id uuid,
  p_error text,
  p_retry_delay_seconds integer default 60
)
returns table (
  retry_scheduled boolean,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_max_attempts integer;
begin
  select j.attempts, j.max_attempts
  into v_attempts, v_max_attempts
  from public.ingestion_jobs j
  where j.id = p_job_id and j.status = 'processing'
  for update;

  if not found then
    raise exception 'Ingestion job % is not processing', p_job_id;
  end if;

  if v_attempts >= v_max_attempts then
    update public.ingestion_jobs
    set
      status = 'failed',
      locked_at = null,
      locked_by = null,
      last_error = left(p_error, 500),
      updated_at = now()
    where id = p_job_id;

    return query select false, v_attempts;
    return;
  end if;

  update public.ingestion_jobs
  set
    status = 'retrying',
    next_attempt_at = now() + make_interval(secs => greatest(p_retry_delay_seconds, 1)),
    locked_at = null,
    locked_by = null,
    last_error = left(p_error, 500),
    updated_at = now()
  where id = p_job_id;

  return query select true, v_attempts;
end;
$$;

revoke all on function public.claim_ingestion_job(text) from public;
revoke all on function public.complete_ingestion_job(uuid) from public;
revoke all on function public.retry_ingestion_job(uuid, text, integer) from public;
grant execute on function public.claim_ingestion_job(text) to service_role;
grant execute on function public.complete_ingestion_job(uuid) to service_role;
grant execute on function public.retry_ingestion_job(uuid, text, integer) to service_role;

-- ============================================================================
-- Fixed-window chat quota. The function derives the user from the JWT so a
-- caller cannot consume another user's quota by passing a forged id.
-- ============================================================================
create table public.chat_rate_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.chat_rate_limits enable row level security;

create policy "chat_rate_limits_select_own"
  on public.chat_rate_limits for select
  using (user_id = auth.uid());

create or replace function public.consume_chat_rate_limit(
  p_limit integer,
  p_window_seconds integer default 60
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_started_at timestamptz;
  v_request_count integer;
  v_window_seconds integer := greatest(p_window_seconds, 1);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.chat_rate_limits as limits (
    user_id,
    window_started_at,
    request_count,
    updated_at
  )
  values (v_user_id, now(), 1, now())
  on conflict (user_id) do update
  set
    window_started_at = case
      when limits.window_started_at <= now() - make_interval(secs => v_window_seconds)
        then now()
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at <= now() - make_interval(secs => v_window_seconds)
        then 1
      else limits.request_count + 1
    end,
    updated_at = now()
  returning window_started_at, request_count
  into v_window_started_at, v_request_count;

  return query
  select
    v_request_count <= greatest(p_limit, 1),
    greatest(
      0,
      ceil(extract(epoch from (v_window_started_at + make_interval(secs => v_window_seconds) - now())))::integer
    );
end;
$$;

grant execute on function public.consume_chat_rate_limit(integer, integer) to authenticated;

-- ============================================================================
-- Traces store operational metadata only. Queries, model output and PDF text
-- are deliberately excluded from this table.
-- ============================================================================
create table public.trace_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  stage text not null,
  status text not null check (status in ('ok', 'error')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(12, 8),
  metadata jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create index trace_events_created_at_idx on public.trace_events(created_at desc);
create index trace_events_user_id_idx on public.trace_events(user_id, created_at desc);
create index trace_events_stage_idx on public.trace_events(stage, created_at desc);

alter table public.trace_events enable row level security;

create policy "trace_events_select_own"
  on public.trace_events for select
  using (user_id = auth.uid());

create policy "trace_events_insert_own"
  on public.trace_events for insert
  with check (user_id = auth.uid());

-- ============================================================================
-- Explicit user feedback for answer-quality monitoring.
-- ============================================================================
create table public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  rating text not null check (rating in ('helpful', 'not_helpful')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index message_feedback_created_at_idx
  on public.message_feedback(created_at desc);

alter table public.message_feedback enable row level security;

create policy "message_feedback_select_own"
  on public.message_feedback for select
  using (user_id = auth.uid());

create policy "message_feedback_insert_own"
  on public.message_feedback for insert
  with check (user_id = auth.uid());

create policy "message_feedback_update_own"
  on public.message_feedback for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
