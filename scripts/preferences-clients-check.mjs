/**
 * User Preferences has the section menu every other settings page has, read
 * off its headings, and its Connected clients section is drawn like Access
 * Tokens: a label with its (?) rather than a paragraph, and the clients in the
 * same bordered table.
 *
 * And the list keeps itself current. A client paired while the code is on the
 * screen shows up in the table without a reload, and the code gives way to a
 * word that it connected - the person pairing is looking at Chrome or at a
 * terminal, not at this page, and a list that waits for a reload looks as if
 * the pairing failed. The pairing is done by the check itself through the
 * same door a client uses, and the client it makes is disconnected again.
 */
import { BASE, chromium, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="preferences-clients"]', { timeout: 20_000 });
await page.waitForTimeout(800);

const layout = await page.evaluate(() => {
  const section = document.querySelector('[data-testid="preferences-clients"]');
  const menu = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.textContent.trim());
  const container = section?.parentElement?.getBoundingClientRect();
  const firstEntry = document.querySelector('a[href="#profile"]')?.getBoundingClientRect();
  return {
    menu,
    menuBeside: firstEntry !== undefined && container !== undefined && firstEntry.right <= container.left,
    hint: section?.querySelector('button[aria-label]') !== null,
    paragraphs: [...(section?.querySelectorAll('p') ?? [])].map((p) => p.textContent.trim()).filter((text) => text.length > 80),
  };
});
record(
  ['Profile', 'Connected clients', 'Notifications', 'Chat', 'Appearance'].every((one) => layout.menu.includes(one)),
  `the menu lists the sections: ${layout.menu.join(', ')}`,
);
record(layout.menuBeside, 'the menu stands beside the sections, not over them');
record(layout.hint && layout.paragraphs.length === 0, 'Connected clients explains itself behind a (?), not in a paragraph');

await page.click('[data-testid="client-pairing-start"]');
const code = (await page.textContent('[data-testid="client-pairing-code"]', { timeout: 10_000 }))?.trim() ?? '';
record(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(code), `a code is shown: ${code}`);
const link = (await page.textContent('[data-testid="client-pairing-link"]'))?.trim() ?? '';
record(link === `${new URL(page.url()).origin}/pair/${code}`, `and one link to copy, the server and the code together: ${link}`);

// The code alone is shown and copyable too, for a client that asks for the code in a field of its own.
const alone = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="client-pairing-code"]');
  const box = el?.getBoundingClientRect();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copied = text; } } });
  return { visible: el !== null && !el.hidden && (box?.height ?? 0) > 0, button: document.querySelector('[data-testid="client-pairing-copy-code"]') !== null };
});
record(alone.visible && alone.button, `the code is shown on its own, with a copy button of its own (${JSON.stringify(alone)})`);
await page.click('[data-testid="client-pairing-copy-code"]');
const copied = await page.waitForFunction(() => window.__copied, null, { timeout: 3_000 }).then((h) => h.jsonValue(), () => null);
record(copied === code, `and that button copies the code, nothing else: ${JSON.stringify(copied)}`);

const name = `check ${Date.now()}`;
const paired = await page.evaluate(
  async ([one, called]) =>
    (await fetch('/api/clients/pair', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: one, client: 'Check', name: called }),
    })).status,
  [code, name],
);
record(paired === 200, `the code pairs a client (${paired})`);

const shown = await page
  .waitForFunction((called) => [...document.querySelectorAll('[data-testid="connected-client"]')].some((row) => row.textContent.includes(called)), name, { timeout: 8_000 })
  .then(() => true, () => false);
record(shown, 'the paired client appears in the table without a reload');
const gaveWay = await page.evaluate(() => ({
  code: document.querySelector('[data-testid="client-pairing-code"]') !== null,
  said: document.querySelector('[data-testid="client-paired"]')?.textContent ?? '',
}));
record(!gaveWay.code && gaveWay.said.includes('connected'), `the code gives way to a word that it connected: "${gaveWay.said}"`);

const boxed = await page.evaluate(() => {
  const table = document.querySelector('[data-testid="connected-clients"]');
  const frame = table?.parentElement;
  const cell = table?.querySelector('td')?.getBoundingClientRect();
  const box = frame?.getBoundingClientRect();
  return {
    border: frame === null || frame === undefined ? '0px' : getComputedStyle(frame).borderTopWidth,
    inset: cell !== undefined && box !== undefined ? Math.round(cell.left - box.left) : -1, // the frame's own border, and no gap past it
  };
});
record(boxed.border !== '0px' && boxed.inset >= 0 && boxed.inset <= 1, `the clients sit in a bordered table, as the tokens do (border ${boxed.border})`);

// Leave nothing behind.
await page.click(`[aria-label="Disconnect ${name}"]`);
const gone = await page
  .waitForFunction((called) => ![...document.querySelectorAll('[data-testid="connected-client"]')].some((row) => row.textContent.includes(called)), name, { timeout: 8_000 })
  .then(() => true, () => false);
record(gone, 'Disconnect takes it out of the table');

// A pairing link opened in a browser says where it goes, signed in or not - not a sign-in page or a 404.
const outside = await chromium.launch();
const stranger = await (await outside.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await stranger.goto(`${BASE}/pair/ABC-DEF`, { waitUntil: 'domcontentloaded' });
const landed = await stranger.waitForSelector('[data-testid="pair-link-page"]', { timeout: 10_000 }).then(() => true, () => false);
const says = landed ? await stranger.textContent('[data-testid="pair-link-page"]') : '';
record(landed && says.includes('/pair/ABC-DEF') && says.includes('Claude Code'), 'a pairing link opened in a browser explains where to paste it, to somebody not signed in');
await outside.close();

await browser.close();
finish();
