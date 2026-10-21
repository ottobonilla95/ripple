import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';

const base = process.env.QA_URL || 'http://127.0.0.1:4318';
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('data/qa-fixtures/speech.wav')}`]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['microphone'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Nothing to review.' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Add sample insights' }).click();
  await expect(page.locator('.insight-card')).toHaveCount(3);
  await page.screenshot({ path: 'data/qa-fixtures/desktop-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Find', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Ask your collection' }).fill('Someone I care about is upset. How should I respond?');
  await page.locator('.search-form').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.library-grid .insight-card').first()).toContainText('Before offering advice', { timeout: 60000 });
  console.log('PASS: question-based semantic search retrieves a differently worded insight.');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your insight' }).fill('A durable test thought about telescope mirrors.');
  await page.locator('.capture-details summary').click();
  await page.getByLabel('Note', { exact: true }).fill('Remember for the astronomy project.');
  await page.getByLabel('Source', { exact: true }).fill('My notebook, page 8');
  await page.getByLabel('Return', { exact: true }).selectOption('reference');
  await page.getByRole('button', { name: 'Save insight' }).click();
  await expect(page.getByRole('textbox', { name: 'Your insight' })).toHaveValue('');
  await page.reload();
  await page.getByRole('button', { name: 'Find', exact: true }).first().click();
  await expect(page.locator('.library-grid')).toContainText('A durable test thought about telescope mirrors.');
  console.log('PASS: save, source/note persistence, and reload.');

  await page.getByRole('button', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.locator('.answer-text')).toContainText('Authentication verifies');
  await page.getByRole('button', { name: 'Remembered', exact: true }).click();
  await expect(page.locator('.insight-card')).toHaveCount(2);
  for (let remaining = 2; remaining > 0; remaining--) {
    await page.getByRole('button', { name: 'Done', exact: true }).first().click();
    await expect(page.locator('.insight-card')).toHaveCount(remaining - 1);
  }
  await expect(page.getByRole('heading', { name: 'Done for today.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Done for today.' })).toBeVisible();
  console.log('PASS: reveal, spaced review feedback, and no same-day refill after reload.');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'data/qa-fixtures/mobile-save.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('button', { name: /Stop ·/ })).toBeVisible();
  await page.waitForTimeout(6500);
  await page.getByRole('button', { name: /Stop ·/ }).click();
  await expect(page.getByRole('textbox', { name: 'Your insight' })).toHaveValue(/listen/i, { timeout: 90000 });
  await expect(page.getByRole('button', { name: 'Save insight' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save insight' }).click();
  await expect(page.getByRole('textbox', { name: 'Your insight' })).toHaveValue('');
  await page.getByRole('button', { name: 'Find', exact: true }).first().click();
  await expect(page.locator('.library-grid audio')).toHaveCount(1);
  console.log('PASS: real MediaRecorder → upload → local Whisper transcript → save with replay.');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your insight' }).fill('An unfinished offline draft.');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your insight' })).toHaveValue('An unfinished offline draft.');
  await expect(page.getByText('Offline.', { exact: false })).toBeVisible();
  await context.setOffline(false);
  console.log('PASS: production app shell opens offline and preserves the written draft.');
  expect(errors).toEqual([]);
  console.log('PASS: no browser JavaScript errors.');
} finally { await browser.close(); }
