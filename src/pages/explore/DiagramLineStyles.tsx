import type { DiagramEdgeData, DiagramEdgeKind, DiagramEndStyle, DiagramLineStyle, DiagramRouting } from '../../api/diagrams';
import { t } from '../../i18n';

/** What each of the four old kinds is, as a line style and two ends - the server's `DiagramEdgeKind`. */
const KINDS: Record<DiagramEdgeKind, { line: DiagramLineStyle; start: DiagramEndStyle; end: DiagramEndStyle }> = {
  arrow: { line: 'solid', start: 'none', end: 'arrow' },
  line: { line: 'solid', start: 'none', end: 'none' },
  dashed: { line: 'dashed', start: 'none', end: 'arrow' },
  both: { line: 'solid', start: 'arrow', end: 'arrow' },
};

/** A line's style and two ends; read off its kind where it carries none of its own, as a line saved before them does. */
export function styleOf(edge: Pick<DiagramEdgeData, 'kind' | 'line' | 'start' | 'end'>) {
  const kind = KINDS[edge.kind] ?? KINDS.arrow;
  return { line: edge.line ?? kind.line, start: edge.start ?? kind.start, end: edge.end ?? kind.end };
}

/** The nearest of the four old kinds, kept beside the style for a reader that knows only them; as the server reckons it. */
export function nearestKind(line: DiagramLineStyle, start: DiagramEndStyle, end: DiagramEndStyle): DiagramEdgeKind {
  if (end === 'none') return 'line';
  if (start !== 'none') return 'both';
  return line === 'solid' ? 'arrow' : 'dashed';
}

export function lineStyleLabel(style: DiagramLineStyle): string {
  switch (style) {
    case 'solid':
      return t('Solid');
    case 'dashed':
      return t('Dashed');
    case 'dotted':
      return t('Dotted');
  }
}

export function endStyleLabel(style: DiagramEndStyle): string {
  switch (style) {
    case 'none':
      return t('None');
    case 'arrow':
      return t('Arrow');
    case 'open':
      return t('Open arrow');
    case 'triangle':
      return t('Triangle');
    case 'diamond':
      return t('Diamond');
    case 'filled-diamond':
      return t('Filled diamond');
    case 'circle':
      return t('Circle');
  }
}

export function routingLabel(routing: DiagramRouting): string {
  switch (routing) {
    case 'straight':
      return t('Straight');
    case 'right-angles':
      return t('Right angles');
    case 'curved':
      return t('Curved');
  }
}

/** A routing drawn as a short line from one corner to the other, for the picker. */
export function RoutingIcon({ routing }: { routing: DiagramRouting }) {
  const d = routing === 'straight' ? 'M 2 11 L 26 1' : routing === 'right-angles' ? 'M 2 11 L 14 11 L 14 1 L 26 1' : 'M 2 11 C 14 11 14 1 26 1';
  return (
    <svg width={28} height={12} viewBox="0 0 28 12" aria-hidden="true" data-routing-icon={routing}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** The dash pattern a line style is drawn with; null for solid. */
export function dashesOf(style: DiagramLineStyle): string | null {
  return style === 'dashed' ? '6 4' : style === 'dotted' ? '1.5 3.5' : null;
}

/** A line style drawn as a short line, for the picker. */
export function LineIcon({ style }: { style: DiagramLineStyle }) {
  const dashes = dashesOf(style);
  return (
    <svg width={28} height={12} viewBox="0 0 28 12" aria-hidden="true" data-line-icon={style}>
      <line x1={2} y1={6} x2={26} y2={6} stroke="currentColor" strokeWidth={1.5} strokeDasharray={dashes ?? undefined} strokeLinecap={style === 'dotted' ? 'round' : undefined} />
    </svg>
  );
}

/**
 * One end's mark at the tip of a short line, pointing out of it as it is drawn
 * on the canvas: to the right for the line's end, to the left for its start.
 */
export function EndIcon({ style, atEnd }: { style: DiagramEndStyle; atEnd: boolean }) {
  return (
    <svg width={28} height={12} viewBox="0 0 28 12" aria-hidden="true" data-end-icon={style}>
      <g transform={atEnd ? undefined : 'translate(28 0) scale(-1 1)'}>
        <line x1={2} y1={6} x2={style === 'none' ? 26 : 16} y2={6} stroke="currentColor" strokeWidth={1.5} />
        <g transform="translate(14 0)">
          <Mark style={style} paper="var(--color-surface)" ink="currentColor" />
        </g>
      </g>
    </svg>
  );
}

/** The mark itself, in a 12 by 12 square with its point at the right. */
function Mark({ style, paper, ink }: { style: DiagramEndStyle; paper: string; ink: string }) {
  const stroke = { stroke: ink, strokeWidth: 1.2, strokeLinejoin: 'round' as const };
  switch (style) {
    case 'arrow':
      return <path d="M 1 1 L 12 6 L 1 11 z" fill={ink} />;
    case 'open':
      return <path d="M 1 1 L 12 6 L 1 11" fill="none" {...stroke} />;
    case 'triangle':
      return <path d="M 1 1 L 12 6 L 1 11 z" fill={paper} {...stroke} />;
    case 'diamond':
      return <path d="M 0.5 6 L 6 1.5 L 12 6 L 6 10.5 z" fill={paper} {...stroke} />;
    case 'filled-diamond':
      return <path d="M 0.5 6 L 6 1.5 L 12 6 L 6 10.5 z" fill={ink} {...stroke} />;
    case 'circle':
      return <circle cx={7} cy={6} r={4.5} fill={paper} {...stroke} />;
    default:
      return null;
  }
}

/**
 * The id of the marker an end is drawn with on the canvas, or null for none.
 * The arrow is left to React Flow's own closed arrow, as it always was, so a
 * line saved before these existed looks exactly as it did.
 */
export function markerId(style: DiagramEndStyle, atEnd: boolean): string | null {
  if (style === 'none' || style === 'arrow') return null;
  return `diagram-${atEnd ? 'end' : 'start'}-${style}`;
}

/** The marks other than the arrow, each pointing out of a line's end and out of its start, for the canvas to refer to. */
export function MarkerDefs() {
  const styles: DiagramEndStyle[] = ['open', 'triangle', 'diamond', 'filled-diamond', 'circle'];
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {styles.flatMap((style) =>
          [true, false].map((atEnd) => (
            <marker
              key={`${style}-${atEnd}`}
              id={markerId(style, atEnd) ?? undefined}
              viewBox="0 0 12 12"
              refX={atEnd ? 12 : 0}
              refY={6}
              markerWidth={10}
              markerHeight={10}
              orient="auto"
            >
              <g transform={atEnd ? undefined : 'translate(12 0) scale(-1 1)'}>
                <Mark style={style} paper="var(--diagram-paper, #ffffff)" ink="var(--diagram-ink)" />
              </g>
            </marker>
          )),
        )}
      </defs>
    </svg>
  );
}
