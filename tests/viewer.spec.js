// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const DEMO = JSON.parse(fs.readFileSync(new URL('../demo/demo-site.inspection.json', import.meta.url), 'utf8'));

/** Collect console errors and uncaught exceptions for a page. */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function openDemo(page) {
  await page.goto('/index.html');
  await page.locator('#btn-open-demo').click();
  await expect(page.locator('.app-nav')).toBeVisible();
}

const view = (page, name) => page.locator(`.nav-link[data-view="${name}"]`).click();

test('start screen: no site, nav hidden, generic title', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/index.html');
  await expect(page.locator('#btn-open-demo')).toBeVisible();
  await expect(page.locator('.app-nav')).toBeHidden();
  await expect(page.locator('#btn-open-backup')).toBeHidden();
  await expect(page).toHaveTitle('Visualiseur d’inspection');
  expect(errors).toEqual([]);
});

test('demo opens and every view renders without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await expect(page.locator('#site-title')).toHaveText(DEMO.site.name);
  await expect(page.locator('.summary-tile').first()).toBeVisible();

  await view(page, 'zones');
  await expect(page.locator('#main-view-content')).not.toBeEmpty();
  await view(page, 'trades');
  await expect(page.locator('#main-view-content')).not.toBeEmpty();

  await view(page, 'site_plan');
  await expect(page.locator('#site-hotspots-list .hotspot-list-item')).toHaveCount(DEMO.sitePlan.hotspots.length);
  const img = page.locator('#site-plan-canvas-root image');
  await expect(img).toHaveAttribute('width', String(DEMO.sitePlan.width));
  await expect(img).toHaveAttribute('href', /^data:image\/svg\+xml;base64,/);

  await view(page, 'floor_plan');
  await expect(page.locator('.level-tab')).toHaveCount(DEMO.levels.length);
  await expect(page.locator('#floor-rooms-list .hotspot-list-item')).toHaveCount(DEMO.levels[0].rooms.length);
  await page.locator('.level-tab').nth(1).click();
  await expect(page.locator('#floor-rooms-list .hotspot-list-item')).toHaveCount(DEMO.levels[1].rooms.length);

  await view(page, 'admin');
  await expect(page.locator('.admin-view')).toBeVisible();

  expect(errors).toEqual([]);
});

test('progress persists across reload and the site stays loaded', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const before = await page.locator('#header-progress-text').textContent();

  await page.locator('.item-card .progress-pill').first().click(); // todo -> planned
  await page.locator('.item-card .progress-pill').first().click(); // planned -> done
  const after = await page.locator('#header-progress-text').textContent();
  expect(after).not.toBe(before);

  await page.reload();
  await expect(page.locator('#btn-open-demo')).toHaveCount(0);
  await expect(page.locator('#site-title')).toHaveText(DEMO.site.name);
  await expect(page.locator('#header-progress-text')).toHaveText(after ?? '');
  expect(errors).toEqual([]);
});

test('export, remove, re-import gives the same site', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await page.locator('.item-card .progress-pill').first().click();
  const progressText = await page.locator('#header-progress-text').textContent();

  await page.locator('#btn-open-backup').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-backup').click()]);
  expect(download.suggestedFilename()).toMatch(/\.inspection\.json$/);
  const exported = JSON.parse(fs.readFileSync(/** @type {string} */ (await download.path()), 'utf8'));
  expect(exported.schema).toBe(1);
  expect(exported.items).toHaveLength(DEMO.items.length);
  expect(Object.keys(exported.userState.userProgress).length).toBeGreaterThan(0);

  // remove the site, then load the exported file from the start screen
  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-close-site').click();
  await expect(page.locator('#btn-open-demo')).toBeVisible();
  await page.locator('#start-file-input').setInputFiles({
    name: 'x.inspection.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator('.app-nav')).toBeVisible();
  await expect(page.locator('#header-progress-text')).toHaveText(progressText ?? '');
  expect(errors).toEqual([]);
});

test('export options leave out progress and the plan image', async ({ page }) => {
  await openDemo(page);
  await page.locator('.item-card .progress-pill').first().click();
  await page.locator('#btn-open-backup').click();
  await page.locator('#opt-progress').uncheck();
  await page.locator('#opt-image').uncheck();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-backup').click()]);
  const exported = JSON.parse(fs.readFileSync(/** @type {string} */ (await download.path()), 'utf8'));
  expect(exported.userState.userProgress).toEqual({});
  expect(exported.sitePlan.imageDataUrl).toBeNull();
  expect(exported.sitePlan.hotspots.length).toBe(DEMO.sitePlan.hotspots.length);
});

test('malformed files are refused and the current site is kept', async ({ page }) => {
  await openDemo(page);
  await page.locator('#btn-open-backup').click();

  for (const bad of ['not json at all', '{"schema": 1}', '{"schema": 99, "items": []}']) {
    const dialog = page.waitForEvent('dialog');
    await page.locator('#backup-file-input').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(bad),
    });
    const d = await dialog;
    expect(d.message()).toContain('Fichier refusé');
    await d.accept();
    await expect(page.locator('#site-title')).toHaveText(DEMO.site.name);
  }
});

test('malformed file on the start screen shows an error message', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#start-file-input').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema": 1}'),
  });
  await expect(page.locator('.error-text')).toContainText('items');
  await expect(page.locator('.app-nav')).toBeHidden();
});

test('hostile package content is rendered as text, never as markup', async ({ page }) => {
  const errors = watchErrors(page);
  const evil = structuredClone(DEMO);
  const payload = '<img src=x onerror="window.__pwned=1">';
  evil.site.name = payload;
  evil.items[0].article = payload;
  evil.items[0].zone = payload;
  evil.items[0].trade = payload;
  evil.items[0].rawObservation = `• ${payload}<script>window.__pwned=1</script>`;
  delete evil.items[0].bullets;
  evil.levels[0].name = payload;
  evil.levels[0].rooms[0].name = payload;
  evil.sitePlan.hotspots[0].name = payload;
  evil.legend.entries[0].description = payload;
  evil.adminItems[0].article = payload;

  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss(); });

  await page.goto('/index.html');
  await page.locator('#start-file-input').setInputFiles({
    name: 'evil.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(evil)),
  });
  await expect(page.locator('.app-nav')).toBeVisible();

  for (const v of ['dashboard', 'zones', 'trades', 'site_plan', 'floor_plan', 'admin']) {
    await view(page, v);
  }
  await page.locator('#btn-open-backup').click();

  expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.locator('#main-view-content script').count()).toBe(0);
  expect(dialogs).toBe(0);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('the shipped files contain no embedded real-site data', async () => {
  const text = JSON.stringify(DEMO);
  expect(DEMO.site.name).toMatch(/fictive/i);
  expect(text.length).toBeLessThan(50_000);
});
