import { test, expect, type Locator, type Page } from '@playwright/test';

/** Drag with real pointer events: press on `source`, then move so the block's top-left lands at (x, y). */
async function dragTo(page: Page, source: Locator, x: number, y: number) {
  const box = (await source.boundingBox())!;
  const grab = { x: 12, y: box.height / 2 };
  await page.mouse.move(box.x + grab.x, box.y + grab.y);
  await page.mouse.down();
  await page.mouse.move(x + grab.x, y + grab.y, { steps: 12 });
  await page.waitForTimeout(50); // drop target is computed on the next animation frame
  await page.mouse.up();
}

const canvas = (page: Page) => page.getByRole('region', { name: /Scripts for/ });
const paletteBlock = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Blocks' }).getByRole('button', { name });
const repeatBody = (page: Page) => canvas(page).locator('.block-c .c-mouth > .stack > .block');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(canvas(page).getByRole('group').first()).toBeVisible();
});

test('drags a block from the palette into a loop', async ({ page }) => {
  await expect(repeatBody(page)).toHaveCount(2);
  const slot = (await canvas(page).locator('.block-c .c-mouth > .stack > [data-slot][data-index="2"]').boundingBox())!;
  await dragTo(page, paletteBlock(page, /turn right 15 degrees/), slot.x + 4, slot.y + 2);
  await expect(repeatBody(page)).toHaveCount(3);
  await expect(repeatBody(page).nth(2)).toHaveAccessibleName(/turn right 15 degrees/);
});

test('a hat dropped on empty canvas starts a new script; undo and redo it', async ({ page }) => {
  const area = (await canvas(page).boundingBox())!;
  await dragTo(page, paletteBlock(page, /when this sprite clicked/), area.x + 560, area.y + 140);
  await expect(canvas(page).locator('.script')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(canvas(page).locator('.script')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(canvas(page).locator('.script')).toHaveCount(2);
});

test('dropping a block on the palette deletes it, and the toast can undo it', async ({ page }) => {
  const block = canvas(page).getByRole('group', { name: /^say Your turn/ });
  const palette = (await page.getByRole('navigation', { name: 'Blocks' }).boundingBox())!;
  await dragTo(page, block, palette.x + 100, palette.y + 300);
  await expect(block).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); // the toast's button
  await expect(canvas(page).getByRole('group', { name: /^say Your turn/ })).toHaveCount(1);
});

test('the green flag runs scripts on the stage, and stop ends them', async ({ page }) => {
  const cat = page.getByRole('button', { name: /^Cat, x/ });
  await expect(cat).toHaveAccessibleName('Cat, x -150, y 0, direction 90');
  await page.getByRole('button', { name: 'Run (green flag)' }).click();
  await expect(page.locator('.bubble')).toContainText('Watch this!');
  await expect(cat).not.toHaveAccessibleName(/x -150,/, { timeout: 3000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.bubble')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
});

test('keyboard only: add, reorder and delete blocks', async ({ page }) => {
  await paletteBlock(page, /wait 1 seconds/).focus();
  await page.keyboard.press('Enter');
  const blocks = canvas(page).locator('.script').first().locator(':scope > .stack > .block');
  await expect(blocks.last()).toHaveAccessibleName(/^wait 1 seconds/);

  await blocks.last().focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(blocks.nth(-2)).toHaveAccessibleName(/^wait 1 seconds/);
  await page.keyboard.press('Delete');
  await expect(canvas(page).getByRole('group', { name: /^wait 1 seconds/ })).toHaveCount(0);
});

test('the project survives a reload', async ({ page }) => {
  await paletteBlock(page, /change x by 10/).click();
  await page.waitForTimeout(600); // autosave is debounced
  await page.reload();
  await expect(canvas(page).getByRole('group', { name: /^change x by 10/ })).toHaveCount(1);
});
