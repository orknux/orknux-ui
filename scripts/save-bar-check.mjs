/**
 * Every page that saves has its Save in one strip along the bottom of the
 * window, not in its header.
 *
 * The strip is a panel, not a floating button: a non-transparent background -
 * the sidebar's own colour - with Save inside it. It is there as the page
 * opens. It is one with the shell - its bottom on the attribution footer's
 * top, its left on the sidebar's right edge (on pages with a section menu too,
 * which it runs under), its right on the window's edge, square-cornered. Save
 * stays in view before and after scrolling to the middle and to the end, and
 * the quick chat's AI button in the footer below does not touch the strip.
 * The page's last field is not hidden under the strip at the end. Discard sits
 * beside Save. On every page it opens: both are off as the page opens, an edit
 * turns them on, Discard puts the field back and turns them off, and an edit
 * saved turns them off and is still there after a reload - after which the
 * value it had is saved back, so the check leaves the workspace as it found it.
 *
 * Reads ids off the workspace and makes one scratch agent, deleted again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const pick = async (query, read) => read(await graphql(query, { w: WORKSPACE }).catch(() => null));
const connection = await pick(`query($w: ID!) { workspaceConnections(workspaceId: $w) { id } }`, (a) => a?.workspaceConnections?.[0]?.id);
const model = await pick(`query($w: ID!) { models(workspaceId: $w) { id } }`, (a) => a?.models?.[0]?.id);
// A function of the check's own, from the server's stub: a workspace's may be one that cannot be saved as it stands.
const fn = (
  await graphql(`mutation($input: CreateFunctionInput!) { createFunction(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, name: `zzSaveBarFn${Date.now()}` },
  }).catch(() => null)
)?.createFunction?.id;
// One this installation owns: a directory user's name is the directory's, and drawn read-only.
const user = await pick(`query { users { id type } }`, (a) => a?.users?.find((one) => one.type !== 'EXTERNAL' && one.type !== 'LDAP')?.id ?? a?.users?.[0]?.id);
const agent = (
  await graphql(`mutation ($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`, {
    w: WORKSPACE,
    n: `zzSaveBar_${Date.now()}`,
  })
).createAgent;

const PAGES = [
  ['workspace settings', `/workspace/${WORKSPACE}/settings`],
  ['admin settings', '/admin/settings'],
  ['agent settings', `/workspace/${WORKSPACE}/agents/${agent.id}/settings`],
  ['a connection', connection && `/workspace/${WORKSPACE}/integrations/connections/${connection}`],
  ['a model', model && `/workspace/${WORKSPACE}/models/${model}`],
  ['the function editor', fn && `/workspace/${WORKSPACE}/functions/${fn}`],
  ['preferences', '/preferences'],
  ['an admin user', user && `/admin/users/${user}`],
];

/** Everything measured at once: the strip, Save in it, the AI button, the footer, the sidebar, the frame. */
const measure = () =>
  page.evaluate(() => {
    const box = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const bar = document.querySelector('[data-testid="save-bar"]');
    const buttons = bar ? [...bar.querySelectorAll('button')] : [];
    const save = buttons.filter((one) => /^(Save|Create|Add|Publish)/.test(one.textContent?.trim() ?? '')).pop() ?? buttons.pop();
    const ai = [...document.querySelectorAll('button')].find((one) => one.textContent?.trim() === 'AI');
    const style = bar ? getComputedStyle(bar) : null;
    const sidebar = document.querySelector('[data-shell-sidebar]');
    return {
      sidebarBackground: sidebar ? getComputedStyle(sidebar).backgroundColor : null,
      vw: innerWidth,
      vh: innerHeight,
      bar: box(bar),
      barBackground: style?.backgroundColor ?? null,
      barRadius: style?.borderTopLeftRadius ?? null,
      save: box(save),
      saveInBar: save !== undefined && bar?.contains(save) === true,
      ai: box(ai),
      footer: box(document.querySelector('[data-shell-footer]')),
      sidebar: box(document.querySelector('[data-shell-sidebar]')),
      main: box(document.querySelector('main')),
      // The page's lowest field the reader can reach in the frame: drawn, and not clipped away inside a box that scrolls on its own.
      last: box(
        [...document.querySelectorAll('main input, main select, main textarea, main button')]
          .filter((one) => {
            if (one.getClientRects().length === 0) return false;
            const r = one.getBoundingClientRect();
            for (let up = one.parentElement; up !== null && up.tagName !== 'MAIN'; up = up.parentElement) {
              if (/(auto|scroll|hidden)/.test(getComputedStyle(up).overflowY)) {
                const clip = up.getBoundingClientRect();
                if (r.bottom > clip.bottom + 1 || r.top < clip.top - 1) return false;
              }
            }
            return true;
          })
          .sort((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom)
          .pop(),
      ),
    };
  });

/** Scrolls whatever the page scrolls in: the shell's frame, or a column of the page's own inside it. */
const scrollTo = (fraction) =>
  page.evaluate((fraction) => {
    let frame = document.querySelector('[data-save-bar-spacer]')?.parentElement ?? null;
    while (frame !== null && frame.tagName !== 'MAIN' && !/(auto|scroll)/.test(getComputedStyle(frame).overflowY)) frame = frame.parentElement;
    frame = frame ?? document.querySelector('main');
    frame.scrollTop = (frame.scrollHeight - frame.clientHeight) * fraction;
  }, fraction);

const near = (a, b) => a !== undefined && b !== undefined && Math.abs(a - b) <= 1;
const transparent = (colour) => colour === null || colour === 'transparent' || /rgba\(.*,\s*0\)$/.test(colour);

try {
  for (const [what, path] of PAGES) {
    if (!path) {
      record(false, `${what}: nothing to open in this workspace`);
      continue;
    }
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    const shown = await page.getByTestId('save-bar').waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    if (!shown) {
      record(false, `${what}: the page has a save strip`);
      continue;
    }
    await page.waitForTimeout(1200);
    let ok = true;
    const notes = [];
    for (const [where, fraction] of [['top', 0], ['middle', 0.5], ['end', 1]]) {
      await scrollTo(fraction);
      await page.waitForTimeout(250);
      const m = await measure();
      const edge = m.sidebar !== null ? m.sidebar.right : m.main.left;
      const apart = (a, b) => a === null || b === null || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      const checks = {
        panel: !transparent(m.barBackground) && m.saveInBar,
        sidebarColour: m.sidebarBackground === null || m.barBackground === m.sidebarBackground,
        aiClearOfBar: apart(m.ai, m.bar),
        onFooter: m.footer !== null && near(m.bar.bottom, m.footer.top),
        fromSidebar: near(m.bar.left, edge),
        toEdge: near(m.bar.right, m.vw),
        square: m.barRadius === '0px',
        saveInView: m.save !== null && m.save.top >= 0 && m.save.bottom <= m.vh,
        aboveAi: m.ai === null || (m.save.bottom <= m.ai.top && !(m.save.right > m.ai.left && m.save.left < m.ai.right && m.save.bottom > m.ai.top && m.save.top < m.ai.bottom)),
        lastClear: where !== 'end' || m.last === null || m.last.bottom <= m.bar.top + 1,
      };
      const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
      if (failed.length > 0) {
        ok = false;
        notes.push(`${where}: ${failed.join(', ')} (bar ${m.barBackground} sidebar ${m.sidebarBackground}, ai ${Math.round(m.ai?.top ?? -1)}-${Math.round(m.ai?.bottom ?? -1)}, ${Math.round(m.bar.left)}-${Math.round(m.bar.right)} x ${Math.round(m.bar.top)}-${Math.round(m.bar.bottom)}, footer ${Math.round(m.footer?.top)}, sidebar ${Math.round(edge)}, save ${Math.round(m.save?.top)}-${Math.round(m.save?.bottom)}, ai ${Math.round(m.ai?.top ?? -1)}, last ${Math.round(m.last?.bottom ?? -1)})`);
      }
    }
    record(ok, `${what}: Save is on a panel in the sidebar's colour, on the footer, from the sidebar to the window's edge, clear of the AI button, at the top, middle and end${notes.length > 0 ? ` - ${notes.join('; ')}` : ''}`);
    record((await page.getByTestId('save-bar-discard').count()) === 1, `${what}: Discard is beside Save`);
  }

  /*
   * On every page: off as it opens, on with an edit, Discard puts it back and
   * turns them off, and an edit saved turns them off and persists. A field each
   * page can be changed through and changed back: a description where there is
   * one, a number, a name, a switch.
   */
  const flows = [
    ['workspace settings', `/workspace/${WORKSPACE}/settings`, { fill: '#workspace-description' }],
    ['admin settings', '/admin/settings', { fill: '#chat-max-rounds' }],
    ['agent settings', `/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { fill: '#agent-description' }],
    ['a connection', connection && `/workspace/${WORKSPACE}/integrations/connections/${connection}`, { fill: '#connection-description' }],
    ['a model', model && `/workspace/${WORKSPACE}/models/${model}`, { fill: '#model-name' }],
    ['the function editor', fn && `/workspace/${WORKSPACE}/functions/${fn}`, { fill: '#function-description' }],
    ['preferences', '/preferences', { radios: '[role="radiogroup"][aria-labelledby="answer-cost"]' }],
    ['an admin user', user && `/admin/users/${user}`, { fill: '#user-display-name' }],
  ];
  const discard = () => page.getByTestId('save-bar-discard');
  const save = () => page.getByTestId('save-bar').locator('button:not([data-testid="save-bar-discard"])').last();
  const both = async () => ({ discard: !(await discard().isDisabled()), save: !(await save().isDisabled()) });
  for (const [what, path, how] of flows) {
    if (!path) continue;
    const open = async () => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.locator(how.fill ?? how.radios).first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
    };
    // What the field says, and how to say something else in it.
    const read = async () =>
      how.fill !== undefined
        ? page.locator(how.fill).inputValue()
        : (await page.locator(`${how.radios} [role="radio"][aria-checked="true"]`).textContent())?.trim();
    const change = async (to) => {
      if (how.fill !== undefined) {
        await page.locator(how.fill).fill(to);
      } else {
        await page.locator(`${how.radios} [role="radio"]`, { hasText: to }).click();
      }
      await page.waitForTimeout(250);
    };
    // Something else to say: the other switch, the next number, or the text with a word added - with no space to be trimmed off an empty one.
    const other = (was) =>
      how.radios !== undefined ? (was === 'On' ? 'Off' : 'On') : /^\d+$/.test(was) ? String(Number(was) + 1) : was === '' ? 'save-bar-check' : `${was} (save-bar-check)`;

    await open();
    const atOpen = await both();
    const was = await read();
    await change(other(was));
    const afterEdit = await both();
    await discard().click();
    await page.waitForTimeout(1500);
    await page.locator(how.fill ?? how.radios).first().waitFor({ timeout: 20_000 });
    const back = await read();
    const afterDiscard = await both();
    record(
      !atOpen.discard && !atOpen.save && afterEdit.discard && afterEdit.save && back === was && !afterDiscard.discard && !afterDiscard.save,
      `${what}: Save and Discard off as it opens, on after an edit, and off again once Discard puts "${was}" back (open ${JSON.stringify(atOpen)}, edited ${JSON.stringify(afterEdit)}, back "${back}", discarded ${JSON.stringify(afterDiscard)})`,
    );

    await change(other(was));
    await save().click();
    await page.waitForTimeout(2500);
    const afterSave = await both();
    await open();
    const kept = await read();
    record(!afterSave.discard && !afterSave.save && kept === other(was), `${what}: an edit saved turns them off and is there after a reload ("${kept}", ${JSON.stringify(afterSave)})`);
    // And back as it was, where the save took.
    if (kept !== was) {
      await change(was);
      if (!(await save().isDisabled())) await save().click();
      await page.waitForTimeout(2500);
    }
  }

  /*
   * The quick chat's window points at the AI button that opened it: a tail from
   * the window's bottom edge whose tip is over the button's centre and between
   * the two. Only where the workspace offers the quick chat.
   */
  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const launcher = page.getByRole('button', { name: 'Ask about this page' });
  if ((await launcher.count()) === 0) {
    console.log('the quick chat is not offered here, so there is no window to point');
  } else {
    await launcher.click();
    await page.getByTestId('quick-chat-tail').waitFor({ timeout: 5_000 }).catch(() => {});
    const placed = await page.evaluate(() => {
      const r = (one) => {
        const b = one?.getBoundingClientRect();
        return b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width } : null;
      };
      return {
        tail: r(document.querySelector('[data-testid="quick-chat-tail"]')),
        window: r(document.querySelector('section[aria-label="Quick chat"]')),
        button: r([...document.querySelectorAll('button')].find((one) => one.getAttribute('aria-expanded') === 'true' && /quick chat/i.test(one.getAttribute('aria-label') ?? ''))),
      };
    });
    const { tail, window: chat, button } = placed;
    const tipX = tail ? tail.left + tail.width / 2 : null;
    const ok = tail !== null && chat !== null && button !== null
      && Math.abs(tipX - (button.left + button.width / 2)) <= 3
      && tail.bottom > chat.bottom && tail.bottom <= button.top;
    record(ok, `the quick chat's window has a tail whose tip is over the AI button's centre, between the window and the button (${JSON.stringify(placed)})`);
    await launcher.click().catch(() => {});
  }
} finally {
  await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => {});
  if (fn) await graphql(`mutation ($id: ID!) { deleteFunction(id: $id) }`, { id: fn }).catch(() => {});
}

await finish(browser);
