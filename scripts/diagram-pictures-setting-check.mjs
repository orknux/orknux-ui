/**
 * Admin -> Settings -> Attachments -> Diagram pictures from internal addresses.
 *
 * A diagram's picture given as an address is fetched by the server for its
 * exports, and whether that may be an address on the server's own network is
 * the administrator's call. The switch is drawn with the attachment settings,
 * shows what the server holds, is stored at once when flipped, and a reload
 * shows it flipped. What the server then fetches is the suite's
 * DiagramWebPicturesTest; this is the half a person touches.
 *
 * Put back at the end. Changes an installation-wide setting.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const stored = async () => (await graphql('query { installationSettings { diagramPicturesInternal } }')).installationSettings.diagramPicturesInternal;
const toggle = () => page.getByRole('switch', { name: 'Diagram pictures from internal addresses', exact: true });

const started = await stored();
try {
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'admin settings')) {
    const shown = await toggle().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
    record(shown, 'the switch is on the page');
    if (shown) {
      const size = await toggle().boundingBox();
      record(size !== null && size.width > 10 && size.height > 10, `and drawn with a size (${size?.width}x${size?.height})`);
      record((await toggle().getAttribute('aria-checked')) === String(started), `it shows what the server holds (${started})`);

      await toggle().click();
      const flipped = async () => (await stored()) === !started;
      let held = false;
      for (let tries = 0; tries < 30 && !held; tries += 1) {
        held = await flipped();
        if (!held) await page.waitForTimeout(200);
      }
      record(held, `a click stores the other answer at once, with no Save (${!started})`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await toggle().waitFor({ state: 'visible', timeout: 20_000 });
      await page.waitForTimeout(500);
      record((await toggle().getAttribute('aria-checked')) === String(!started), 'and a reload shows it flipped');
    }
  }
} finally {
  await graphql('mutation ($a: Boolean!) { setDiagramPicturesInternal(allowed: $a) { diagramPicturesInternal } }', { a: started }).catch(() => undefined);
}

await finish(browser);
