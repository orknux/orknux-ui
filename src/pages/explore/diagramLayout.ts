import dagre from '@dagrejs/dagre';

import type { DiagramDrawing, DiagramNodeData } from '../../api/diagrams';

export type LayoutDirection = 'LR' | 'TB';

/** Space around a group's children, and room above them for its label. */
const GROUP_PAD = 24;
const GROUP_TITLE = 28;

/**
 * The drawing laid out again by dagre (MIT): ranks along [direction], each
 * group drawn round what sits in it.
 *
 * A group is a compound node to dagre, which places its children together and
 * reports the box round them; a group with nothing in it is laid out as an
 * ordinary node. A connection to or from a group is left out of the layout -
 * dagre does not rank clusters - and drawn where the boxes end up. Positions
 * come back as the top left corner, whole pixels, as the drawing holds them.
 */
export function laidOut(drawing: DiagramDrawing, direction: LayoutDirection): DiagramDrawing {
  if (drawing.nodes.length === 0) return drawing;
  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  graph.setGraph({ rankdir: direction, nodesep: 48, ranksep: 80, marginx: 40, marginy: 40 });
  graph.setDefaultEdgeLabel(() => ({}));

  const holding = new Set(drawing.nodes.filter((node) => node.parent !== undefined).map((node) => node.parent as string));
  const isCluster = (node: DiagramNodeData) => node.kind === 'group' && holding.has(node.id);
  const clusters = new Set(drawing.nodes.filter(isCluster).map((node) => node.id));

  for (const node of drawing.nodes) {
    if (clusters.has(node.id)) graph.setNode(node.id, { paddingTop: GROUP_TITLE });
    else graph.setNode(node.id, { width: node.w, height: node.h });
  }
  for (const node of drawing.nodes) {
    if (node.parent !== undefined && graph.hasNode(node.parent)) graph.setParent(node.id, node.parent);
  }
  for (const edge of drawing.edges) {
    if (clusters.has(edge.from) || clusters.has(edge.to) || edge.from === edge.to) continue;
    graph.setEdge(edge.from, edge.to, {}, edge.id);
  }

  dagre.layout(graph);

  const nodes = drawing.nodes.map((node) => {
    const placed = graph.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    if (placed === undefined) return node;
    if (clusters.has(node.id)) return node;
    return { ...node, x: Math.round(placed.x - node.w / 2), y: Math.round(placed.y - node.h / 2) };
  });
  return { ...drawing, nodes: wrapGroups(nodes) };
}

/** Every group that holds something drawn round it, innermost first, so an outer group wraps an inner one already sized. */
export function wrapGroups(nodes: DiagramNodeData[]): DiagramNodeData[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = (node: DiagramNodeData): number => {
    let found = 0;
    let up = node.parent;
    const seen = new Set<string>();
    while (up !== undefined && !seen.has(up)) {
      seen.add(up);
      found += 1;
      up = byId.get(up)?.parent;
    }
    return found;
  };
  const groups = nodes.filter((node) => node.kind === 'group').sort((a, b) => depth(b) - depth(a));
  for (const group of groups) {
    const inside = [...byId.values()].filter((node) => node.parent === group.id);
    if (inside.length === 0) continue;
    const left = Math.min(...inside.map((node) => node.x)) - GROUP_PAD;
    const top = Math.min(...inside.map((node) => node.y)) - GROUP_PAD - GROUP_TITLE;
    const right = Math.max(...inside.map((node) => node.x + node.w)) + GROUP_PAD;
    const bottom = Math.max(...inside.map((node) => node.y + node.h)) + GROUP_PAD;
    byId.set(group.id, { ...group, x: left, y: top, w: right - left, h: bottom - top });
  }
  return nodes.map((node) => byId.get(node.id) ?? node);
}
