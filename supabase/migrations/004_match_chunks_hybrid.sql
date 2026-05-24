-- StudyAgent — hybrid search (pgvector + BM25) con Reciprocal Rank Fusion.
-- Llamada desde lib/ai/retrieval.ts cuando AI_CONFIG.rag.retrievalMode = 'hybrid'.
--
-- Decisiones:
-- - Config 'simple' (sin stemming) para tsvector: evita sesgo a un idioma y
--   funciona razonable bien con tokens cortos y nombres propios. Si se quiere
--   stemming en castellano, migración nueva con 'spanish'.
-- - Columna `content_tsv` GENERATED ALWAYS STORED: se mantiene en sync sin
--   trigger. La carga inicial reescribe la tabla; aceptable a la escala
--   actual.
-- - RPC server-side hace ambas búsquedas y fusiona vía RRF (k=60 por defecto)
--   en una sola query para minimizar round-trips.
-- - `security invoker` para respetar RLS igual que `match_chunks`.

alter table public.chunks
  add column content_tsv tsvector
  generated always as (to_tsvector('simple', content)) stored;

create index chunks_content_tsv_idx
  on public.chunks
  using gin (content_tsv);

create or replace function public.match_chunks_hybrid(
  query_text text,
  query_embedding vector(1536),
  match_count int default 8,
  candidate_multiplier int default 4,
  rrf_k int default 60,
  p_user_id uuid default null,
  p_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  page_number int,
  similarity float,
  rrf_score float
)
language plpgsql
security invoker
stable
as $$
declare
  v_candidate_count int := greatest(match_count * candidate_multiplier, match_count);
  v_query_tsquery tsquery := websearch_to_tsquery('simple', coalesce(query_text, ''));
begin
  return query
  with
    vector_candidates as (
      select
        c.id,
        row_number() over (order by c.embedding <=> query_embedding) as rank
      from public.chunks c
      where
        (p_user_id is null or c.user_id = p_user_id)
        and (p_document_ids is null or c.document_id = any(p_document_ids))
      order by c.embedding <=> query_embedding
      limit v_candidate_count
    ),
    keyword_candidates as (
      select
        c.id,
        row_number() over (
          order by ts_rank_cd(c.content_tsv, v_query_tsquery) desc
        ) as rank
      from public.chunks c
      where
        (p_user_id is null or c.user_id = p_user_id)
        and (p_document_ids is null or c.document_id = any(p_document_ids))
        and v_query_tsquery <> ''::tsquery
        and c.content_tsv @@ v_query_tsquery
      order by ts_rank_cd(c.content_tsv, v_query_tsquery) desc
      limit v_candidate_count
    ),
    fused as (
      select
        coalesce(v.id, k.id) as id,
        coalesce(1.0 / (rrf_k + v.rank), 0)
          + coalesce(1.0 / (rrf_k + k.rank), 0) as rrf_score
      from vector_candidates v
      full outer join keyword_candidates k on v.id = k.id
    )
  select
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    c.page_number,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    f.rrf_score::float
  from fused f
  join public.chunks c on c.id = f.id
  order by f.rrf_score desc
  limit match_count;
end;
$$;

grant execute on function public.match_chunks_hybrid(
  text, vector(1536), int, int, int, uuid, uuid[]
) to authenticated;
