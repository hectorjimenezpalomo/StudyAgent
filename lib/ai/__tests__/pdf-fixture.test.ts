import fs from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import { describe, expect, it } from 'vitest';

describe('PDF fixtures', () => {
  it('studyagent-demo.pdf contiene texto extraible', async () => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/studyagent-demo.pdf');
    const parsed = await pdfParse(fs.readFileSync(filePath));

    expect(parsed.numpages).toBeGreaterThan(0);
    expect(parsed.text).toContain('Dummy PDF file');
  });
});
