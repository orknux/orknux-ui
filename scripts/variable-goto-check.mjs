/**
 * A field that reads a variable has a way to it: an open link beside the
 * reference, and the variables page opening on that variable searched for.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const stamp = Date.now();
const { createVariableCatalog: catalog } = await graphql(
  'mutation($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id name } }',
  { w: WORKSPACE, n: `zzGoto ${stamp}` },
);
const name = `zz_goto_${stamp}`;
const { createVariable: variable } = await graphql(
  'mutation($input: CreateVariableInput!) { createVariable(input: $input) { id name } }',
  { input: { workspaceId: WORKSPACE, catalogId: catalog.id, name, type: 'STRING', kind: 'VALUE', value: 'there' } },
);

let pointed = null;
try {
  // The variables page, sent to one variable.
  await page.goto(`${BASE}/workspace/${WORKSPACE}/variables?catalog=${catalog.id}&variable=${encodeURIComponent(name)}`, {
    waitUntil: 'domcontentloaded',
  });
  const search = page.getByRole('searchbox', { name: 'Search variables' });
  await search.waitFor({ timeout: 20_000 });
  record((await search.inputValue()) === name, `the variables page arrives with the variable searched for (${await search.inputValue()})`);
  // The name is shown as text or held in its row's name box, depending on the row.
  const shown = await page
    .waitForFunction(
      (wanted) =>
        document.body.innerText.includes(wanted) || [...document.querySelectorAll('input')].some((box) => box.value === wanted && box.offsetParent !== null),
      name,
      { timeout: 15_000 },
    )
    .then(() => true)
    .catch(() => false);
  record(shown, 'and its row is on screen');

  // A plugin parameter pointing at it offers the way there. Only where a plugin
  // has a parameter nobody answered, so nothing anybody set is touched.
  const { workspacePlugins } = await graphql(
    'query($w: ID!) { workspacePlugins(workspaceId: $w) { plugin { id name } parameters { name type literal variableId secretSet } } }',
    { w: WORKSPACE },
  );
  for (const entry of workspacePlugins) {
    const free = entry.parameters.find(
      (one) => one.type.toUpperCase() === 'STRING' && one.literal === null && one.variableId === null && !one.secretSet,
    );
    if (free !== undefined) {
      pointed = { plugin: entry.plugin, parameter: free.name };
      break;
    }
  }
  if (pointed === null) {
    record(true, 'no plugin here has an unanswered parameter to point at the variable; the link half is skipped');
  } else {
    await graphql(
      'mutation($w: ID!, $p: ID!, $n: String!, $v: ID) { setPluginParameter(workspaceId: $w, pluginId: $p, name: $n, variableId: $v) { missing } }',
      { w: WORKSPACE, p: pointed.plugin.id, n: pointed.parameter, v: variable.id },
    );
    await page.goto(`${BASE}/workspace/${WORKSPACE}/plugins`, { waitUntil: 'domcontentloaded' });
    const opener = page.locator(`[aria-controls="plugin-parameters-${pointed.plugin.id}"]`);
    await opener.waitFor({ timeout: 20_000 });
    await opener.click();
    const link = page.locator(`#plugin-parameters-${pointed.plugin.id} [data-reference-open]`).first();
    const drawn = await link.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    const href = drawn ? (await link.getAttribute('href')) ?? '' : '';
    record(
      href.includes(`/workspace/${WORKSPACE}/variables`) && href.includes(`catalog=${catalog.id}`) && href.includes(`variable=${name}`),
      `${pointed.plugin.name}'s ${pointed.parameter} links to the variable it reads (${href})`,
    );
    record(drawn && (await link.getAttribute('target')) === '_blank', 'in a tab of its own, so the page it leaves keeps what is half-typed');
  }
} finally {
  if (pointed !== null) {
    await graphql('mutation($w: ID!, $p: ID!, $n: String!) { clearPluginParameter(workspaceId: $w, pluginId: $p, name: $n) { missing } }', {
      w: WORKSPACE,
      p: pointed.plugin.id,
      n: pointed.parameter,
    }).catch(() => undefined);
  }
  await graphql('mutation($id: ID!) { deleteVariableCatalog(id: $id) }', { id: catalog.id }).catch(() => undefined);
}

await finish(browser);
