import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const results = [];
const add = (level, name, detail) => results.push({ level, name, detail });

function commandVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
add(nodeMajor >= 20 ? 'ok' : 'error', 'Node.js', `v${process.versions.node} (requires 20+)`);

for (const [name, command, optional] of [
  ['npm', process.platform === 'win32' ? 'npm.cmd' : 'npm', false],
  ['Docker', 'docker', false],
  ['Supabase CLI', 'supabase', false],
  ['Python', 'python', true],
  ['uv', 'uv', true],
]) {
  const version = commandVersion(command);
  add(version ? 'ok' : optional ? 'warn' : 'error', name, version ?? (optional ? 'not found; only required for full Python evals' : 'not found'));
}

const envPath = resolve('.env.local');
if (!existsSync(envPath)) {
  add('error', '.env.local', 'missing; copy .env.example to .env.local');
} else {
  const entries = new Map();
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) entries.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const placeholders = /^(?:|change-me|your-|replace-with|sk-your|https:\/\/your-|00000000-0000-4000-8000-000000000000)/i;
  const check = (name, required, reason = '') => {
    const value = entries.get(name);
    const valid = Boolean(value && !placeholders.test(value));
    add(valid ? 'ok' : required ? 'error' : 'warn', name, valid ? 'configured' : `${required ? 'required' : 'optional'}${reason ? ` ${reason}` : ''}`);
  };

  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'NEXT_PUBLIC_APP_URL', 'CRON_SECRET']) check(name, true);
  if ((entries.get('AI_PROVIDER') ?? 'openai') === 'google') check('GOOGLE_GENERATIVE_AI_API_KEY', true, 'when AI_PROVIDER=google');
  if (entries.get('RERANK_PROVIDER') === 'cohere') check('COHERE_API_KEY', true, 'when RERANK_PROVIDER=cohere');
  if (process.argv.includes('--mcp') || entries.has('MCP_USER_ID')) check('MCP_USER_ID', true, 'for MCP');
}

for (const result of results) console.log(`${result.level.toUpperCase().padEnd(5)} ${result.name}: ${result.detail}`);
const errors = results.filter((result) => result.level === 'error').length;
console.log(`\nDoctor finished with ${errors} error(s).`);
process.exitCode = errors === 0 ? 0 : 1;
