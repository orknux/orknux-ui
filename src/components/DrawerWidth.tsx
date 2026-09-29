/**
 * The width of the drawers the workflow editor opens beside its graph.
 *
 * An agent's, action's, condition's, trigger's or name's settings open in a
 * drawer that stands left of the Node Properties panel, and every one of them
 * was a fixed `min(34vw, 520px)` - narrow for a prompt or a long mapping, where
 * the panel beside it could already be dragged wide. So they widen the same
 * way, from their left edge, and share one width: they are one place on the
 * screen that happens to hold five different forms, and a width chosen for one
 * of them is the width somebody wants for the next.
 *
 * The page that opens the drawers owns the size, because only it knows how much
 * row there is and how much of it the panel already takes; it provides it here,
 * and each drawer draws `DrawerEdge` inside itself. Without a provider there is
 * no handle and the drawer keeps its stylesheet width.
 */
import { createContext, useContext } from 'react';

import styles from './Dialog.module.css';
import { ResizeHandle } from './DragSize';
import type { DragSize } from './DragSize';
import { t } from '../i18n';

export interface DrawerWidthValue {
  drag: DragSize<number | null>;
  /** What the handle reports while nothing has been dragged: the width the stylesheet chose. */
  drawn: number;
  min: number;
  max: number;
}

export const DrawerWidth = createContext<DrawerWidthValue | null>(null);

/** The left-edge handle of a drawer, drawn only where a page provides the width. */
export function DrawerEdge({ placement }: { placement: 'modal' | 'panel' }) {
  const width = useContext(DrawerWidth);
  if (width === null || placement !== 'panel') return null;
  return (
    <ResizeHandle
      orientation="vertical"
      className={styles.drawerEdge}
      label={t('Width of the settings drawer')}
      valueNow={width.drag.size ?? width.drawn}
      valueMin={width.min}
      valueMax={width.max}
      title={t('Drag to change the width; double-click to put it back')}
      dragging={width.drag.dragging}
      handlers={width.drag.handlers}
    />
  );
}
