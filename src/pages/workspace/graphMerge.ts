import type { GraphEdge, GraphNode } from '../../api/graph';

/** A graph as the editor sends it: what a save carries, and what the merge works on. */
export interface DrawnGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** What a save carries of a node, without what the server works out from it. */
export function asDrawn(node: GraphNode): GraphNode {
  const { inputs: _inputs, outputs: _outputs, ...drawn } = node;
  return drawn as GraphNode;
}

const edgeKey = (edge: GraphEdge) => `${edge.source}|${edge.target}|${edge.branch ?? ''}|${edge.option ?? ''}`;

/**
 * One node as compared: its fields in a fixed order, with nothing for what
 * is missing, so a field one side sent as null and the other left out is the
 * same field.
 */
function sameNode(a: GraphNode | undefined, b: GraphNode | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const flat = (node: GraphNode) =>
    JSON.stringify(
      Object.keys(node)
        .sort()
        .filter((key) => (node as unknown as Record<string, unknown>)[key] !== undefined && (node as unknown as Record<string, unknown>)[key] !== null)
        .map((key) => [key, (node as unknown as Record<string, unknown>)[key]]),
    );
  return flat(a) === flat(b);
}

/**
 * Puts what this editor changed onto what somebody else saved. Issue #645.
 *
 * Three pictures: [base], the graph as this editor last read it; [mine], what
 * is on its canvas now; [theirs], what the server holds now. A node this
 * editor did not touch since [base] is taken as they have it - moved, changed,
 * or gone; one it did touch is kept as it is here, its change winning over
 * theirs, because it is the change the person in front of this screen just
 * made and can see. A line is kept where either side drew it since and gone
 * where either side took it away, and none is kept to a node that is not
 * there.
 *
 * Whole nodes rather than fields, so two people changing two fields of one
 * node at the same moment keeps the one made here. That is rare - two people
 * in one node's panel at once - and it is never silent: the other editor is
 * told of this save the moment it lands and redraws.
 */
export function mergeGraphs(base: DrawnGraph, mine: DrawnGraph, theirs: DrawnGraph): DrawnGraph {
  const was = new Map(base.nodes.map((node) => [node.key, node]));
  const here = new Map(mine.nodes.map((node) => [node.key, node]));
  const there = new Map(theirs.nodes.map((node) => [node.key, node]));

  const nodes: GraphNode[] = [];
  const order = [...theirs.nodes.map((node) => node.key), ...mine.nodes.map((node) => node.key)];
  const seen = new Set<string>();
  order.forEach((key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const touched = !sameNode(was.get(key), here.get(key));
    const kept = touched ? here.get(key) : there.get(key);
    if (kept !== undefined) nodes.push(kept);
  });

  const keys = new Set(nodes.map((node) => node.key));
  const wasEdges = new Set(base.edges.map(edgeKey));
  const hereEdges = new Map(mine.edges.map((edge) => [edgeKey(edge), edge]));
  const thereEdges = new Map(theirs.edges.map((edge) => [edgeKey(edge), edge]));
  const edges: GraphEdge[] = [];
  new Set([...thereEdges.keys(), ...hereEdges.keys()]).forEach((key) => {
    const inBase = wasEdges.has(key);
    const inMine = hereEdges.has(key);
    const inTheirs = thereEdges.has(key);
    // Drawn since by either side, or still there on both.
    const kept = (inMine && inTheirs) || (inMine && !inBase) || (inTheirs && !inBase);
    const edge = hereEdges.get(key) ?? thereEdges.get(key);
    if (kept && edge !== undefined && keys.has(edge.source) && keys.has(edge.target)) edges.push(edge);
  });

  return { nodes, edges };
}
