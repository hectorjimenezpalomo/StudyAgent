# Security Policy

StudyAgent processes private documents and connects to services using powerful
credentials. Please report security problems privately and avoid testing
against systems or data you do not own.

## Reporting a vulnerability

Use [GitHub Private Vulnerability Reporting](https://github.com/hectorjimenezpalomo/StudyAgent/security/advisories/new).
Do not open a public issue for a vulnerability, leaked credential, private PDF,
or personal data. If Private Vulnerability Reporting is unavailable, contact
the primary maintainer through a private channel listed on their public GitHub
profile. Do not post sensitive details while looking for a contact channel.

Include the affected version or commit, impact, reproduction steps, and a
minimal proof of concept with all secrets and personal data removed. The
maintainer will acknowledge a usable report, investigate it, coordinate a fix,
and credit the reporter if requested and safe to do so. Please allow reasonable
time for remediation before disclosure.

## Supported versions

Security fixes are applied to the latest release and `main`. Older versions are
not currently maintained as separate support branches.

## Sensitive assets

- `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `COHERE_API_KEY`, and `CRON_SECRET` are
  server-only secrets. Rotate them immediately if exposed.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intended
  for browser use, but their safety depends on correct Row Level Security.
- User PDFs live in a private Supabase Storage bucket under a user-scoped path.
  All application tables use RLS. Removing or weakening those controls is a
  security-sensitive change.
- The MCP server uses the Supabase service-role key and bypasses RLS. It is a
  local stdio process for one configured user and must never be exposed to a
  network or untrusted client.
- Eval result files can contain literal answers and recovered PDF chunks. They
  are gitignored and must be treated as private data.
- Demo accounts, test credentials, real PDFs, and production database dumps
  must never be committed.

## Responsible disclosure

Please minimize access, preserve evidence without retaining user data, avoid
service disruption, and give the maintainer an opportunity to fix the issue.
This policy does not authorize social engineering, data exfiltration, denial of
service, or testing third-party infrastructure without permission.
