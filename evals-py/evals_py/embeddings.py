"""Embeddings de queries. OpenAI ``text-embedding-3-small`` a 1536 dimensiones.

Espejo de ``lib/ai/embeddings.ts``: mismo modelo y misma dimensión, para pegar
sobre los MISMOS vectores indexados (HNSW 1536D). NO cambiar el modelo aquí sin
re-ingesta completa (ver AGENTS.md regla 6).
"""

from __future__ import annotations

from openai import OpenAI

from .config import AI_CONFIG


def embed_query(client: OpenAI, text: str) -> list[float]:
    response = client.embeddings.create(
        model=AI_CONFIG.embedding_model,
        input=text,
        dimensions=AI_CONFIG.embedding_dimensions,
    )
    return response.data[0].embedding


def serialize_embedding(embedding: list[float]) -> str:
    """Formato ``[a,b,c]`` que esperan los RPC (igual que retrieval.ts)."""
    return "[" + ",".join(repr(x) for x in embedding) + "]"
