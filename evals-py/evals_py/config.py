"""Configuración del harness Python, espejo de ``lib/ai/config.ts`` (AI_CONFIG.rag).

Lee ``../.env.local`` (mismo fichero que usa ``npm run eval``) vía python-dotenv.
Los defaults DEBEN coincidir con los de TypeScript para que los resultados sean
comparables (matchCount 8, matchThreshold 0.5, RRF k 60, etc.).

Decisión (ver ADR 0002): v1 del harness Python se limita a OpenAI para la
generación. El eje de proveedor (OpenAI vs Gemini) se compara con el harness TS.
Aun así leemos ``AI_PROVIDER`` para reflejarlo en el reporte.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path

from dotenv import load_dotenv

# evals-py/evals_py/config.py -> raíz del repo es dos niveles arriba.
REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_LOCAL = REPO_ROOT / ".env.local"
DATASET_DEFAULT = REPO_ROOT / "evals" / "dataset.jsonl"
RESULTS_DIR = REPO_ROOT / "evals" / "results"

# Cargar .env.local si existe (no falla si no está: CI puede inyectar env).
load_dotenv(ENV_LOCAL)


def _parse_retrieval_mode(value: str | None) -> str:
    return value if value in ("vector", "hybrid") else "vector"


def _parse_rerank_provider(value: str | None) -> str:
    return value if value in ("none", "llm", "cohere") else "none"


def _parse_provider(value: str | None) -> str:
    return value if value in ("openai", "google") else "openai"


@dataclass(frozen=True)
class RagConfig:
    match_count: int = 8
    match_threshold: float = 0.5
    retrieval_mode: str = field(
        default_factory=lambda: _parse_retrieval_mode(os.getenv("RAG_RETRIEVAL_MODE"))
    )
    hybrid_rrf_constant: int = 60
    hybrid_candidate_multiplier: int = 4
    rerank_provider: str = field(
        default_factory=lambda: _parse_rerank_provider(os.getenv("RERANK_PROVIDER"))
    )
    rerank_candidate_pool_multiplier: int = 3


@dataclass(frozen=True)
class AiConfig:
    provider: str = field(default_factory=lambda: _parse_provider(os.getenv("AI_PROVIDER")))
    chat_model: str = field(default_factory=lambda: os.getenv("OPENAI_CHAT_MODEL") or "gpt-4o-mini")
    embedding_model: str = field(
        default_factory=lambda: os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small"
    )
    embedding_dimensions: int = 1536
    rag: RagConfig = field(default_factory=RagConfig)


AI_CONFIG = AiConfig()


@dataclass(frozen=True)
class RequiredEnv:
    supabase_url: str
    supabase_service_role_key: str
    openai_api_key: str


def load_env() -> RequiredEnv:
    """Valida las env vars obligatorias (mismas que ``evals/runner.ts``)."""
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    missing = [
        name
        for name, value in (
            ("NEXT_PUBLIC_SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", service_role),
            ("OPENAI_API_KEY", openai_key),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            f"[evals-py/config] Faltan variables de entorno: {', '.join(missing)}. "
            f"Rellena {ENV_LOCAL} o inyecta las env."
        )

    assert supabase_url and service_role and openai_key  # narrow para el type checker
    return RequiredEnv(supabase_url, service_role, openai_key)
