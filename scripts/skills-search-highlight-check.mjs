/**
 * The skills and memory searches mark where each card matched.
 *
 * The search narrowed the cards and said nothing about why one was left: a
 * skill found by a phrase inside it looked exactly like one found by its name.
 * Now every occurrence of the words typed is a `<mark>` in what the card draws
 * - its name, its description, its markdown - and a card found only by
 * something it does not draw shows it: a workspace skill and a long memory an
 * excerpt around the match, a plugin's skill its folded page opened.
 *
 * Typing has to stay quick while it does. The skills page once froze for most
 * of a second a letter because every card parsed its markdown again; the marks
 * are a walk over what was parsed, so the time from the last key to the marks
 * being drawn is measured and recorded, on a warm page.
 *
 * Makes a skill catalogue and a memory catalogue of its own, with a word no
 * fixture holds, and deletes both. A plugin's catalogue is stubbed, since the
 * fixture loads no plugin, and it is the one card that draws markdown.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

/** The slowest the marks may follow the last key, on a warm page. */
const SLOWEST_MARKS_MS = 300;

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const token = Date.now().toString(36);
/** As names write it, capitalised; the body writes it lowercase. */
const WORD = `Quillmoss${token}`;
const word = WORD.toLowerCase();
/** What is typed: most of the word, in the other case. */
const TYPED = word.slice(0, -2);
/** What a mark in a name must hold: exactly the typed letters, in the case the name has them. */
const IN_NAME = WORD.slice(0, TYPED.length);

const SKILL_CATALOG = `Highlight check ${token}`;
const BY_NAME = `${WORD} notes`;
const BY_BODY = `Body only ${token}`;
const PLAIN = `Plain ${token}`;

const PLUGIN = {
  name: `highlight_check_${token}`,
  key: `highlight_check_${token}`,
  plugin: 'Highlight Check',
  skills: [
    {
      name: 'Plugin body only',
      key: 'plugin_body_only',
      description: 'Its words are folded away.',
      content: `# Heading\n\nSome **${word}** prose, and \`${word}\` in code.`,
    },
    { name: 'Plugin plain', key: 'plugin_plain', description: 'Nothing here.', content: 'Nothing at all.' },
  ],
};

const MEMORY_CATALOG = `Highlight check ${token}`;
const MEMORY_BY_TITLE = `${WORD} memory`;
const MEMORY_LONG = `Long memory ${token}`;
const MEMORY_PLAIN = `Plain memory ${token}`;

const made = { skillCatalog: null, skills: [], memoryCatalog: null };

/** The text of every mark under a selector, in order. */
const marks = (selector) =>
  page.locator(`${selector} mark`).evaluateAll((items) => items.map((item) => item.textContent));
/** Whether every mark under a selector is drawn - on screen, not folded away - and holds text alone. */
const marksDrawn = (selector) =>
  page.locator(`${selector} mark`).evaluateAll(
    (items) =>
      items.length > 0 &&
      items.every((item) => item.checkVisibility() && item.getBoundingClientRect().width > 0 && item.children.length === 0),
  );
const allMarks = () => page.evaluate(() => document.querySelectorAll('mark').length);
const cardsIn = (group, kind) =>
  page
    .locator(`[data-search-group="${group}"] [data-${kind}-card]`)
    .evaluateAll((items, kind) => items.map((item) => item.getAttribute(`data-${kind}-card`)), kind);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  // ---- the fixture ---------------------------------------------------------
  made.skillCatalog = (
    await graphql(
      `mutation($w: ID!, $n: String!) { createSkillCatalog(workspaceId: $w, name: $n) { id } }`,
      { w: WORKSPACE, n: SKILL_CATALOG },
    )
  ).createSkillCatalog.id;
  const filler = Array.from({ length: 6 }, (_, i) => `Filler line ${i + 1} says nothing in particular.`).join('\n');
  for (const [name, description, content] of [
    [BY_NAME, 'Found by its name.', 'Nothing to see in here.'],
    [BY_BODY, 'Found only by what it says.', `# Body\n\n${filler}\n\nThe **${word}** rule is kept down here.`],
    [PLAIN, 'Matches nothing.', 'Nothing at all.'],
  ]) {
    const skill = (
      await graphql(
        `mutation($input: CreateSkillInput!) { createSkill(input: $input) { id } }`,
        { input: { workspaceId: WORKSPACE, catalogId: made.skillCatalog, name, description, content: `---
name: ${name}
description: ${description}
---

${content}
` } },
      )
    ).createSkill;
    made.skills.push(skill.id);
  }

  made.memoryCatalog = (
    await graphql(
      `mutation($w: ID!, $n: String!) { createMemoryCatalog(workspaceId: $w, name: $n) { id } }`,
      { w: WORKSPACE, n: MEMORY_CATALOG },
    )
  ).createMemoryCatalog.id;
  for (const [title, content] of [
    [MEMORY_BY_TITLE, 'Short, and found by its title.'],
    [MEMORY_LONG, `${filler}\nThe ${word} is on the seventh line, under the cut.`],
    [MEMORY_PLAIN, 'Nothing at all.'],
  ]) {
    await graphql(`mutation($input: CreateMemoryInput!) { createMemory(input: $input) { id } }`, {
      input: { catalogId: made.memoryCatalog, title, content },
    });
  }

  // Only the plugins' catalogues are stubbed; everything else is the server's.
  await page.route('**/graphql', async (route) => {
    const query = route.request().postDataJSON()?.query ?? '';
    if (query.includes('pluginSkillCatalogs')) return route.fulfill({ json: { data: { pluginSkillCatalogs: [PLUGIN] } } });
    return route.continue();
  });

  // ---- skills --------------------------------------------------------------
  const box = page.locator('[data-skill-search]');
  await page.goto(`${BASE}/workspace/${WORKSPACE}/skills?catalog=${made.skillCatalog}`, { waitUntil: 'domcontentloaded' });
  await box.waitFor({ timeout: 30_000 });
  await page.locator(`[data-skill-card="${BY_NAME}"]`).waitFor({ timeout: 30_000 });
  record((await allMarks()) === 0, 'nothing is marked before anything is typed');

  // All but the last letter, as a person types, and let the page settle: what is timed is a warm page.
  await box.click();
  await page.keyboard.type(TYPED.slice(0, -1), { delay: 60 });
  await page.locator(`[data-search-group="${SKILL_CATALOG}"]`).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);

  /*
   * Timed in the page, from the key going down to the first frame in which the
   * name's mark holds every letter typed - what the person sees. Timed from the
   * test, it would be the automation's own round trips as well.
   */
  await page.evaluate(
    ({ card, wanted }) => {
      window.__marked = new Promise((resolve) => {
        const input = document.querySelector('[data-skill-search]');
        input.addEventListener(
          'keydown',
          (event) => {
            const from = event.timeStamp;
            const look = () => {
              const mark = document.querySelector(`[data-skill-card="${card}"] h2 a mark`);
              if (mark !== null && mark.textContent === wanted) resolve(Math.round(performance.now() - from));
              else if (performance.now() - from > 5000) resolve(-1);
              else requestAnimationFrame(look);
            };
            requestAnimationFrame(look);
          },
          { once: true },
        );
      });
    },
    { card: BY_NAME, wanted: IN_NAME },
  );
  await page.keyboard.press(TYPED.slice(-1));
  const took = await page.evaluate(() => window.__marked);
  record(
    took >= 0 && took <= SLOWEST_MARKS_MS,
    `the marks follow the last key within ${SLOWEST_MARKS_MS} ms (${took} ms from keydown to the name's mark holding "${IN_NAME}")`,
  );
  await page.waitForTimeout(300);

  const skillGroup = `[data-search-group="${SKILL_CATALOG}"]`;
  const shown = await cardsIn(SKILL_CATALOG, 'skill');
  record(
    same([...shown].sort(), [BY_BODY, BY_NAME].sort()),
    `the two skills that match are shown, and the one that does not is not (${shown.join(', ')})`,
  );
  record((await page.locator(`[data-skill-card="${PLAIN}"]`).count()) === 0, 'the skill that matches nothing is hidden');

  const nameCard = `${skillGroup} [data-skill-card="${BY_NAME}"]`;
  const inName = await marks(`${nameCard} h2 a`);
  record(same(inName, [IN_NAME]), `the name marks exactly the letters typed, in its own case (${JSON.stringify(inName)})`);
  record(await marksDrawn(`${nameCard} h2 a`), 'and that mark is drawn, holding text alone');
  record(
    (await page.locator(`${nameCard} [data-search-excerpt]`).count()) === 0,
    'a skill found by its name draws no excerpt',
  );

  const bodyCard = `${skillGroup} [data-skill-card="${BY_BODY}"]`;
  record((await marks(`${bodyCard} h2`)).length === 0, 'a skill found only by its content has nothing marked in its name');
  const inExcerpt = await marks(`${bodyCard} [data-search-excerpt]`);
  record(
    same(inExcerpt, [TYPED]),
    `it draws an excerpt of its content around the match, marked exactly (${JSON.stringify(inExcerpt)})`,
  );
  record(await marksDrawn(`${bodyCard} [data-search-excerpt]`), 'and the excerpt and its mark are on screen');
  {
    const excerpt = await page.locator(`${bodyCard} [data-search-excerpt]`).innerText();
    record(!excerpt.includes('**'), `the excerpt reads as prose, without the markdown's asterisks (${excerpt})`);
  }

  const pluginGroup = `[data-search-group="${PLUGIN.name}"]`;
  const pluginShown = await cardsIn(PLUGIN.name, 'skill');
  record(same(pluginShown, ['Plugin body only']), `a plugin's skill that matches is shown, its other is not (${pluginShown.join(', ')})`);
  const pluginCard = `${pluginGroup} [data-skill-card="Plugin body only"]`;
  record(
    await page.locator(`${pluginCard} details`).evaluate((details) => details.open),
    "matched only in its folded page, the plugin's skill opens it",
  );
  const inMarkdown = await marks(`${pluginCard} details`);
  record(same(inMarkdown, [TYPED, TYPED]), `the rendered markdown marks both occurrences exactly (${JSON.stringify(inMarkdown)})`);
  record(await marksDrawn(`${pluginCard} details`), 'and both are drawn');
  {
    const parents = await page
      .locator(`${pluginCard} details mark`)
      .evaluateAll((items) => items.map((item) => item.parentElement?.tagName.toLowerCase()));
    record(
      same(parents, ['strong', 'code']),
      `marked inside the bold and the code the markdown drew, not across them (${parents.join(', ')})`,
    );
  }
  {
    const strayLetters = await page.evaluate(
      () => [...document.querySelectorAll('mark')].filter((mark) => mark.closest('[data-skill-card]') === null).length,
    );
    record(strayLetters === 0, `nothing outside the cards is marked (${strayLetters})`);
  }

  await box.fill('');
  await page.waitForTimeout(400);
  record((await allMarks()) === 0, `cleared, every mark is gone (${await allMarks()})`);
  record(
    (await page.locator('[data-search-excerpt]').count()) === 0,
    'and so is every excerpt',
  );

  // ---- memory --------------------------------------------------------------
  const memoryBox = page.locator('[data-memory-search]');
  await page.goto(`${BASE}/workspace/${WORKSPACE}/memory?catalog=${made.memoryCatalog}`, { waitUntil: 'domcontentloaded' });
  await memoryBox.waitFor({ timeout: 30_000 });
  await page.locator(`[data-memory-card="${MEMORY_BY_TITLE}"]`).waitFor({ timeout: 30_000 });
  record((await allMarks()) === 0, 'memory: nothing is marked before anything is typed');

  await memoryBox.fill(TYPED);
  await page.locator(`[data-search-group="${MEMORY_CATALOG}"]`).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  const memoryGroup = `[data-search-group="${MEMORY_CATALOG}"]`;
  const memories = await cardsIn(MEMORY_CATALOG, 'memory');
  record(
    same([...memories].sort(), [MEMORY_BY_TITLE, MEMORY_LONG].sort()),
    `memory: the two that match are shown, the one that does not is not (${memories.join(', ')})`,
  );
  record((await page.locator(`[data-memory-card="${MEMORY_PLAIN}"]`).count()) === 0, 'memory: the one that matches nothing is hidden');

  const titleCard = `${memoryGroup} [data-memory-card="${MEMORY_BY_TITLE}"]`;
  const inTitle = await marks(`${titleCard} h2`);
  record(same(inTitle, [IN_NAME]), `memory: the title marks exactly the letters typed (${JSON.stringify(inTitle)})`);
  record(await marksDrawn(`${titleCard} h2`), 'memory: and that mark is drawn');

  const longCard = `${memoryGroup} [data-memory-card="${MEMORY_LONG}"]`;
  const inLong = await marks(longCard);
  record(same(inLong, [TYPED]), `memory: matched on its seventh line, the body marks it exactly (${JSON.stringify(inLong)})`);
  record(
    (await page.locator(`${longCard} [data-search-excerpt]`).count()) === 1 && (await marksDrawn(longCard)),
    'memory: and shows an excerpt around it, so the mark is not under the three-line cut',
  );

  await memoryBox.fill('');
  await page.waitForTimeout(400);
  record((await allMarks()) === 0, `memory: cleared, every mark is gone (${await allMarks()})`);
} finally {
  for (const id of made.skills) {
    await graphql(`mutation($id: ID!) { deleteSkill(id: $id) }`, { id }).catch(() => undefined);
  }
  if (made.skillCatalog !== null) {
    await graphql(`mutation($id: ID!) { deleteSkillCatalog(id: $id) }`, { id: made.skillCatalog }).catch(() => undefined);
  }
  if (made.memoryCatalog !== null) {
    await graphql(`mutation($id: ID!) { deleteMemoryCatalog(id: $id) }`, { id: made.memoryCatalog }).catch(() => undefined);
  }
}

await finish(browser);
