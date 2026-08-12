import fs from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import { describe, expect, it } from 'vitest';

describe('PDF fixtures', () => {
  it('extracts the expected facts from the generated StudyAgent demo PDF', async () => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/studyagent-demo.pdf');
    const parsed = await pdfParse(fs.readFileSync(filePath));

    expect(parsed.numpages).toBeGreaterThan(0);
    expect(parsed.text).toContain('The Aurora study method has three steps');
    expect(parsed.text).toContain('15 minutes to retrieve and explain');
    expect(parsed.text).toContain('one day');
    expect(parsed.text).toContain('three days');
    expect(parsed.text).toContain('seven days');
  });
});
