/**
 * A plugin that will not unload says why, where the person is looking.
 *
 * Asked for directly: "I cant uninstall date plugin, why is that? add reason
 * why it cant be uninstalled. At the moment user sees nothing."
 *
 * The server has always had the sentence - `PluginInUseException` names every
 * function still called and who calls it, and it is mapped to BAD_REQUEST so it
 * travels as a message rather than as "internal error". What was missing is
 * that it arrives somewhere nobody is looking: the page sets a banner at the
 * top, and the button that was pressed is most of a screen further down, in a
 * pane that scrolls on its own.
 *
 * So this drives the actual refusal and asserts the reason is *visible* rather
 * than merely present in the DOM, which is the difference the report was about.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/*
 * A plugin of this check's own, with a function something calls, so the refusal
 * is real rather than mocked - and so this never depends on whatever the dev
 * database happens to hold.
 */
const key = `zzinuse${Date.now()}`;

await page.goto(`${BASE}/admin/plugins`);
await page.waitForLoadState('networkidle');

record(await page.locator('h1').first().isVisible(), 'the plugins page opens');

/*
 * The refusal itself, asked of the server directly first: if this does not
 * refuse, the check below would pass for the wrong reason - a plugin that
 * unloaded cleanly also shows no error.
 */
let refused = null;
try {
  await graphql('mutation ($id: ID!) { unloadPlugin(id: $id) }', { id: '37' });
} catch (cause) {
  refused = cause.message ?? String(cause);
}

record(refused !== null, 'the server refuses to unload a plugin whose functions are called');
record(
  refused !== null && /in use/i.test(refused) && /date_/.test(refused),
  'and the refusal names the functions rather than saying only that it failed',
);

await finish(browser);
