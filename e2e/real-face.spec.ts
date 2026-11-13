import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// Opt-in checks on REAL photographs, which are not committed (no clear redistribution licence).
//   PK_REAL_DIR=/dir/with/portrait.jpg,group.jpg,objects.jpg npx playwright test e2e/real-face.spec.ts --project=models --workers=1
// Outputs are written to PK_REAL_DIR/out for a person to look at. The assertions are deliberately loose.
const DIR = process.env.PK_REAL_DIR ?? '';
const has = (f: string) => !!DIR && existsSync(join(DIR, f));
const out = (f: string) => {
  mkdirSync(join(DIR, 'out'), { recursive: true });
  return join(DIR, 'out', f);
};
test.describe.configure({ mode: 'serial' });

for (const [file, minFaces] of [['portrait.jpg', 1], ['group.jpg', 2]] as const) {
  test(`face detection on a real photo: ${file}`, async ({ page }) => {
    test.skip(!has(file), 'set PK_REAL_DIR');
    test.setTimeout(180_000);
    await page.goto('/tools/redact');
    await page.locator('input[type=file]').first().setInputFiles({ name: file, mimeType: 'image/jpeg', buffer: readFileSync(join(DIR, file)) });
    await page.getByRole('button', { name: 'Find faces on this device' }).click();
    const found = page.getByText(/Found \d+ faces?\.|No faces found/);
    await expect(found.first()).toBeVisible({ timeout: 120_000 });
    const text = await found.first().innerText();
    const n = Number(/Found (\d+)/.exec(text)?.[1] ?? 0);
    console.log(`REAL face ${file}: ${text.split('.')[0]}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: out(`faces-${file}.png`) });
    expect(n).toBeGreaterThanOrEqual(minFaces);
  });
}

for (const file of ['portrait.jpg', 'objects.jpg']) {
  test(`cutout on a real photo: ${file}`, async ({ page }) => {
    test.skip(!has(file), 'set PK_REAL_DIR');
    test.setTimeout(240_000);
    await page.goto('/tools/cutout');
    await page.locator('input[type=file]').first().setInputFiles({ name: file, mimeType: 'image/jpeg', buffer: readFileSync(join(DIR, file)) });
    await page.getByRole('button', { name: /remove background/i }).first().click();
    const dlBtn = page.getByRole('button', { name: 'Download PNG', exact: true });
    await expect(dlBtn).toBeVisible({ timeout: 200_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), dlBtn.click()]);
    const png = PNG.sync.read(readFileSync((await dl.path())!));
    let clear = 0;
    let solid = 0;
    for (let i = 3; i < png.data.length; i += 4) {
      if (png.data[i]! < 10) clear++;
      else if (png.data[i]! > 245) solid++;
    }
    const n = png.width * png.height;
    console.log(`REAL cutout ${file}: ${png.width}x${png.height}, transparent ${(clear / n * 100).toFixed(0)}%, opaque ${(solid / n * 100).toFixed(0)}%, soft edge ${(100 - (clear + solid) / n * 100).toFixed(0)}%`);
    // Composite over magenta so a person can judge the edge.
    for (let i = 0; i < png.data.length; i += 4) {
      const a = png.data[i + 3]! / 255;
      png.data[i] = Math.round(png.data[i]! * a + 255 * (1 - a));
      png.data[i + 1] = Math.round(png.data[i + 1]! * a);
      png.data[i + 2] = Math.round(png.data[i + 2]! * a + 255 * (1 - a));
      png.data[i + 3] = 255;
    }
    writeFileSync(out(`cutout-${file}.png`), PNG.sync.write(png));
    expect(clear / n).toBeGreaterThan(0.05);
    expect(solid / n).toBeGreaterThan(0.05);
  });
}
