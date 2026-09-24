/**
 * A plugin's secret parameter can show what is being typed into it.
 *
 * Issue #366. The box was a bare `type="password"` with nothing beside it, so a
 * key pasted with a character missing - or one the clipboard mangled - could not
 * be checked before it was saved, and the plugin that then refused to
 * authenticate said nothing about which of the two it was. Connections got this
 * in #339 and the variables page has it; this is the third place.
 *
 * What is measured is the part that can go quietly wrong: that the box is
 * covered to start with, that the eye uncovers exactly what was typed, and that
 * it goes back. And the bound that matters - the eye is not offered over an
 * empty box or over the placeholder standing in for a stored secret, because the
 * server never hands a stored secret back and a control promising one would be
 * promising the one thing it cannot give.
 *
 * Nothing is saved: the value is typed and the page is left. Loads a plugin of
 * its own with one secret parameter - a seeded installation has no plugins at
 * all, and the developer's is the only one with a Slack in it - and unloads it
 * afterwards.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1100 } });

/* ------------------------------------- a plugin with a secret parameter ---- */

const KEY = 'zzSecretReveal';
const SOURCE = `
export default class Keyed extends OrknuxPlugin {
  id() { return '${KEY}'; }
  apiVersion() { return 1; }
  parameters() {
    return [
      new OrknuxParameter({ name: 'apiKey', type: 'string', description: 'The key it signs with.', secret: true }),
    ];
  }
}
`;

const sweep = async () => {
  const { plugins } = await graphql(`query { plugins { id key } }`, {});
  for (const old of plugins.filter((one) => one.key === KEY)) {
    await graphql(`mutation($id: ID!) { unloadPlugin(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept plugin ${old.key}`);
  }
};
await sweep();
const clean = async () => {
  await sweep();
  await finish(browser);
};

const loaded = await page.request.post(`${BASE}/api/plugins`, {
  multipart: { file: { name: `${KEY}.js`, mimeType: 'text/javascript', buffer: Buffer.from(SOURCE, 'utf8') } },
});
record(loaded.ok(), `a plugin with a secret parameter loads (${loaded.status()})`);
if (!loaded.ok()) await clean();

const { workspacePlugins } = await graphql(
  `query($w: ID!) {
     workspacePlugins(workspaceId: $w) {
       plugin { id name }
       parameters { name secret secretSet }
     }
   }`,
  { w: WORKSPACE },
);

const holding = workspacePlugins.find((one) => one.plugin.name === KEY || one.plugin.id === KEY) ??
  workspacePlugins.find((one) => one.parameters.some((p) => p.secret)) ??
  null;

if (holding === null) {
  /*
   * Said rather than passed quietly: with no secret parameter installed there
   * is no box to cover, and a silent skip reads afterwards as coverage.
   */
  record(false, 'there is an installed plugin with a secret parameter to measure');
  await clean();
}

const secret = holding.parameters.find((p) => p.secret);
console.log(`measuring ${holding.plugin.name} / ${secret.name} (stored: ${secret.secretSet})`);

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/workspace/${WORKSPACE}/plugins`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the plugins page'), 'the plugins page is on screen');

/* Narrowed to the one loaded here: the list is paged, and a plugin loaded last is on the last page. */
await page.getByPlaceholder('Search plugins...').fill(KEY);
await page.waitForTimeout(600);

/*
 * The parameters are behind the plugin's name, which is a real button so a
 * reader announces it as something that opens. One plugin at a time.
 */
const opener = page.locator(`button[aria-controls="plugin-parameters-${holding.plugin.id}"]`).first();
await opener.waitFor({ timeout: 20_000 });
await opener.click();

const box = page.locator('input[type="password"], input[autocomplete="new-password"]').first();
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, "the plugin's secret parameter has a box");
if (!there) await clean();

/** The eye inside this field's own row, which is what the toggle is. */
const eye = box.locator('xpath=following-sibling::button[@aria-pressed]').first();

/*
 * Empty to start with, and nothing to show. An eye over an empty box reveals
 * nothing and says there is something to look at; over the placeholder standing
 * in for a stored secret it would promise what the server will not hand back.
 */
record(await box.inputValue().then((held) => held === ''), 'which opens empty, whether or not one is stored');
record(await eye.count().then((many) => many === 0), 'and carries no eye while there is nothing typed to show');

/* ------------------------------------------------- what is being typed ---- */

const TYPED = 'sk-check-0123456789';
await box.fill(TYPED);

const appeared = await eye
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(appeared, 'typing into it brings out the eye');
if (!appeared) await clean();

record(await box.getAttribute('type').then((kind) => kind === 'password'), 'and what was typed is covered');

await eye.click();
const shown = await page
  .waitForFunction(
    () => {
      const found = document.querySelector('input[autocomplete="new-password"]');
      return found !== null && found.type === 'text';
    },
    { timeout: 10_000 },
  )
  .then(() => true)
  .catch(() => false);
record(shown, 'pressing it uncovers the box');
record(await box.inputValue().then((held) => held === TYPED), 'and what it shows is exactly what was typed');

/*
 * The accessible name says which way it is, because a bare glyph carries no
 * meaning of its own - the rule secret-reveal-check states for the other three.
 */
const named = await eye.getAttribute('aria-label');
console.log(`named: ${named}`);
record(/^Hide /.test(named ?? ''), `it names the act it would now perform (${named})`);
record(await eye.getAttribute('aria-pressed').then((said) => said === 'true'), 'and says it is pressed');

await eye.click();
const hidden = await page
  .waitForFunction(
    () => {
      const found = document.querySelector('input[autocomplete="new-password"]');
      return found !== null && found.type === 'password';
    },
    { timeout: 10_000 },
  )
  .then(() => true)
  .catch(() => false);
record(hidden, 'and pressing it again puts it away');

/*
 * Left as it was found: the value is cleared rather than saved, so this check
 * cannot leave a plugin holding a made-up credential.
 */
await box.fill('');

await clean();
