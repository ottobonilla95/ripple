import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// UI-only fixtures keep browser checks away from the user's collection.
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
const pixelPreview = new URL(process.env.QA_URL || 'http://127.0.0.1:4317').searchParams.get('basin') === 'pixel';
const screenshotPrefix = pixelPreview ? 'pensieve-pixel' : 'pensieve';
const waterFrame = async () => createHash('sha256').update(await page.locator('.basin-magic').evaluate(el => el.toDataURL())).digest('hex');
page.on('pageerror', error => errors.push(error.message));
const fixtures = [
  { id: 'one', content: 'You don’t have to turn every quiet moment into something useful.', note: 'Keep a little space.', source: 'Sample thought', source_type: 'thought', intent: 'revisit', created_at: '2026-10-17T12:00:00Z' },
  { id: 'two', content: 'Authentication verifies identity. Authorization determines access.', question: 'How do authentication and authorization differ?', intent: 'practice', source: 'Technical note', source_type: 'thought', created_at: '2026-10-26T12:00:00Z' },
  { id: 'three', content: 'A good question can stay with you longer than a quick answer.', intent: 'revisit', source: 'Sample phrase', source_type: 'thought', created_at: '2026-11-02T12:00:00Z' }
];
let remaining = [...fixtures];
let failNext = false;
let feedbackCount = 0;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (/\/insights\/[^/]+\/review$/.test(path)) {
    feedbackCount++;
    if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: 'Could not save. Try again.' } }); }
    const id = path.split('/')[3];
    if (route.request().postDataJSON().action === 'stop') fixtures.find(item => item.id === id).review_enabled = 0;
    remaining = remaining.filter(item => item.id !== id);
    return route.fulfill({ json: {} });
  }
  return route.fulfill({ json: path === '/api/review' ? remaining : path === '/api/insights' ? fixtures : { total: fixtures.length, pending: 0, models: { embeddings: 'idle' } } });
});
mkdirSync('data/qa-fixtures', { recursive: true });
try {
  await page.goto(process.env.QA_URL || 'http://127.0.0.1:4317');
  await expect(page.locator('.thought-text')).toHaveText(fixtures[0].content);
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.basin').evaluate(el => el.scrollIntoView({ block: 'center' }));
    const basin = await page.locator('.basin').boundingBox();
    const nav = await page.locator('.navigation').boundingBox();
    expect(basin.y + basin.height).toBeLessThan(nav.y);
  }
  console.log('PASS: basin is reachable above bottom navigation at 320, 390, 430, and 1440px; no horizontal overflow.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1700);
  const firstFrame = await waterFrame();
  await page.waitForTimeout(200);
  expect(await waterFrame()).not.toBe(firstFrame);
  await expect(page.locator(pixelPreview ? '.pixel-basin-art' : '.basin-shape')).toBeVisible();
  await page.screenshot({ path: `data/qa-fixtures/${screenshotPrefix}-mobile.png`, fullPage: true });
  await expect(page.getByText('Keep a little space.', { exact: true })).not.toBeVisible();
  await page.getByText('Stay with this thought', { exact: true }).click();
  await expect(page.getByText('Keep a little space.', { exact: true })).toBeVisible();
  await page.getByText('Stay with this thought', { exact: true }).click();
  failNext = true;
  const settle = () => page.getByRole('button', { name: 'Let this thought settle and continue', exact: true });
  await settle().click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.locator('.thought-text')).toHaveText(fixtures[0].content);
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[1].question);
  expect(feedbackCount).toBe(2);
  await expect(page.locator('.thought-text')).toHaveText(fixtures[1].question);
  await expect(page.getByText(fixtures[1].content, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal this thought', exact: true }).click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[1].content);
  await expect(page.getByText(fixtures[1].question, { exact: true })).toHaveCount(0);
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[2].content);
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[0].content);
  await expect(page.locator('.daily-progress')).toHaveAttribute('aria-label', 'Thought 1 of 3');
  await expect(page.locator('.basin')).toBeEnabled();
  const scheduledReviews = feedbackCount;
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[1].question);
  await expect(page.locator('.thought-text')).toHaveText(fixtures[1].question);
  await expect(page.getByText(fixtures[1].content, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal this thought', exact: true }).click();
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[2].content);
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[0].content);
  expect(feedbackCount).toBe(scheduledReviews);
  await page.screenshot({ path: `data/qa-fixtures/${screenshotPrefix}-loop.png`, fullPage: true });
  await page.reload();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[0].content);
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[1].question);
  expect(feedbackCount).toBe(scheduledReviews);
  console.log('PASS: feedback failure keeps the current thought; two loops wrap to the first item, reset recall, and do not repeat scheduled review writes; browsing continues after reload.');
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  await expect(page.locator('.insight-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your insight' })).toBeVisible();
  await page.screenshot({ path: `data/qa-fixtures/${screenshotPrefix}-save.png`, fullPage: true });
  const longPassage = 'A longer saved passage. '.repeat(65);
  remaining = [{ ...fixtures[0], content: longPassage }];
  await page.reload();
  await expect(page.locator('.thought-text')).toHaveText(remaining[0].content.trim());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.basin').evaluate(el => el.scrollIntoView({ block: 'center' }));
  await expect(page.locator('.basin')).toBeVisible();
  await settle().click();
  await expect(page.locator('.thought-text')).toHaveText(longPassage.trim());
  await expect(page.locator('.basin')).toBeEnabled();
  await expect(page.locator('.daily-progress')).toHaveAttribute('aria-label', 'Thought 1 of 1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const stillWater = await waterFrame();
  await page.waitForTimeout(250);
  expect(await waterFrame()).toBe(stillWater);
  fixtures.push({ ...fixtures[2], id: 'reference', intent: 'reference', content: 'A reference-only thought.' });
  await page.getByText('Stay with this thought', { exact: true }).click();
  await page.getByRole('button', { name: 'Stop resurfacing', exact: true }).click();
  await expect(page.locator('.floating-thought')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.thought-text')).toHaveText(fixtures[1].question);
  await expect(page.locator('.daily-progress')).toHaveAttribute('aria-label', 'Thought 1 of 2');
  console.log('PASS: a single thought loops; stopped and reference-only thoughts stay out of the loop.');
  remaining = [];
  fixtures.length = 0;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Save your first thought' })).toBeVisible();
  await page.screenshot({ path: `data/qa-fixtures/${screenshotPrefix}-empty.png`, fullPage: true });
  expect(errors).toEqual([]);
  console.log('PASS: collection and capture navigation, long passage scrolling, empty state, reduced motion, and no browser JavaScript errors.');
} finally { await browser.close(); }
