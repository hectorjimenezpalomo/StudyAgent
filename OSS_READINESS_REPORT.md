# OSS readiness report

Status: v0.1.0 released on 2026-08-12. The readiness pull request was [#11](https://github.com/hectorjimenezpalomo/StudyAgent/pull/11), rebase-merged after green CI and CodeQL. No external review occurred.

## Before and after

The initial repository had working private-document RAG, green CI, and Private Vulnerability Reporting, but no detected license, release, description, topics, community files, issues, pull requests, public baseline, or protected `main`. This work adds MIT licensing, governance and security guidance, an OSS-focused landing page, reproducible setup, deterministic demo/E2E assets, dependency and CodeQL automation, ten real roadmap issues, and release materials.

No model, embedding dimension, database schema, migration, RLS policy, prompt, runtime dependency, or core RAG architecture was changed. Logs no longer expose authenticated email addresses or user UUIDs, and MCP clients receive generic failures while detailed errors remain on stderr.

## Fixed rubric

| Area | Weight | Current score |
|---|---:|---:|
| Working product and architecture | 25 | 24 |
| Reproducible setup and tests | 20 | 18 |
| Security and privacy posture | 20 | 18 |
| Governance and community health | 15 | 15 |
| Evaluation evidence | 10 | 5 |
| Launch evidence and adoption | 10 | 1 |
| **Launch score** | **100** | **81** |

The deductions are for missing public deployment validation, an empty public evaluation corpus and baseline, no verified screenshots/GIF, and no adoption evidence. Codex application readiness uses the same evidence conservatively: **55/100** until release history and authentic user activity exist.

## Application gate

Do not apply to Codex for Open Source immediately at zero adoption signals. Reassess after a real release and recent maintenance plus evidence such as real users, substantive issues, forks, or external contributions. Roughly 100 authentic stars is a strong internal target, never an official requirement. Do not replace `<STARS>`, `<FORKS>`, `<EXTERNAL_CONTRIBUTORS>`, `<RELEASES>`, `<USAGE_SIGNAL>`, or `<LATEST_ACTIVITY>` without evidence.

## Verification ledger

- Clean temporary checkout: `npm ci` installed 511 packages. `npm run lint`, `npm run typecheck`, 17 Vitest files/92 tests, and `npm run build` passed. `uv sync --frozen` and 16 Python tests passed.
- `npm run doctor` correctly detected the absent `.env.local`; Node/npm, Docker, Supabase CLI, optional Python, and optional `uv` reporting were exercised. The Windows `npm.cmd` path was corrected during verification.
- The demo PDF was regenerated twice with identical SHA-256 `78E11562C0F5ED13E29D60F09FF7CF909388737F7E9B90CBE1FEFD7C4727541D`; `pdf-parse` extracted the expected Aurora facts.
- E2E was skipped because this environment did not provide `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, a configured Supabase/OpenAI worker, and `CRON_SECRET`. RAG evals were not run because the committed dataset is empty and no private evaluation corpus was available.
- `git diff --check` passed. The filename-only secret-value scan found no matches. No secret value was introduced into tracked files or logs.
- GitHub checks passed on [PR #11](https://github.com/hectorjimenezpalomo/StudyAgent/pull/11): `verify`, `python-evals`, `CodeQL (javascript-typescript)`, and `CodeQL (python)`.
- The ten roadmap issues are [#1–#10](https://github.com/hectorjimenezpalomo/StudyAgent/issues). Issue #8 is the only `good first issue`.
- Repository description and all ten requested topics are live. Discussions remains disabled. Private Vulnerability Reporting, secret scanning, push protection, dependency alerts, and Dependabot security updates are enabled.
- The annotated tag and published release are [v0.1.0](https://github.com/hectorjimenezpalomo/StudyAgent/releases/tag/v0.1.0).
- The active [`Protect main` ruleset](https://github.com/hectorjimenezpalomo/StudyAgent/rules/20723054) requires pull requests, resolved conversations, zero approvals, `verify`, `python-evals`, both language-specific CodeQL checks, and rebase merges. It blocks deletion and non-fast-forward pushes and retains a permanent administrator bypass for the sole maintainer.

The release exists but there is still no public deployment validation, public evaluation baseline, verified screenshot/GIF, user evidence, fork, or external contribution. No adoption or quality metric is inferred.
