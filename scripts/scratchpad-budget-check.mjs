/**
 * Admin Settings sets how many bytes a session's scratchpads may hold. Issue #411.
 *
 * The field is in kilobytes and the server keeps bytes, so this also checks the
 * two agree: what the box saves reads back as that many bytes. What the bound
 * then does to a write is ScratchpadTest's business; here it is the box.
 *
 * Leaves the setting as it found it.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const budget = async () =>
  (await graphql(`query { installationSettings { scratchpadBudgetBytes scratchpadBudgetBytesConfigured } }`, {}))
    .installationSettings;

const was = (await budget()).scratchpadBudgetBytes;
const KB = was === 2048 * 1024 ? 4096 : 2048;
console.log(`budget was ${was} bytes; setting ${KB} KB`);

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the admin settings page'), 'the admin settings page is on screen');

const box = page.locator('#scratchpad-budget');
const there = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'there is a box for how much a session\'s scratchpads may hold');
if (!there) await finish(browser);

// It opens on what the server holds, in KB.
record(Number(await box.inputValue()) === Math.round(was / 1024), `it opens on the current budget (${await box.inputValue()} KB)`);

await box.fill(String(KB));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);

const now = (await budget()).scratchpadBudgetBytes;
record(now === KB * 1024, `saving ${KB} KB stores ${KB * 1024} bytes (${now})`);

/* Left as it was found. */
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.locator('#scratchpad-budget').fill(String(Math.round(was / 1024)));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
record((await budget()).scratchpadBudgetBytes === was, 'the setting is left as it was found');

await finish(browser);
