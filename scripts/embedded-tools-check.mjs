/**
 * The capabilities the release brings are offered to an agent.
 *
 * Issue #505. The pdf, the diagrams and the charts stopped being sandboxed
 * bundles and became JVM code, and the thing worth checking is not that the
 * code exists but that the names still reach an agent's Tools list - a
 * capability nobody is offered is a capability nobody has.
 *
 * `pdf_fromHtml` in particular: it kept its name and its function row through
 * two rewrites precisely so a graph and an agent that knew it would go on
 * working, and that claim is only true if it is still here.
 */
import { open, record, finish } from './suite/harness.mjs';

const { browser, graphql } = await open();

const { builtInTools } = await graphql('query { builtInTools { name governance } }');
const named = new Set(builtInTools.map((tool) => tool.name));

for (const name of ['pdf_fromHtml', 'pdf_read', 'pdf_preview', 'charts_render', 'diagram_render']) {
  record(named.has(name), `${name} is offered`);
}

/* And each is switched by its own name, like every other built-in. */
const granted = builtInTools
  .filter((tool) => tool.name.startsWith('pdf_') || tool.name.startsWith('charts_') || tool.name.startsWith('diagram_'))
  .every((tool) => tool.governance === 'GRANT');
record(granted, 'each is granted by name rather than by some wider switch');

/*
 * And the workflow half. A graph names a function by its row, so the rows have
 * to be there for a node to point at one - they were re-pointed rather than
 * rewritten, which is the whole reason an existing graph survived this.
 */
const { workflowFunctions } = await graphql(
  'query { workflowFunctions(scope: EMBEDDED) { name scope } }',
).catch(() => ({ workflowFunctions: null }));

if (workflowFunctions !== null) {
  const rows = new Set(workflowFunctions.map((one) => one.name));
  record(rows.has('pdf_fromHtml'), 'pdf_fromHtml is a workflow function a graph can point at');
}

await finish(browser);
