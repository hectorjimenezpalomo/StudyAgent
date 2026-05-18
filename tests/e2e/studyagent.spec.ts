import { test, expect } from '@playwright/test';
import path from 'node:path';

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run demo flow.');

test('login, upload PDF, ask, and reload persisted chat', async ({ page }) => {
  await page.goto('/login?redirect=/documents');
  await page.getByLabel('Email').fill(email ?? '');
  await page.getByLabel('Password').fill(password ?? '');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(process.cwd(), 'tests/fixtures/studyagent-demo.pdf'));

  await expect(page.getByText('studyagent-demo.pdf')).toBeVisible();
  await expect(page.getByText(/Estado: ready/)).toBeVisible({ timeout: 60_000 });

  await page.goto('/chat');
  await page.getByPlaceholder('Preguntale a tus apuntes...').fill('Que contiene este PDF?');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(/PDF|documento|apuntes/i)).toBeVisible({ timeout: 60_000 });

  const url = page.url();
  expect(url).toContain('conversation_id=');
  await page.reload();
  await expect(page.getByText('Que contiene este PDF?')).toBeVisible();
});
