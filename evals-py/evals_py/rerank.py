"""Reranking post-retrieval. Solo ``none`` y ``cohere``.

El reranker ``llm`` de ``lib/ai/rerank.ts`` NO se porta a propósito (ver README):
mantiene el harness Python simple y determinista. El eje "LLM reranker" se cubre
con el harness TS. ``cohere`` usa el MISMO endpoint y modelo default que TS
(``rerank-multilingual-v3.0`` en ``api.cohere.com/v2/rerank``).
"""

from __future__ import annotations

import os

import httpx

from .db import Chunk

COHERE_ENDPOINT = "https://api.cohere.com/v2/rerank"
DEFAULT_COHERE_MODEL = "rerank-multilingual-v3.0"


def _cohere_rerank(query: str, chunks: list[Chunk], top_k: int) -> list[Chunk]:
    api_key = os.getenv("COHERE_API_KEY")
    if not api_key:
        raise RuntimeError("[evals-py/rerank] RERANK_PROVIDER=cohere requiere COHERE_API_KEY")

    model = os.getenv("COHERE_RERANK_MODEL") or DEFAULT_COHERE_MODEL
    response = httpx.post(
        COHERE_ENDPOINT,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "query": query,
            "documents": [c.content for c in chunks],
            "top_n": top_k,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    results = response.json().get("results", [])

    ordered: list[Chunk] = []
    for item in results:
        idx = item["index"]
        if 0 <= idx < len(chunks):
            ordered.append(chunks[idx])
    return ordered


def rerank(provider: str, query: str, chunks: list[Chunk], top_k: int) -> list[Chunk]:
    """Reordena ``chunks`` a ``top_k``. ``none`` = trunca sin reordenar.

    Fallback graceful: si el reranker lanza, devuelve el orden de retrieval
    truncado (mismo comportamiento que retrieval.ts).
    """
    if provider == "none" or not chunks:
        return chunks[:top_k]
    if provider == "cohere":
        try:
            return _cohere_rerank(query, chunks, top_k)
        except Exception as err:  # noqa: BLE001 - fallback deliberado
            print(f"[evals-py/rerank] cohere fallback: {err}")
            return chunks[:top_k]
    raise ValueError(f"[evals-py/rerank] proveedor no soportado en Python: {provider}")
