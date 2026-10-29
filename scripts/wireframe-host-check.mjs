/**
 * A wireframe hosted as an HTML page from the editor's Host menu, and the page
 * it is hosted at following every save - with nothing done again.
 *
 * Makes a wireframe holding one button, opens it in the editor and presses
 * Host page, Host as HTML page. The button then reads Hosted and its menu
 * shows the address, which, fetched in the page, serves HTML with the
 * button's words in it. The button is made primary in the editor's panel and
 * saved by the editor's own autosave, and the same address serves it filled,
 * as it was not before. Stop hosting takes the page away - the address
 * answers 404 - and the wireframe stays.
 *
 * Makes its own wireframe and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

/** What an address serves, read in the page with the signed-in cookie. */
async function served(address) {
  return page.evaluate(async (url) => {
    const answer = await fetch(url, { cache: 'no-store', credentials: 'include' });
    return { status: answer.status, type: answer.headers.get('content-type') ?? '', body: answer.ok ? await answer.text() : '' };
  }, address);
}

let id = null;
try {
  const drawing = { elements: [{ id: 'cta', type: 'button', x: 40, y: 40, w: 200, h: 48, text: 'First words' }] };
  id = (
    await graphql('mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }', {
      w: WORKSPACE,
      n: `Host check ${Date.now()}`,
      d: JSON.stringify(drawing),
    })
  ).createWireframe.id;

  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
  const host = page.getByTestId('wireframe-host');
  await host.waitFor({ timeout: 20_000 });
  await page.locator('[data-element-type="button"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await host.getAttribute('data-hosted')) === 'false', 'the editor offers to host the wireframe');

  await host.click();
  await page.getByTestId('wireframe-host-start').click();
  await page.locator('[data-testid="wireframe-host"][data-hosted="true"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const artifact = await host.getAttribute('data-artifact');
  await host.click();
  const address = ((await page.getByTestId('wireframe-hosted-link').innerText().catch(() => '')) ?? '').trim();
  record(
    artifact?.startsWith('SAVED-') === true && address.endsWith(`/api/artifacts/${artifact?.replace('SAVED-', '')}/preview`),
    `hosted, the menu shows the page's artifact and its address (${artifact}, ${address})`,
  );
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);

  const first = await served(address);
  record(first.status === 200 && first.type.startsWith('text/html') && first.body.includes('First words'),
    `the address serves the wireframe as an HTML page (${first.status}, ${first.type})`);

  /*
   * The button made primary in the editor's panel and left to its autosave: the
   * page follows with nothing done again. The panel rather than its words,
   * which are edited by a double-click on the canvas - a gesture of its own,
   * and not what this check is about.
   */
  await page.locator('[data-element-type="button"]').first().click();
  await page.getByTestId('wireframe-field-primary').check({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForFunction(() => document.querySelector('[data-testid="wireframe-unsaved"]') === null, null, { timeout: 15_000 }).catch(() => undefined);
  const filled = (body) => body.includes('class="el button primary"');
  let after = await served(address);
  for (let tries = 0; tries < 10 && !filled(after.body); tries++) {
    await page.waitForTimeout(500);
    after = await served(address);
  }
  const held = (await graphql('query ($id: ID!) { wireframe(id: $id) { revision } }', { id })).wireframe;
  record(after.status === 200 && filled(after.body) && !filled(first.body) && after.body.includes('First words'),
    `after the button is made primary and saved in the editor, the same address serves it filled (saved revision ${held?.revision})`);

  // Stopped from the menu: the page goes, its address with it, and the wireframe stays.
  await host.click();
  await page.getByTestId('wireframe-host-stop').click();
  await page.locator('[data-testid="wireframe-host"][data-hosted="false"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const gone = await served(address);
  const still = (await graphql('query ($id: ID!) { wireframe(id: $id) { id elementCount hostedAs } }', { id })).wireframe;
  record(gone.status === 404 && still?.elementCount === 1 && still?.hostedAs === null,
    `Stop hosting takes the page away (${gone.status}) and the wireframe stays (${JSON.stringify(still)})`);
} finally {
  if (id !== null) await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
