/**
 * A settings page's choices are drawn in its text fields' type and box: the
 * diagram's Catalog and "What agents may do with it" stood in a larger font
 * than Name above them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const { diagrams } = await graphql(`query($w: ID!) { diagrams(workspaceId: $w) { id } }`, { w: WORKSPACE }).catch(() => ({ diagrams: [] }));
const diagram = diagrams?.[0];
record(diagram !== undefined, `a diagram to open the settings of (${diagram?.id})`);

if (diagram !== undefined) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${diagram.id}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('diagram-settings-catalog').waitFor({ timeout: 20_000 });
  const read = await page.evaluate(() => {
    const box = (el) => {
      const css = getComputedStyle(el);
      return { size: css.fontSize, height: Math.round(el.getBoundingClientRect().height), left: Math.round(el.getBoundingClientRect().left) };
    };
    const name = document.querySelector('[data-testid="diagram-settings-name"]');
    const wrapper = name?.closest('[class*="_inputWrapper_"]');
    const text = name === null ? null : getComputedStyle(name).fontSize;
    const select = document.querySelector('[data-testid="diagram-settings-catalog"]');
    const value = select?.querySelector('[class*="_value_"]') ?? select;
    return { text, field: wrapper && box(wrapper), select: select && box(select), value: value && getComputedStyle(value).fontSize };
  });
  record(read.value === read.text, `the choice's words are in the text field's type (${read.value} / ${read.text})`);
  record(read.select !== null && read.field !== null && Math.abs(read.select.height - read.field.height) <= 2, `and its box stands as tall as the field's (${JSON.stringify(read)})`);
}

await finish(browser);
