# OSS readiness report

Status: release preparation in progress on `oss-readiness-v1`. Links and remote verification will be finalized in the required post-release documentation pull request.

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

The final post-release update must record exact clean-checkout command results, the E2E prerequisite decision, secret and link checks, commit/PR/release URLs, issue links, repository metadata, security-setting results, ruleset details, and any manual blockers. It must explicitly state whether external review occurred and must not infer evaluation or adoption metrics.
