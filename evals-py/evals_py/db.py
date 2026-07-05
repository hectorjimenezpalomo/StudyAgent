"""Acceso a Supabase: mismos RPC que ``lib/ai/retrieval.ts``.

- ``match_chunks``          (vector puro)
- ``match_chunks_hybrid``   (pgvector + BM25 fusionados con RRF server-side)

Usa el cliente supabase-py con la service-role key (igual que ``evals/runner.ts``,
que salta RLS deliberadamente para evaluar). Los argumentos de cada RPC son
idénticos a los de retrieval.ts, campo por campo.
"""

from __future__ import annotations

from dataclasses import dataclass

from supabase import Client, create_client

from .config import AI_CONFIG, RequiredEnv


@dataclass
class Chunk:
    id: str
    document_id: str
    content: str
    chunk_index: int
    page_number: int | None
    similarity: float


def create_supabase(env: RequiredEnv) -> Client:
    return create_client(env.supabase_url, env.supabase_service_role_key)


def _row_to_chunk(row: dict) -> Chunk:
    return Chunk(
        id=row["id"],
        document_id=row["document_id"],
        content=row["content"],
        chunk_index=row["chunk_index"],
        page_number=row.get("page_number"),
        similarity=row.get("similarity", 0.0),
    )


def match_chunks(
    supabase: Client,
    serialized_embedding: str,
    user_id: str,
    document_ids: list[str],
    match_count: int,
) -> list[Chunk]:
    response = supabase.rpc(
        "match_chunks",
        {
            "query_embedding": serialized_embedding,
            "match_threshold": AI_CONFIG.rag.match_threshold,
            "match_count": match_count,
            "p_user_id": user_id,
            "p_document_ids": document_ids,
        },
    ).execute()
    return [_row_to_chunk(row) for row in (response.data or [])]


def match_chunks_hybrid(
    supabase: Client,
    query_text: str,
    serialized_embedding: str,
    user_id: str,
    document_ids: list[str],
    match_count: int,
) -> list[Chunk]:
    response = supabase.rpc(
        "match_chunks_hybrid",
        {
            "query_text": query_text,
            "query_embedding": serialized_embedding,
            "match_count": match_count,
            "candidate_multiplier": AI_CONFIG.rag.hybrid_candidate_multiplier,
            "rrf_k": AI_CONFIG.rag.hybrid_rrf_constant,
            "p_user_id": user_id,
            "p_document_ids": document_ids,
        },
    ).execute()
    return [_row_to_chunk(row) for row in (response.data or [])]


def resolve_user_id(supabase: Client, document_ids: list[str]) -> str | None:
    """user_id del propietario de los documentos (igual que runner.ts)."""
    response = (
        supabase.table("documents")
        .select("user_id")
        .in_("id", document_ids)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0]["user_id"] if rows else None
