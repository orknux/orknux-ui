/**
 * Part of a shape's words styled, and a new line drawn like the last.
 *
 * A label was one style throughout. Now words selected while typing in a
 * shape are made bold, italic, underlined, struck through or coloured - by
 * Ctrl+B, Ctrl+I, Ctrl+U or the bar shown over the words - kept in the label as
 * marks, drawn styled with the marks gone, and exported the same way. This
 * types, selects, styles, and reads what is drawn, kept and exported.
 *
 * And a line drawn out of a shape was always a plain curved arrow, however the
 * diagram's other lines were drawn; it now looks like the line made before it.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzRichText ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'Pay now or later', x: 0, y: 0, w: 260, h: 80 },
        { id: 'b', kind: 'box', label: 'B', x: 0, y: 240 },
        { id: 'c', kind: 'box', label: 'C', x: 400, y: 240 },
        { id: 'd', kind: 'box', label: 'D', x: 400, y: 0 },
        { id: 'card', kind: 'link', label: 'Handbook', x: 700, y: 0, w: 260, h: 64, link: 'https://example.test/card' },
      ],
      edges: [{ id: 'first', from: 'b', to: 'c', label: 'pays', line: 'dashed', start: 'none', end: 'open', routing: 'right-angles', color: '#dc2626', width: 3 }],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((key) => window.localStorage.setItem(key, JSON.stringify({ x: 60, y: 60, zoom: 1 })), `orknux.diagram.view.${id}`);
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') await page.getByTestId('diagram-mode-edit').click();

  // A line is drawn in its own colour and thickness - both were saved and then lost to the stylesheet, so every line drew grey.
  const drawn = await page
    .locator('.react-flow__edge[data-id="first"] path.react-flow__edge-path')
    .evaluate((path) => ({ stroke: getComputedStyle(path).stroke, width: getComputedStyle(path).strokeWidth }));
  record(drawn.stroke === 'rgb(220, 38, 38)' && drawn.width === '3px', `a line is drawn in its own colour and thickness (${JSON.stringify(drawn)})`);

  // Typed into, "now" selected and made bold with Ctrl+B; "later" coloured from the bar.
  await page.locator('.react-flow__node[data-id="a"]').dblclick();
  const box = page.getByTestId('diagram-label-editor');
  await box.waitFor({ timeout: 5_000 });
  record((await page.getByTestId('diagram-style-bar').count()) === 1, 'typing in a shape shows the bar that styles the selected words');
  // The characters from..to of what the box shows, selected as a person drags across them.
  const pick = (from, to) =>
    box.evaluate((one, [from, to]) => {
      const texts = [];
      const walker = document.createTreeWalker(one, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) texts.push(node);
      const point = (offset) => {
        let left = offset;
        for (const text of texts) {
          if (left <= text.length) return [text, left];
          left -= text.length;
        }
        const last = texts[texts.length - 1];
        return [last, last.length];
      };
      const range = document.createRange();
      range.setStart(...point(from));
      range.setEnd(...point(to));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, [from, to]);
  await pick(4, 7);
  await page.keyboard.press('Control+b');
  const shown = await box.innerText();
  const boldNow = await box.evaluate((one) => [...one.querySelectorAll('span')].some((span) => span.textContent === 'now' && Number(getComputedStyle(span).fontWeight) >= 700));
  record(shown === 'Pay now or later' && boldNow, `Ctrl+B makes the selected word bold as it is typed, with no marks shown (${JSON.stringify(shown)}, bold ${boldNow})`);
  await pick(11, 16);
  await page.getByTestId('diagram-style-colour-2563eb').click();
  await page.keyboard.press('Control+i');
  record((await box.innerText()) === 'Pay now or later', `the bar colours them and Ctrl+I makes them italic, still with no marks shown (${JSON.stringify(await box.innerText())})`);
  // Typed on after the bold word, the new letters are bold with it; and Ctrl+Z takes them back.
  await pick(7, 7);
  await page.keyboard.type('!');
  record((await box.innerText()) === 'Pay now! or later', `typing goes on where the caret is (${JSON.stringify(await box.innerText())})`);
  await page.keyboard.press('Control+z');
  record((await box.innerText()) === 'Pay now or later', `and Ctrl+Z takes it back (${JSON.stringify(await box.innerText())})`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  const label = page.locator('.react-flow__node[data-id="a"] [data-testid="diagram-node-label-text"]');
  record((await label.innerText()) === 'Pay now or later', `the shape shows the words without their marks (${await label.innerText()})`);
  const looks = await label.locator('[data-styled]').evaluateAll((spans) => spans.map((one) => ({ text: one.textContent, weight: getComputedStyle(one).fontWeight, italic: getComputedStyle(one).fontStyle, colour: getComputedStyle(one).color })));
  const bold = looks.find((one) => one.text === 'now');
  const later = looks.find((one) => one.text === 'later');
  record(bold !== undefined && Number(bold.weight) >= 700, `and the bold word bold (${JSON.stringify(bold)})`);
  record(later !== undefined && later.italic === 'italic' && later.colour === 'rgb(37, 99, 235)', `and the coloured word coloured and italic (${JSON.stringify(later)})`);

  await page.waitForTimeout(3000);
  const kept = (await stored()).nodes.find((node) => node.id === 'a');
  record(kept?.label === 'Pay **now** or [*later*]{#2563eb}', `the label is kept with its marks (${kept?.label})`);
  const svg = await (await page.request.get(`${BASE}/api/diagrams/${id}/export/svg`)).text();
  record(svg.includes('<tspan font-weight="700">now</tspan>') && svg.includes('fill="#2563eb">later</tspan>') && !svg.includes('**'), 'and exported styled, with no marks');

  // A line's label is taken hold of and slid along it, toward its start; a click on it selects the line.
  const tag = page.getByTestId('diagram-edge-label');
  const before = await tag.boundingBox();
  const startBox = await page.locator('.react-flow__node[data-id="b"]').boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 10, before.y + before.height / 2);
  await page.mouse.move(startBox.x + startBox.width + 30, before.y + before.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const slid = (await stored()).edges.find((edge) => edge.id === 'first');
  const after = await tag.boundingBox();
  record(slid?.labelAt !== undefined && slid.labelAt < 0.3, `a line's label dragged along it stays where it was let go (labelAt ${slid?.labelAt})`);
  record(after.x < before.x - 60, `and is drawn there (${Math.round(before.x - after.x)}px toward the start)`);
  const svgAfter = await (await page.request.get(`${BASE}/api/diagrams/${id}/export/svg`)).text();
  const shownAt = Number(/<text x="(\d+)"[^>]*>pays</.exec(svgAfter)?.[1] ?? NaN);
  record(shownAt < 200 && shownAt > 160, `and exported there (x ${shownAt})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await tag.click();
  await page.waitForTimeout(200);
  record((await page.locator('.react-flow__edge[data-id="first"]').getAttribute('class')).includes('selected'), 'a click on the label selects its line');

  // A link card is selected by a click anywhere on it - its open button too, which opens the address as well.
  await page.keyboard.press('Escape');
  const opened = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.locator('.react-flow__node[data-id="card"] [data-testid="diagram-node-link"]').click();
  const tab = await opened;
  await page.waitForTimeout(200);
  record((await page.locator('.react-flow__node[data-id="card"]').getAttribute('class')).includes('selected') && tab !== null, `a click on a link card's open button selects the card and opens its address (${tab === null ? 'no tab' : 'a tab'})`);
  await tab?.close().catch(() => undefined);
  const button = await page.locator('.react-flow__node[data-id="card"] [data-testid="diagram-node-link"]').boundingBox();
  record(button.width <= 28, `and the button is small beside the card it is on (${Math.round(button.width)}px)`);
  const ring = await page.locator('.react-flow__node[data-id="card"] [data-testid="diagram-node-shape"]').evaluate((one) => getComputedStyle(one).boxShadow);
  record(ring !== 'none' && ring.includes('2px'), `a selected link card is lit by a ring, as a selected shape is (${ring})`);

  // A shape's words styled whole from the side panel: bold and green, then bold taken off, then the usual ink again.
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="d"]').click();
  await page.waitForTimeout(200);
  await page.getByTestId('diagram-text-style-bold').click();
  await page.getByTestId('diagram-text-colour-16a34a').click();
  await page.waitForTimeout(300);
  const dWords = page.locator('.react-flow__node[data-id="d"] [data-styled]');
  const dLook = await dWords.first().evaluate((one) => ({ weight: getComputedStyle(one).fontWeight, colour: getComputedStyle(one).color })).catch(() => null);
  record(dLook !== null && Number(dLook.weight) >= 700 && dLook.colour === 'rgb(22, 163, 74)', `the panel makes a shape's words bold and green (${JSON.stringify(dLook)})`);
  await page.waitForTimeout(2500);
  record((await stored()).nodes.find((node) => node.id === 'd')?.label === '[**D**]{#16a34a}', `kept as marks round the whole label (${(await stored()).nodes.find((node) => node.id === 'd')?.label})`);
  record((await page.getByTestId('diagram-text-style-bold').getAttribute('aria-pressed')) === 'true', 'and the panel shows them bold');
  await page.getByTestId('diagram-text-style-bold').click();
  await page.getByTestId('diagram-text-colour-usual').click();
  await page.waitForTimeout(2500);
  record((await stored()).nodes.find((node) => node.id === 'd')?.label === 'D', `taken off again, the label is its words alone (${(await stored()).nodes.find((node) => node.id === 'd')?.label})`);

  // A link card takes a fill.
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="card"]').click({ position: { x: 40, y: 20 } });
  await page.waitForTimeout(200);
  const swatch = page.getByTestId('diagram-node-colour').nth(1);
  const picked = await swatch.getAttribute('title');
  await swatch.click();
  await page.waitForTimeout(300);
  const cardFill = await page.locator('.react-flow__node[data-id="card"] [data-testid="diagram-node-shape"]').evaluate((one) => getComputedStyle(one).backgroundColor);
  const hex = (rgb) => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  record(hex(cardFill) === picked, `a link card is drawn in the fill picked for it (${hex(cardFill)}, picked ${picked})`);

  // Several shapes at once: the panel fills them and styles their words.
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="b"]').click();
  await page.locator('.react-flow__node[data-id="c"]').click({ modifiers: ['Shift'] });
  await page.waitForTimeout(200);
  await page.getByTestId('diagram-many-fill-colour').nth(2).click();
  await page.getByTestId('diagram-text-style-italic').click();
  await page.waitForTimeout(2500);
  const both = (await stored()).nodes.filter((node) => node.id === 'b' || node.id === 'c');
  record(
    both.length === 2 && both.every((node) => node.color !== undefined && node.color === both[0].color) && both.map((node) => node.label).join() === '*B*,*C*',
    `with two selected the panel fills both and styles both (${JSON.stringify(both.map((node) => [node.label, node.color]))})`,
  );
  await page.keyboard.press('Escape');

  // A line drawn from D to C looks like the one made before it: dashed, open-ended, right angles, red and thick.
  const handle = (node, side) => page.locator(`.react-flow__handle[data-nodeid="${node}"][data-handleid="${side}"]`);
  await page.locator('.react-flow__node[data-id="d"]').hover();
  const from = await handle('d', 'bottom').boundingBox();
  const to = await page.locator('.react-flow__node[data-id="c"]').boundingBox();
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) await page.mouse.move(start.x + ((end.x - start.x) * step) / 12, start.y + ((end.y - start.y) * step) / 12);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const made = (await stored()).edges.find((edge) => edge.id !== 'first');
  record(
    made !== undefined && made.line === 'dashed' && made.end === 'open' && made.routing === 'right-angles' && made.color === '#dc2626' && made.width === 3,
    `a new line looks like the line made before it (${JSON.stringify(made && { line: made.line, end: made.end, routing: made.routing, color: made.color, width: made.width })})`,
  );

  // An older line given a new colour is the one the next line copies - and that line, let go near the top of a side, is pinned there.
  await page.keyboard.press('Escape');
  await tag.click();
  await page.waitForTimeout(200);
  await page.getByTestId('diagram-edge-stroke-field-colour').first().click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="b"]').hover();
  const fromB = await handle('b', 'top').boundingBox();
  const dBox = await page.locator('.react-flow__node[data-id="d"]').boundingBox();
  const startB = { x: fromB.x + fromB.width / 2, y: fromB.y + fromB.height / 2 };
  const endD = { x: dBox.x + 3, y: dBox.y + dBox.height * 0.2 };
  await page.mouse.move(startB.x, startB.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) await page.mouse.move(startB.x + ((endD.x - startB.x) * step) / 12, startB.y + ((endD.y - startB.y) * step) / 12);
  await page.waitForTimeout(150);
  // While it is dragged, the line ends where it will be pinned - not at the side's middle handle.
  const preview = await page.getByTestId('diagram-connection-preview').evaluate((one) => ({ x: Number(one.dataset.x), y: Number(one.dataset.y) })).catch(() => null);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  const third = (await stored()).edges.find((edge) => edge.from === 'b' && edge.to === 'd');
  const dNode = (await stored()).nodes.find((node) => node.id === 'd');
  const pinnedAt = third?.toAt !== undefined && dNode !== undefined ? { x: dNode.x, y: dNode.y + third.toAt * (dNode.h ?? 60) } : null;
  record(
    preview !== null && pinnedAt !== null && Math.abs(preview.x - pinnedAt.x) <= 1 && Math.abs(preview.y - pinnedAt.y) <= 2,
    `a line being drawn shows the point it will be pinned to (${JSON.stringify(preview)} vs ${JSON.stringify(pinnedAt)})`,
  );
  record(third?.color === '#2563eb', `a new line copies the line restyled last, not the one made last (${third?.color})`);
  record(third?.toSide === 'left' && third.toAt !== undefined && third.toAt < 0.35, `and let go near the top of a side, it is pinned there rather than at the middle (${third?.toSide} ${third?.toAt})`);

  // Double-clicked near its start, a line takes its label there.
  const near = await page.locator(`.react-flow__edge[data-id="${third?.id}"] path.react-flow__edge-path`).evaluate((path) => {
    const at = path.getPointAtLength(path.getTotalLength() * 0.12);
    const matrix = path.getScreenCTM();
    return { x: at.x * matrix.a + at.y * matrix.c + matrix.e, y: at.x * matrix.b + at.y * matrix.d + matrix.f };
  });
  await page.mouse.dblclick(near.x, near.y);
  await page.waitForTimeout(300);
  await page.keyboard.type('yes');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const labelled = (await stored()).edges.find((edge) => edge.id === third?.id);
  record(labelled?.label === 'yes' && labelled.labelAt !== undefined && labelled.labelAt < 0.3, `a line double-clicked near its start is labelled there (${labelled?.label} at ${labelled?.labelAt})`);
} catch (error) {
  record(false, `stopped part-way: ${String(error?.message ?? error).split('\n')[0]}`);
}

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
// A deleted diagram is kept in the workspace's bin, and a check's own is nobody's to restore.
const binned = await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id kind name } } }', { w: WORKSPACE })
  .then((data) => data.recycleBin.content)
  .catch(() => []);
for (const entry of binned.filter((one) => one.kind === 'DIAGRAM' && one.name === NAME)) {
  await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => undefined);
}

await finish(browser);
