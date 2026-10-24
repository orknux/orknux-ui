/**
 * Explore is a section of its own, and Research is its first page. Issue #659.
 *
 * The bar across the top gains Explore, between Design and Flow - it was
 * Analysis while 1.2.0 was built, and an /analysis/ address still lands - and
 * it goes to Research - the list of what this workspace has researched, with a New
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
 * and opens the research on a page of its own; its Back link leads to the
 * list, which shows it.
 *
 * A research always has its model, so the picker has no empty row and
 * arrives with the workspace's first chat model chosen; the check makes one
 * where the workspace has none, at an address that never answers - what is
 * measured is that the research is started and listed, not what a model makes
 * of it, so it may well be listed as failed. Use web search is a box in the
 * sources, on until it is unticked, and the research says when it was off;
 * Include images is the box beside it, off until it is ticked, sent with the
 * start as it was left, and said on the research when it was on.
 * The check removes what it started, the document it uploaded and the model
 * it made.
 *
 * The list's row reads as the Runs list's does: every cell but the question
 * and the status badge at one size, plain text at a regular weight and a link
 * at a medium one, each cell under its heading's left edge - they were four
 * sizes and three weights. The model a research used is a link to the model's
 * page, in the row and on the research.
 *
 * A research opened is a page of its own, not a card over the list: a Back
 * link to the list, the question as the page's title, and not one row of the
 * list under it.
 */
import { BASE, WORKSPACE, open, record, finish, optionsOffered, chosenOption, chooseOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const question = `zz research check ${stamp}: why is the sea salty?`;
const fileName = `zz-research-${stamp}.md`;

// A chat model to preselect: the workspace's own, or one made here that never answers.
const held = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name kind } }`, { w: WORKSPACE });
let madeProvider = null;
// Two of them, so remembering the one chosen can be told from taking the first.
const chatModels = held.models.filter((one) => one.kind === 'CHAT').length;
if (chatModels < 2) {
  madeProvider = (
    await graphql(`mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
      input: { workspaceId: WORKSPACE, name: `zz research check ${stamp}`, type: 'OPENAI', endpoint: 'https://research.invalid', secret: 'sk-check' },
    })
  ).createModelProvider.id;
  for (let at = chatModels; at < 2; at++) {
    await graphql(`mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
      input: { providerId: madeProvider, name: `zz research model ${stamp} ${at}`, modelId: `zz-research-${at}`, kind: 'CHAT' },
    });
  }
}

// An address from when the section was called Analysis lands on Explore's page.
await page.goto(`${BASE}/workspace/${WORKSPACE}/analysis/research`, { waitUntil: 'domcontentloaded' });
await page.waitForURL(/\/explore\/research$/, { timeout: 15_000 }).catch(() => undefined);
record(/\/workspace\/[^/]+\/explore\/research$/.test(page.url()), `an /analysis/ address goes to /explore/ (${page.url()})`);
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Research', level: 1 }).waitFor({ timeout: 20_000 }).catch(() => undefined);

// --- the section ------------------------------------------------------------
const lit = await page.evaluate(() => {
  const current = document.querySelector('nav[aria-label="Sections"] [aria-current="page"]');
  return current === null ? null : (current.textContent ?? '').trim();
});
record(lit === 'Explore', `Explore is the section lit on Research (${lit})`);

// Chat joins the bar once the installation's settings arrive.
await page.locator('nav[aria-label="Sections"] a', { hasText: /^Chat$/ }).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
const bar = await page.evaluate(() =>
  [...document.querySelectorAll('nav[aria-label="Sections"] a, nav[aria-label="Sections"] span')]
    .map((one) => ({ name: (one.textContent ?? '').trim(), x: one.getBoundingClientRect().left }))
    .filter((one) => ['AI', 'Analysis', 'Answer', 'Chat', 'Design', 'Explore', 'Flow', 'Workspace'].includes(one.name))
    .sort((a, b) => a.x - b.x)
    .map((one) => one.name),
);
record(
  JSON.stringify(bar) === JSON.stringify(['AI', 'Chat', 'Design', 'Explore', 'Flow', 'Workspace']),
  `Explore is drawn between Design and Flow, in the alphabet's order, and nothing says Analysis or Answer (${bar.join(', ')})`,
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
await page.locator('nav[aria-label="Sections"] a', { hasText: /^Explore$/ }).first().click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(/\/explore\/research$/, { timeout: 15_000 }).catch(() => undefined);
record(/\/explore\/research$/.test(page.url()), `the Explore link opens Research (${page.url()})`);

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

// Chosen already, and there is no "none" row to leave it on: a research always has its model.
await page.waitForFunction(() => document.querySelector('#research-model')?.getAttribute('data-value') !== '', null, { timeout: 10_000 }).catch(() => undefined);
const preselected = (await dialog.locator('#research-model').getAttribute('data-value')) ?? '';
let chosenName = ((await dialog.locator('#research-model').textContent()) ?? '').trim();
record(preselected !== '', `a chat model is chosen before anybody picks one (${chosenName})`);
await dialog.locator('#research-model').click();
const pickerRows = page.locator('[data-model-menu="research-model"] [role="option"]');
await pickerRows.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
const emptyRows = await page.locator('[data-model-menu="research-model"] [role="option"][data-value=""]').count();
const firstRow = (await pickerRows.first().getAttribute('data-value').catch(() => '')) ?? '';
record(emptyRows === 0 && (await pickerRows.count()) > 0, `the picker offers models and no empty row (${emptyRows} empty)`);
record(firstRow === preselected, 'the one chosen is the first the picker offers');
const rowValues = await pickerRows.evaluateAll((all) => all.map((one) => one.getAttribute('data-value') ?? ''));
await page.keyboard.press('Escape');
record(!/set in the mode/i.test(((await dialog.textContent()) ?? '')), 'nothing says the model is set in the mode');

// The model chosen is remembered for the next research: picked, the dialog closed and opened again, it is still chosen.
const other = rowValues.find((one) => one !== '' && one !== preselected) ?? null;
if (other !== null) {
  await dialog.locator('#research-model').click();
  await page.locator(`[data-model-menu="research-model"] [role="option"][data-value="${other}"]`).click({ timeout: 5_000 }).catch(() => undefined);
  await dialog.getByRole('button', { name: 'Cancel' }).last().click({ timeout: 5_000 }).catch(() => undefined);
  // Through a reload, so it is remembered rather than merely still held by the page.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New research/ }).click({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('#research-model')?.getAttribute('data-value') !== '', null, { timeout: 10_000 }).catch(() => undefined);
  const remembered = (await dialog.locator('#research-model').getAttribute('data-value')) ?? '';
  record(remembered === other, `the model last chosen is chosen again next time (${remembered} for ${other})`);
  chosenName = ((await dialog.locator('#research-model').textContent()) ?? '').trim();
}

const languages = (await optionsOffered(page, '#research-language')).map((one) => one.label);
record(JSON.stringify(languages) === JSON.stringify(['Academic', 'Colloquial', 'Formal']), `the languages are Academic, Colloquial, Formal (${languages.join(', ')})`);
const formats = (await optionsOffered(page, '#research-format')).map((one) => one.label);
record(JSON.stringify(formats) === JSON.stringify(['PDF', 'Document']), `the outputs are PDF and Document (${formats.join(', ')})`);
record((await chosenOption(page, '#research-format')) === 'PDF', `the output is PDF until somebody says otherwise (${await chosenOption(page, '#research-format')})`);

// --- web search -------------------------------------------------------------
const webSearch = dialog.locator('input[type="checkbox"][data-web-search]');
record((await webSearch.count()) === 1 && (await webSearch.isChecked()), 'Use web search is a box, ticked until somebody unticks it');
const boxLabel = ((await webSearch.locator('xpath=..').textContent()) ?? '').trim();
record(boxLabel === 'Use web search', `and it says so in one line (${boxLabel})`);
const order = await page.evaluate(() => {
  const box = document.querySelector('dialog[open] [data-web-search]')?.getBoundingClientRect();
  const sites = document.querySelector('dialog[open] [data-sites="research-websites-include"]')?.getBoundingClientRect();
  return box === undefined || sites === undefined ? null : Math.round(sites.top - box.bottom);
});
record(order !== null && order >= 0, `it stands with the sources, above the websites (${order}px above)`);

// --- images -----------------------------------------------------------------
const images = dialog.locator('input[type="checkbox"][data-include-images]');
record((await images.count()) === 1 && !(await images.isChecked()), 'Include images is a box, unticked until somebody ticks it');
const imagesLabel = ((await images.locator('xpath=..').textContent()) ?? '').trim();
record(imagesLabel === 'Include images', `and it says so in one line (${imagesLabel})`);
const beside = await page.evaluate(() => {
  const web = document.querySelector('dialog[open] [data-web-search]')?.parentElement?.getBoundingClientRect();
  const box = document.querySelector('dialog[open] [data-include-images]')?.parentElement?.getBoundingClientRect();
  return web === undefined || box === undefined ? null : { rise: Math.round(Math.abs(box.top - web.top)), gap: Math.round(box.left - web.right) };
});
record(beside !== null && beside.rise <= 2 && beside.gap > 0, `beside Use web search, on its line (${JSON.stringify(beside)})`);

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
await webSearch.uncheck();
record(!(await webSearch.isChecked()), 'unticked, it stays unticked');
await images.check();
record(await images.isChecked(), 'ticked, Include images stays ticked');
await dialog.locator('textarea#research-question').fill(question);
// What Start sends, read off the request itself.
const sent = page.waitForRequest((request) => (request.postData() ?? '').includes('StartResearch'), { timeout: 15_000 }).catch(() => null);
await dialog.getByRole('button', { name: /^Start$/ }).click();
const startInput = JSON.parse((await sent)?.postData() ?? '{}')?.variables?.input ?? {};
record(startInput.includeImages === true && startInput.useWebSearch === false, `Start sends both switches as they were left (${JSON.stringify({ includeImages: startInput.includeImages, useWebSearch: startInput.useWebSearch })})`);
await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
record((await page.locator('dialog[open]').count()) === 0, 'Start closes the dialog');

// --- its own page ------------------------------------------------------------
await page.waitForURL(/\/explore\/research\/\d+$/, { timeout: 15_000 }).catch(() => undefined);
record(/\/explore\/research\/\d+$/.test(page.url()), `Start opens the research on its own page (${page.url()})`);
await page.locator('[data-research-title]').filter({ hasText: question }).waitFor({ timeout: 15_000 }).catch(() => undefined);
const title = ((await page.locator('h1').first().textContent().catch(() => '')) ?? '').trim();
record(title === question, `the page's title is the question (${title})`);
const listRows = await page.locator('[data-research]').count();
record(listRows === 0, `and no row of the list is drawn on it (${listRows})`);
const back = page.locator('a[aria-label="Back to Research"]');
const backHref = (await back.first().getAttribute('href').catch(() => null)) ?? '';
record((await back.count()) === 1 && backHref.endsWith(`/workspace/${WORKSPACE}/explore/research`), `a Back link leads to the list (${backHref})`);
const backBox = await back.first().boundingBox().catch(() => null);
const titleBox = await page.locator('h1').first().boundingBox().catch(() => null);
record(backBox !== null && titleBox !== null && backBox.y + backBox.height <= titleBox.y + 1, 'above the title, where every detail page has it');
await back.first().click();
await page.waitForURL(/\/explore\/research$/, { timeout: 15_000 }).catch(() => undefined);

const row = page.locator('[data-research]').filter({ hasText: question });
await row.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
record((await row.count()) === 1, 'the research is in the list at once');
const status = ((await row.first().locator('span').filter({ hasText: /^(Running|Completed|Failed|Stopped)$/ }).first().textContent().catch(() => '')) ?? '').trim();
record(status !== '', `and says where it has got to (${status})`);

// --- the row's typography ---------------------------------------------------
/*
 * What is drawn, per cell: the element holding the words - a link where the
 * cell is one - its computed size and weight, its left edge against its
 * heading's, and its middle against the row's.
 */
const drawn = await row.first().evaluate((held) => {
  const card = held.closest('section');
  const heads = [...(card?.querySelectorAll(':scope > div:first-child > span') ?? [])];
  const rowBox = held.getBoundingClientRect();
  const cells = {};
  for (const cell of held.querySelectorAll('[data-cell]')) {
    const words = cell.getAttribute('data-cell') === 'status' ? cell.firstElementChild : (cell.querySelector('a') ?? cell);
    const style = getComputedStyle(words);
    const box = words.getBoundingClientRect();
    const heading = heads.find((one) => Math.abs(one.getBoundingClientRect().left - cell.getBoundingClientRect().left) < 1.5);
    cells[cell.getAttribute('data-cell')] = {
      size: style.fontSize,
      weight: style.fontWeight,
      link: words.tagName === 'A',
      left: Math.round(box.left - cell.getBoundingClientRect().left),
      headed: heading !== undefined,
      middle: Math.round(box.top + box.height / 2 - (rowBox.top + rowBox.height / 2)),
    };
  }
  return cells;
});
const textCells = ['mode', 'model', 'started', 'result'];
const sizes = new Set([drawn.question?.size, ...textCells.map((name) => drawn[name]?.size)]);
record(sizes.size === 1 && !sizes.has(undefined), `the question and every text cell are one size (${JSON.stringify(Object.fromEntries(Object.entries(drawn).map(([k, v]) => [k, v.size])))})`);
record(drawn.question?.weight === '600', `the question is the row's one bold cell (${drawn.question?.weight})`);
const weights = textCells.map((name) => `${name}:${drawn[name]?.link ? 'link' : 'text'}:${drawn[name]?.weight}`);
record(
  textCells.every((name) => drawn[name] !== undefined && drawn[name].weight === (drawn[name].link ? '500' : '400')),
  `plain cells are regular and links medium (${weights.join(', ')})`,
);
record(
  drawn.status !== undefined && parseFloat(drawn.status.size) < parseFloat(drawn.question?.size ?? '0') && drawn.status.weight === '600',
  `the status is a badge, smaller and bold, as on Runs (${drawn.status?.size} ${drawn.status?.weight})`,
);
record(
  Object.values(drawn).every((one) => one.headed && one.left <= 1),
  `every cell starts under its heading (${JSON.stringify(Object.fromEntries(Object.entries(drawn).map(([k, v]) => [k, `${v.headed}/${v.left}`])))})`,
);
record(
  Object.values(drawn).every((one) => Math.abs(one.middle) <= 2),
  `every cell sits on the row's middle (${JSON.stringify(Object.fromEntries(Object.entries(drawn).map(([k, v]) => [k, v.middle])))})`,
);

// --- the model, as a link ---------------------------------------------------
const rowModel = (await row.first().locator('[data-cell="model"] a[data-model-link]').getAttribute('href').catch(() => null)) ?? '';
record(new RegExp(`^/workspace/${WORKSPACE}/models/\\d+$`).test(rowModel), `the row's model links to the model's page (${rowModel})`);

// Opened from the list, it is its own page again, and says what was asked.
await row.first().getByRole('link', { name: question }).click().catch(() => undefined);
const opened = page.locator('[data-opened]');
await opened.waitFor({ timeout: 10_000 }).catch(() => undefined);
await opened.locator('[data-summary]').waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await page.locator('[data-research]').count()) === 0, 'opened from the list, the list is not drawn under it');
const facts = ((await opened.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
record(facts.includes('example.org') && facts.includes('tabloid.example') && facts.includes(fileName), `opened, it shows the websites and the document it was given (${facts.slice(0, 160)})`);
const usedModel = ((await opened.locator('[data-research-model]').textContent().catch(() => '')) ?? '').trim();
record(usedModel !== '' && usedModel !== '—' && chosenName.startsWith(usedModel), `and the model it used (${usedModel})`);
const openedModel = (await opened.locator('[data-research-model] a[data-model-link]').getAttribute('href').catch(() => null)) ?? '';
record(openedModel !== '' && openedModel === rowModel, `as a link to the model's page, the row's own (${openedModel})`);
record((await opened.locator('[data-web-search-off]').count()) === 1, 'and that it did not search the web');
const imagesOn = ((await opened.locator('[data-include-images-on]').textContent().catch(() => '')) ?? '').trim();
record(imagesOn === 'On', `and that it was asked for images (${imagesOn})`);
const stored = await graphql(`query($w: ID!) { researches(workspaceId: $w, size: 100) { content { question useWebSearch includeImages modelName } } }`, { w: WORKSPACE });
const mine = stored.researches.content.find((one) => one.question === question);
record(mine?.useWebSearch === false && mine?.includeImages === true && (mine?.modelName ?? '') !== '', `the research keeps all three (${JSON.stringify(mine)})`);

// --- clean up ---------------------------------------------------------------
const listed = await graphql(`query($w: ID!) { researches(workspaceId: $w, size: 100) { content { id question } } }`, { w: WORKSPACE });
for (const one of listed.researches.content.filter((held) => held.question.startsWith('zz research check'))) {
  await graphql(`mutation($id: ID!) { deleteResearch(id: $id) }`, { id: one.id });
}
const uploaded = await graphql(`query($w: ID!) { researchDocuments(workspaceId: $w, search: "zz-research-", limit: 100) { id } }`, { w: WORKSPACE });
for (const one of uploaded.researchDocuments) {
  await graphql(`mutation($id: String!) { deleteArtifact(id: $id) }`, { id: `SAVED-${one.id}` }).catch(() => undefined);
}
if (madeProvider !== null) {
  await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: madeProvider }).catch(() => undefined);
}

await finish(browser);
