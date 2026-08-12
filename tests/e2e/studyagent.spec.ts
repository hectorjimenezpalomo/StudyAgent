import { test, expect } from '@playwright/test';
import path from 'node:path';
import { z } from 'zod';

const uploadResponseSchema = z.object({ document_id: z.string().uuid() });
const statusResponseSchema = z.object({ status: z.string() });

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const cronSecret = process.env.CRON_SECRET;

test.skip(
  !email || !password || !cronSecret,
  'Set E2E_USER_EMAIL, E2E_USER_PASSWORD, and CRON_SECRET to run the deterministic demo flow.'
);

test('login, upload PDF, ask, and reload persisted chat', async ({ page }) => {
  await page.goto('/login?redirect=/documents');
  await page.getByLabel('Email').fill(email ?? '');
  await page.getByLabel('Password').fill(password ?? '');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();

  let documentId: string | undefined;

  try {
    const uploadResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/upload') && response.request().method() === 'POST'
    );
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(process.cwd(), 'tests/fixtures/studyagent-demo.pdf'));
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.ok()).toBe(true);
    const uploadBody = uploadResponseSchema.parse(await uploadResponse.json());
    documentId = uploadBody.document_id;

    await expect(page.getByText('studyagent-demo.pdf')).toBeVisible();
    const workerResponse = await page.request.post('/api/internal/ingest', {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(workerResponse.ok()).toBe(true);

    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/documents/${documentId}/status`);
        if (!response.ok()) return `http-${response.status()}`;
        return statusResponseSchema.parse(await response.json()).status;
      }, { timeout: 90_000 })
      .toBe('ready');

    await page.goto('/chat');
    const question = 'Cuales son los tres pasos del metodo Aurora?';
    await page.getByPlaceholder('Preguntale a tus apuntes...').fill(question);
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(/recuper|explic|verific/i)).toBeVisible({ timeout: 60_000 });

    const url = page.url();
    expect(url).toContain('conversation_id=');
    await page.reload();
    await expect(page.getByText(question)).toBeVisible();
  } finally {
    if (documentId) {
      const cleanupResponse = await page.request.delete(`/api/documents/${documentId}`);
      expect(cleanupResponse.ok()).toBe(true);
    }
  }
});
