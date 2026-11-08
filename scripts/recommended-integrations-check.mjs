/**
 * The Integrations page draws orknux.ai's recommendations as cards, and Ask
 * Claude hands the setup prompt to the person's own Claude.
 *
 * Measured on the page rather than read off the answer: two cards side by side
 * at a desktop width, each wide enough to read, nothing pushing the section
 * wider than its column; the effort and where it runs written on each; Ask
 * Claude a claude-cli:// link whose prompt is exactly the one the server
 * filled; the hand-off note shown once it is pressed; the steps drawn as a
 * list when asked for; and a marketplace with no recommendations said in
 * words. The recommendations are stubbed in the browser: a check written
 * against whatever orknux.ai recommends today goes red when it recommends
 * something else. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PROMPT = 'Help me connect Blender to "Studio" at http://localhost:5173.\nStep two & more.';

const card = (key, name, extra = {}) => ({
  key, name, vendor: `${name} Foundation`, summary: `${name} for agents.`, description: '', tags: ['3d'],
  homepage: `https://${key}.example.invalid`, repository: `https://github.com/example/${key}-mcp`, license: 'MIT',
  maintainer: 'COMMUNITY', popularity: null, kind: 'MCP_SERVER', transport: 'STDIO', runsOn: 'USER_MACHINE',
  sampleTools: [], effort: 'QUARTER_HOUR', minutes: 20, requirements: [`${name} 3.0`, 'uv'], needsAdmin: false,
  github: null,
  steps: Array.from({ length: 30 }, (_, n) => `${n + 1}. Step ${n + 1} of setting it up.`).join('\n'),
  claudePrompt: PROMPT, reason: null, installed: false, tooOld: null, icon: null, iconDark: null,
  ...extra,
});

// An icon as the server hands it: an address of its own. A picture here, so the check needs no server behind it.
const ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#24292f"/></svg>');

let offered = true;
let paged = false;
const asked = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('integrationTags')) {
    return answer({ integrationTags: [{ tag: '3d', label: '3D', count: 1 }, { tag: 'electronics', label: 'Electronics', count: 1 }] });
  }
  if (body.includes('integrationRecommendations(')) {
    asked.push(JSON.parse(body).variables ?? {});
    return answer({
      integrationRecommendations: paged
        ? (JSON.parse(body).variables?.after === 'page-2'
          ? { offered: true, items: [card('kicad', 'KiCad')], next: null, total: 3 }
          : { offered: true, items: [card('blender', 'Blender'), card('github', 'GitHub')], next: 'page-2', total: 3 })
        : offered
        ? {
            offered: true, total: 2, next: null,
            items: [
              card('blender', 'Blender', { reason: 'You draw in 3D.', installed: true, github: { fullName: 'ahujasid/blender-mcp', url: 'https://github.com/ahujasid/blender-mcp', stars: 12345, archived: true, checkedAt: '2026-11-08T00:00:00Z' }, summary: Array.from({ length: 12 }, () => 'Blender for agents, at length.').join(' ') }),
              card('github', 'GitHub', { transport: 'STREAMABLE_HTTP', runsOn: 'ANYWHERE', effort: 'MINUTES', minutes: 5, maintainer: 'OFFICIAL', icon: ICON, iconDark: ICON }),
            ],
          }
        : { offered: false, total: 0, next: null, items: [] },
    });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="integration-github"]', { timeout: 20_000 }).catch(() => {});

const drawn = await page.evaluate(() => {
  const section = document.querySelector('[data-testid="recommended-integrations"]');
  const cards = [...document.querySelectorAll('article[data-testid^="integration-"]')].map((one) => {
    const box = one.getBoundingClientRect();
    return { key: one.dataset.testid, top: Math.round(box.top), width: Math.round(box.width), text: one.textContent };
  });
  const sectionBox = section?.getBoundingClientRect();
  const main = section?.parentElement?.getBoundingClientRect();
  return {
    found: !!section,
    cards,
    sectionRight: sectionBox ? Math.round(sectionBox.right) : null,
    columnRight: main ? Math.round(main.right) : null,
    scrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

record(drawn.found, 'the Integrations page has a Recommended integrations section');
record(drawn.cards.length === 2, `two cards are drawn (${drawn.cards.length})`);
if (drawn.cards.length === 2) {
  const [one, two] = drawn.cards;
  record(one.top === two.top, `at 1440 wide the two cards sit side by side (tops ${one.top} and ${two.top})`);
  record(one.width >= 320 && two.width >= 320, `each card is at least 320 wide (${one.width}, ${two.width})`);
  record(one.text.includes('about 20 min') && one.text.includes('Runs on your computer'), 'a card says how long and where it runs');
  record(one.text.includes('needs a bridge to HTTP') && !two.text.includes('needs a bridge'), 'only the stdio server says it needs a bridge');
  record(one.text.includes('You draw in 3D.'), "orknux.ai's reason is on the card");
  record(one.text.includes('Set up here') && !two.text.includes('Set up here'), 'only the one already set up says so');
}
record(drawn.sectionRight !== null && drawn.sectionRight <= drawn.columnRight, `the section stays inside its column (${drawn.sectionRight} ≤ ${drawn.columnRight})`);
record(!drawn.scrollsSideways, 'the page does not scroll sideways');

const icons = await page.evaluate(() => ({
  github: (() => { const img = document.querySelector('[data-testid="integration-github"] [data-testid="integration-icon"]'); return img ? { loaded: img.complete && img.naturalWidth > 0, size: Math.round(img.getBoundingClientRect().width) } : null; })(),
  blender: document.querySelector('[data-testid="integration-blender"] [data-testid="integration-icon"]') !== null,
}));
record(icons.github?.loaded === true && icons.github.size === 36, `a card with an icon draws the tool's own icon (${JSON.stringify(icons.github)})`);
record(!icons.blender, 'and one without keeps its initial');
const blender = page.locator('[data-testid="integration-blender"]');
{
  const shown = await blender.locator('[data-testid="integration-tags"] button').allTextContents();
  record(shown.includes('3D'), `a card shows its tags, named as the filter names them (${shown.join(', ')})`);
  await blender.locator('[data-testid="integration-tags"] button', { hasText: '3D' }).click();
  await page.waitForTimeout(600);
  const chosen = await page.locator('button', { hasText: /^3D$/ }).first().evaluate((b) => b.className);
  record(/tagOn/.test(chosen), 'and pressing one filters by it');
  await page.locator('button', { hasText: /^All$/ }).first().click();
  await page.waitForTimeout(600);
}
{
  const stars = await blender.locator('[data-testid="integration-stars"]').textContent().catch(() => null);
  record(stars?.trim() === '· ★ 12k', `GitHub's stars are on the card (${JSON.stringify(stars)})`);
  const rows = await blender.evaluate((card) => Object.fromEntries([...card.querySelectorAll('dl > div')].map((row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()])));
  record(rows.Repository === 'ahujasid/blender-mcp · ★ 12k' && rows.Website === 'blender.example.invalid',
    `Website and Repository are rows of their own, the stars beside the repository (${JSON.stringify({ Website: rows.Website, Repository: rows.Repository })})`);
  const linkRow = await blender.evaluate((card) => [...(card.querySelector('[data-testid="copy-prompt"]')?.parentElement?.children ?? [])].map((el) => el.textContent?.trim()));
  record(!linkRow.includes('Website') && !linkRow.includes('Repository'), `and are no longer among the action links (${linkRow.join(', ')})`);
  record(await blender.locator('[data-testid="integration-archived"]').isVisible().catch(() => false), 'and an archived repository is said to be archived');
  record((await page.locator('[data-testid="integration-github"] [data-testid="integration-stars"]').count()) === 0, 'a card with no GitHub repository read shows no stars');
}
{
  // Cards in a row are one height, and a long description is folded at five lines until pressed.
  const tops = await page.evaluate(() => [...document.querySelectorAll('article[data-testid^="integration-"]')]
    .map((card) => Math.round(card.getBoundingClientRect().height)));
  record(tops.length >= 2 && new Set(tops).size === 1, `the cards in a row are the same height (${tops.join(', ')})`);
  const room = await page.evaluate(() => [...document.querySelectorAll('[data-testid="integration-summary"]')].map((p) => {
    const line = parseFloat(getComputedStyle(p).lineHeight);
    return Math.round(p.getBoundingClientRect().height / line);
  }));
  record(room.length > 0 && Math.min(...room) < 5, `no card reserves five lines it does not need (${room.join(', ')})`);
  const summary = blender.locator('[data-testid="integration-summary"]');
  const lines = async () => summary.evaluate((p) => { const line = parseFloat(getComputedStyle(p).lineHeight); return Math.round(p.getBoundingClientRect().height / (Number.isNaN(line) ? 21 : line)); });
  const before = await lines();
  record(before <= 5, `a long description is folded at five lines (${before})`);
  await summary.click();
  const after = await lines();
  record(after > 5, `pressing it shows all of it (${after} lines)`);
  await summary.click();
  record((await lines()) <= 5, 'and pressing again folds it');
}
const href = await blender.locator('[data-testid="ask-claude"]').getAttribute('href');
const handed = href?.startsWith('claude-cli://open?q=') ? decodeURIComponent(href.slice('claude-cli://open?q='.length)) : null;
record(handed === PROMPT, `Ask Claude opens Claude Code with exactly the prompt the server filled (${JSON.stringify(handed)?.slice(0, 60)})`);
const desktop = await blender.getByRole('link', { name: 'In Claude Desktop' }).getAttribute('href');
record(desktop?.startsWith('claude://code/new?q='), 'there is a Claude Desktop link beside it');

// The link goes to another application; the page is only asked to say what happens next.
await blender.locator('[data-testid="ask-claude"]').evaluate((link) => {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  link.click();
});
record(await blender.getByRole('status').isVisible().catch(() => false), 'pressing Ask Claude says what happens next');
await blender.locator('[data-testid="handoff-close"]').click();
record((await blender.getByRole('status').count()) === 0, 'and the note it shows can be closed');

// Do it yourself opens the steps where they can be read, not below the bottom of the window.
await blender.getByRole('button', { name: 'Do it yourself' }).click();
await page.waitForTimeout(900);
const opened = await blender.evaluate((card) => {
  const steps = card.querySelector('ol, ul')?.closest('div')?.getBoundingClientRect();
  const buttons = card.querySelector('[data-testid="ask-claude"]')?.getBoundingClientRect();
  return steps && buttons ? { top: Math.round(steps.top), buttons: Math.round(buttons.bottom), height: innerHeight } : null;
});
{
  // Opening one card grows that card alone: its neighbour keeps its folded height.
  const heights = await page.evaluate(() => ({
    open: Math.round(document.querySelector('[data-testid="integration-blender"]').getBoundingClientRect().height),
    other: Math.round(document.querySelector('[data-testid="integration-github"]').getBoundingClientRect().height),
  }));
  record(heights.open > heights.other && heights.other < 700, `opening a card's steps grows that card alone (${JSON.stringify(heights)})`);
}
record(opened !== null && opened.top >= 0 && opened.buttons <= opened.height + 1, `opening the steps brings them and the buttons under them into view (${JSON.stringify(opened)})`);

// The prompt can be copied for pasting into Claude by hand: a labelled link beside the others, not a bare icon on a line of its own.
const copy = blender.locator('[data-testid="copy-prompt"]');
const beside = await copy.evaluate((button) => button.parentElement?.querySelector('a, button') !== null && button.textContent.trim());
record(beside === 'Copy prompt', `Copy prompt is a word among the card's links (${JSON.stringify(beside)})`);
record((await blender.locator('img[src*="copy"]').count()) === 0, 'and no unlabelled copy icon is left on the card');

// Still open from above.
const steps = await blender.locator('li').allTextContents();
record(steps.includes('Step 1 of setting it up.') && steps.includes('Step 30 of setting it up.'), `the steps are drawn as a list (${steps.length} items)`);
record(await blender.getByText('You need:').isVisible(), 'and what is needed first is said above them');

{
  // The Sort box is one of the filters, at their size - not a page field's.
  const sizes = await page.evaluate(() => ({
    sort: getComputedStyle(document.querySelector('button[title="Sort the integrations"]')).fontSize,
    chip: getComputedStyle([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'All')).fontSize,
  }));
  record(sizes.sort === sizes.chip, `the Sort box is the tag chips' size (${JSON.stringify(sizes)})`);
}
// Sorting: the order chosen is what is asked for, and the arrow turns it round.
await page.getByTitle('Sort the integrations').click();
await page.getByRole('option', { name: 'Popularity' }).click().catch(async () => page.locator('option', { hasText: 'Popularity' }).click());
await page.waitForTimeout(700);
const byPopularity = asked.at(-1);
record(byPopularity?.order === 'POPULAR' && byPopularity?.ascending == null, `choosing Popularity asks for it, most popular first (${JSON.stringify(byPopularity)})`);
const arrow = page.locator('[data-testid="sort-direction"]');
record((await arrow.textContent())?.trim() === '↓', 'and the arrow says descending');
await arrow.click();
await page.waitForTimeout(700);
record(asked.at(-1)?.ascending === true && (await arrow.textContent())?.trim() === '↑', `pressing it asks for the other way (${JSON.stringify(asked.at(-1))})`);

// The sort chosen is kept: a reload asks for it again and draws it.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('article[data-testid="integration-blender"]', { timeout: 15_000 });
const kept = asked.at(-1);
record(kept?.order === 'POPULAR' && kept?.ascending === true && (await arrow.textContent())?.trim() === '↑'
  && ((await page.getByTitle('Sort the integrations').textContent()) ?? '').includes('Popularity'),
  `a reload keeps Popularity, ascending (${JSON.stringify(kept)})`);

// Quick actions reach the section by its name.
await page.getByRole('combobox', { name: 'Quick actions' }).or(page.getByLabel('Quick actions')).first().fill('recommended integ');
const found = page.getByRole('option').filter({ hasText: 'Recommended integrations' }).first();
record(await found.waitFor({ timeout: 5_000 }).then(() => true, () => false), 'Quick actions find Recommended integrations');

// Infinite scroll: a next page loads by itself when the end of the list comes into view - no button.
paged = true;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('article[data-testid="integration-blender"]', { timeout: 15_000 });
record((await page.getByRole('button', { name: 'Show more' }).count()) === 0, 'there is no Show more button');
await page.locator('[data-testid="integrations-more"]').scrollIntoViewIfNeeded();
const second = await page.waitForSelector('article[data-testid="integration-kicad"]', { timeout: 10_000 }).then(() => true, () => false);
record(second, 'scrolling to the end of the list loads the next page by itself');
paged = false;

offered = false;
await page.reload({ waitUntil: 'domcontentloaded' });
const none = await page.getByText('orknux.ai has no recommendations for this installation yet.').waitFor({ timeout: 15_000 }).then(() => true, () => false);
record(none, 'a marketplace with no recommendations is said in words, not as an empty box');

await browser.close();
finish();
