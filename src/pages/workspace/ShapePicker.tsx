import type { NodeShape } from '../../api/graph';
import { t } from '../../i18n';
import styles from './ShapePicker.module.css';

/*
 * Each outline as the card is drawn with it, in a 64 by 36 box: the same
 * corners, cuts and points as the canvas, at the size of a tile.
 */
const OUTLINES: Record<NodeShape | 'DEFAULT', string> = {
  DEFAULT: 'M5 2.5 H59 A2.5 2.5 0 0 1 61.5 5 V31 A2.5 2.5 0 0 1 59 33.5 H5 A2.5 2.5 0 0 1 2.5 31 V5 A2.5 2.5 0 0 1 5 2.5 Z',
  RECTANGLE: 'M2.5 2.5 H61.5 V33.5 H2.5 Z',
  ROUNDED: 'M9 2.5 H55 A6.5 6.5 0 0 1 61.5 9 V27 A6.5 6.5 0 0 1 55 33.5 H9 A6.5 6.5 0 0 1 2.5 27 V9 A6.5 6.5 0 0 1 9 2.5 Z',
  PILL: 'M18 2.5 H46 A15.5 15.5 0 0 1 46 33.5 H18 A15.5 15.5 0 0 1 18 2.5 Z',
  NOTCHED: 'M8 2.5 H56 L61.5 8 V28 L56 33.5 H8 L2.5 28 V8 Z',
  HEXAGON: 'M11 2.5 H53 L61.5 18 L53 33.5 H11 L2.5 18 Z',
};

/**
 * The node panel's Shape: every outline drawn as a tile, the current one lit,
 * so the choice is made by looking rather than by reading a list of names.
 * A radio group - arrows move between the tiles, as in any other.
 */
export function ShapePicker({
  id,
  value,
  labels,
  onChoose,
}: {
  id: string;
  value: NodeShape | null;
  labels: Record<NodeShape, string>;
  onChoose: (shape: NodeShape | null) => void;
}) {
  const choices: { shape: NodeShape | null; label: string; outline: string }[] = [
    { shape: null, label: t('Default'), outline: OUTLINES.DEFAULT },
    ...(Object.keys(labels) as NodeShape[]).map((shape) => ({ shape, label: labels[shape], outline: OUTLINES[shape] })),
  ];
  const at = Math.max(0, choices.findIndex((one) => one.shape === value));
  return (
    <div className={styles.grid} role="radiogroup" id={id} aria-label={t('Shape')}>
      {choices.map((one, index) => {
        const chosen = index === at;
        return (
          <button
            key={one.shape ?? 'DEFAULT'}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            className={chosen ? `${styles.tile} ${styles.tileChosen}` : styles.tile}
            data-shape-choice={one.shape ?? 'DEFAULT'}
            onClick={() => onChoose(one.shape)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              const next = choices[(index + step + choices.length) % choices.length];
              onChoose(next.shape);
              const tiles = event.currentTarget.parentElement?.querySelectorAll('button');
              (tiles?.[(index + step + choices.length) % choices.length] as HTMLButtonElement | undefined)?.focus();
            }}
          >
            <svg className={styles.outline} viewBox="0 0 64 36" aria-hidden="true">
              <path className={styles.body} d={one.outline} />
              <rect className={styles.accent} x={one.shape === 'PILL' ? 12 : one.shape === 'HEXAGON' ? 13 : 7} y="11" width="2.5" height="14" rx="1.25" />
              <rect className={styles.line} x={one.shape === 'PILL' ? 18 : one.shape === 'HEXAGON' ? 19 : 13} y="13" width="22" height="3" rx="1.5" />
              <rect className={styles.lineFaint} x={one.shape === 'PILL' ? 18 : one.shape === 'HEXAGON' ? 19 : 13} y="20" width="30" height="3" rx="1.5" />
            </svg>
            <span className={styles.name}>{one.label}</span>
          </button>
        );
      })}
    </div>
  );
}
