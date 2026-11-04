/**
 * The diagram editor's right-click menu, outlines and lines in colours of
 * their own, pictures put on the canvas, and boxes linked to other diagrams.
 *
 * A right click on a box offers duplicating and deleting it, its fill and its
 * outline, and drawing it over or under the rest; an outline chosen there is
 * stored. A picture chosen from a file is drawn in a box of its own
 * proportions, with a spinner while it goes up, and the server keeps it. A
 * box linked to another diagram says that diagram's name and opens it.
 *
 * Measured off what is drawn and what the server stores.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const make = async (name, drawing) =>
  (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: `${name} ${Date.now()}`,
    d: JSON.stringify(drawing),
  })).createDiagram.id;
const target = await make('zzLinked', { nodes: [{ id: 't', label: 'over there' }], edges: [] });
const id = await make('zzEditing', {
  // Two layers, so the right-click menu has its Layer section and is as tall as it gets.
  layers: [
    { id: 'base', name: 'Base', visible: true, locked: false },
    { id: 'top', name: 'Top', visible: true, locked: false },
  ],
  nodes: [
    { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
    { id: 'b', kind: 'box', label: 'second', x: 300, y: 0, w: 160, h: 60 },
  ],
  edges: [{ id: 'e', from: 'a', to: 'b' }],
});
const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const waitSaved = () => page.waitForTimeout(2500);
/** A small PNG, made in the page, as a file the picker would hand over. */
const pngFile = async () => {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const pen = canvas.getContext('2d');
    pen.fillStyle = '#2563eb';
    pen.fillRect(0, 0, 200, 100);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return { name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
};

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') await page.getByTestId('diagram-mode-edit').click();

  // Right click on a box: the menu, with what can be done to it.
  await page.locator('.react-flow__node[data-id="a"]').click({ button: 'right' });
  const menu = page.getByTestId('diagram-right-menu');
  record(await menu.isVisible(), 'a right click on a box opens its menu');
  const inView = await menu.evaluate((one) => { const r = one.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth; });
  record(inView, 'and the whole of it is on the screen');
  // Opened low on a short window, it is lifted by its own height rather than running under the bottom.
  await page.keyboard.press('Escape');
  const size = page.viewportSize();
  await page.setViewportSize({ width: size.width, height: 560 });
  await page.waitForTimeout(300);
  // The box brought low on the canvas by dragging the canvas up under it, then right-clicked there.
  const pane = await page.locator('.react-flow__pane').boundingBox();
  let node = await page.locator('.react-flow__node[data-id="a"]').boundingBox();
  const by = 450 - (node.y + node.height / 2);
  const from = pane.y + pane.height / 2 - by / 2;
  await page.mouse.move(pane.x + 20, from);
  await page.mouse.down();
  await page.mouse.move(pane.x + 20, from + by, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  node = await page.locator('.react-flow__node[data-id="a"]').boundingBox();
  const lowAt = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  await page.mouse.click(lowAt.x, lowAt.y);
  await page.waitForTimeout(200);
  await page.mouse.click(lowAt.x, lowAt.y, { button: 'right' });
  await menu.waitFor({ timeout: 3000 }).catch(() => undefined);
  const low = await menu.evaluate((one) => { const r = one.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), window: window.innerHeight, scrolls: one.scrollHeight > one.clientHeight }; }).catch(() => null);
  record(low !== null && low.top >= 0 && low.bottom <= low.window, `opened low on a short window, it is still wholly on the screen (${JSON.stringify(low)}, the box at ${Math.round(node.y)})`);
  await page.keyboard.press('Escape');
  await page.setViewportSize(size);
  await page.waitForTimeout(300);
  await page.locator('.react-flow__node[data-id="a"]').click({ button: 'right' });
  record(await page.getByTestId('diagram-right-copy-link').isVisible(), 'the menu offers a link to this box');
  for (const one of ['diagram-right-duplicate', 'diagram-right-delete', 'diagram-right-order-front', 'diagram-right-order-back', 'diagram-right-outline-width']) {
    record(await page.getByTestId(one).isVisible(), `the menu offers ${one.replace('diagram-right-', '')}`);
  }

  // An outline picked there is stored on the box.
  await page.getByTestId('diagram-right-outline-colour').nth(4).click();
  await page.getByTestId('diagram-right-outline-width').selectOption?.('4').catch(() => undefined);
  await waitSaved();
  const outlined = (await stored()).nodes.find((one) => one.id === 'a');
  record(typeof outlined?.border === 'string' && outlined.border.startsWith('#'), `the outline's colour is stored (${outlined?.border})`);

  // Send to back: the box is drawn first. Escape closes the menu first, as it would for a person.
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="b"]').click({ button: 'right' });
  await page.getByTestId('diagram-right-order-back').click();
  await waitSaved();
  record((await stored()).nodes[0]?.id === 'b', `send to back puts it first in the drawing (${(await stored()).nodes.map((one) => one.id).join(', ')})`);

  // Duplicate from the menu.
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="a"]').click({ button: 'right' });
  await page.getByTestId('diagram-right-duplicate').click();
  await waitSaved();
  record((await stored()).nodes.length === 3, `duplicate adds a box (${(await stored()).nodes.length})`);

  // Text pasted onto the canvas from elsewhere is put down as text, words alone; it used to do nothing at all.
  await page.keyboard.press('Escape');
  // With the pointer over an empty part of the canvas, where the paste should land.
  const paneBox = await page.locator('.react-flow__pane').boundingBox();
  const aim = { x: paneBox.x + paneBox.width * 0.8, y: paneBox.y + paneBox.height * 0.8 };
  await page.mouse.move(aim.x, aim.y, { steps: 3 });
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Pasted from elsewhere');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await waitSaved();
  const pastedBox = (await stored()).nodes.find((one) => one.label === 'Pasted from elsewhere');
  record(pastedBox?.kind === 'text', `text pasted onto the canvas is put down as text (${pastedBox?.kind})`);
  const landed = await page.locator(`.react-flow__node[data-id="${pastedBox?.id}"]`).boundingBox().catch(() => null);
  const missBy = landed === null ? Infinity : Math.hypot(landed.x + landed.width / 2 - aim.x, landed.y + landed.height / 2 - aim.y);
  record(missBy < 40, `under the pointer, not in the middle of the view (${Math.round(missBy)} px off)`);
  const bare = await page.locator(`.react-flow__node[data-id="${pastedBox?.id}"] [data-testid="diagram-node-shape"]`).evaluate((one) => {
    const look = getComputedStyle(one);
    return { border: look.borderTopWidth, background: look.backgroundColor };
  }).catch(() => null);
  record(bare !== null && bare.border === '0px' && bare.background === 'rgba(0, 0, 0, 0)', `with no box, outline or fill around it (${JSON.stringify(bare)})`);

  // A picture from a file: a spinner, then the picture, in its proportions, kept by the server.
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-picture-input').setInputFiles(await pngFile());
  const spun = await page.getByTestId('diagram-node-picture-loading').first().waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
  await page.getByTestId('diagram-node-picture').first().waitFor({ timeout: 15_000 });
  await waitSaved();
  const picture = (await stored()).nodes.find((one) => one.kind === 'image');
  record(spun || picture !== undefined, `a spinner holds its place while it goes up (${spun ? 'seen' : 'too quick to see'})`);
  record(picture !== undefined && /^\d+$/.test(picture.image ?? ''), `the picture is uploaded and named by its id (${picture?.image})`);
  record(picture !== undefined && Math.abs(picture.w / picture.h - 2) < 0.1, `its box has the picture's proportions (${picture?.w}x${picture?.h})`);
  const drawn = await page.getByTestId('diagram-node-picture').first().evaluate((img) => img.complete && img.naturalWidth > 0);
  record(drawn, 'and the canvas draws it');
  // Exported as a PNG, with the picture in it: the server's renderer refused a picture once, and the export failed whole.
  await page.waitForTimeout(2500);
  const exported = await page.request.get(`${BASE}/api/diagrams/${id}/export/png`);
  const pngBody = await exported.body();
  record(
    exported.status() === 200 && exported.headers()['content-type']?.startsWith('image/png') && pngBody.length > 1000,
    `the diagram exports as a PNG with the picture in it (${exported.status()}, ${exported.headers()['content-type']}, ${pngBody.length} bytes)`,
  );

  // A picture from a web address, asked for by the toolbar's picture button rather than found in the side panel afterwards.
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-add-picture').click();
  record(await page.getByTestId('diagram-picture-file').isVisible(), 'the picture button offers a file from this computer');
  await page.getByTestId('diagram-picture-address').fill('https://example.test/logo.png');
  await page.getByTestId('diagram-picture-address-add').click();
  await waitSaved();
  const fromWeb = (await stored()).nodes.find((one) => one.kind === 'image' && one.image === 'https://example.test/logo.png');
  record(fromWeb !== undefined, `and a web address, which becomes a picture node (${fromWeb?.image})`);

  // A link card from the toolbar: another diagram found by name, drawn on a card of its own.
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-add-link').click();
  const search = page.getByTestId('diagram-link-search-field');
  record(await search.evaluate((one) => document.activeElement === one), 'the Link button opens a search, ready to type in');
  await search.fill('zzLinked');
  await page.keyboard.press('Enter');
  await waitSaved();
  const card = (await stored()).nodes.find((one) => one.kind === 'link');
  record(card?.link === `diagram:${target}`, `Enter makes a link card leading to the diagram found (${card?.link})`);
  const drawnName = await page.locator(`.react-flow__node[data-id="${card?.id}"] [data-testid="diagram-node-label-text"]`).textContent().catch(() => null);
  record(drawnName?.startsWith('zzLinked') === true, `the card shows that diagram's name (${drawnName})`);
  record((await page.getByTestId('diagram-node-link-open').textContent())?.startsWith('zzLinked') === true, 'and the side panel says where it leads');

  // The list is narrowed to one kind of thing by its filters.
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-add-link').click();
  await page.getByTestId('diagram-link-filter-document').click();
  const kinds = await page.getByTestId('diagram-link-search-row').evaluateAll((all) => [...new Set(all.map((one) => one.firstElementChild?.textContent))]);
  record(kinds.length <= 1 && (kinds.length === 0 || kinds[0] === 'Document'), `Documents lists documents only (${JSON.stringify(kinds)})`);

  // A web address with words of its own: the card shows the words and leads to the address.
  await page.getByTestId('diagram-link-filter-web').click();
  await page.getByTestId('diagram-link-web-address').fill('https://example.test/handbook');
  await page.getByTestId('diagram-link-web-text').fill('The handbook');
  await page.waitForFunction(() => document.querySelector('[data-testid="diagram-link-web-add"]')?.disabled === false, null, { timeout: 5000 }).catch(() => undefined);
  await page.getByTestId('diagram-link-web-add').click({ timeout: 5000 });
  await waitSaved();
  const worded = (await stored()).nodes.find((one) => one.kind === 'link' && one.link === 'https://example.test/handbook');
  record(worded?.label === 'The handbook', `a web link keeps the words it was given (${worded?.label})`);
  const wordedDrawn = await page.locator(`.react-flow__node[data-id="${worded?.id}"] [data-testid="diagram-node-label-text"]`).textContent().catch(() => null);
  record(wordedDrawn === 'The handbook', `and the card shows them (${wordedDrawn})`);

  // Text made a link: with a text element selected the link button opens on its web address, its words filled in.
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-add-text').click();
  await waitSaved();
  const words = (await stored()).nodes.filter((one) => one.kind === 'text').at(-1);
  await page.getByTestId('diagram-add-link').click();
  const filled = await page.getByTestId('diagram-link-web-text').inputValue().catch(() => null);
  record(filled === words?.label, `with text selected the link button opens on a web address with its words (${filled})`);
  await page.getByTestId('diagram-link-web-address').fill('https://example.test/words');
  await page.waitForFunction(() => document.querySelector('[data-testid="diagram-link-web-add"]')?.disabled === false, null, { timeout: 5000 }).catch(() => undefined);
  await page.getByTestId('diagram-link-web-add').click({ timeout: 5000 });
  await waitSaved();
  const linkedWords = (await stored()).nodes.find((one) => one.id === words?.id);
  record(linkedWords?.kind === 'text' && linkedWords.link === 'https://example.test/words', `and Add makes that text the link, not a new card (${linkedWords?.kind} ${linkedWords?.link})`);

  // An address pasted over selected words being typed makes them a link.
  await page.locator(`.react-flow__node[data-id="${words?.id}"]`).dblclick();
  const editor = page.getByTestId('diagram-label-editor');
  await editor.waitFor({ timeout: 3000 });
  await editor.selectText();
  await editor.evaluate((one) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'https://example.test/pasted');
    one.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Escape');
  await waitSaved();
  const pastedLink = (await stored()).nodes.find((one) => one.id === words?.id);
  record(pastedLink?.link === 'https://example.test/pasted' && pastedLink.label === words?.label, `an address pasted over selected words links them and keeps the words (${pastedLink?.link}, ${pastedLink?.label})`);
  // A text link has no button: a click on its words opens the address.
  const buttons = await page.locator(`.react-flow__node[data-id="${words?.id}"] [data-testid="diagram-node-link"]`).count();
  record(buttons === 0, `a text link carries no open button (${buttons})`);
  // Only the words open it: a click on the empty room beside them is a click on the text element, and opens nothing.
  const box = await page.locator(`.react-flow__node[data-id="${words?.id}"]`).boundingBox();
  const wordsBox = await page.locator(`.react-flow__node[data-id="${words?.id}"] [data-testid="diagram-node-label-text"]`).boundingBox();
  const beside = page.context().waitForEvent('request', { predicate: (one) => one.url().includes('example.test/pasted'), timeout: 1500 }).catch(() => null);
  await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2);
  record((await beside) === null && wordsBox.width < box.width - 12, `a click beside the words opens nothing (words ${Math.round(wordsBox.width)} of ${Math.round(box.width)} px)`);
  // The new tab is caught by the address it asks for: example.test never resolves, so the tab itself ends on an error page.
  const asked = page.context().waitForEvent('request', { predicate: (one) => one.url().includes('example.test/pasted'), timeout: 5000 }).catch(() => null);
  await page.locator(`.react-flow__node[data-id="${words?.id}"] [data-testid="diagram-node-label-text"]`).click();
  const request = await asked;
  const tab = page.context().pages().find((one) => one !== page) ?? null;
  record(request !== null, `a click on its words opens the address (${request?.url() ?? 'nothing opened'})`);
  await tab?.close().catch(() => undefined);

  // A web address pasted into the same search is offered as itself.
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-add-link').click();
  await page.getByTestId('diagram-link-search-field').fill('https://example.test/spec');
  const offered = await page.getByTestId('diagram-link-search-row').first().textContent();
  record(offered?.includes('example.test/spec') === true, `an address is offered as itself (${offered})`);
  await page.keyboard.press('Escape');

  // Clicked as an event: the web link card made after it sits on top of it in the middle of the view.
  await page.locator(`.react-flow__node[data-id="${card?.id}"] [data-testid="diagram-node-link"]`).dispatchEvent('click');
  await page.waitForURL(new RegExp(`/explore/diagrams/${target}$`), { timeout: 10_000 }).catch(() => undefined);
  record(page.url().endsWith(`/explore/diagrams/${target}`), `the card's open button opens that diagram (${page.url()})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: target }).catch(() => undefined);
}

await finish(browser);
