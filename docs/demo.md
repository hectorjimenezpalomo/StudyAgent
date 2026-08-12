# Two-minute demo

## Prepare safely

Use a dedicated demo account and the committed original fixture, generated with `npm run demo:fixture`. Never demonstrate private, personal, copyrighted, or regulated documents. Confirm the worker endpoint and `CRON_SECRET` are configured, ingest the fixture once, and keep an empty conversation ready.

## Timed script

- **0:00–0:15 — Login:** sign in and note that each user's document access is isolated with Supabase RLS.
- **0:15–0:35 — Upload:** upload the StudyAgent demo PDF and show its status become ready after ingestion.
- **0:35–1:05 — Ask:** ask a factual question whose answer is explicitly present in the fixture.
- **1:05–1:20 — Cite:** open the citation's document entry. Explain that page-level PDF links are planned, not implemented.
- **1:20–1:40 — Study tool:** request a quiz or flashcards grounded in the same document.
- **1:40–1:50 — Persistence:** reload or reopen the conversation and show that messages persist.
- **1:50–2:00 — Evals:** show the harness commands and state clearly that the public dataset is empty and no public baseline is claimed.

CTA: “Try it, tell me what breaks, and open an issue if you find something useful to improve.”

## Screenshot shot list

Capture login, documents with a ready fixture, a grounded answer with citation, a quiz or flashcard result, persisted conversation history, and a sanitized evaluation command. Crop browser and terminal chrome that might reveal usernames, paths, keys, IDs, or unrelated files.

## GIF checklist

Record at readable resolution, keep the final edit under two minutes, remove idle time, avoid cursor jitter, verify no secrets or personal data appear frame-by-frame, add concise captions, and show only behavior that exists. Do not fabricate scores, deployment URLs, or product states.

