/**
 * Every side panel on a session says what it holds behind a (?), the Thinking
 * filter is not tinted while it is off, and Watchers and Schedules carry their
 * (?) beside the page name rather than beside an empty list.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const { llmSessions } = await graphql(
  'query($w: ID!) { llmSessions(workspaceId: $w, page: 0, size: 1) { content { id } } }',
  { w: WORKSPACE },
).catch(() => ({ llmSessions: { content: [] } }));
const session = llmSessions?.content?.[0];
record(session !== undefined, `a session to open (${session?.id})`);

if (session !== undefined) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${session.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-hint="Scratchpads"]').waitFor({ timeout: 20_000 }).catch(() => undefined);
  // Every panel drawn - Sessions only where the session has others under it.
  const panels = await page.evaluate(() =>
    [...document.querySelectorAll('p[class*="familyTitle"]')].map((title) => ({
      name: title.textContent?.trim(),
      hinted: title.parentElement?.querySelector('[data-hint]') !== null,
    })),
  );
  const missing = panels.filter((one) => !one.hinted).map((one) => one.name);
  record(panels.length >= 7 && missing.length === 0, `each of the ${panels.length} side panels has its (?) (missing: ${missing.join(', ') || 'none'})`);

  const chip = page.getByRole('button', { name: 'Thinking', exact: true }).first();
  if ((await chip.count()) === 1) {
    const colours = await chip.evaluate((one) => {
      const own = getComputedStyle(one).backgroundColor;
      const plain = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Note');
      return { own, note: plain ? getComputedStyle(plain).backgroundColor : null, pressed: one.getAttribute('aria-pressed') };
    });
    if (colours.pressed !== 'true') {
      record(colours.own === colours.note, `the Thinking filter, off, has the background the others have (${colours.own} vs ${colours.note})`);
    }
  }
}

for (const [path, name] of [['watchers', 'Watchers'], ['schedules', 'Schedules']]) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/${path}`, { waitUntil: 'domcontentloaded' });
  const heading = page.locator('h1').filter({ hasText: name }).first();
  await heading.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const beside = await heading.evaluate((one) => one.parentElement?.querySelector('[data-hint]') !== null).catch(() => false);
  record(beside, `${name} has its (?) beside the page name`);
}

await finish(browser);
