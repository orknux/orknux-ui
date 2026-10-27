import { noteHeightFor } from './wireframeNotes';
import type { CSSProperties, ReactElement } from 'react';

import type { WireframeElement } from '../../api/wireframes';
import { isBox, isCheckable } from '../../api/wireframes';
import styles from './WireframeDrawing.module.css';
import { gradientLine, lookOf, opaque, SHADOW_LOOK, strokeOf } from './wireframeStyle';
import type { Look } from './wireframeStyle';

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

/** The artifact ids a picture is named by, as the server's `DocumentContent.ARTIFACT` reads them. */
const ARTIFACT = /^(IMAGE|TASK|SAVED|DESIGN)-[0-9]{1,18}$/;

/**
 * Where an image element's picture is drawn from: the address a document's
 * pictures are drawn from (`DocumentContent.source`), which serves the
 * workspace's own pictures to whoever may see it. Null for an image element
 * that names none, which is drawn as a placeholder.
 */
export function pictureSource(element: WireframeElement, workspaceId: string | undefined): string | null {
  const artifact = element.props?.artifact;
  if (workspaceId === undefined || workspaceId === '' || typeof artifact !== 'string' || !ARTIFACT.test(artifact)) return null;
  return `/api/workspaces/${workspaceId}/document-images/${artifact}`;
}

/** The same elements, as drawn on the canvas and on a card in the list; a picture is drawn where the workspace is known. */
export function WireframeShapes({ elements, markerId, workspaceId }: { elements: WireframeElement[]; markerId: string; workspaceId?: string }) {
  return (
    <>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} />
        </marker>
        {/* SVG 1.1's drop shadow, as the server's picture of a wireframe draws it too. */}
        {(Object.keys(SHADOW_LOOK) as (keyof typeof SHADOW_LOOK)[]).map((shadow) => (
          <filter key={shadow} id={`${markerId}-shadow-${shadow}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation={SHADOW_LOOK[shadow].blur / 2} />
            <feOffset dy={SHADOW_LOOK[shadow].dy} result="blurred" />
            <feFlood floodColor="#000000" floodOpacity={SHADOW_LOOK[shadow].opacity} />
            <feComposite in2="blurred" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>
      {elements.map((element, index) => (
        <WireframeShape key={element.id} element={element} markerId={markerId} paintId={`${markerId}-paint-${index}`} workspaceId={workspaceId} />
      ))}
    </>
  );
}

/** Each kind's own outline, the stylesheet's, which a border prop draws over; null for a kind drawn with none. */
const INK = 'var(--wireframe-ink)';
const PENCIL = 'var(--wireframe-pencil)';
const OUTLINE: Record<WireframeElement['type'], { colour: string | null; width: number }> = {
  frame: { colour: INK, width: 1.5 },
  rect: { colour: PENCIL, width: 1 },
  text: { colour: null, width: 1 },
  button: { colour: INK, width: 1.5 },
  input: { colour: PENCIL, width: 1 },
  image: { colour: PENCIL, width: 1 },
  line: { colour: INK, width: 1.5 },
  arrow: { colour: INK, width: 1.5 },
  note: { colour: 'var(--wireframe-note-edge)', width: 1 },
  checkbox: { colour: null, width: 1 },
  radio: { colour: null, width: 1 },
  toggle: { colour: null, width: 1 },
};

/**
 * What the props say about a shape's paint, as an inline style over its class,
 * and the gradient it needs where its background is one. Empty where the
 * props say nothing, so an unstyled drawing is drawn by the stylesheet alone.
 */
function painted(element: WireframeElement, look: Look, paintId: string): { style: CSSProperties; gradient: ReactElement | null } {
  const style: CSSProperties = {};
  let gradient: ReactElement | null = null;
  if (look.fill?.kind === 'solid') style.fill = look.fill.colour;
  if (look.fill?.kind === 'gradient') {
    const line = gradientLine(look.fill.angle, element);
    gradient = (
      <defs>
        <linearGradient id={paintId} gradientUnits="userSpaceOnUse" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}>
          {look.fill.stops.map((stop, at) => {
            const { hex, opacity } = opaque(stop.colour);
            return <stop key={at} offset={`${stop.at}%`} stopColor={hex} stopOpacity={opacity} />;
          })}
        </linearGradient>
      </defs>
    );
    style.fill = `url(#${paintId})`;
  }
  const stroke = strokeOf(look, OUTLINE[element.type], INK);
  if (stroke !== null) {
    style.stroke = stroke.colour ?? 'none';
    style.strokeWidth = stroke.width;
    style.strokeDasharray = stroke.dashes ?? 'none';
  }
  return { style, gradient };
}

function WireframeShape({ element, markerId, paintId, workspaceId }: { element: WireframeElement; markerId: string; paintId: string; workspaceId?: string }) {
  const { x, y, w, type } = element;
  const text = element.text ?? '';
  // A note at least as tall as its words, as the server reads one: the note drawn while typing is the one saved.
  const h = type === 'note' ? Math.max(element.h, noteHeightFor(text, Math.max(1, w))) : element.h;
  const props = element.props ?? {};
  const look = lookOf(element);
  const shadow = look.shadow === undefined ? undefined : `url(#${markerId}-shadow-${look.shadow})`;
  const { style: paint, gradient } = painted(element, look, paintId);
  const boxStyle: CSSProperties = { ...paint, ...(shadow === undefined ? {} : { filter: shadow }) };
  const words: CSSProperties = look.color === undefined ? {} : { color: look.color };
  const rounded = (own: number) => look.radius ?? own;
  const label = (className: string) =>
    text === '' ? null : (
      <foreignObject x={x} y={y} width={Math.max(1, w)} height={Math.max(1, h)} className={styles.words}>
        <div className={className} style={{ ...(type === 'text' ? textStyle(props) : {}), ...words }}>
          {text}
        </div>
      </foreignObject>
    );
  const common = { 'data-element-id': element.id, 'data-element-type': type } as const;

  if (!isBox(type)) {
    const head = type !== 'arrow' ? undefined : look.borderColor === undefined ? markerId : `${paintId}-head`;
    return (
      <g {...common} className={styles.element}>
        {head !== undefined && head !== markerId && (
          // An arrow in a colour of its own has a head of that colour.
          <defs>
            <marker id={head} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: look.borderColor }} />
            </marker>
          </defs>
        )}
        {/* What the pointer catches: wider than the line, and not drawn. */}
        <line x1={x} y1={y} x2={x + w} y2={y + h} className={styles.lineHit} />
        <line
          x1={x}
          y1={y}
          x2={x + w}
          y2={y + h}
          className={styles.line}
          style={{ ...(paint.stroke === undefined ? {} : { stroke: paint.stroke, strokeWidth: paint.strokeWidth, strokeDasharray: paint.strokeDasharray }), ...(shadow === undefined ? {} : { filter: shadow }) }}
          markerEnd={head === undefined ? undefined : `url(#${head})`}
        />
      </g>
    );
  }

  if (isCheckable(type)) {
    const on = props.checked === true;
    const middle = y + h / 2;
    const control = type === 'toggle' ? 32 : 16;
    return (
      <g {...common} className={styles.element}>
        {gradient}
        <rect x={x} y={y} width={w} height={h} rx={rounded(0)} className={styles.textHit} style={boxStyle} />
        {/* A press on the control itself ticks it; on the words, it selects. */}
        <g data-toggle={element.id} className={styles.toggle} data-checked={on}>
          {type === 'checkbox' && (
            <>
              <rect x={x} y={middle - 8} width={16} height={16} rx={3} className={on ? styles.controlOn : styles.control} />
              {on && <path d={`M ${x + 4} ${middle} L ${x + 7} ${middle + 3} L ${x + 12} ${middle - 3}`} className={styles.tick} />}
            </>
          )}
          {type === 'radio' && (
            <>
              <circle cx={x + 8} cy={middle} r={7.5} className={styles.control} />
              {on && <circle cx={x + 8} cy={middle} r={4} className={styles.radioDot} />}
            </>
          )}
          {type === 'toggle' && (
            <>
              <rect x={x} y={middle - 9} width={32} height={18} rx={9} className={on ? styles.trackOn : styles.track} />
              <circle cx={on ? x + 23 : x + 9} cy={middle} r={6} className={on ? styles.knobOn : styles.knob} />
            </>
          )}
        </g>
        {text !== '' && (
          <foreignObject x={x + control + 8} y={y} width={Math.max(1, w - control - 8)} height={Math.max(1, h)} className={styles.words}>
            <div className={styles.controlLabel} style={words}>
              {text}
            </div>
          </foreignObject>
        )}
      </g>
    );
  }

  switch (type) {
    case 'frame':
      return (
        <g {...common} className={styles.element}>
          {text !== '' && (
            <text x={x} y={y - 8} className={styles.frameTitle} style={look.color === undefined ? undefined : { fill: look.color }}>
              {text}
            </text>
          )}
          {gradient}
          <rect x={x} y={y} width={w} height={h} rx={rounded(10)} className={styles.frame} style={boxStyle} />
        </g>
      );
    case 'rect':
      return (
        <g {...common} className={styles.element}>
          {gradient}
          <rect x={x} y={y} width={w} height={h} rx={rounded(6)} className={styles.rect} style={boxStyle} />
          {label(styles.centred)}
        </g>
      );
    case 'text':
      return (
        <g {...common} className={styles.element}>
          {gradient}
          <rect x={x} y={y} width={w} height={h} rx={rounded(0)} className={styles.textHit} style={boxStyle} />
          {label(styles.text)}
        </g>
      );
    case 'button': {
      const primary = props.variant === 'primary';
      return (
        <g {...common} className={styles.element}>
          {gradient}
          <rect x={x} y={y} width={w} height={h} rx={rounded(Math.min(8, h / 2))} className={primary ? styles.buttonPrimary : styles.button} style={boxStyle} />
          {label(primary ? `${styles.centred} ${styles.onStrong}` : styles.centred)}
        </g>
      );
    }
    case 'input':
      return (
        <g {...common} className={styles.element}>
          {gradient}
          <rect x={x} y={y} width={w} height={h} rx={rounded(6)} className={styles.input} style={boxStyle} />
          {label(styles.placeholder)}
        </g>
      );
    case 'image': {
      const source = pictureSource(element, workspaceId);
      if (source !== null) {
        return (
          <g {...common} className={styles.element}>
            {gradient}
            <rect x={x} y={y} width={w} height={h} rx={rounded(0)} className={styles.textHit} style={boxStyle} />
            <image href={source} x={x} y={y} width={Math.max(1, w)} height={Math.max(1, h)} preserveAspectRatio="xMidYMid meet" data-testid="wireframe-picture" />
            {label(styles.caption)}
          </g>
        );
      }
      return (
        <g {...common} className={styles.element}>
          {gradient}
          <rect x={x} y={y} width={w} height={h} rx={rounded(4)} className={styles.rect} style={boxStyle} />
          <line x1={x} y1={y} x2={x + w} y2={y + h} className={styles.cross} />
          <line x1={x + w} y1={y} x2={x} y2={y + h} className={styles.cross} />
          {label(styles.caption)}
        </g>
      );
    }
    case 'note':
      return (
        <g {...common} className={styles.element}>
          {gradient}
          <rect x={x} y={y} width={w} height={h} rx={rounded(2)} className={styles.note} style={boxStyle} />
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
export function WireframePreview({ elements, id, workspaceId }: { elements: WireframeElement[]; id: string; workspaceId?: string }) {
  const bounds = boundsOf(elements);
  const pad = 24;
  return (
    <svg
      className={styles.preview}
      viewBox={bounds === null ? '0 0 100 60' : `${bounds.x - pad} ${bounds.y - pad} ${bounds.w + pad * 2} ${bounds.h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <WireframeShapes elements={elements} markerId={`wireframe-preview-arrow-${id}`} workspaceId={workspaceId} />
    </svg>
  );
}
