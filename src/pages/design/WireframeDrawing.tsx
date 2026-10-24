import type { WireframeElement } from '../../api/wireframes';
import { isBox } from '../../api/wireframes';
import styles from './WireframeDrawing.module.css';

/** The smallest box that holds every element, or null for an empty drawing. */
export function boundsOf(elements: WireframeElement[]): { x: number; y: number; w: number; h: number } | null {
  if (elements.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const one of elements) {
    left = Math.min(left, one.x, one.x + one.w);
    right = Math.max(right, one.x, one.x + one.w);
    // A frame's title sits above it.
    top = Math.min(top, one.y, one.y + one.h, one.type === 'frame' ? one.y - 20 : one.y);
    bottom = Math.max(bottom, one.y, one.y + one.h);
  }
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

/** The same elements, as drawn on the canvas and on a card in the list. */
export function WireframeShapes({ elements, markerId }: { elements: WireframeElement[]; markerId: string }) {
  return (
    <>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} />
        </marker>
      </defs>
      {elements.map((element) => (
        <WireframeShape key={element.id} element={element} markerId={markerId} />
      ))}
    </>
  );
}

function WireframeShape({ element, markerId }: { element: WireframeElement; markerId: string }) {
  const { x, y, w, h, type } = element;
  const text = element.text ?? '';
  const props = element.props ?? {};
  const label = (className: string) =>
    text === '' ? null : (
      <foreignObject x={x} y={y} width={Math.max(1, w)} height={Math.max(1, h)} className={styles.words}>
        <div className={className} style={type === 'text' ? textStyle(props) : undefined}>
          {text}
        </div>
      </foreignObject>
    );
  const common = { 'data-element-id': element.id, 'data-element-type': type } as const;

  if (!isBox(type)) {
    return (
      <g {...common} className={styles.element}>
        {/* What the pointer catches: wider than the line, and not drawn. */}
        <line x1={x} y1={y} x2={x + w} y2={y + h} className={styles.lineHit} />
        <line
          x1={x}
          y1={y}
          x2={x + w}
          y2={y + h}
          className={styles.line}
          markerEnd={type === 'arrow' ? `url(#${markerId})` : undefined}
        />
      </g>
    );
  }

  switch (type) {
    case 'frame':
      return (
        <g {...common} className={styles.element}>
          {text !== '' && (
            <text x={x} y={y - 8} className={styles.frameTitle}>
              {text}
            </text>
          )}
          <rect x={x} y={y} width={w} height={h} rx={10} className={styles.frame} />
        </g>
      );
    case 'rect':
      return (
        <g {...common} className={styles.element}>
          <rect x={x} y={y} width={w} height={h} rx={6} className={styles.rect} />
          {label(styles.centred)}
        </g>
      );
    case 'text':
      return (
        <g {...common} className={styles.element}>
          <rect x={x} y={y} width={w} height={h} className={styles.textHit} />
          {label(styles.text)}
        </g>
      );
    case 'button': {
      const primary = props.variant === 'primary';
      return (
        <g {...common} className={styles.element}>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(8, h / 2)} className={primary ? styles.buttonPrimary : styles.button} />
          {label(primary ? `${styles.centred} ${styles.onStrong}` : styles.centred)}
        </g>
      );
    }
    case 'input':
      return (
        <g {...common} className={styles.element}>
          <rect x={x} y={y} width={w} height={h} rx={6} className={styles.input} />
          {label(styles.placeholder)}
        </g>
      );
    case 'image':
      return (
        <g {...common} className={styles.element}>
          <rect x={x} y={y} width={w} height={h} rx={4} className={styles.rect} />
          <line x1={x} y1={y} x2={x + w} y2={y + h} className={styles.cross} />
          <line x1={x + w} y1={y} x2={x} y2={y + h} className={styles.cross} />
          {label(styles.caption)}
        </g>
      );
    case 'note':
      return (
        <g {...common} className={styles.element}>
          <rect x={x} y={y} width={w} height={h} rx={2} className={styles.note} />
          {label(styles.noteText)}
        </g>
      );
    default:
      return null;
  }
}

function textStyle(props: Record<string, string | number | boolean>) {
  const size = typeof props.size === 'number' ? props.size : 14;
  return { fontSize: `${size}px`, fontWeight: props.weight === 'bold' ? 600 : 400 };
}

/** A small picture of a whole wireframe, fitted to its box: the list's cards. */
export function WireframePreview({ elements, id }: { elements: WireframeElement[]; id: string }) {
  const bounds = boundsOf(elements);
  const pad = 24;
  return (
    <svg
      className={styles.preview}
      viewBox={bounds === null ? '0 0 100 60' : `${bounds.x - pad} ${bounds.y - pad} ${bounds.w + pad * 2} ${bounds.h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <WireframeShapes elements={elements} markerId={`wireframe-preview-arrow-${id}`} />
    </svg>
  );
}
