/**
 * The edit mask is changed on an existing provider's page, and stays changed.
 *
 * Reported: "edit mask can't be changed in provider edit".
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
/*
 * Every type that edits pictures through the standard interface asks; it was
 * offered on OpenAI and stable-diffusion.cpp alone, so on a WebUI or llama.cpp
 * provider there was nothing to change.
 */
for (const type of ['OPENAI', 'STABLE_DIFFUSION_CPP', 'STABLE_DIFFUSION_WEBUI', 'LLAMA_CPP']) {
  const NAME = `zz mask ${Date.now()}`;
  const made = (await graphql('mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }', {
    input: { workspaceId: WORKSPACE, name: NAME, type, endpoint: 'http://mask.invalid/v1' },
  })).createModelProvider;

  try {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${made.id}`, { waitUntil: 'domcontentloaded' });
    const mask = page.getByTestId('edit-mask');
    const shown = await mask.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    record(shown, `a ${type} provider offers the edit mask`);
    if (shown) {
      await chooseOption(page, mask, 'WHITE');
      const picked = await chosenOption(page, mask);
      record(picked === 'WHITE', `${type}: the choice takes (${picked})`);
      const save = page.getByTestId('save-bar').getByRole('button', { name: /Save/ });
      const enabled = await save.isEnabled().catch(() => false);
      record(enabled, `${type}: and Save is offered for it`);
      if (enabled) await save.click();
      await page.waitForTimeout(1500);
      const { modelProvider } = await graphql('query($id: ID!) { modelProvider(id: $id) { editMask } }', { id: made.id });
      record(modelProvider?.editMask === 'WHITE', `${type}: and it is saved (${modelProvider?.editMask})`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await mask.waitFor({ timeout: 20_000 });
      record((await chosenOption(page, mask)) === 'WHITE', `${type}: and the page opens on it`);
    }
  } finally {
    await graphql('mutation($id: ID!) { removeModelProvider(id: $id) }', { id: made.id }).catch(() => undefined);
  }

}

await finish(browser);
