/**
 * A Refresh button beside Auto on the research pages. Issue #667.
 *
 * Auto stops following a list once nothing in it runs, and a person may have
 * set it to Off; either way there was no way to look again but reloading the
 * page. The list and a research's own page now carry Refresh right of Auto, on
 * the same line, and pressing it asks the server again at once.
 *
 * Auto is set to Off first, so every request counted is the button's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const ROW = {
  id: '434343', question: 'zz refresh check: why are there tides?', modeId: null, modeName: 'Shallow', workflowId: '1',
  workflowName: 'Research: Shallow', modelId: null, modelName: 'Stub', language: 'FORMAL', outputFormat: 'DOCUMENT',
  plannerAgentId: null, plannerAgentName: null, writerAgentId: null, writerAgentName: null, reviewerAgentId: null, reviewerAgentName: null,
  websitesInclude: [], websitesExclude: [], documentsInclude: [], documentsExclude: [], useWebSearch: true,
  includeImages: false, images: [], status: 'COMPLETED', executionId: null, fileName: null, fileUrl: null, artifactId: null,
  artifactKey: null, previewUrl: null, error: null, startedBy: 'alice', startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(), earlierExecutionIds: [], review: false, reviewerModelId: null, reviewerModelName: null,
  parentId: null, progress: null, sources: [],
};
const asked = { list: 0, one: 0 };
await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (query.includes('researches(')) {
    asked.list += 1;
    return route.fulfill({ json: { data: { researches: { content: [ROW], page: 0, size: 20, totalElements: 1, totalPages: 1 } } } });
  }
  if (query.includes('research(id:')) {
    asked.one += 1;
    return route.fulfill({
      json: {
        data: {
          research: {
            ...ROW, result: '# Tides', draft: null, estimatedSecondsLeft: null, reviewRounds: [], followUps: [],
            followUpCount: 0, parentQuestion: null, children: [], sessions: [],
          },
        },
      },
    });
  }
  return route.continue();
});

/** Refresh beside Auto: right of it, on the same line. */
async function besideAuto(label) {
  const auto = page.getByRole('combobox', { name: 'Refresh automatically' }).or(page.locator('[aria-label="Refresh automatically"]')).first();
  const button = page.locator('[data-refresh]');
  await button.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const a = await auto.boundingBox().catch(() => null);
  const b = await button.boundingBox().catch(() => null);
  record(b !== null && (await button.textContent())?.trim() === 'Refresh', `${label}: there is a Refresh button`);
  record(
    a !== null && b !== null && b.x >= a.x + a.width - 1 && b.x - (a.x + a.width) < 40 && Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < 4,
    `${label}: right beside Auto, on its line (${JSON.stringify({ a, b })})`,
  );
  return button;
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  for (const key of Object.keys(window.localStorage)) if (key.includes('refresh')) window.localStorage.removeItem(key);
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('[data-refresh], [aria-label="Refresh automatically"]').first().waitFor({ timeout: 20_000 });
// Off, so nothing but the button asks.
const auto = page.locator('[aria-label="Refresh automatically"]').first();
await auto.click().catch(() => undefined);
await page.getByRole('option', { name: 'Off' }).click().catch(() => undefined);

const listButton = await besideAuto('the list');
const before = asked.list;
await listButton.click().catch(() => undefined);
await page.waitForTimeout(800);
record(asked.list === before + 1, `pressing it asks for the list once more (${before} -> ${asked.list})`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research/${ROW.id}`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-research-title]').waitFor({ timeout: 20_000 });
const oneButton = await besideAuto('a research');
const was = asked.one;
await oneButton.click().catch(() => undefined);
await page.waitForTimeout(800);
record(asked.one === was + 1, `pressing it asks for the research once more (${was} -> ${asked.one})`);

await browser.close();
finish();
