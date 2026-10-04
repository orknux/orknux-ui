/**
 * The installation settings page is in sections, and Quick actions can reach
 * each one.
 *
 * Every agent, tool-loop, session, scratchpad and drawing setting sat under
 * one "Chat" heading with no anchor - twenty-odd fields in a run, and the
 * page's section list in Quick actions naming none of them. What is pinned is
 * what is drawn: a heading on the page for each section, found by the anchor
 * Quick actions jumps to, and the settings that belong to it inside it.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1280, height: 1000 } });

await page.goto(`${BASE}/admin/settings`);
await page.waitForLoadState('networkidle');

/** Each section's anchor, and one setting that has to be under it. */
const SECTIONS = [
  ['chat', 'chat-max-rounds'],
  ['agents', 'agent-max-subagents'],
  // The first wait on a rate limit that named none. Issue #608.
  ['agents', 'rate-limit-backoff-seconds'],
  ['tool-calls', 'max-tool-calls-at-once'],
  ['tool-list', 'tools-named-in-search'],
  ['sessions', 'session-compact-after'],
  ['sessions', 'sessions-removable'],
  ['scratchpads', 'scratchpad-budget'],
  ['drawing', 'drawing-scale'],
  ['commands', 'command-marker'],
  ['attachments', null],
  ['metrics', null],
  // The server's log levels, without a restart. Issue #591.
  ['logging', 'log-level-root'],
  // How long a copy waits for a lock, drawn last. Issue #581.
  ['workspace-copies', 'workspace-copy-lock-wait-seconds'],
];

/** Where a heading and a field sit, top to bottom, so "under" means drawn below it. */
async function top(selector) {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  return box?.y ?? null;
}

const tops = [];
for (const [anchor, field] of SECTIONS) {
  const heading = page.locator(`h2#${anchor}`);
  const shown = await heading.isVisible().catch(() => false);
  record(shown, `the ${anchor} section has a heading on the page`);
  const at = await top(`h2#${anchor}`);
  if (!tops.some((seen) => seen.anchor === anchor)) tops.push({ anchor, y: at });
  if (field !== null) {
    const fieldAt = await top(`#${field}`);
    record(at !== null && fieldAt !== null && fieldAt > at, `${field} is drawn under the ${anchor} heading`);
  }
}

/* In the order Quick actions lists them, top to bottom. */
const ordered = tops.every(({ y }, i) => y !== null && (i === 0 || y > tops[i - 1].y));
record(ordered, 'the sections are drawn in the order Quick actions lists them');

/* And a field belongs to its own section, not the next one down. */
const chatNext = await top('h2#agents');
const rounds = await top('#chat-max-rounds');
const subagents = await top('#agent-max-subagents');
record(rounds !== null && chatNext !== null && rounds < chatNext, 'chat rounds is above the Agents heading');
record(subagents !== null && chatNext !== null && subagents > chatNext, 'the subagent setting is below it');

/* The switch that keeps conversations is with the sessions, not under Metrics where it was. */
const removable = await top('#sessions-removable');
const nextDown = await top('h2#scratchpads');
record(removable !== null && nextDown !== null && removable < nextDown, 'the conversations switch is above the Scratchpads heading');

await finish(browser);
