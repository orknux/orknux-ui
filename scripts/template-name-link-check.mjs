/**
 * A template's name on Admin -> Templates opens it.
 *
 * The name was plain text and the only way in was a gear at the far end of
 * the row, which on a wide window is off to the side of where somebody looks.
 * Publishes a template of its own from one of the workspace's agents, and
 * deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const NAME = `link check ${Date.now().toString(36)}`;

const { workspaceAgents } = await graphql(
  'query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 1) { content { id } } }',
  { w: WORKSPACE },
);
const agent = workspaceAgents.content[0];
let made = null;
try {
  made = (
    await graphql(
      `mutation($w: ID!, $id: ID!, $input: ComponentTemplateInput!) {
         saveComponentAsTemplate(workspaceId: $w, kind: AGENT, id: $id, depth: SHALLOW, input: $input) { id }
       }`,
      { w: WORKSPACE, id: agent.id, input: { name: NAME } },
    )
  ).saveComponentAsTemplate;
  record(made !== null, `a template to open (${NAME})`);

  await page.goto(`${BASE}/admin/templates`, { waitUntil: 'domcontentloaded' });
  const name = page.locator('[data-template-name]').filter({ hasText: NAME }).first();
  await name.waitFor({ timeout: 20_000 }).catch(() => undefined);
  await name.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForURL(`**/admin/templates/${made.id}`, { timeout: 10_000 }).catch(() => undefined);
  record(new URL(page.url()).pathname === `/admin/templates/${made.id}`, `clicking its name opens it (${page.url()})`);
} finally {
  if (made !== null) await graphql('mutation($id: ID!) { deleteComponentTemplate(id: $id) }', { id: made.id }).catch(() => undefined);
}

await finish(browser);
