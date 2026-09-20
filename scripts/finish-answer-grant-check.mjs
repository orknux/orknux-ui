/**
 * `finish_answer` is ticked to begin with, and can be unticked.
 *
 * Every other row in an agent's Tools list is a capability somebody decided to
 * hand over, so the list starts empty and a tick is a decision. This one is the
 * other way round: it is how a turn *stops*. An agent that posted its reply
 * itself - a Slack message, a file it uploaded - has nothing left to write, and
 * without a way to say so it either repeats the message or answers with
 * nothing, which the provider reports as an empty message, which the run reads
 * as a failure, which is retried, which posts the whole thing a second time.
 *
 * So it is a switch on the agent rather than a grant, drawn in the grant list
 * because that list is where somebody looks to see what an agent may do. What
 * this measures is that being on by default survives a save and a reload, and
 * that unticking it is recorded - which is the half a defaulted-on flag gets
 * wrong: it is easy to draw a tick, and easy to store nothing behind it.
 *
 * It puts the agent back the way it found it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { workspaceAgents } = await graphql(
  `query ($w: ID!) {
     workspaceAgents(workspaceId: $w, page: 0, size: 20) { content { id name finishAccess } }
   }`,
  { w: WORKSPACE },
);
const agent = workspaceAgents.content[0];
if (agent === undefined) {
  record(false, 'the workspace has an agent to open; the seed builds one');
  await finish(browser);
}

record(
  agent.finishAccess === true,
  `an agent has it to begin with, without anybody ticking anything (${agent.finishAccess})`,
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('text=Tools', { timeout: 20_000 });
// The form fetches its catalogues before it can draw a row in any of them.
await page.waitForFunction(
  () => [...document.querySelectorAll('label')].some((one) => one.textContent.includes('finish_answer')),
  { timeout: 20_000 },
);
// The catalogues arrive after the form does, and a row clicked while the
// list behind it is still settling is a click the next render undoes.
await page.waitForTimeout(2000);

/** The row, its tick, and what the list says it is. */
const row = () =>
  page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')];
    const found = labels.find((one) => one.textContent.includes('finish_answer'));
    if (found === undefined) return null;
    const box = found.querySelector('input[type="checkbox"]');
    return {
      ticked: box?.checked === true,
      says: found.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
    };
  });

const opened = await row();
record(opened !== null, 'the row is in the Tools list, where the grants are');
record(opened?.ticked === true, `and it is ticked (${opened?.says})`);
/* ------------------------------------------------- unticking it is recorded */

await page.locator('label', { hasText: 'finish_answer' }).locator('input[type="checkbox"]').click();
await page.waitForTimeout(600);
record((await row())?.ticked === false, 'it can be unticked');

await page.getByRole('button', { name: 'Save' }).first().click();
await page.waitForTimeout(1500);

const after = (
  await graphql(`query ($id: ID!) { agent(id: $id) { finishAccess } }`, { id: agent.id })
).agent;
record(
  after.finishAccess === false,
  `the server holds what was unticked, rather than a default that outlives it (${after.finishAccess})`,
);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Tools', { timeout: 20_000 });
// The form fetches its catalogues before it can draw a row in any of them.
await page.waitForFunction(
  () => [...document.querySelectorAll('label')].some((one) => one.textContent.includes('finish_answer')),
  { timeout: 20_000 },
);
// The catalogues arrive after the form does, and a row clicked while the
// list behind it is still settling is a click the next render undoes.
await page.waitForTimeout(2000);
record(
  (await row())?.ticked === false,
  'and the form comes back unticked rather than ticked again by the default',
);

/* ------------------------------------------------------ and back on it goes */

await page.locator('label', { hasText: 'finish_answer' }).locator('input[type="checkbox"]').click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Save' }).first().click();
await page.waitForTimeout(1500);

const restored = (
  await graphql(`query ($id: ID!) { agent(id: $id) { finishAccess } }`, { id: agent.id })
).agent;
record(restored.finishAccess === true, 'ticking it again turns it back on');

await finish(browser);
