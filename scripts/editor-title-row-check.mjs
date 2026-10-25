/**
 * The row under the top bar in every editor - "← Documents  Untitled document",
 * "← Wireframes  Login", "← Videos", "← Images", "← Diagrams" - is drawn the
 * same way in each: the back link and the name at one size, on one baseline,
 * the name in the primary text colour and medium weight, the link in the
 * secondary colour, and no box round the link that looks like focus.
 *
 * They shared a class and inherited the font of whatever page held them, so
 * the size and the weight changed from editor to editor.
 *
 * Makes its own document, wireframe and diagram and removes them.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const documentId = (await graphql('mutation ($w: ID!, $n: String!) { createDocument(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `Title row ${stamp}` })).createDocument.id;
const wireframeId = (await graphql('mutation ($w: ID!, $n: String!) { createWireframe(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `Title row ${stamp}` })).createWireframe.id;
const diagramId = (await graphql('mutation ($w: ID!, $n: String!) { createDiagram(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `Title row ${stamp}` })).createDiagram.id;

const editors = [
  { name: 'documents', path: `design/documents/${documentId}`, back: 'document-back', title: 'document-title' },
  { name: 'wireframes', path: `design/wireframes/${wireframeId}`, back: 'wireframe-back', title: 'wireframe-title' },
  { name: 'videos', path: 'design/videos/new', back: 'video-back', title: 'video-name' },
  { name: 'images', path: 'design/images/new', back: 'editor-back', title: 'editor-name' },
  { name: 'diagrams', path: `explore/diagrams/${diagramId}`, back: 'diagram-back', title: 'diagram-title' },
];

const drawn = [];
for (const one of editors) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/${one.path}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(one.title).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const measured = await page.evaluate(([back, title]) => {
    const look = (element) => {
      const style = getComputedStyle(element);
      // The baseline: where the glyphs' own box ends, read through a range over the text.
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = [...range.getClientRects()].pop();
      return {
        size: parseFloat(style.fontSize),
        weight: style.fontWeight,
        colour: style.color,
        family: style.fontFamily,
        bottom: box === undefined ? null : Math.round(box.bottom * 10) / 10,
        outline: style.outlineStyle === 'none' ? 'none' : `${style.outlineStyle} ${style.outlineWidth}`,
        border: style.borderTopStyle === 'none' ? 'none' : style.borderTopWidth,
        shadow: style.boxShadow,
        background: style.backgroundColor,
      };
    };
    const probe = document.createElement('span');
    document.body.append(probe);
    probe.style.color = 'var(--color-text-primary)';
    const primary = getComputedStyle(probe).color;
    probe.style.color = 'var(--color-text-secondary)';
    const secondary = getComputedStyle(probe).color;
    probe.remove();
    return {
      back: look(document.querySelector(`[data-testid="${back}"]`)),
      title: look(document.querySelector(`[data-testid="${title}"]`)),
      primary,
      secondary,
    };
  }, [one.back, one.title]);
  // Focused from the keyboard, as the documents editor left it: underlined, never boxed.
  await page.keyboard.press('Shift');
  const focused = await page.getByTestId(one.back).evaluate((element) => {
    element.focus();
    const style = getComputedStyle(element);
    return { visible: element.matches(':focus-visible'), outline: style.outlineStyle, decoration: style.textDecorationLine };
  });
  measured.back.focused = focused;
  drawn.push({ name: one.name, ...measured });
  await page.screenshot({ path: shot(`editor-title-row-${one.name}.png`), clip: { x: 0, y: 0, width: 900, height: 110 } });
}
console.log(JSON.stringify(drawn.map(({ name, back, title }) => ({ name, back, title }))));

const sizes = new Set(drawn.flatMap((one) => [one.back.size, one.title.size]));
record(sizes.size === 1 && [...sizes][0] === 13, `back link and name are one size in every editor, 13px (${[...sizes].join(', ')}px)`);
record(new Set(drawn.flatMap((one) => [one.back.family, one.title.family])).size === 1, 'and one family');
for (const one of drawn) {
  record(one.back.bottom !== null && one.back.bottom === one.title.bottom, `${one.name}: the back link and the name share a baseline (${one.back.bottom} / ${one.title.bottom})`);
  record(one.title.weight === '500' && one.title.colour === one.primary, `${one.name}: the name is medium and primary (${one.title.weight}, ${one.title.colour})`);
  record(one.back.weight === '400' && one.back.colour === one.secondary, `${one.name}: the back link is regular and secondary (${one.back.weight}, ${one.back.colour})`);
  record(
    one.back.outline === 'none' && one.back.border === 'none' && one.back.shadow === 'none' && one.back.background === 'rgba(0, 0, 0, 0)',
    `${one.name}: no box is drawn round the back link (${one.back.outline}, ${one.back.border}, ${one.back.shadow}, ${one.back.background})`,
  );
  const focused = one.back.focused;
  record(
    !focused.visible || (focused.outline === 'none' && focused.decoration.includes('underline')),
    `${one.name}: focused from the keyboard it is underlined, not boxed (${JSON.stringify(focused)})`,
  );
}
record(new Set(drawn.map((one) => one.back.bottom)).size === 1, `the row sits at one height in every editor (${drawn.map((one) => one.back.bottom).join(', ')})`);

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: documentId });
await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id: wireframeId });
await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: diagramId });
await finish(browser);
