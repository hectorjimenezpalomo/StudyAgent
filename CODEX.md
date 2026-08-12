# CODEX.md

Briefing for coding agents (Codex, Claude Code, Cursor).

## Before changing the repository

1. `AGENTS.md` — non-negotiable rules.
2. `ARCHITECTURE.md` — catalog of names and types.
3. `ROADMAP.md` — pending and future work.

## How to work here

- Follow every rule in `AGENTS.md`. If one seems arbitrary, assume it is intentional.
- If you must deviate from a rule, justify it in the commit message and update `AGENTS.md` in the same commit.
- `*.test.ts` files define expected behavior. Your implementation must make them pass.
- If a change affects the database, agent tools, or RLS policies, read rule 2 in `AGENTS.md` before starting.

## Decisions you must NOT make

See "Decisions an agent must NOT make" in `AGENTS.md`. Those require a proposed pull request and human review.

## Verification before marking work complete

```
npm run typecheck
npm run test
npm run build
```

If the task affects the UI or critical flows, also run `npm run test:e2e`.
