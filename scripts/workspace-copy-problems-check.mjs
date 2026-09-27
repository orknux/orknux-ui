/**
 * What a workspace copy left behind is collapsed until asked for.
 *
 * A copy of a large workspace can leave a hundred parts behind, one line each,
 * and the list pushed the workspaces off the screen. What is pinned is what is
 * drawn: after a copy, one summary line with the count, no problem lines
 * visible, and the lines there once it is opened.
 *
 * The duplicate's answer is stood in for, so the check does not depend on
 * which workspace happens to have unresolvable parts - and no workspace is
 * created by it.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1280, height: 1000 } });

const PROBLEMS = Array.from({ length: 40 }, (_, i) => `action "Action.orkx.json" was not copied: reason ${i}`);

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('duplicateWorkspace')) return route.continue();
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        duplicateWorkspace: {
          workspace: { id: '999999', name: 'Stand-in copy', description: null },
          carried: [{ kind: 'function', count: 3 }],
          variablesToSet: [],
          credentialsToSet: ['connection Slack outbound'],
          problems: PROBLEMS,
        },
      },
    }),
  });
});

await page.goto(`${BASE}/admin/workspaces`);
await page.waitForLoadState('networkidle');

const duplicate = page.locator('button[aria-label^="Duplicate "]').first();
record(await duplicate.isVisible().catch(() => false), 'a workspace can be duplicated from the list');
await duplicate.click();

const summary = page.locator('details summary', { hasText: '40 parts were not copied' });
await summary.waitFor({ timeout: 10000 }).catch(() => {});
record(await summary.isVisible().catch(() => false), 'one line says how many parts were not copied');

const firstLine = page.getByText('reason 0', { exact: false });
record(!(await firstLine.isVisible().catch(() => true)), 'and the lines themselves are not drawn until asked for');

/* What needs a credential is said outright, not behind the fold. */
record(
  await page.getByText('connection Slack outbound').isVisible().catch(() => false),
  'what came without its credentials is named on the page',
);

if (await summary.isVisible().catch(() => false)) await summary.click();
record(await firstLine.isVisible().catch(() => false), 'opening it shows them');

await finish(browser);
