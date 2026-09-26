/**
 * A scratchpad opens as a document, in the room the page has left. Issue #457.
 *
 * What was reported: reading a pad gave its content a box a few hundred pixels
 * tall with the rest of the window empty below it, and Delete and Save sat in a
 * bar underneath. A scratchpad is a document - a page of HTML, a story, a file of
 * code - so the editor takes the height the page has, and the two acts on the
 * file are beside its name at the top, where every editor's Save has been since
 * #386.
 *
 * What is measured, off the real page:
 *
 *   the editor's height    within 40px of the room between its top and the foot
 *                          of the window, the attribution strip aside
 *   and not counted        a taller window gives the editor the room and a short
 *                          one takes it back, which is the half a constant in the
 *                          stylesheet got wrong
 *   the page fits          with a pad open the frame does not scroll past itself,
 *                          so the room the editor takes is room there was
 *   Save and Delete        above the editor, to the right of the file's name, on
 *                          one line with it
 *   under the editor       no button at all: the footer bar is gone rather than
 *                          moved
 *   and Save still saves   the byte count and the server agree after a press,
 *                          because a control that moved is a control that can
 *                          have been unwired on the way
 *
 * The fixture is a scratchpad made on a session this workspace already has, and
 * taken away again. There is no mutation that makes a session - one exists
 * because an agent node carrying a `sessionKey` ran - so this borrows the newest
 * one rather than running a workflow to produce another: what is being measured
 * is the shape of the editor, and any session with a pad in it draws it.
 */
import { BASE, WORKSPACE, open, record, drawn, shot, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

/* ----------------------------------------------------------------- fixture */

const STAMP = Date.now();
const PAD = `zzPad457-${STAMP}.md`;
/* Long enough that the editor has a document in it rather than a line. */
const LINES = Array.from({ length: 120 }, (unused, index) => `Line ${index + 1} of a document somebody is reading.`);
const CONTENT = LINES.join('\n');

const { llmSessions } = await graphql(
  `query($id: ID!) { llmSessions(workspaceId: $id, page: 0, size: 5) { content { id key } } }`,
  { id: WORKSPACE },
);
const session = llmSessions.content[0] ?? null;
if (session === null) {
  record(
    false,
    'this workspace holds no session, so there is nothing to keep a scratchpad in. A session exists because a ' +
      'workflow with a session node ran; the seed runs one.',
  );
  await finish(browser);
}
console.log(`borrowing session ${session.key} (#${session.id})`);

/** Anything a run that died halfway through left behind, and the pad itself after. */
async function sweep() {
  const held = await graphql(`query($id: ID!) { sessionScratchpads(sessionId: $id) { name ownedHere } }`, {
    id: session.id,
  });
  for (const old of held.sessionScratchpads.filter((one) => one.name.startsWith('zzPad457-'))) {
    await graphql(`mutation($id: ID!, $name: String!) { deleteSessionScratchpad(sessionId: $id, name: $name) }`, {
      id: session.id,
      name: old.name,
    }).catch(() => undefined);
    console.log(`swept scratchpad ${old.name}`);
  }
}

await sweep();

await graphql(
  `mutation($id: ID!, $name: String!, $description: String, $content: String) {
     createSessionScratchpad(sessionId: $id, name: $name, description: $description, content: $content) { name bytes }
   }`,
  { id: session.id, name: PAD, description: 'Made by scripts/scratchpad-editor-check.mjs, and removed again.', content: CONTENT },
);
console.log(`made scratchpad ${PAD} (${CONTENT.length} characters)`);

/* ------------------------------------------------------------------ the page */

/**
 * Everything the assertions are made of, read off the page in one go.
 *
 * The frame is the box the page scrolls inside rather than the window: that is
 * what the shell gives a page, and measuring the editor against the window would
 * be asserting that the attribution strip does not exist.
 */
const readLayout = () =>
  page.evaluate(() => {
    const editor = document.querySelector('[data-scratchpad-content]');
    const name = document.querySelector('[data-scratchpad-open]');
    const view = document.querySelector('section[class*="_padView_"]');
    if (editor === null || name === null || view === null) return null;

    const frame = (() => {
      for (let up = editor.parentElement; up !== null; up = up.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(up).overflowY)) return up;
      }
      return document.documentElement;
    })();
    const strip = document.querySelector('footer');
    const box = (one) => {
      const rect = one.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        height: Math.round(rect.height),
      };
    };

    /* The two controls by their words, so this says nothing about class names. */
    const named = (word) =>
      [...view.querySelectorAll('button')].filter((one) => one.textContent.trim() === word).map(box);

    return {
      viewport: window.innerHeight,
      strip: Math.round(strip?.getBoundingClientRect().height ?? 0),
      editor: box(editor),
      name: box(name),
      save: named('Save')[0] ?? null,
      remove: named('Delete')[0] ?? null,
      rail: document.querySelector('div[class*="_rail_"]') === null
        ? null
        : box(document.querySelector('div[class*="_rail_"]')),
      /* Anything pressable in this view that sits below the document. */
      below: [...view.querySelectorAll('button')].filter(
        (one) => one.getBoundingClientRect().top >= editor.getBoundingClientRect().bottom - 2,
      ).length,
      frameScrolls: frame.scrollHeight > frame.clientHeight + 4,
      frameBottom: Math.round(frame.getBoundingClientRect().bottom),
    };
  });

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${session.id}`, { waitUntil: 'domcontentloaded' });

if (await drawn(page, 'the session page')) {
  const row = page.locator(`[data-scratchpad="${PAD}"]`);
  const listed = await row
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(listed, `the pad is listed in the rail (${PAD})`);

  if (listed) {
    await row.click();
    await page.locator('[data-scratchpad-content]').waitFor({ timeout: 20_000 });
    /* One frame for the measurement to be written and the box to take it. */
    await page.waitForTimeout(500);

    const seen = await readLayout();
    if (seen === null) {
      record(false, 'the pad opened but its editor, name or view could not be found on the page');
    } else {
      console.log(JSON.stringify(seen));

      /*
       * The room between the top of the editor and the foot of the window, the
       * attribution strip aside. A document should be within a hair of all of
       * it; 360px of one in a 900px window was the report.
       */
      const room = seen.viewport - seen.strip - seen.editor.top;
      record(
        room - seen.editor.height <= 40,
        `the editor takes the height the page has left: ${seen.editor.height}px of ${room}px, ` +
          `${room - seen.editor.height}px short of it`,
      );
      record(
        seen.editor.height > 400,
        `which in a 900px window is a document rather than a box (${seen.editor.height}px, and it was 360px)`,
      );
      record(
        !seen.frameScrolls,
        'and the page does not scroll past its frame with a pad open, so that room was room there was',
      );

      /* Above the document, and to the right of its name, on the one line. */
      record(
        seen.save !== null && seen.save.top < seen.editor.top,
        `Save is above the editor (${seen.save?.bottom ?? 'not found'} against the editor's ${seen.editor.top})`,
      );
      record(
        seen.save !== null && seen.save.left > seen.name.right,
        `and to the right of the file's name (Save at ${seen.save?.left ?? '-'}, the name ends at ${seen.name.right})`,
      );
      record(
        seen.save !== null && Math.abs(seen.save.top - seen.name.top) < 40,
        'on one line with it rather than under it',
      );
      record(
        seen.remove !== null && seen.remove.top < seen.editor.top && seen.remove.left > seen.name.right,
        'Delete is up there beside it',
      );
      record(seen.below === 0, `and nothing below the document is pressable: the footer bar is gone (${seen.below})`);

      await page.screenshot({ path: shot('scratchpad-editor.png') });

      /*
       * Measured rather than counted: the same page in two other windows. A
       * constant in the stylesheet passes the assertion above in the window it
       * was written for and fails in every other one, which is the whole of what
       * went wrong three times over in the plugin catalog.
       */
      await page.setViewportSize({ width: 1440, height: 1300 });
      await page.waitForTimeout(500);
      const taller = await readLayout();
      record(
        taller.editor.height > seen.editor.height + 300,
        `a 400px taller window gives the editor the room (${seen.editor.height}px to ${taller.editor.height}px)`,
      );
      record(
        taller.viewport - taller.strip - taller.editor.top - taller.editor.height <= 40,
        'and it still ends where the page does',
      );

      await page.setViewportSize({ width: 1440, height: 620 });
      await page.waitForTimeout(500);
      const shorter = await readLayout();
      record(
        shorter.editor.height >= 260 && shorter.editor.height < seen.editor.height,
        `a short window takes it back, down to a floor somebody can still read (${shorter.editor.height}px)`,
      );

      /*
       * And at the width where the rail drops under the body. The room under the
       * editor is taken out of the clearance the shell keeps at the foot of a
       * page, which is only room to take where the foot of the page is what
       * follows the editor - here the panels do, and they must still be under it
       * rather than over it.
       */
      await page.setViewportSize({ width: 420, height: 800 });
      await page.waitForTimeout(600);
      const narrow = await readLayout();
      record(
        narrow.rail !== null && narrow.rail.top >= narrow.editor.bottom - 2,
        `at phone width the panels stay under the document rather than over it ` +
          `(the editor ends at ${narrow.editor.bottom}, the rail starts at ${narrow.rail?.top ?? 'nowhere'})`,
      );

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(500);

      /*
       * And the press still saves. A control that moved is a control that can
       * have been unwired on the way, and the page is the only place that shows
       * it: the byte count beside it and the server have to agree afterwards.
       */
      const editor = page.locator('[data-scratchpad-content]');
      await editor.fill(`${CONTENT}\nA line typed by the check.`);
      const save = page.locator(`section[class*="_padView_"] button:text-is("Save")`);
      record(await save.isEnabled(), 'typing into the document arms Save');
      await save.click();
      await page.waitForTimeout(1500);

      const after = await graphql(
        `query($id: ID!, $name: String!) { sessionScratchpad(sessionId: $id, name: $name) { content bytes } }`,
        { id: session.id, name: PAD },
      );
      record(
        after.sessionScratchpad?.content.endsWith('A line typed by the check.') === true,
        'and pressing it writes the document back to the server',
      );
      record(
        (await page.locator('section[class*="_padView_"] span[class*="_padSize_"]').innerText()).includes('KB'),
        `with the size beside it saying what the document now weighs (${after.sessionScratchpad?.bytes ?? 0} bytes)`,
      );

      /*
       * The other half of this view, which moved with it. A form that keeps its
       * Create at the foot while the pad beside it keeps its Save at the top is
       * the disagreement the header convention exists to end.
       */
      await page.locator('[data-scratchpad-add]').click();
      await page.locator('#new-pad-content').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(500);
      const form = await page.evaluate(() => {
        const content = document.querySelector('#new-pad-content');
        const view = content.closest('section');
        const top = content.getBoundingClientRect().top;
        const button = (word) =>
          [...view.querySelectorAll('button')].find((one) => one.textContent.trim() === word) ?? null;
        return {
          height: Math.round(content.getBoundingClientRect().height),
          createAbove: (button('Create')?.getBoundingClientRect().bottom ?? Infinity) < top,
          cancelAbove: (button('Cancel')?.getBoundingClientRect().bottom ?? Infinity) < top,
          below: [...view.querySelectorAll('button')].filter(
            (one) => one.getBoundingClientRect().top >= content.getBoundingClientRect().bottom - 2,
          ).length,
        };
      });
      record(
        form.createAbove && form.cancelAbove && form.below === 0,
        'the new-pad form keeps Create and Cancel above its content box as well, with nothing under it',
      );
      record(form.height > 300, `and that box is given the room too (${form.height}px)`);
      await page.screenshot({ path: shot('scratchpad-new.png') });
    }
  }
}

/* ------------------------------------------------------------------ tidy up */

await sweep();

await finish(browser);
