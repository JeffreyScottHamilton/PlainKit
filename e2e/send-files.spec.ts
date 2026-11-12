import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { sha256 } from './fixtures';

const NAME = 'payload.bin';
const SIZE = 300 * 1024;

/** Opens the tool in a fresh tab and waits for its heading. Switches to Receive when asked. */
async function open(page: Page, view: 'Send' | 'Receive'): Promise<Locator> {
  await page.goto('/tools/send-files');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Send files' })).toBeVisible();
  if (view === 'Receive') await main.getByRole('radio', { name: 'Receive' }).click();
  return main;
}

/** Manual pairing between two tabs of one browser context: invite, reply, reply pasted, connected on both. */
async function pair(a: Page, b: Page, data: Buffer): Promise<{ ma: Locator; mb: Locator }> {
  const ma = await open(a, 'Send');
  await ma.locator('input[type=file]').setInputFiles({ name: NAME, mimeType: 'application/octet-stream', buffer: data });
  await expect(ma.getByText(NAME, { exact: true })).toBeVisible();
  await ma.getByRole('button', { name: 'Create invite' }).click();
  const invite = ma.getByLabel('Invite code', { exact: true });
  await expect(invite).not.toHaveValue('', { timeout: 20_000 });
  const inviteText = await invite.inputValue();

  const mb = await open(b, 'Receive');
  await mb.getByLabel('Paste invite code', { exact: true }).fill(inviteText);
  await mb.getByRole('button', { name: 'Create reply' }).click();
  const reply = mb.getByLabel('Reply code', { exact: true });
  await expect(reply).not.toHaveValue('', { timeout: 20_000 });
  await ma.getByLabel('Paste reply code', { exact: true }).fill(await reply.inputValue());
  await ma.getByRole('button', { name: 'Connect', exact: true }).click();

  await expect(ma.getByText('Direct connection open.', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(mb.getByText('Direct connection open.', { exact: true })).toBeVisible({ timeout: 30_000 });
  const ca = ((await ma.getByLabel('Comparison number').textContent()) ?? '').replace(/\s/g, '');
  const cb = ((await mb.getByLabel('Comparison number').textContent()) ?? '').replace(/\s/g, '');
  expect(ca).toMatch(/^\d{6}$/);
  expect(cb).toBe(ca);
  return { ma, mb };
}

test('sends a 300 KB file after both sides show the same number and the receiver accepts', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  const data = randomBytes(SIZE);
  const { ma, mb } = await pair(a, b, data);

  await ma.getByRole('button', { name: 'Send 1 file' }).click();
  await expect(mb.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 15_000 });
  await mb.getByRole('button', { name: 'Accept' }).click();

  await expect(mb.getByText('Transfer complete.', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(ma.getByText('Transfer complete.', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(mb.getByText(/300 KB · Checked with SHA-256/)).toBeVisible();

  const [dl] = await Promise.all([b.waitForEvent('download'), mb.getByRole('button', { name: `Download ${NAME}` }).click()]);
  const got = await readFile(await dl.path());
  expect(got.length).toBe(SIZE);
  expect(sha256(new Uint8Array(got))).toBe(sha256(data));
});

test('declining sends no file bytes', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  const { ma, mb } = await pair(a, b, randomBytes(SIZE));

  await ma.getByRole('button', { name: 'Send 1 file' }).click();
  await expect(mb.getByRole('button', { name: 'Decline' })).toBeVisible({ timeout: 15_000 });
  await mb.getByRole('button', { name: 'Decline' }).click();

  await expect(ma.locator('.pk-notice').getByText('Declined by the other device. No file bytes were sent.')).toBeVisible({ timeout: 15_000 });
  await expect(ma.getByRole('progressbar')).toHaveCount(0);
  await expect(mb.getByRole('button', { name: /^Download/ })).toHaveCount(0);
});

test('pasting garbage as an invite shows a clear error', async ({ context }) => {
  const b = await context.newPage();
  const mb = await open(b, 'Receive');
  await mb.getByLabel('Paste invite code', { exact: true }).fill('this is not a code');
  await mb.getByRole('button', { name: 'Create reply' }).click();
  await expect(mb.getByRole('alert')).toContainText('This is not a Plainkit code');
});
