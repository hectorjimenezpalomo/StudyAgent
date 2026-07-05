"""Generador de dataset sintético de evaluación.

Convierte chunks reales del usuario en casos ``EvalCase`` sin etiquetado manual:
el chunk origen ES el ground truth (``ground_truth_chunk_ids = [chunk.id]``). Da
potencia estadística a los deltas hybrid/rerank/provider frente a los ~10 casos
manuales.

Uso:
    python -m evals_py.synthesize --user-id UUID [--document-id UUID] \
        [--per-doc 30] [--multi-hop] [--out ../evals/dataset.synthetic.jsonl]

Sesgos conocidos y mitigaciones: ver ``README.md`` y ``../evals/README.md``. La
principal mitigación es forzar que la pregunta PARAFRASEE (prohibido copiar >3
palabras seguidas del chunk) para reducir el solape léxico pregunta↔chunk.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from openai import OpenAI

from . import db
from .config import AI_CONFIG, load_env
from .models import EvalCase

MIN_CHUNK_CHARS = 200

_SINGLE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "qa_pair",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
                "answer": {"type": "string"},
            },
            "required": ["question", "answer"],
            "additionalProperties": False,
        },
    },
}

_SINGLE_INSTRUCTIONS = (
    "A partir del PASAJE, escribe UNA pregunta de estudio y su respuesta.\n"
    "Reglas estrictas:\n"
    "- La pregunta debe PARAFRASEAR: prohibido copiar más de 3 palabras seguidas "
    "del pasaje.\n"
    "- La pregunta debe ser autocontenida (entendible sin ver el pasaje) y "
    "responderse SOLO con este pasaje.\n"
    "- La respuesta debe ser concisa y estar soportada por el pasaje.\n"
    "- Mismo idioma que el pasaje.\n\n"
    "PASAJE:\n{content}"
)

_MULTIHOP_INSTRUCTIONS = (
    "A partir de los DOS PASAJES consecutivos, escribe UNA pregunta que requiera "
    "combinar información de AMBOS para responderse, y su respuesta.\n"
    "Reglas estrictas:\n"
    "- La pregunta debe PARAFRASEAR: prohibido copiar más de 3 palabras seguidas "
    "de los pasajes.\n"
    "- Debe necesitar AMBOS pasajes (no responderse con uno solo).\n"
    "- La respuesta debe ser concisa y estar soportada por los pasajes.\n"
    "- Mismo idioma que los pasajes.\n\n"
    "PASAJE 1:\n{content_a}\n\nPASAJE 2:\n{content_b}"
)


def fetch_chunks(supabase, user_id: str, document_id: str | None) -> list[db.Chunk]:
    query = (
        supabase.table("chunks")
        .select("id, document_id, content, chunk_index, page_number")
        .eq("user_id", user_id)
    )
    if document_id:
        query = query.eq("document_id", document_id)
    response = query.order("document_id").order("chunk_index").execute()
    rows = response.data or []
    return [
        db.Chunk(
            id=r["id"],
            document_id=r["document_id"],
            content=r["content"],
            chunk_index=r["chunk_index"],
            page_number=r.get("page_number"),
            similarity=0.0,
        )
        for r in rows
        if len(r["content"]) >= MIN_CHUNK_CHARS
    ]


def stratified_sample(chunks: list[db.Chunk], per_doc: int) -> list[db.Chunk]:
    """Muestreo estratificado por documento y posición (no solo el principio)."""
    by_doc: dict[str, list[db.Chunk]] = {}
    for chunk in chunks:
        by_doc.setdefault(chunk.document_id, []).append(chunk)

    sampled: list[db.Chunk] = []
    for doc_chunks in by_doc.values():
        doc_chunks.sort(key=lambda c: c.chunk_index)
        n = len(doc_chunks)
        if n <= per_doc:
            sampled.extend(doc_chunks)
            continue
        # Índices repartidos uniformemente a lo largo del documento.
        step = n / per_doc
        picks = {min(n - 1, int(i * step)) for i in range(per_doc)}
        sampled.extend(doc_chunks[i] for i in sorted(picks))
    return sampled


def adjacent_pairs(chunks: list[db.Chunk], per_doc: int) -> list[tuple[db.Chunk, db.Chunk]]:
    """Pares de chunks con chunk_index consecutivo dentro del mismo documento."""
    by_doc: dict[str, list[db.Chunk]] = {}
    for chunk in chunks:
        by_doc.setdefault(chunk.document_id, []).append(chunk)

    pairs: list[tuple[db.Chunk, db.Chunk]] = []
    for doc_chunks in by_doc.values():
        doc_chunks.sort(key=lambda c: c.chunk_index)
        count = 0
        for a, b in zip(doc_chunks, doc_chunks[1:]):
            if b.chunk_index == a.chunk_index + 1:
                pairs.append((a, b))
                count += 1
                if count >= per_doc:
                    break
    return pairs


def _generate_qa(client: OpenAI, prompt: str) -> dict:
    response = client.chat.completions.create(
        model=AI_CONFIG.chat_model,
        messages=[{"role": "user", "content": prompt}],
        response_format=_SINGLE_SCHEMA,
    )
    return json.loads(response.choices[0].message.content or "{}")


def synthesize_single(client: OpenAI, chunk: db.Chunk) -> EvalCase | None:
    try:
        qa = _generate_qa(client, _SINGLE_INSTRUCTIONS.format(content=chunk.content))
        return EvalCase(
            id=f"syn-{chunk.id[:8]}",
            question=qa["question"],
            ground_truth_answer=qa["answer"],
            ground_truth_chunk_ids=[chunk.id],
            document_ids=[chunk.document_id],
        )
    except Exception as err:  # noqa: BLE001
        print(f"[evals-py/synthesize] chunk {chunk.id[:8]} omitido: {err}")
        return None


def synthesize_multihop(
    client: OpenAI, pair: tuple[db.Chunk, db.Chunk]
) -> EvalCase | None:
    a, b = pair
    try:
        qa = _generate_qa(
            client, _MULTIHOP_INSTRUCTIONS.format(content_a=a.content, content_b=b.content)
        )
        return EvalCase(
            id=f"syn-mh-{a.id[:8]}",
            question=qa["question"],
            ground_truth_answer=qa["answer"],
            ground_truth_chunk_ids=[a.id, b.id],
            document_ids=[a.document_id],
        )
    except Exception as err:  # noqa: BLE001
        print(f"[evals-py/synthesize] par {a.id[:8]} omitido: {err}")
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera un dataset de evals sintético")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--document-id", default=None)
    parser.add_argument("--per-doc", type=int, default=30)
    parser.add_argument("--multi-hop", action="store_true")
    parser.add_argument(
        "--out", type=Path, default=Path(__file__).resolve().parents[2] / "evals" / "dataset.synthetic.jsonl"
    )
    args = parser.parse_args()

    env = load_env()
    supabase = db.create_supabase(env)
    client = OpenAI(api_key=env.openai_api_key)

    chunks = fetch_chunks(supabase, args.user_id, args.document_id)
    if not chunks:
        print("[evals-py/synthesize] No hay chunks (>=200 chars) para ese usuario/documento.")
        return

    cases: list[EvalCase] = []

    selected = stratified_sample(chunks, args.per_doc)
    print(f"[evals-py/synthesize] {len(selected)} chunk(s) seleccionados (single-hop)...")
    for i, chunk in enumerate(selected, start=1):
        print(f"  ({i}/{len(selected)}) {chunk.id[:8]} ... ", end="", flush=True)
        case = synthesize_single(client, chunk)
        print("ok" if case else "skip")
        if case:
            cases.append(case)

    if args.multi_hop:
        pairs = adjacent_pairs(chunks, args.per_doc)
        print(f"[evals-py/synthesize] {len(pairs)} par(es) adyacentes (multi-hop)...")
        for i, pair in enumerate(pairs, start=1):
            print(f"  ({i}/{len(pairs)}) {pair[0].id[:8]} ... ", end="", flush=True)
            case = synthesize_multihop(client, pair)
            print("ok" if case else "skip")
            if case:
                cases.append(case)

    # Sobrescribe el fichero completo por run (no append).
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        for case in cases:
            fh.write(case.model_dump_json() + "\n")

    print(f"[evals-py/synthesize] {len(cases)} caso(s) escritos en {args.out}")


if __name__ == "__main__":
    main()
