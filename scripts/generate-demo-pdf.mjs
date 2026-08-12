import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const sourcePath = resolve('tests/fixtures/studyagent-demo-source.txt');
const outputPath = resolve('tests/fixtures/studyagent-demo.pdf');
const source = readFileSync(sourcePath, 'utf8').trim();
const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const candidates = process.platform === 'win32'
  ? [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'msedge.exe',
      'chrome.exe',
    ]
  : ['google-chrome', 'chromium', 'chromium-browser'];

const pathDirectories = (process.env.PATH ?? '').split(delimiter);
const commands = candidates.flatMap((candidate) => candidate.includes('\\') || candidate.includes('/')
  ? [candidate]
  : [candidate, ...pathDirectories.map((directory) => join(directory, candidate))]);

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'studyagent-demo-'));
const htmlPath = join(temporaryDirectory, 'demo.html');
writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><title>StudyAgent Demo Notes</title><style>@page{size:Letter;margin:0.75in}body{font:14px/1.5 Arial,sans-serif;color:#111}pre{white-space:pre-wrap;font:inherit}</style><pre>${escapeHtml(source)}</pre>`);

let generated = false;
try {
  for (const command of commands) {
    const result = spawnSync(command, [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${outputPath}`,
      pathToFileURL(htmlPath).href,
    ], { encoding: 'utf8', timeout: 60_000 });
    if (result.status === 0) {
      generated = true;
      break;
    }
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (!generated) throw new Error('No supported Chromium browser was found. Install Edge, Chrome, or Chromium to regenerate the demo PDF.');
const normalizedPdf = readFileSync(outputPath, 'binary').replaceAll(
  /D:\d{14}\+00'00'/g,
  "D:20260101000000+00'00'"
);
writeFileSync(outputPath, normalizedPdf, 'binary');
console.log(`Generated ${outputPath} from ${sourcePath}`);
