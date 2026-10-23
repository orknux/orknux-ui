/**
 * A model's own answer time limit, on its page beside Requests per Minute.
 *
 * Empty shows the installation's limit in grey and takes it; a number typed is
 * the model's own and is kept; emptied again it goes back to the
 * installation's. Issue #644.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const { models } = await graphql(
  'query($w: ID!) { models(workspaceId: $w) { id name kind answerLimitMinutes answerLimitMinutesInherited } }',
  { w: WORKSPACE },
).catch(() => ({ models: [] }));
const model = (models ?? []).find((one) => one.kind === 'CHAT');
record(model !== undefined, `a chat model to open (${model?.name})`);

if (model !== undefined) {
  const field = page.locator('#answer-limit');
  const stored = async () =>
    (await graphql('query($id: ID!) { model(id: $id) { answerLimitMinutes } }', { id: model.id })).model.answerLimitMinutes;
  const saveWith = async (value) => {
    // Save is off while nothing differs from what is stored.
    if ((await field.inputValue()) === value) return;
    await field.fill(value);
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(2000);
  };

  try {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
    await field.waitFor({ timeout: 20_000 }).catch(() => undefined);
    record((await field.count()) === 1, 'the page has an answer time limit');

    // Beside Requests per Minute, on its row, where the row held an empty slot.
    const level = await page.evaluate(() => {
      const top = (id) => Math.round(document.getElementById(id)?.getBoundingClientRect().top ?? -1);
      return { rpm: top('rpm'), limit: top('answer-limit') };
    });
    record(level.limit === level.rpm && level.rpm >= 0, `level with Requests per Minute (${level.rpm}, ${level.limit})`);

    await saveWith('');
    record((await stored()) === null, 'emptied, the model keeps no limit of its own');
    const placeholder = await field.getAttribute('placeholder');
    record(
      placeholder === String(model.answerLimitMinutesInherited),
      `and the empty box shows the installation's (${placeholder} / ${model.answerLimitMinutesInherited})`,
    );

    await saveWith('15');
    record((await stored()) === 15, 'a number typed is saved as the model\'s own');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await field.waitFor({ timeout: 20_000 });
    record((await field.inputValue()) === '15', `and is there after a reload (${await field.inputValue()})`);

    await saveWith('0');
    const refusal = await page.getByText(/not a number of minutes a model may take/).count();
    record(refusal > 0, 'a limit outside the range is refused, and the page says so');
    record((await stored()) === 15, 'and the one kept before it stays');
  } finally {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
    await field.waitFor({ timeout: 20_000 }).catch(() => undefined);
    if ((await field.count()) === 1) {
      await saveWith(model.answerLimitMinutes === null ? '' : String(model.answerLimitMinutes));
    }
  }
}

await finish(browser);
