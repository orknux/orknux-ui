/**
 * A diagram's details on a page of their own: the list's pencil opens it; the
 * name, the description (with a counter), the catalog and the Agents setting
 * are changed there and Save keeps them through a reload; leaving with a
 * change unsaved asks first; Open Editor goes to the drawing; and the list has
 * no Agents dropdown.
 *
 * Makes its own two catalogs and diagram, and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const catalog = async (name) => (await graphql('mutation ($w: ID!, $n: String!) { createDiagramCatalog(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: name })).createDiagramCatalog.id;
const first = await catalog(`zzSettingsA ${stamp}`);
const second = await catalog(`zzSettingsB ${stamp}`);
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $c: ID) { createDiagram(workspaceId: $w, name: $n, catalogId: $c) { id } }',
  { w: WORKSPACE, n: `zzSettings ${stamp}`, c: first },
);
const id = made.id;
const NAME = `zzRenamed ${stamp}`;
const SAID = `What the payments team owns, ${stamp}.`;
const held = async () => (await graphql('query ($id: ID!) { diagram(id: $id) { name description catalogId agentAccess } }', { id })).diagram;

// The list: no Agents dropdown, and the pencil opens the page.
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams?catalog=${first}`, { waitUntil: 'domcontentloaded' });
const row = page.locator(`[data-testid="diagram-row"][data-diagram-id="${id}"]`);
await row.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await row.getByTestId('diagram-access').count()) === 0 && (await row.locator('button[aria-haspopup]:not([data-move-to])').count()) === 0,
  'the list has no Agents dropdown in its rows');
await row.getByTestId('diagram-edit').click({ timeout: 10_000 }).catch(() => undefined);
await page.waitForURL(new RegExp(`/explore/diagrams/${id}/settings$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/explore/diagrams/${id}/settings`), `the pencil opens the diagram's settings page (${page.url()})`);
const crumb = await page.locator('p a').filter({ hasText: 'Diagrams' }).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(crumb, 'with a breadcrumb back to Diagrams');

// Name, description with its counter, catalog and Agents.
const name = page.getByTestId('diagram-settings-name');
await name.waitFor({ timeout: 10_000 }).catch(() => undefined);
await name.fill(NAME);
await page.getByTestId('diagram-settings-description').fill(SAID);
const counted = (await page.getByTestId('diagram-settings-counter').textContent().catch(() => '')) ?? '';
record(counted.replace(/\s/g, '').startsWith(`${SAID.length}/`), `the description counts toward its limit (${counted})`);
await page.getByTestId('diagram-settings-catalog').click();
await page.locator('[role="listbox"] [role="option"]', { hasText: `zzSettingsB ${stamp}` }).first().click();
await page.getByTestId('diagram-settings-access').click();
await page.locator('[role="listbox"] [role="option"]', { hasText: 'Read only' }).first().click();

// Leaving unsaved asks first.
await page.locator('p a').filter({ hasText: 'Diagrams' }).last().click();
const asked = await page.locator('dialog[open]').waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
record(asked && page.url().endsWith('/settings'), 'leaving with changes unsaved asks first');
if (asked) await page.locator('dialog[open]').getByRole('button', { name: /^Stay|Keep editing|Cancel/ }).first().click().catch(() => page.keyboard.press('Escape'));

await page.getByTestId('diagram-settings-save').click();
await page.waitForTimeout(1500);
const after = await held();
record(after.name === NAME && after.description === SAID && after.catalogId === second && after.agentAccess === 'READ', `Save stores all four (${JSON.stringify(after)})`);
await page.reload({ waitUntil: 'domcontentloaded' });
await name.waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await name.inputValue()) === NAME && (await page.getByTestId('diagram-settings-description').inputValue()) === SAID
  && ((await page.getByTestId('diagram-settings-access').textContent()) ?? '').includes('Read only'), 'and they are there after a reload');

// Open Editor goes to the drawing.
await page.getByTestId('diagram-open-editor').click();
await page.waitForURL(new RegExp(`/explore/diagrams/${id}$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/explore/diagrams/${id}`), `Open Editor opens the drawing (${page.url()})`);

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id });
for (const one of [first, second]) await graphql('mutation ($id: ID!) { deleteDiagramCatalog(id: $id) }', { id: one }).catch(() => undefined);
await finish(browser);
