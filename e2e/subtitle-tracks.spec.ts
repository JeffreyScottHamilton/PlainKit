import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { mkvFixtureBytes } from '../src/engines/subtitles/mkv.fixture';

test('Subtitles: a text track stored in an MKV loads into the editor and exports with exact times', async ({ page }) => {
  const external: string[] = [];
  await page.goto('/tools/subtitles');
  const origin = new URL(page.url()).origin;
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url());
  });
  const main = page.getByRole('main');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), main.getByRole('button', { name: 'Choose an MKV or WebM file' }).click()]);
  await chooser.setFiles({ name: 'film.mkv', mimeType: 'video/x-matroska', buffer: Buffer.from(mkvFixtureBytes()) });

  const tracks = main.getByRole('list', { name: 'Subtitle tracks' });
  await expect(tracks.getByRole('listitem')).toHaveCount(3);
  await expect(tracks.getByText('Track 2 “English” · eng · S_TEXT/UTF8')).toBeVisible();
  await expect(tracks.getByText('Picture-based or unknown format: cannot be read as text')).toBeVisible();

  await main.getByRole('button', { name: 'Load track 2 into the editor' }).click();
  await expect(main.getByText('3 cues').first()).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => {
    await page.getByRole('complementary', { name: 'Subtitles settings' }).getByRole('button', { name: 'Export subtitles' }).click();
    await main.getByRole('button', { name: /^Download .*\.srt/ }).first().click();
  })()]);
  const srt = readFileSync((await dl.path())!, 'utf8');
  expect(srt).toContain('00:00:01,500 --> 00:00:03,000\nHello, world.');
  expect(srt).toContain('00:00:05,800 --> 00:00:07,800\nNext 🎬');

  // The Japanese ASS track replaces the editor content only after confirmation.
  await main.getByRole('button', { name: 'Load track 3 into the editor' }).click();
  await expect(main.getByText(/replaces the subtitles in the editor/)).toBeVisible();
  await main.getByRole('button', { name: 'Replace current subtitles' }).click();
  await expect(main.locator('textarea').filter({ hasText: 'こんにちは' }).first()).toBeVisible();
  expect(external).toEqual([]);
});

test('Subtitles: a file that is not Matroska is refused with a clear message', async ({ page }) => {
  await page.goto('/tools/subtitles');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('main').getByRole('button', { name: 'Choose an MKV or WebM file' }).click()]);
  await chooser.setFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('\0\0\0 ftypisom....') });
  await expect(page.getByRole('main').getByText('This is not a Matroska or WebM file.')).toBeVisible();
});
