/**
 * Analysis is a section of its own, and Research is its first page. Issue #659.
 *
 * The bar across the top gains Analysis, between AI and Chat, and it goes to
 * Research - the list of what this workspace has researched, with a New
 * research button. The dialog offers every choice the owner asked for: the
 * question; the mode - Shallow, Medium, Deep and whatever was added, each
 * named in a word with how long it usually takes said beside the row rather
 * than in it - and Add mode; the model; the language - Academic, Colloquial,
 * Formal; and the output, PDF unless somebody says Document.
 *
 * Websites to keep to and to avoid are lists: a site typed and added with
 * Enter or Add becomes a row of its own with a remove, an address is cut to
 * its host, and something that is no website is said at once and not added.
 *
 * Documents are picked, not listed: a box finds them by a word, the one picked
 * becomes a row with Include or Exclude and a remove, and a file uploaded right
 * there lands on Artifacts and arrives picked. Start writes the research down,
 * and the list shows it at once.
 *
 * No model is needed: what is measured is that the research is started and
 * listed, not what a model makes of it, so it may well be listed as failed.
 * The check removes what it started and the document it uploaded.
 */
import { BASE, WORKSPACE, open, record, finish, optionsOffered, chosenOption, chooseOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const question = `zz research check ${stamp}: why is the sea salty?`;
const fileName = `zz-research-${stamp}.md`;

await page.goto(`${BASE}/workspace/${WORKSPACE}/analysis/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Research', level: 1 }).waitFor({ timeout: 20_000 }).catch(() => undefined);

// --- the section ------------------------------------------------------------
const lit = await page.evaluate(() => {
  const current = document.querySelector('nav[aria-label="Sections"] [aria-current="page"]');
  return current === null ? null : (current.textContent ?? '').trim();
});
record(lit === 'Analysis', `Analysis is the section lit on Research (${lit})`);

const bar = await page.evaluate(() =>
  [...document.querySelectorAll('nav[aria-label="Sections"] a, nav[aria-label="Sections"] span')]
    .map((one) => ({ name: (one.textContent ?? '').trim(), x: one.getBoundingClientRect().left }))
    .filter((one) => ['AI', 'Analysis', 'Answer', 'Chat', 'Design', 'Flow', 'Workspace'].includes(one.name))
    .sort((a, b) => a.x - b.x)
    .map((one) => one.name),
);
record(
  bar.indexOf('Analysis') === bar.indexOf('AI') + 1 && bar.indexOf('AI') >= 0 && !bar.includes('Answer'),
  `Analysis is drawn after AI, in the alphabet's order, and nothing says Answer (${bar.join(', ')})`,
);

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
await page.locator('nav[aria-label="Sections"] a', { hasText: /^Analysis$/ }).first().click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(/\/analysis\/research$/, { timeout: 15_000 }).catch(() => undefined);
record(/\/analysis\/research$/.test(page.url()), `the Analysis link opens Research (${page.url()})`);

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
await page.locator('#research-mode').click();
for (const name of ['Shallow', 'Medium', 'Deep']) {
  const option = page.getByRole('option', { name, exact: true }).first();
  await option.hover().catch(() => undefined);
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
await dialog.locator('[data-adding-mode]').getByRole('button', { name: 'Cancel' }).click();

record(await dialog.locator('#research-model').isVisible(), 'the model is chosen with the model picker');

const languages = (await optionsOffered(page, '#research-language')).map((one) => one.label);
record(JSON.stringify(languages) === JSON.stringify(['Academic', 'Colloquial', 'Formal']), `the languages are Academic, Colloquial, Formal (${languages.join(', ')})`);
const formats = (await optionsOffered(page, '#research-format')).map((one) => one.label);
record(JSON.stringify(formats) === JSON.stringify(['PDF', 'Document']), `the outputs are PDF and Document (${formats.join(', ')})`);
record((await chosenOption(page, '#research-format')) === 'PDF', `the output is PDF until somebody says otherwise (${await chosenOption(page, '#research-format')})`);

// --- websites, as lists -----------------------------------------------------
const include = dialog.locator('[data-sites="research-websites-include"]');
const exclude = dialog.locator('[data-sites="research-websites-exclude"]');
record((await include.locator('textarea').count()) === 0 && (await include.locator('input').count()) === 1, 'websites are typed one at a time, not into a text area');

await include.locator('input').fill('https://www.example.org/news?x=1');
await include.locator('input').press('Enter');
await include.locator('input').fill('docs.example.net');
await include.getByRole('button', { name: 'Add' }).click();
const included = await include.locator('[data-site]').evaluateAll((all) => all.map((one) => one.getAttribute('data-site')));
record(JSON.stringify(included) === JSON.stringify(['example.org', 'docs.example.net']), `Enter and Add each make a row, an address cut to its host (${included.join(', ')})`);
record((await dialog.count()) === 1, 'and Enter does not send the form');

await exclude.locator('input').fill('not a site');
await exclude.locator('input').press('Enter');
const refusal = ((await exclude.locator('[data-site-refused]').textContent().catch(() => '')) ?? '').trim();
record(refusal.includes('not a site') && (await exclude.locator('[data-site]').count()) === 0, `something that is no website is said and not added (${refusal})`);
await exclude.locator('input').fill('tabloid.example');
await exclude.locator('input').press('Enter');
record((await exclude.locator('[data-site]').count()) === 1, 'a website to avoid is a row of its own');

await include.locator('[data-site="docs.example.net"]').getByRole('button').click();
record((await include.locator('[data-site]').count()) === 1, 'a row goes with its own remove');

// --- documents, picked ------------------------------------------------------
const documents = dialog.locator('fieldset[data-documents]');
record((await documents.locator('[data-picked]').count()) === 0, 'no document is drawn until one is picked');

await documents.locator('[data-document-upload]').setInputFiles({
  name: fileName,
  mimeType: 'text/markdown',
  buffer: Buffer.from('The harbour master logs a spring tide every fortnight.'),
});
await documents.locator(`[data-picked="${fileName}"]`).waitFor({ timeout: 15_000 }).catch(() => undefined);
record((await documents.locator(`[data-picked="${fileName}"]`).count()) === 1, 'an uploaded document arrives picked');
const onArtifacts = await graphql(`query($w: ID!, $s: String) { researchDocuments(workspaceId: $w, search: $s) { id name } }`, { w: WORKSPACE, s: fileName });
record(onArtifacts.researchDocuments.length === 1, 'and is one of the workspace\'s documents');

// Removed, then found again by a word in its name.
await documents.locator(`[data-picked="${fileName}"]`).getByRole('button', { name: `Remove ${fileName}` }).click();
record((await documents.locator('[data-picked]').count()) === 0, 'a picked document goes with its own remove');
await documents.locator('#research-document-search').click();
await documents.locator('#research-document-search').fill(`zz-research-${stamp}`);
const result = documents.locator('[data-document-results] button', { hasText: fileName });
await result.waitFor({ timeout: 10_000 }).catch(() => undefined);
const results = await documents.locator('[data-document-results] button').count();
record(results === 1, `the box finds it by a word in its name, and only it (${results})`);
await result.dispatchEvent('mousedown');
await documents.locator(`[data-picked="${fileName}"]`).waitFor({ timeout: 5_000 }).catch(() => undefined);
record((await documents.locator(`[data-picked="${fileName}"]`).count()) === 1, 'picking it makes it a row');
await chooseOption(page, documents.locator(`[data-picked="${fileName}"]`), 'EXCLUDE');
record((await chosenOption(page, documents.locator(`[data-picked="${fileName}"]`))) === 'EXCLUDE', 'and the row says include or exclude');

// --- starting one -----------------------------------------------------------
await dialog.locator('textarea#research-question').fill(question);
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
const opened = page.locator('[data-opened]');
await opened.waitFor({ timeout: 10_000 }).catch(() => undefined);
const facts = ((await opened.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
record(facts.includes('example.org') && facts.includes('tabloid.example') && facts.includes(fileName), `opened, it shows the websites and the document it was given (${facts.slice(0, 160)})`);

// --- clean up ---------------------------------------------------------------
const listed = await graphql(`query($w: ID!) { researches(workspaceId: $w, size: 100) { content { id question } } }`, { w: WORKSPACE });
for (const one of listed.researches.content.filter((held) => held.question.startsWith('zz research check'))) {
  await graphql(`mutation($id: ID!) { deleteResearch(id: $id) }`, { id: one.id });
}
const uploaded = await graphql(`query($w: ID!) { researchDocuments(workspaceId: $w, search: "zz-research-", limit: 100) { id } }`, { w: WORKSPACE });
for (const one of uploaded.researchDocuments) {
  await graphql(`mutation($id: String!) { deleteArtifact(id: $id) }`, { id: `SAVED-${one.id}` }).catch(() => undefined);
}

await finish(browser);
