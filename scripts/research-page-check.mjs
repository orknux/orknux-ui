/**
 * Answer is a section of its own, and Research is its first page. Issue #659.
 *
 * The bar across the top gains Answer, between AI and Chat, and it goes to
 * Research - the list of what this workspace has researched, with a New
 * research button. The dialog offers every choice the owner asked for: the
 * question; the mode - Shallow, Medium, Deep and whatever was added, each
 * named in a word with how long it usually takes said beside the row rather
 * than in it - and Add mode; the model; websites and documents, each to
 * include and to exclude; the language - Academic, Colloquial, Formal; and the
 * output - PDF or Document. Start writes the research down, and the list shows
 * it at once.
 *
 * No model is needed: what is measured is that the research is started and
 * listed, not what a model makes of it, so it may well be listed as failed.
 * The check removes what it started.
 */
import { BASE, WORKSPACE, open, record, finish, optionsOffered } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const question = `zz research check ${Date.now()}: why is the sea salty?`;

await page.goto(`${BASE}/workspace/${WORKSPACE}/answer/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Research', level: 1 }).waitFor({ timeout: 20_000 }).catch(() => undefined);

// --- the section ------------------------------------------------------------
const lit = await page.evaluate(() => {
  const current = document.querySelector('nav[aria-label="Sections"] [aria-current="page"]');
  return current === null ? null : (current.textContent ?? '').trim();
});
record(lit === 'Answer', `Answer is the section lit on Research (${lit})`);

const bar = await page.evaluate(() =>
  [...document.querySelectorAll('nav[aria-label="Sections"] a, nav[aria-label="Sections"] span')]
    .map((one) => ({ name: (one.textContent ?? '').trim(), x: one.getBoundingClientRect().left }))
    .filter((one) => ['AI', 'Answer', 'Chat', 'Design', 'Flow', 'Workspace'].includes(one.name))
    .sort((a, b) => a.x - b.x)
    .map((one) => one.name),
);
record(bar.indexOf('Answer') === bar.indexOf('AI') + 1 && bar.indexOf('AI') >= 0, `Answer is drawn after AI, in the alphabet's order (${bar.join(', ')})`);

/*
 * Six sections fit beside the Quick actions box: the last one ends before the
 * box begins, at the width this check runs at and at a wide one. At 1440 Flow
 * went under the box until the bar stopped centring the box there.
 */
for (const width of [1440, 1920, 1280]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.waitForTimeout(300);
  const gap = await page.evaluate(() => {
    const links = [...document.querySelectorAll('nav[aria-label="Sections"] a, nav[aria-label="Sections"] span')]
      .filter((one) => (one.textContent ?? '').trim() !== '');
    const last = links.map((one) => one.getBoundingClientRect().right).reduce((a, b) => Math.max(a, b), 0);
    const box = document.querySelector('input[aria-label="Quick actions"]')?.closest('div')?.getBoundingClientRect().left ?? Infinity;
    return Math.round(box - last);
  });
  record(gap >= 0, `at ${width}px the sections end before the Quick actions box (${gap}px apart)`);
}
await page.setViewportSize({ width: 1440, height: 1000 });

const menu = await page.locator('aside a, nav a').filter({ hasText: /^Research$/ }).count();
record(menu > 0, 'Research is in the section menu');

// The bar's own link lands here, from another section.
await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
await page.locator('nav[aria-label="Sections"] a', { hasText: /^Answer$/ }).first().click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(/\/answer\/research$/, { timeout: 15_000 }).catch(() => undefined);
record(/\/answer\/research$/.test(page.url()), `the Answer link opens Research (${page.url()})`);

// --- the dialog -------------------------------------------------------------
await page.getByRole('button', { name: /New research/ }).click({ timeout: 15_000 });
const dialog = page.locator('dialog[open]');
await dialog.waitFor({ timeout: 10_000 });

record(await dialog.locator('textarea#research-question').isVisible(), 'the question is a text area');

// The modes arrive with the dialog; wait for the three.
const upTo = Date.now() + 15_000;
let modes = [];
while (Date.now() < upTo) {
  modes = await optionsOffered(page, '#research-mode').catch(() => []);
  if (modes.length >= 3) break;
  await page.waitForTimeout(300);
}
const modeNames = modes.map((one) => one.label);
record(
  ['Shallow', 'Medium', 'Deep'].every((name) => modeNames.includes(name)),
  `the modes are Shallow, Medium and Deep (${modeNames.join(', ')})`,
);
record(modeNames.every((name) => !/minute/i.test(name)), 'no mode carries its explanation in its label');

// How long each takes is said beside the row the pointer is on.
const hints = {};
const control = page.locator('#research-mode');
await control.click();
for (const name of ['Shallow', 'Medium', 'Deep']) {
  const row = page.getByRole('option', { name, exact: true }).first();
  await row.hover().catch(() => undefined);
  await page.waitForTimeout(150);
  hints[name] = ((await page.locator('[data-select-hint]').first().textContent().catch(() => '')) ?? '').trim();
}
await page.keyboard.press('Escape');
record(/few minutes/i.test(hints.Shallow ?? ''), `Shallow's hint says a few minutes (${hints.Shallow})`);
record(/several minutes/i.test(hints.Medium ?? '') && !/more than/i.test(hints.Medium ?? ''), `Medium's hint says several minutes (${hints.Medium})`);
record(/more than several minutes/i.test(hints.Deep ?? ''), `Deep's hint says more than several minutes (${hints.Deep})`);

record(await dialog.getByRole('button', { name: 'Add mode' }).isVisible(), 'Add mode is offered beside the mode');
await dialog.getByRole('button', { name: 'Add mode' }).click();
record(await dialog.locator('#research-mode-name').isVisible(), 'Add mode asks for a name');
const runs = (await optionsOffered(page, '#research-mode-runs').catch(() => [])).map((one) => one.label);
record(runs.includes('Medium'), `and for what it runs: a copy of a mode, or a workflow (${runs.slice(0, 5).join(', ')}…)`);
await dialog.getByRole('button', { name: 'Cancel' }).first().click();

record(await dialog.locator('#research-model').isVisible(), 'the model is chosen with the model picker');
record(
  (await dialog.locator('#research-websites-include').isVisible()) && (await dialog.locator('#research-websites-exclude').isVisible()),
  'websites have an include and an exclude list',
);
record(await dialog.locator('fieldset[data-documents]').isVisible(), 'documents are offered to include and to exclude');

const languages = (await optionsOffered(page, '#research-language')).map((one) => one.label);
record(JSON.stringify(languages) === JSON.stringify(['Academic', 'Colloquial', 'Formal']), `the languages are Academic, Colloquial, Formal (${languages.join(', ')})`);
const formats = (await optionsOffered(page, '#research-format')).map((one) => one.label);
record(JSON.stringify(formats) === JSON.stringify(['PDF', 'Document']), `the outputs are PDF and Document (${formats.join(', ')})`);

// --- starting one -----------------------------------------------------------
await dialog.locator('textarea#research-question').fill(question);
await dialog.locator('#research-websites-include').fill('example.org');
await dialog.getByRole('button', { name: /^Start$/ }).click();
await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
record((await page.locator('dialog[open]').count()) === 0, 'Start closes the dialog');

const row = page.locator('[data-research]').filter({ hasText: question });
await row.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
record((await row.count()) === 1, 'the research is in the list at once');
const status = ((await row.first().locator('span').filter({ hasText: /^(Running|Completed|Failed|Stopped)$/ }).first().textContent().catch(() => '')) ?? '').trim();
record(status !== '', `and says where it has got to (${status})`);

// Opened, it says what was asked.
await row.first().getByRole('link', { name: question }).click().catch(() => undefined);
await page.locator('[data-opened]').waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await page.locator('[data-opened]').filter({ hasText: 'example.org' }).count()) === 1, 'opened, it shows what it was asked to keep to');

// --- clean up ---------------------------------------------------------------
const listed = await graphql(`query($w: ID!) { researches(workspaceId: $w, size: 100) { content { id question } } }`, { w: WORKSPACE });
for (const one of listed.researches.content.filter((held) => held.question.startsWith('zz research check'))) {
  await graphql(`mutation($id: ID!) { deleteResearch(id: $id) }`, { id: one.id });
}

await finish(browser);
