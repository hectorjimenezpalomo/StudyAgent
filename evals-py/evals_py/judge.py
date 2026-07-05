"""LLM-as-judge propio. Port de ``evals/judge.ts``.

Reproduce las MISMAS instrucciones de faithfulness y answer_relevancy que el
harness TS, para que la comparación "mi judge vs Ragas" (ver ADR 0002) sea justa:
mismo prompt, distinto lenguaje de implementación.
"""

from __future__ import annotations

import json

from openai import OpenAI

from .config import AI_CONFIG

_FAITHFULNESS_PROMPT = """Evalúa si la RESPUESTA está soportada por el CONTEXTO. Devuelve un score entre 0 y 1:

- 1.0: cada afirmación de la respuesta aparece literal o parafraseada en el contexto.
- 0.5: parte de la respuesta está en el contexto, parte no.
- 0.0: la respuesta inventa datos que no están en el contexto.

Una respuesta que dice "no tengo información sobre eso" cuando el contexto efectivamente no la tiene es score 1.0.

Devuelve SOLO JSON: {{"score": <0..1>, "reasoning": "<1-3 frases>"}}.

CONTEXTO:
{context}

RESPUESTA:
{answer}"""

_RELEVANCY_PROMPT = """Evalúa si la RESPUESTA aborda directamente la PREGUNTA del usuario. Devuelve un score entre 0 y 1:

- 1.0: responde con precisión a lo que se pregunta.
- 0.5: responde parcialmente o se va por las ramas.
- 0.0: no aborda la pregunta o cambia de tema.

Ignora si la respuesta es factualmente correcta; solo importa si trata el tema correcto.

Devuelve SOLO JSON: {{"score": <0..1>, "reasoning": "<1-3 frases>"}}.

PREGUNTA:
{question}

RESPUESTA:
{answer}"""


def _judge(client: OpenAI, prompt: str) -> float:
    response = client.chat.completions.create(
        model=AI_CONFIG.chat_model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
        score = float(data.get("score", 0.0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, score))


def judge_faithfulness(client: OpenAI, context_text: str, answer: str) -> float:
    if not answer.strip():
        return 0.0
    return _judge(client, _FAITHFULNESS_PROMPT.format(context=context_text, answer=answer))


def judge_answer_relevancy(client: OpenAI, question: str, answer: str) -> float:
    if not answer.strip():
        return 0.0
    return _judge(client, _RELEVANCY_PROMPT.format(question=question, answer=answer))
