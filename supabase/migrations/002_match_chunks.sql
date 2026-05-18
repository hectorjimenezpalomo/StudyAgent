-- StudyAgent — match_chunks function for vector similarity search
-- Llamada desde lib/ai/tools.ts (search_documents) y desde el RAG manual de la Fase 3.

create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.5,
  match_count int default 8,
  p_user_id uuid default null,
  p_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  page_number int,
  similarity float
)
language plpgsql
security invoker
stable
as $$
begin
  return query
  select
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    c.page_number,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where
    (p_user_id is null or c.user_id = p_user_id)
    and (p_document_ids is null or c.document_id = any(p_document_ids))
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Permitir que usuarios autenticados invoquen la función.
grant execute on function public.match_chunks(vector(1536), float, int, uuid, uuid[]) to authenticated;
