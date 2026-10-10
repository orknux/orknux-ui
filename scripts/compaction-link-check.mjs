/*
 * A session line saying a turn was summarised to fit the model's window links
 * to the settings that decide how - drawn by the page from the line's kind and
 * words, so nothing about the link is stored with the line - and the workspace
 * settings page lands on that section.
 *
 * The session's lines are stubbed: making a real turn outgrow a model's window
 * takes a model. The settings page is the real one.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const SESSION = '987654';
const iso = () => new Date().toISOString();
const line = (id, kind, content) => ({
  id, kind, actor: kind === 'SYSTEM' ? 'system' : 'Builder', content, result: null, millis: null, at: iso(), agentDetails: null,
});
const LINES = [
  line('1', 'SYSTEM', "The turn outgrew the model's window, so its earlier steps were replaced by a summary and it carried on.\n\nWhat was done so far."),
  line('2', 'SYSTEM', 'The task is finished.'),
];

const json = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('llmSessionEvents(')) return json(route, { llmSessionEvents: { totalElements: LINES.length, content: LINES } });
  if (body.includes('llmSessionFamily(')) return json(route, { llmSessionFamily: [] });
  if (body.includes('sessionBoxes(')) return json(route, { sessionBoxes: [] });
  if (body.includes('sessionScratchpads(')) return json(route, { sessionScratchpads: [] });
  if (body.includes('sessionExecutions(')) return json(route, { sessionExecutions: [] });
  if (body.includes('llmSession(')) {
    return json(route, {
      llmSession: { id: SESSION, workspaceId: WORKSPACE, key: 'compaction-check', keyPrefix: 'compaction-check', eventCount: 2, createdAt: iso(), lastEventAt: iso(), notes: [] },
    });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION}`, { waitUntil: 'domcontentloaded' });
if (!(await drawn(page, 'the session'))) await finish(browser);

const links = page.locator('[data-compaction-settings]');
await links.first().waitFor({ timeout: 10_000 }).catch(() => {});
record((await links.count()) === 1, `the summarised turn's line, and only it, links to the settings (${await links.count()})`);
record(
  (await links.first().getAttribute('href').catch(() => null)) === `/workspace/${WORKSPACE}/settings#compaction`,
  'to the compaction section of this workspace\'s settings',
);

await page.unroute('**/graphql');
await links.first().click();
await page.waitForURL(`**/workspace/${WORKSPACE}/settings#compaction`, { timeout: 10_000 }).catch(() => {});
const section = page.locator('#compaction');
await section.waitFor({ timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(800);
const box = await section.boundingBox().catch(() => null);
const height = page.viewportSize()?.height ?? 900;
record(box !== null && box.y >= -2 && box.y < height / 2, `and the settings page opens on that section (top at ${box?.y})`);

await finish(browser);
