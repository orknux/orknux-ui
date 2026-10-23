/**
 * An edit on a provider's page is still an edit after the provider's check
 * lands.
 *
 * Saving a provider makes the server check it on a thread of its own, and the
 * page polls for the answer every two seconds while the stored status says Not
 * checked. The answer replaced the page's copy of the provider - and what the
 * page measured "changed" from moved with that copy, so whatever had been
 * typed in those seconds was suddenly measured against itself: the boxes kept
 * the typing, Save and Discard went grey, and the edit could not be saved.
 *
 * Found by provider-credential-check in CI on 1.1.8 and 1.1.9, which chose a
 * secret right after a save and then found Save Changes disabled - on a runner
 * slow enough for the check's answer to land between the two. Here the timing
 * is not left to a runner: the provider is answered as Not checked when the
 * page opens and as Failed when it polls, and the edit is made in between.
 *
 * Nothing is saved. The provider is the fixture's own, and the page is left
 * with the edit unsaved.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { modelProviders } = await graphql(`query ($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
  w: WORKSPACE,
});
const provider = modelProviders[0];
if (provider === undefined) {
  record(false, `workspace ${WORKSPACE} has no provider to open; the seed makes one`);
  await finish(browser);
}

let asked = 0;
/** Whether the edit has been made: until then the provider reads as Not checked, after it as checked. */
let edited = false;
let polledAfter = 0;
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('modelProvider(')) return route.continue();
  const answered = await route.fetch();
  const json = await answered.json();
  if (json?.data?.modelProvider) {
    asked += 1;
    if (edited) polledAfter += 1;
    /*
     * Opening, it is a provider just saved and not yet checked; once the edit
     * is made, the poll finds the check done. By the edit rather than by the
     * count of reads, since a development build reads it twice on the way in.
     */
    json.data.modelProvider = {
      ...json.data.modelProvider,
      checkEnabled: true,
      status: edited ? 'FAILED' : 'NOT_CHECKED',
      lastCheckMessage: edited ? 'provider-status-dirty-check: the check landed' : null,
    };
  }
  return route.fulfill({ response: answered, json });
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${provider.id}`, { waitUntil: 'domcontentloaded' });
const name = page.locator('#provider-name');
await name.waitFor({ timeout: 20_000 });
await page.waitForFunction(() => (document.querySelector('#provider-name')?.value ?? '') !== '', undefined, { timeout: 20_000 });

const save = page.getByRole('button', { name: 'Save Changes', exact: true });
const typed = `${provider.name} edited`;
await name.fill(typed);
edited = true;
await page.waitForTimeout(200);
record(await save.isEnabled(), 'an edit to the name turns Save on');

// The poll runs every two seconds; wait for it to have been answered, not for the clock.
for (let waited = 0; polledAfter === 0 && waited < 15_000; waited += 250) await page.waitForTimeout(250);
await page.waitForTimeout(300);
record(polledAfter >= 1, `the page polled for the check after the edit and was answered (${polledAfter} of ${asked} reads)`);
record((await name.inputValue()) === typed, `the box still holds what was typed (${JSON.stringify(await name.inputValue())})`);
record(await save.isEnabled(), 'and Save is still on: the check landing did not make the edit read as saved');

await finish(browser);
