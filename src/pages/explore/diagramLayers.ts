import type { DiagramDrawing, DiagramLayer } from '../../api/diagrams';

/**
 * A diagram's layers, as the editor works with them.
 *
 * A diagram with none of its own has one, Base, which everything is on; the
 * server says the same (`DiagramDrawing.BASE`), so a box with no layer is on
 * the first in both places. The first layer added makes Base a real one, so
 * nothing already drawn moves.
 */
export const BASE: DiagramLayer = { id: 'base', name: 'Base', visible: true, locked: false };

/** The layers there are, bottom first. */
export function layersOf(drawing: DiagramDrawing): DiagramLayer[] {
  return drawing.layers !== undefined && drawing.layers.length > 0 ? drawing.layers : [BASE];
}

/** The id of the layer an item is on: its own, or the first. */
export function layerOf(item: { layer?: string }, drawing: DiagramDrawing): string {
  return item.layer ?? layersOf(drawing)[0].id;
}

/** Ids of the layers not shown, with what this browser has hidden on top while viewing. */
export function hiddenLayers(drawing: DiagramDrawing, hiddenHere: ReadonlySet<string>): Set<string> {
  return new Set(layersOf(drawing).filter((one) => !one.visible || hiddenHere.has(one.id)).map((one) => one.id));
}

export function lockedLayers(drawing: DiagramDrawing): Set<string> {
  return new Set(layersOf(drawing).filter((one) => one.locked).map((one) => one.id));
}

/**
 * Whose layers a merge keeps: mine where I changed them since we both started,
 * theirs otherwise - the rule `mergeById` keeps for each box, for the one list.
 */
export function mergeLayers(base: DiagramDrawing, mine: DiagramDrawing, theirs: DiagramDrawing): DiagramLayer[] | undefined {
  return JSON.stringify(mine.layers ?? []) === JSON.stringify(base.layers ?? []) ? theirs.layers : mine.layers;
}

/** A fresh layer id, not one the drawing has. */
export function freshLayerId(drawing: DiagramDrawing): string {
  const taken = new Set(layersOf(drawing).map((one) => one.id));
  for (;;) {
    const made = `l${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(made)) return made;
  }
}
