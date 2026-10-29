/**
 * The wireframe editor's toolbar on a narrow window: every control in it is on
 * the screen, none cut off past the right edge.
 *
 * The bar held a dozen tools, zoom, undo, Duplicate, Delete, Import, Export and
 * Host on one row of fixed height that could not shrink, so at 1430px wide
 * Export ran off the end and could not be reached, and the wireframe's name was
 * squeezed to nothing. The name gives way first now, to a few letters, and then
 * the buttons wrap onto a second row. Measured at three widths, from roomy to
 * narrow, by reading each control's box: its right edge is inside the window,
 * it has a size, the name keeps some width, the bar is one row where there is
 * room for one, and the canvas still starts below the bar rather than under it.
 *
 * Makes its own wireframe and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

let id = null;
try {
  id = (
    await graphql('mutation ($w: ID!, $n: String!) { createWireframe(workspaceId: $w, name: $n) { id } }', {
      w: WORKSPACE,
      n: `Toolbar check ${Date.now()}`,
    })
  ).createWireframe.id;
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('wireframe-export').waitFor({ timeout: 20_000 });

  for (const width of [1440, 1200, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const measured = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="wireframe-back"]')?.parentElement;
      if (!bar) return null;
      const shown = [...bar.querySelectorAll('button, input')].filter((one) => one.getClientRects().length > 0);
      const out = shown
        .map((one) => ({ what: one.getAttribute('data-testid') ?? one.getAttribute('aria-label') ?? one.textContent?.trim() ?? '', box: one.getBoundingClientRect() }))
        .filter(({ box }) => box.right > window.innerWidth + 0.5 || box.width === 0)
        .map(({ what, box }) => `${what} (${Math.round(box.left)}-${Math.round(box.right)})`);
      const svg = document.querySelector('[data-testid="wireframe-svg"]');
      return {
        count: shown.length,
        out,
        barBottom: bar.getBoundingClientRect().bottom,
        barHeight: bar.getBoundingClientRect().height,
        titleWidth: document.querySelector('[data-testid="wireframe-title"]')?.getBoundingClientRect().width ?? 0,
        canvasTop: svg?.getBoundingClientRect().top ?? null,
        pageWide: document.documentElement.scrollWidth,
      };
    });
    record(measured !== null && measured.count > 20 && measured.out.length === 0,
      `at ${width}px every one of the toolbar's ${measured?.count} controls is inside the window (${measured?.out.join(', ') || 'none out'})`);
    record(measured !== null && measured.titleWidth >= 40, `at ${width}px the wireframe's name keeps some of its width (${Math.round(measured?.titleWidth ?? 0)}px)`);
    if (width === 1440) record(measured !== null && measured.barHeight <= 48, `at 1440px the bar is one row (${measured?.barHeight}px tall)`);
    record(measured !== null && measured.canvasTop !== null && measured.canvasTop >= measured.barBottom - 0.5 && measured.pageWide <= width,
      `at ${width}px the canvas starts below the bar (${measured?.canvasTop} >= ${measured?.barBottom}) and the page does not scroll sideways (${measured?.pageWide})`);
  }
} finally {
  if (id !== null) await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
